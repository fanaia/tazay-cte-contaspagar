from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content if content.endswith("\n") else content + "\n")


def replace_once(source, old, new, label):
    if old not in source:
        raise RuntimeError(f"Trecho não encontrado: {label}")
    return source.replace(old, new, 1)

# Agenda um único processamento em lote para os documentos carregados na mesma janela.
path = "backend/src/services/contasPagar/sidecar.js"
source = read(path)
anchor = '''function observacaoDocumentoCancelado(compra = {}, conta = {}, pago = false) {
  const documento = `${compra.tipoDocumentoFiscal || "Documento"} ${compra.numeroDocumentoFiscal || compra.codigoRecebimentoOmie}`;
  const titulo = conta.codigoLancamentoOmie || conta.codigoLancamentoIntegracao || "sem identificação";
  if (pago) {
    return `${documento} cancelado no Omie após a realização do pagamento da conta agrupada ${titulo}. O pagamento já havia sido realizado.`;
  }
  return `${documento} cancelado no Omie e removido da conta a pagar agrupada ${titulo}.`;
}
'''
insert = anchor + '''
function janelaProcessamento(now = new Date()) {
  return Math.floor(new Date(now).getTime() / 15000);
}

async function agendarProcessamentoPendentes(documento = {}, options = {}) {
  if (documento.etapa !== ETAPA_FATURADO || documento.statusDocumentoOmie !== "Pendente") {
    return { ignored: true, reason: "documento-fora-de-faturado-pendente" };
  }
  if (!["NF-e", "CT-e"].includes(documento.tipoDocumentoFiscal)) {
    return { ignored: true, reason: "tipo-documento-nao-suportado" };
  }
  if (
    documento.statusAprovacao === "Aprovada"
    && documento.contaPagarId
    && documento.statusIntegracao === "Sincronizado"
  ) {
    return { ignored: true, reason: "documento-sem-pendencia" };
  }

  const instanceId = String(documento.instanceId || "default");
  const bucket = janelaProcessamento(options.now || new Date());
  const { enqueueIntegration } = core();
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TAZAY_PROCESSAR_PENDENTES_OMIE",
    resource: "documentos-fiscais",
    operation: "reconcile",
    aggregateType: "IntegracaoOmie",
    aggregateId: instanceId,
    idempotencyKey: `tazay:documentos-fiscais:${instanceId}:reconcile:${bucket}`,
    payload: { instanceId },
  });
  return {
    instanceId,
    ticketId: String(ticket?._id || ""),
    scheduled: true,
  };
}

async function executarProcessamentoPendentesOmie(event, context = {}) {
  const { reconciliarPendentes } = require("./reconciliation");
  const instanceId = String(event.payload?.instanceId || "default");
  const result = await reconciliarPendentes({ instanceId });
  context.recordItem?.({ instanceId, ...result });
  return { instanceId, ...result };
}
'''
source = replace_once(source, anchor, insert, "inserir agendamento")

old = '''  if (conta.status === "Exclusão pendente") {
    return { ignored: true, reason: "exclusao-ja-pendente", contaId };
  }

  const param = chaveContaPagarOmie(conta);
'''
new = '''  if (conta.status === "Exclusão pendente") {
    return { ignored: true, reason: "exclusao-ja-pendente", contaId };
  }

  const sincronizada = Number(conta.codigoLancamentoOmie || 0) > 0
    || Number(conta.revisao || 0) > 0
    || ["Pendente", "Enviado"].includes(conta.statusEnvioOmie)
    || ["Pendente sincronização", "Aberta", "Pagamento cancelado"].includes(conta.status);
  if (!sincronizada) {
    const result = await regenerarContaExcluida(conta._id, options);
    return { ...result, exclusaoSomenteLocal: true };
  }

  const param = chaveContaPagarOmie(conta);
'''
source = replace_once(source, old, new, "exclusão local segura")
source = source.replace(
'''module.exports = {
  STATUS_DOCUMENTO_CANCELADO,
  chaveContaPagarOmie,
  executarExclusaoContaPagarOmie,
  observacaoDocumentoCancelado,
  pagamentoRealizado,
  regenerarContaExcluida,
  solicitarExclusaoContaOmie,
  tratarCancelamentoDocumento,
};''',
'''module.exports = {
  STATUS_DOCUMENTO_CANCELADO,
  agendarProcessamentoPendentes,
  chaveContaPagarOmie,
  executarExclusaoContaPagarOmie,
  executarProcessamentoPendentesOmie,
  janelaProcessamento,
  observacaoDocumentoCancelado,
  pagamentoRealizado,
  regenerarContaExcluida,
  solicitarExclusaoContaOmie,
  tratarCancelamentoDocumento,
};''')
write(path, source)

# O trigger apenas agenda o lote; não cria uma chamada Omie por documento importado.
write("backend/src/triggers/compras.js", '''"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const { agendarProcessamentoPendentes } = require("../services/contasPagar");

defineTrigger("Compra", {
  after: async (document) => {
    await agendarProcessamentoPendentes(document);
  },
});
''')

# Filtra somente pendências reais no reconciliador em lote.
path = "backend/src/services/contasPagar/reconciliation.js"
source = read(path)
old = '''  const configuracao = await obterConfiguracao({ create: true });
  const compras = await Compra.find({ etapa: ETAPA_FATURADO })
    .sort({ codigoFornecedorOmie: 1, codigoPedidoOmie: 1 })
    .lean();'''
new = '''  const configuracao = await obterConfiguracao({ create: true });
  const query = {
    etapa: ETAPA_FATURADO,
    statusDocumentoOmie: "Pendente",
    $or: [
      { statusAprovacao: { $ne: "Aprovada" } },
      { contaPagarId: { $exists: false } },
      { statusIntegracao: { $in: ["Não sincronizado", "Pendente", "Erro"] } },
    ],
  };
  if (options.instanceId) query.instanceId = String(options.instanceId);
  const compras = await Compra.find(query)
    .sort({ codigoFornecedorOmie: 1, tipoDocumentoFiscal: 1, codigoPedidoOmie: 1 })
    .lean();'''
source = replace_once(source, old, new, "query de pendências")
write(path, source)

# Webhook agenda lote somente quando os dados de negócio mudaram.
path = "backend/src/services/contasPagar/webhooks.js"
source = read(path)
source = source.replace(
'''  STATUS_DOCUMENTO_CANCELADO,
  regenerarContaExcluida,
  tratarCancelamentoDocumento,
} = require("./sidecar");''',
'''  STATUS_DOCUMENTO_CANCELADO,
  agendarProcessamentoPendentes,
  regenerarContaExcluida,
  tratarCancelamentoDocumento,
} = require("./sidecar");''')
source = source.replace('const { reconciliarCompra } = require("./reconciliation");\n', '')
old = '''  const current = await Compra.findOne({ chaveExterna: normalized.chaveExterna }).lean();
  if (current?.entradaFaturadoEm) normalized.entradaFaturadoEm = current.entradaFaturadoEm;
  if (current?.dataVencimento) normalized.dataVencimento = current.dataVencimento;
  if (current?.statusAprovacao) normalized.statusAprovacao = current.statusAprovacao;
  if (current?.contaPagarId) normalized.contaPagarId = current.contaPagarId;
  if (!normalized.entradaFaturadoEm) normalized.entradaFaturadoEm = new Date();
  const compra = await Compra.findOneAndUpdate(
    { chaveExterna: normalized.chaveExterna },
    { $set: normalized },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return reconciliarCompra(compra._id);'''
new = '''  const current = await Compra.findOne({ chaveExterna: normalized.chaveExterna }).lean();
  const fields = [
    "tipoDocumentoFiscal",
    "numeroDocumentoFiscal",
    "codigoFornecedorOmie",
    "valorFaturado",
    "codigoCategoriaOmie",
    "codigoContaCorrenteOmie",
    "statusDocumentoOmie",
    "codigoEtapaRecebimentoOmie",
  ];
  const changed = !current || fields.some((field) => (
    String(current?.[field] ?? "") !== String(normalized?.[field] ?? "")
  ));
  if (current?.entradaFaturadoEm) normalized.entradaFaturadoEm = current.entradaFaturadoEm;
  if (current?.dataVencimento) normalized.dataVencimento = current.dataVencimento;
  if (current?.statusAprovacao) normalized.statusAprovacao = current.statusAprovacao;
  if (current?.contaPagarId) normalized.contaPagarId = current.contaPagarId;
  if (!normalized.entradaFaturadoEm) normalized.entradaFaturadoEm = new Date();
  normalized.statusIntegracao = changed ? "Pendente" : (current?.statusIntegracao || "Sincronizado");
  const compra = await Compra.findOneAndUpdate(
    { chaveExterna: normalized.chaveExterna },
    { $set: normalized },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (!changed) return { ignored: true, reason: "documento-sem-alteracao", compraId: String(compra._id) };
  return agendarProcessamentoPendentes(compra);'''
source = replace_once(source, old, new, "agendamento do webhook")
write(path, source)

# Handler do processamento em lote.
path = "backend/src/mappings/omie.js"
source = read(path)
source = source.replace(
'''  executarExclusaoContaPagarOmie,
  executarEnvioContaPagarOmie,''',
'''  executarExclusaoContaPagarOmie,
  executarEnvioContaPagarOmie,
  executarProcessamentoPendentesOmie,''')
source = source.replace(
'''    TAZAY_EXCLUIR_CONTA_PAGAR_OMIE: executarExclusaoContaPagarOmie,
    TAZAY_PROCESSAR_WEBHOOK_OMIE: processarWebhookOmie''',
'''    TAZAY_EXCLUIR_CONTA_PAGAR_OMIE: executarExclusaoContaPagarOmie,
    TAZAY_PROCESSAR_PENDENTES_OMIE: executarProcessamentoPendentesOmie,
    TAZAY_PROCESSAR_WEBHOOK_OMIE: processarWebhookOmie''')
write(path, source)

# Regressões de processamento em lote e ausência de consumo por item.
path = "backend/test/sidecarAutomatico.test.js"
source = read(path)
insert_before = '''test("configuração não permite desligar a automação", () => {'''
new_tests = r'''test("importação agenda processamento em lote em vez de chamar o Omie por documento", () => {
  const trigger = source("../src/triggers/compras.js");
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(trigger, /agendarProcessamentoPendentes/);
  assert.doesNotMatch(trigger, /reconciliarCompra/);
  assert.match(sidecar, /TAZAY_PROCESSAR_PENDENTES_OMIE/);
  assert.match(sidecar, /janelaProcessamento/);
  assert.match(reconciliation, /statusAprovacao: \{ \$ne: "Aprovada" \}/);
  assert.match(reconciliation, /statusDocumentoOmie: "Pendente"/);
  assert.match(mapping, /TAZAY_PROCESSAR_PENDENTES_OMIE: executarProcessamentoPendentesOmie/);
});

test("webhook sem alteração não gera novo processamento", () => {
  const webhooks = source("../src/services/contasPagar/webhooks.js");
  assert.match(webhooks, /documento-sem-alteracao/);
  assert.match(webhooks, /normalized\.statusIntegracao = changed/);
  assert.match(webhooks, /agendarProcessamentoPendentes\(compra\)/);
});

'''
if insert_before not in source:
    raise RuntimeError("Ponto de inserção dos testes não encontrado")
source = source.replace(insert_before, new_tests + insert_before, 1)
write(path, source)
