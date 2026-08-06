from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content if content.endswith("\n") else content + "\n")


write("backend/src/services/contasPagar/omieRequest.js", r'''"use strict";

const crypto = require("node:crypto");
const { GenericError } = require("@oondemand/oon-core-back");
const { core, models } = require("./runtime");

const DEFAULT_MIN_INTERVAL_MS = 5000;
const DEFAULT_LOCK_MS = 30000;
const MAX_LOCK_WAIT_MS = 20000;

function limparValor(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(limparValor).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, limparValor(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function normalizarParametrosOmie(param) {
  const input = Array.isArray(param) ? param : [param];
  const normalized = limparValor(input);
  if (!Array.isArray(normalized) || !normalized.length) {
    throw new GenericError("A chamada Omie foi bloqueada porque não possui parâmetros.", {
      statusCode: 422,
      retryable: false,
      details: { field: "param", message: "Informe ao menos um parâmetro válido." },
    });
  }
  for (const item of normalized) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !Object.keys(item).length) {
      throw new GenericError("A chamada Omie foi bloqueada porque contém parâmetros vazios.", {
        statusCode: 422,
        retryable: false,
        details: { field: "param", message: "Objetos vazios não são enviados ao Omie." },
      });
    }
  }
  return normalized;
}

function extrairCooldownSegundos(error) {
  const text = [error?.message, error?.response?.data?.faultstring, error?.response?.data?.message]
    .filter(Boolean)
    .join(" ");
  const match = text.match(/(?:tente novamente em|aguarde)\s+(\d+)\s*segundos?/i);
  return match ? Math.max(1, Number(match[1])) : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttleCollection() {
  const { Compra } = models();
  return Compra.db.collection("tazay_omie_request_throttle");
}

function minIntervalMs() {
  return Math.max(1000, Number(process.env.OON_OMIE_MIN_INTERVAL_MS || DEFAULT_MIN_INTERVAL_MS));
}

async function initializeThrottle(instanceId) {
  const collection = throttleCollection();
  const epoch = new Date(0);
  await collection.updateOne(
    { _id: String(instanceId || "default") },
    {
      $setOnInsert: {
        lockedUntil: epoch,
        nextAllowedAt: epoch,
        cooldownUntil: epoch,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return collection;
}

async function acquireThrottle(instanceId) {
  const key = String(instanceId || "default");
  const collection = await initializeThrottle(key);
  const token = crypto.randomUUID();
  const deadline = Date.now() + MAX_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = new Date();
    const state = await collection.findOne({ _id: key });
    if (state?.cooldownUntil && new Date(state.cooldownUntil) > now) {
      const seconds = Math.max(1, Math.ceil((new Date(state.cooldownUntil).getTime() - now.getTime()) / 1000));
      throw new GenericError(`A instância Omie está em pausa preventiva por mais ${seconds} segundos. Nenhuma requisição foi enviada.`, {
        statusCode: 429,
        code: "OMIE_COOLDOWN_ACTIVE",
        retryable: false,
      });
    }

    const acquired = await collection.findOneAndUpdate(
      {
        _id: key,
        lockedUntil: { $lte: now },
        nextAllowedAt: { $lte: now },
        cooldownUntil: { $lte: now },
      },
      {
        $set: {
          lockedBy: token,
          lockedUntil: new Date(now.getTime() + DEFAULT_LOCK_MS),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (acquired) return { collection, key, token };

    const nextState = await collection.findOne({ _id: key });
    const waitUntil = Math.max(
      Number(new Date(nextState?.lockedUntil || 0)),
      Number(new Date(nextState?.nextAllowedAt || 0)),
    );
    await sleep(Math.min(1000, Math.max(100, waitUntil - Date.now())));
  }

  throw new GenericError("A chamada Omie foi bloqueada porque já existe outra operação em andamento para esta instância.", {
    statusCode: 409,
    code: "OMIE_REQUEST_IN_PROGRESS",
    retryable: false,
  });
}

async function releaseThrottle(lock, options = {}) {
  const now = new Date();
  const cooldownSeconds = Math.max(0, Number(options.cooldownSeconds || 0));
  const nextAllowedAt = new Date(now.getTime() + minIntervalMs());
  const cooldownUntil = cooldownSeconds
    ? new Date(now.getTime() + cooldownSeconds * 1000)
    : new Date(0);
  await lock.collection.updateOne(
    { _id: lock.key, lockedBy: lock.token },
    {
      $set: {
        lockedUntil: now,
        lockedBy: "",
        lastRequestAt: now,
        nextAllowedAt,
        cooldownUntil,
        updatedAt: now,
      },
    },
  );
}

async function executarChamadaOmie(call, instanceId, param, context = {}) {
  const callKey = String(call || "").trim();
  if (!callKey) {
    throw new GenericError("A chamada Omie foi bloqueada porque o método não foi informado.", {
      statusCode: 422,
      retryable: false,
    });
  }
  const normalizedParam = normalizarParametrosOmie(param);
  const { omie } = core();
  if (!omie?.call) {
    throw new GenericError("O runtime Omie não disponibiliza execução de chamadas declaradas.", {
      statusCode: 500,
      retryable: false,
    });
  }

  const lock = await acquireThrottle(instanceId);
  try {
    const result = await omie.call({
      callKey,
      instanceId,
      payload: { param: normalizedParam },
    }, { context, maxAttempts: 1 });
    await releaseThrottle(lock);
    return result;
  } catch (error) {
    const cooldownSeconds = extrairCooldownSegundos(error);
    await releaseThrottle(lock, { cooldownSeconds });
    error.retryable = false;
    throw error;
  }
}

module.exports = {
  executarChamadaOmie,
  extrairCooldownSegundos,
  normalizarParametrosOmie,
};
''')

write("backend/src/services/contasPagar/conclusaoRecebimento.js", r'''"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_CONCLUIDO } = require("./constants");
const { models } = require("./runtime");
const { primeiroValor } = require("./utils");
const { dadosRespostaOmie } = require("./omieOperations");
const { executarChamadaOmie } = require("./omieRequest");

function identificacaoPersistida(compra = {}) {
  return {
    codigoRecebimentoOmie: Number(compra.codigoRecebimentoOmie || 0),
    chaveDocumentoFiscal: String(compra.chaveDocumentoFiscal || "").trim(),
    etapaOmie: String(compra.codigoEtapaRecebimentoOmie || "50").trim() || "50",
    recebido: compra.statusDocumentoOmie === "Recebido"
      || compra.situacaoPedidoOmieOrigem === "Recebido",
  };
}

function resolverIdentificacaoRecebimento(compra) {
  const identificacao = identificacaoPersistida(compra);
  if (!(identificacao.codigoRecebimentoOmie > 0) && !identificacao.chaveDocumentoFiscal) {
    throw new GenericError("O documento não possui código de recebimento nem chave fiscal. Nenhuma consulta foi enviada ao Omie.", {
      statusCode: 422,
      code: "RECEBIMENTO_SEM_IDENTIFICADOR",
      retryable: false,
    });
  }
  return identificacao;
}

async function executarConclusaoRecebimentoOmie(event, context = {}) {
  const { Compra } = models();
  const compraId = String(event.payload?.compraId || event.aggregateId || "");
  const compra = await Compra.findById(compraId);
  if (!compra) return { ignored: true, reason: "compra-nao-encontrada", compraId };
  if (compra.statusConclusaoOmie === "Concluído") {
    return { ignored: true, reason: "recebimento-ja-concluido", compraId };
  }

  try {
    const identificacao = resolverIdentificacaoRecebimento(compra.toObject());
    let resposta = {};
    if (!identificacao.recebido) {
      const result = await executarChamadaOmie(
        "concluir-recebimento",
        compra.instanceId,
        [{
          nIdReceb: identificacao.codigoRecebimentoOmie || undefined,
          cChaveNfe: identificacao.chaveDocumentoFiscal || undefined,
          cEtapa: identificacao.etapaOmie,
        }],
        context,
      );
      resposta = dadosRespostaOmie(result);
    }

    const now = new Date();
    await Compra.findByIdAndUpdate(compra._id, {
      $set: {
        codigoRecebimentoOmie: identificacao.codigoRecebimentoOmie || compra.codigoRecebimentoOmie,
        chaveDocumentoFiscal: identificacao.chaveDocumentoFiscal || compra.chaveDocumentoFiscal,
        etapa: ETAPA_CONCLUIDO,
        situacaoPedidoOmieOrigem: "Recebido",
        statusDocumentoOmie: "Recebido",
        statusConclusaoOmie: "Concluído",
        statusIntegracao: "Sincronizado",
        concluidaNoOmieEm: now,
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      },
    }, { runValidators: true });

    const response = {
      compraId: String(compra._id),
      codigoPedidoOmie: Number(compra.codigoPedidoOmie || 0),
      codigoRecebimentoOmie: identificacao.codigoRecebimentoOmie,
      chaveDocumentoFiscal: identificacao.chaveDocumentoFiscal,
      statusConclusaoOmie: "Concluído",
      jaEstavaRecebido: identificacao.recebido,
      origemIdentificacao: "persistida",
      chamadasListagem: 0,
      chamadasConclusao: identificacao.recebido ? 0 : 1,
      descricaoStatusOmie: String(primeiroValor(
        resposta.cDescStatus,
        resposta.descricao_status,
        "Recebimento concluído.",
      )),
    };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await Compra.findByIdAndUpdate(compra._id, {
      $set: {
        statusConclusaoOmie: "Erro",
        statusIntegracao: "Erro",
        ultimoErro: message,
      },
    });
    error.retryable = false;
    throw error;
  }
}

module.exports = {
  executarConclusaoRecebimentoOmie,
  identificacaoPersistida,
  resolverIdentificacaoRecebimento,
};
''')

operations_path = "backend/src/services/contasPagar/omieOperations.js"
operations = read(operations_path)
operations = operations.replace(
    'const { array, primeiroValor } = require("./utils");',
    'const { array, primeiroValor } = require("./utils");\nconst { executarChamadaOmie } = require("./omieRequest");',
)
operations, count = re.subn(
    r'async function executarChamadaOmie\([\s\S]*?\n}\n\nfunction cabecalhoRecebimento',
    'function cabecalhoRecebimento',
    operations,
    count=1,
)
if count != 1:
    raise RuntimeError("Não foi possível remover o executor Omie duplicado")
operations, count = re.subn(
    r'async function listarRecebimentosOmie\([\s\S]*?\n}\n\nasync function enfileirarConclusaoCompras',
    'async function enfileirarConclusaoCompras',
    operations,
    count=1,
)
if count != 1:
    raise RuntimeError("Não foi possível remover a listagem de recebimentos")
operations, count = re.subn(
    r'async function executarConclusaoRecebimentoOmie\([\s\S]*?\n}\n\nasync function executarEnvioContaPagarOmie',
    'async function executarEnvioContaPagarOmie',
    operations,
    count=1,
)
if count != 1:
    raise RuntimeError("Não foi possível remover a conclusão duplicada")
consulta = r'''async function consultarPagamentoContaPagar(contaOrId) {
  const { ContaPagarAgrupada } = models();
  const contaId = String(contaOrId?._id || contaOrId || "");
  const atual = await ContaPagarAgrupada.findById(contaId);
  if (!atual) return { ignored: true, reason: "conta-nao-encontrada" };
  if (["Excluída"].includes(atual.status)) return { ignored: true, reason: "conta-inativa" };
  if (atual.statusPagamentoOmie === "Consultando") {
    return { ignored: true, reason: "consulta-ja-pendente", contaId };
  }

  chaveConsultaContaPagar(atual);
  const conta = await ContaPagarAgrupada.findOneAndUpdate(
    { _id: atual._id, statusPagamentoOmie: { $ne: "Consultando" } },
    {
      $set: { statusPagamentoOmie: "Consultando", ultimoErro: "" },
      $inc: { consultaPagamentoRevisao: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!conta) return { ignored: true, reason: "consulta-ja-pendente", contaId };

  const { enqueueIntegration } = core();
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TAZAY_CONSULTAR_PAGAMENTO_OMIE",
    resource: "contas-pagar-agrupadas",
    operation: "payment-status",
    aggregateType: "ContaPagarAgrupada",
    aggregateId: String(conta._id),
    idempotencyKey: `tazay:conta-pagar:${conta._id}:consultar-pagamento:r${conta.consultaPagamentoRevisao}`,
    payload: { contaId: String(conta._id) },
  });
  return {
    contaId: String(conta._id),
    ticketId: String(ticket?._id || ""),
    statusPagamentoOmie: "Consultando",
  };
}

async function executarConsultaPagamentoOmie'''
operations, count = re.subn(
    r'async function consultarPagamentoContaPagar\([\s\S]*?\n}\n\nasync function executarConsultaPagamentoOmie',
    consulta,
    operations,
    count=1,
)
if count != 1:
    raise RuntimeError("Não foi possível proteger a consulta de pagamento")
operations = operations.replace("\n  executarConclusaoRecebimentoOmie,", "")
operations = operations.replace("\n  listarRecebimentosOmie,", "")
write(operations_path, operations)

index_path = "backend/src/services/contasPagar/index.js"
index_source = read(index_path)
if '...require("./omieRequest")' not in index_source:
    index_source = index_source.replace(
        '  ...require("./omieOperations"),',
        '  ...require("./omieOperations"),\n  ...require("./omieRequest"),',
    )
write(index_path, index_source)

write("backend/src/hooks/integrationAutoProcessor.js", r'''"use strict";

const AUTO_PROCESSOR_SYMBOL = Symbol.for("tazay.integrationAutoProcessor");

async function tornarErrosOmieDefinitivos(integrations) {
  const { Outbox } = integrations.getIntegrationModels();
  const result = await Outbox.updateMany(
    { provider: "omie", status: "Erro temporário" },
    {
      $set: {
        previousStatus: "Erro temporário",
        status: "Erro definitivo",
        nextAttemptAt: null,
        leaseId: "",
        lockedAt: null,
        lockedBy: "",
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    },
  );
  return Number(result.modifiedCount || 0);
}

async function processarIntegracoesPendentes(options = {}) {
  const { integrations } = require("@oondemand/oon-core-back");
  const errosConvertidos = await tornarErrosOmieDefinitivos(integrations);
  const fila = await integrations.drainOnce({
    batchSize: Math.max(1, Number(options.batchSize || process.env.OON_INTEGRATION_AUTO_BATCH_SIZE || 1)),
    webhookBatchSize: Math.max(1, Number(
      options.webhookBatchSize || process.env.OON_INTEGRATION_AUTO_WEBHOOK_BATCH_SIZE || 10,
    )),
  });
  return { errosConvertidos, fila };
}

function iniciarProcessamentoAutomatico(options = {}) {
  if (globalThis[AUTO_PROCESSOR_SYMBOL]) return globalThis[AUTO_PROCESSOR_SYMBOL];
  const intervalMs = Math.max(
    5000,
    Number(options.intervalMs || process.env.OON_INTEGRATION_AUTO_INTERVAL_MS || 6000),
  );
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processarIntegracoesPendentes(options);
    } catch (error) {
      console.error("[tazay] Falha ao processar integrações pendentes:", error?.message || error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setImmediate(tick);
  const state = {
    timer,
    tick,
    stop() {
      clearInterval(timer);
      delete globalThis[AUTO_PROCESSOR_SYMBOL];
    },
  };
  globalThis[AUTO_PROCESSOR_SYMBOL] = state;
  return state;
}

module.exports = {
  iniciarProcessamentoAutomatico,
  processarIntegracoesPendentes,
  tornarErrosOmieDefinitivos,
};
''')

mapping_path = "backend/src/mappings/omie.js"
mapping = read(mapping_path)
mapping, count = re.subn(
    r'\n    "listar-recebimentos": \{[\s\S]*?\n    \},\n    "concluir-recebimento":',
    '\n    "concluir-recebimento":',
    mapping,
    count=1,
)
if count != 1:
    raise RuntimeError("Não foi possível remover a chamada listar-recebimentos")
mapping = mapping.replace(
    'param: { $path: "$input.param", default: [{}] }',
    'param: { $path: "$input.param" }',
)
mapping = mapping.replace(
    '      connectionTest: true\n',
    '      maxAttempts: 1,\n      connectionTest: true\n',
    1,
)
mapping = mapping.replace(
    '      param: [{\n        pagina: "$input.page",\n        registros_por_pagina: "$input.pageSize"\n      }],\n      pagination:',
    '      param: [{\n        pagina: "$input.page",\n        registros_por_pagina: "$input.pageSize"\n      }],\n      maxAttempts: 1,\n      pagination:',
    1,
)
mapping = mapping.replace(
    '        apenas_importado_api: "N"\n      }],\n      pagination:',
    '        apenas_importado_api: "N"\n      }],\n      maxAttempts: 1,\n      pagination:',
    1,
)
for call in [
    "incluir-conta-pagar",
    "alterar-conta-pagar",
    "consultar-conta-pagar",
    "excluir-conta-pagar",
    "concluir-recebimento",
]:
    pattern = rf'("{re.escape(call)}": \{{[\s\S]*?param: \{{ \$path: "\$input\.param" \}})(?!,\n      maxAttempts)'
    mapping, count = re.subn(pattern, r'\1,\n      maxAttempts: 1', mapping, count=1)
    if count != 1:
        raise RuntimeError(f"Não foi possível limitar {call} a uma tentativa")
mapping = mapping.replace(
    '    webhookAction("Financas.ContaPagar.Excluido"),\n    webhookAction("*")',
    '    webhookAction("Financas.ContaPagar.Excluido")',
)
write(mapping_path, mapping)

ui_path = "frontend/central.ui.json"
ui = json.loads(read(ui_path))
ui["navigation"] = {
    "mode": "mixed",
    "items": [
        {
            "label": "Tickets de Integração",
            "href": "/configuracoes/integracao-omie/tickets",
            "icon": "↔",
            "section": "Sistema",
            "order": 850,
        }
    ],
}
write(ui_path, json.dumps(ui, ensure_ascii=False, indent=2) + "\n")

conclusion_test_path = "backend/test/conclusaoRecebimento.test.js"
conclusion_test = read(conclusion_test_path)
replacement_test = r'''test("a Central drena automaticamente somente tickets novos, sem reprocessar erros", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/hooks/integrationAutoProcessor.js"),
    "utf8",
  );
  assert.match(source, /integrations\.drainOnce/);
  assert.match(source, /getIntegrationModels/);
  assert.match(source, /status: "Erro definitivo"/);
  assert.match(source, /OON_INTEGRATION_AUTO_BATCH_SIZE \|\| 1/);
  assert.match(source, /OON_INTEGRATION_AUTO_WEBHOOK_BATCH_SIZE \|\| 10/);
  assert.doesNotMatch(source, /enfileirarComprasPagasExistentes/);
  assert.doesNotMatch(source, /OON_INTEGRATION_AUTO_BACKFILL_BATCH_SIZE/);
  assert.doesNotMatch(source, /etapa: "Pago"/);
});
'''
conclusion_test, count = re.subn(
    r'test\("a Central drena automaticamente a fila, webhooks e compras já pagas"[\s\S]*?\n}\);\n?$',
    lambda _: replacement_test,
    conclusion_test,
    count=1,
)
if count != 1:
    raise RuntimeError("Não foi possível atualizar o teste do processador automático")
write(conclusion_test_path, conclusion_test)

write("backend/test/consumoOmie.test.js", r'''"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extrairCooldownSegundos,
  normalizarParametrosOmie,
} = require("../src/services/contasPagar");

test("bloqueia chamada Omie sem parâmetros antes da requisição", () => {
  assert.throws(() => normalizarParametrosOmie({}), /parâmetros vazios|não possui parâmetros/i);
  assert.throws(() => normalizarParametrosOmie([]), /não possui parâmetros/i);
  assert.throws(() => normalizarParametrosOmie([{ campo: undefined }]), /não possui parâmetros/i);
});

test("remove valores vazios sem eliminar zero ou false", () => {
  assert.deepEqual(normalizarParametrosOmie([{
    codigo: 123,
    pagina: 0,
    ativo: false,
    vazio: "",
    ausente: undefined,
  }]), [{ codigo: 123, pagina: 0, ativo: false }]);
});

test("reconhece pausa informada pelo Omie", () => {
  assert.equal(extrairCooldownSegundos(new Error("Tente novamente em 1342 segundos.")), 1342);
  assert.equal(extrairCooldownSegundos(new Error("Aguarde 2 segundos para tentar novamente")), 2);
});

test("conclusão não possui pesquisa nem compatibilidade legada", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/conclusaoRecebimento.js"), "utf8");
  assert.doesNotMatch(source, /listarRecebimentosOmie/);
  assert.doesNotMatch(source, /fallback-legado/);
  assert.match(source, /chamadasListagem: 0/);
  assert.match(source, /RECEBIMENTO_SEM_IDENTIFICADOR/);
});

test("mapeamento não permite tentativa múltipla nem parâmetro padrão vazio", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  assert.doesNotMatch(source, /"listar-recebimentos"/);
  assert.doesNotMatch(source, /default: \[\{\}\]/);
  assert.doesNotMatch(source, /maxAttempts: [2-9]/);
  const calls = source.slice(source.indexOf("calls: {"), source.indexOf("lists: ["));
  const declaredCalls = [...calls.matchAll(/^    "[^"]+": \{/gm)].length;
  const singleAttempts = [...calls.matchAll(/maxAttempts: 1/g)].length;
  assert.equal(singleAttempts, declaredCalls);
});

test("consulta de pagamento impede ticket duplicado enquanto já consulta", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/omieOperations.js"), "utf8");
  assert.match(source, /consulta-ja-pendente/);
  assert.match(source, /statusPagamentoOmie: \{ \$ne: "Consultando" \}/);
  assert.doesNotMatch(source, /async function listarRecebimentosOmie/);
});

test("job não pesquisa documentos, não faz backfill e não reprocessa erro temporário", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/hooks/integrationAutoProcessor.js"), "utf8");
  assert.doesNotMatch(source, /Compra\.find/);
  assert.doesNotMatch(source, /reconciliar|consolidar/i);
  assert.match(source, /status: "Erro definitivo"/);
  assert.match(source, /batchSize:[\s\S]*\|\| 1/);
});

test("menu possui acesso direto aos tickets de integração", () => {
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8"));
  assert.equal(ui.navigation.mode, "mixed");
  assert.equal(ui.navigation.items.some((item) => (
    item.label === "Tickets de Integração"
    && item.href === "/configuracoes/integracao-omie/tickets"
  )), true);
});
''')

final_mapping = read(mapping_path)
if '"listar-recebimentos"' in final_mapping or "default: [{}]" in final_mapping:
    raise RuntimeError("Mapeamento Omie ainda contém pesquisa legada ou parâmetro vazio padrão")
call_section = final_mapping[final_mapping.index("calls: {"):final_mapping.index("lists: [")]
call_count = len(re.findall(r'^    "[^"]+": \{', call_section, re.MULTILINE))
attempt_count = len(re.findall(r'maxAttempts: 1', call_section))
if call_count != attempt_count:
    raise RuntimeError(f"Nem todas as chamadas estão limitadas a uma tentativa: {attempt_count}/{call_count}")
