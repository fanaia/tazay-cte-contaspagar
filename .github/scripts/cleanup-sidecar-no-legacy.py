from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content if content.endswith("\n") else content + "\n")

# Base zerada: configuração singleton sem versão ou migração.
model_path = "backend/src/models/ConfiguracaoContasPagar.js"
model = read(model_path)
model = re.sub(r'\n    versaoConfiguracao: fields\.number\([^\n]+\),', '', model, count=1)
write(model_path, model)

write("backend/src/services/contasPagar/configuration.js", '''"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { models } = require("./runtime");

const CODIGO_ETAPA_FATURADO_FORNECEDOR = "50";

const DEFAULT_CONFIGURATION = Object.freeze({
  chave: "default",
  categoriaPadraoId: null,
  contaCorrentePadraoId: null,
});

function parametrosRecebimentosFaturados({ input = {} } = {}) {
  return [{
    nPagina: Math.max(1, Number(input.page || 1)),
    nRegistrosPorPagina: Math.max(1, Number(input.pageSize || 100)),
    cOrdenarPor: "CODIGO",
    cEtapa: CODIGO_ETAPA_FATURADO_FORNECEDOR,
    cExibirDetalhes: "S",
  }];
}

async function obterConfiguracao(options = {}) {
  const { ConfiguracaoContasPagar } = models();
  if (!ConfiguracaoContasPagar) return { ...DEFAULT_CONFIGURATION };
  let configuracao = await ConfiguracaoContasPagar.findOne({ chave: "default" }).lean();
  if (!configuracao && options.create === true) {
    configuracao = await ConfiguracaoContasPagar.findOneAndUpdate(
      { chave: "default" },
      { $setOnInsert: DEFAULT_CONFIGURATION },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }
  return { ...DEFAULT_CONFIGURATION, ...(configuracao || {}) };
}

function erroParametroFinanceiro(field, message) {
  return new GenericError(message, {
    statusCode: 422,
    details: { field, message },
  });
}

async function resolverCategoria(categoriaId) {
  const { CategoriaOmie } = models();
  if (!categoriaId || !CategoriaOmie) return null;
  const categoria = await CategoriaOmie.findById(categoriaId).lean();
  if (!categoria) throw erroParametroFinanceiro("categoriaId", "Categoria Omie selecionada não foi encontrada.");
  if (categoria.status === "Inativo") {
    throw erroParametroFinanceiro("categoriaId", `A categoria ${categoria.nome} está inativa no Omie.`);
  }
  return {
    id: String(categoria._id),
    codigo: String(categoria.codigoCategoriaOmie || "").trim(),
    nome: String(categoria.nome || categoria.descricao || "").trim(),
  };
}

async function resolverContaCorrente(contaCorrenteId) {
  const { ContaCorrenteOmie } = models();
  if (!contaCorrenteId || !ContaCorrenteOmie) return null;
  const conta = await ContaCorrenteOmie.findById(contaCorrenteId).lean();
  if (!conta) throw erroParametroFinanceiro("contaCorrenteId", "Conta corrente Omie selecionada não foi encontrada.");
  if (conta.status === "Inativo") {
    throw erroParametroFinanceiro("contaCorrenteId", `A conta corrente ${conta.nome} está inativa no Omie.`);
  }
  return {
    id: String(conta._id),
    codigo: Number(conta.codigoContaCorrenteOmie || 0),
    nome: String(conta.nome || "").trim(),
  };
}

async function resolverParametrosFinanceiros(input = {}, options = {}) {
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const obrigatorios = options.obrigatorios !== false;
  const categoriaId = input.categoriaId || input.categoriaFinanceiraId || input.categoriaOmieId
    || configuracao.categoriaPadraoId;
  const contaCorrenteId = input.contaCorrenteId || input.contaCorrenteFinanceiraId || input.contaCorrenteOmieId
    || configuracao.contaCorrentePadraoId;
  const [categoria, contaCorrente] = await Promise.all([
    resolverCategoria(categoriaId),
    resolverContaCorrente(contaCorrenteId),
  ]);
  if (obrigatorios && !categoria?.codigo) {
    throw erroParametroFinanceiro(
      "categoriaId",
      "Configure uma categoria padrão no Omie antes do processamento automático.",
    );
  }
  if (obrigatorios && !(contaCorrente?.codigo > 0)) {
    throw erroParametroFinanceiro(
      "contaCorrenteId",
      "Configure uma conta corrente padrão no Omie antes do processamento automático.",
    );
  }
  return { configuracao, categoria, contaCorrente };
}

module.exports = {
  CODIGO_ETAPA_FATURADO_FORNECEDOR,
  DEFAULT_CONFIGURATION,
  erroParametroFinanceiro,
  obterConfiguracao,
  parametrosRecebimentosFaturados,
  resolverCategoria,
  resolverContaCorrente,
  resolverParametrosFinanceiros,
};
''')

# Pagamento é recebido exclusivamente por webhook; remove estados e campos de polling.
conta_path = "backend/src/models/ContaPagarAgrupada.js"
conta = read(conta_path)
conta = conta.replace('  "Consultando",\n', '')
conta = re.sub(r'\n    consultaPagamentoRevisao: fields\.number\([^\n]+\),', '', conta, count=1)
conta = re.sub(r'\n    ultimaConsultaPagamentoEm: fields\.date\([^\n]+\),', '', conta, count=1)
write(conta_path, conta)

operations_path = "backend/src/services/contasPagar/omieOperations.js"
operations = read(operations_path)
operations = operations.replace(
    'const { ETAPA_CONCLUIDO, ETAPA_FATURADO, ETAPA_PAGO } = require("./constants");',
    'const { ETAPA_CONCLUIDO, ETAPA_PAGO } = require("./constants");',
)
operations, key_count = re.subn(
    r'\nfunction chaveConsultaContaPagar\([\s\S]*?\n}\n\nfunction cabecalhoRecebimento',
    '\nfunction cabecalhoRecebimento',
    operations,
    count=1,
)
operations, polling_count = re.subn(
    r'\nasync function consultarPagamentoContaPagar\([\s\S]*?\n}\n\nasync function executarConsultaPagamentoOmie\([\s\S]*?\n}\n\nmodule\.exports =',
    '\nmodule.exports =',
    operations,
    count=1,
)
if key_count != 1 or polling_count != 1:
    raise RuntimeError(f"Não foi possível remover polling: chave={key_count}, funções={polling_count}")
operations = operations.replace('  chaveConsultaContaPagar,\n', '')
operations = operations.replace('  consultarPagamentoContaPagar,\n', '')
operations = operations.replace('  executarConsultaPagamentoOmie,\n', '')
write(operations_path, operations)

mapping_path = "backend/src/mappings/omie.js"
mapping = read(mapping_path)
mapping = mapping.replace('  executarConsultaPagamentoOmie,\n', '')
mapping, call_count = re.subn(
    r'\n    "consultar-conta-pagar": \{[\s\S]*?\n    \},\n    "excluir-conta-pagar":',
    '\n    "excluir-conta-pagar":',
    mapping,
    count=1,
)
mapping = mapping.replace('    TAZAY_CONSULTAR_PAGAMENTO_OMIE: executarConsultaPagamentoOmie,\n', '')
if call_count != 1:
    raise RuntimeError("Chamada consultar-conta-pagar não encontrada")
write(mapping_path, mapping)

# Ação por ícone acessível, sem emoji.
ui_path = "frontend/central.ui.json"
ui = json.loads(read(ui_path))
conta_view = next(item for item in ui["collections"] if item.get("model") == "ContaPagarAgrupada")
action = conta_view["list"]["rowActions"][0]
action["label"] = "Excluir conta"
action["icon"] = "trash"
action["iconOnly"] = True
write(ui_path, json.dumps(ui, ensure_ascii=False, indent=2) + "\n")

# Teste financeiro focado em eventos, sem polling.
write("backend/test/pagamentoOmie.test.js", '''"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classificarPagamentoContaPagar,
  montarObservacaoDocumentosFiscais,
  montarPayloadContaPagar,
} = require("../src/services/contasPagar");

test("descrição do contas a pagar detalha NF-es, CT-es e valores", () => {
  const documentos = [
    { tipoDocumentoFiscal: "NF-e", numeroDocumentoFiscal: "00000", valorFaturado: 100 },
    { tipoDocumentoFiscal: "CT-e", numeroDocumentoFiscal: "00001", valorFaturado: 200 },
  ];
  assert.equal(
    montarObservacaoDocumentosFiscais(documentos),
    "Contas a Pagar gerada pela Central Oon referente aos documentos fiscais:\\nNF-e 00000 - R$ 100,00\\nCT-e 00001 - R$ 200,00",
  );
  const payload = montarPayloadContaPagar({
    codigoLancamentoIntegracao: "OON-DOCS-G1",
    codigoFornecedorOmie: 123,
    tipoDocumentoFiscal: "NF-e",
    dataVencimento: "2026-08-12",
    geracao: 1,
    codigoCategoriaOmie: "2.01.01",
    codigoContaCorrenteOmie: 10,
  }, documentos);
  assert.equal(payload.observacao, montarObservacaoDocumentosFiscais(documentos));
});

test("classifica situação de pagamento recebida nos eventos Omie", () => {
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "PAG" }).statusPagamentoOmie, "Pago");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "LIQ" }).statusPagamentoOmie, "Pago");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "PAGTO_PARCIAL" }).statusPagamentoOmie, "Parcial");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "CANCELADO" }).statusPagamentoOmie, "Cancelado");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "EMABERTO", valor_pag: 100 }).statusPagamentoOmie, "Pendente");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "EMABERTO", valor_pag: 0 }).statusPagamentoOmie, "Pago");
});

test("envio possui handler próprio e pagamento não possui polling", () => {
  const mapping = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const operations = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/omieOperations.js"), "utf8");
  const reconciliation = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/reconciliation.js"), "utf8");
  assert.match(mapping, /TAZAY_ENVIAR_CONTA_PAGAR_OMIE: executarEnvioContaPagarOmie/);
  assert.doesNotMatch(mapping, /consultar-conta-pagar|TAZAY_CONSULTAR_PAGAMENTO_OMIE/);
  assert.doesNotMatch(operations, /consultarPagamentoContaPagar|executarConsultaPagamentoOmie|Consultando/);
  assert.match(reconciliation, /handler: "TAZAY_ENVIAR_CONTA_PAGAR_OMIE"/);
  assert.doesNotMatch(reconciliation, /enqueueOmieCall/);
});

test("modelos exibem situação Omie sem consulta manual ou periódica", () => {
  const compra = fs.readFileSync(path.join(__dirname, "../src/models/Compra.js"), "utf8");
  const conta = fs.readFileSync(path.join(__dirname, "../src/models/ContaPagarAgrupada.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8");
  assert.match(compra, /"Pago"/);
  assert.match(conta, /statusPagamentoOmie/);
  assert.doesNotMatch(conta, /Consultando|consultaPagamentoRevisao|ultimaConsultaPagamentoEm/);
  assert.doesNotMatch(routes, /consultar-pagamento/);
  assert.doesNotMatch(ui, /Consultar pagamento no Omie/);
});
''')

consumo_path = "backend/test/consumoOmie.test.js"
consumo = read(consumo_path)
consumo = re.sub(
    r'test\("consulta de pagamento impede ticket duplicado enquanto já consulta"[\s\S]*?\n}\);\n\n',
    '''test("pagamento é atualizado exclusivamente por eventos do Omie", () => {\n  const operations = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/omieOperations.js"), "utf8");\n  const mapping = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");\n  const webhooks = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/webhooks.js"), "utf8");\n  assert.doesNotMatch(operations, /consultarPagamentoContaPagar|executarConsultaPagamentoOmie/);\n  assert.doesNotMatch(mapping, /consultar-conta-pagar|TAZAY_CONSULTAR_PAGAMENTO_OMIE/);\n  assert.match(webhooks, /Financas\\.ContaPagar\\.BaixaRealizada/);\n  assert.match(webhooks, /Financas\\.ContaPagar\\.BaixaCancelada/);\n});\n\n''',
    consumo,
    count=1,
)
write(consumo_path, consumo)

contas_test_path = "backend/test/contasPagar.test.js"
contas_test = read(contas_test_path)
contas_test = contas_test.replace('  assert.equal(DEFAULT_CONFIGURATION.versaoConfiguracao, 4);\n', '')
write(contas_test_path, contas_test)

sidecar_test_path = "backend/test/sidecarAutomatico.test.js"
sidecar_test = read(sidecar_test_path)
insert = '''test("base zerada não possui migração ou versão de configuração", () => {
  const model = source("../src/models/ConfiguracaoContasPagar.js");
  const config = source("../src/services/contasPagar/configuration.js");
  assert.doesNotMatch(model, /versaoConfiguracao/);
  assert.doesNotMatch(config, /CONFIGURATION_VERSION|versaoConfiguracao|\\$lt|\\$exists/);
});

test("exclusão é exibida como ícone acessível e não emoji", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  const action = conta.list.rowActions[0];
  assert.equal(action.label, "Excluir conta");
  assert.equal(action.icon, "trash");
  assert.equal(action.iconOnly, true);
  assert.notEqual(action.label, "🗑️");
});

'''
marker = 'test("configuração não permite desligar a automação", () => {'
if marker not in sidecar_test:
    raise RuntimeError("Marcador do sidecar test não encontrado")
sidecar_test = sidecar_test.replace(marker, insert + marker, 1)
write(sidecar_test_path, sidecar_test)

# Falha cedo caso qualquer caminho de legado/polling permaneça.
all_source = "\n".join([
    read("backend/src/models/ConfiguracaoContasPagar.js"),
    read("backend/src/services/contasPagar/configuration.js"),
    read("backend/src/models/ContaPagarAgrupada.js"),
    read("backend/src/services/contasPagar/omieOperations.js"),
    read("backend/src/mappings/omie.js"),
])
for token in [
    "versaoConfiguracao",
    "CONFIGURATION_VERSION",
    "consultarPagamentoContaPagar",
    "executarConsultaPagamentoOmie",
    "TAZAY_CONSULTAR_PAGAMENTO_OMIE",
    '"consultar-conta-pagar"',
    '"Consultando"',
    "consultaPagamentoRevisao",
    "ultimaConsultaPagamentoEm",
]:
    if token in all_source:
        raise RuntimeError(f"Caminho legado/polling ainda presente: {token}")
