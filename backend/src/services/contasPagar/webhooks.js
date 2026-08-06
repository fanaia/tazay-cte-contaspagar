"use strict";

const { ETAPA_FATURADO } = require("./constants");
const {
  encontrarFinanceiro,
  encontrarRecebimento,
  normalizarCompraOmie,
  normalizarRecebimentoOmie,
} = require("./normalization");
const { classificarPagamentoContaPagar, enfileirarConclusaoCompras } = require("./omieOperations");
const { chaveBase } = require("./payload");
const { models } = require("./runtime");
const { primeiroValor } = require("./utils");
const {
  STATUS_DOCUMENTO_CANCELADO,
  agendarProcessamentoPendentes,
  regenerarContaExcluida,
  tratarCancelamentoDocumento,
} = require("./sidecar");

async function processarWebhookCompra(eventType, payload, instanceId = "default") {
  const { Compra } = models();
  const recebimento = encontrarRecebimento(payload);
  const normalized = recebimento
    ? normalizarRecebimentoOmie(recebimento, { instanceId })
    : normalizarCompraOmie(payload, { instanceId, eventType });
  if (!normalized) return { ignored: true, reason: "documento-nao-reconhecido", eventType };
  if (!["NF-e", "CT-e"].includes(normalized.tipoDocumentoFiscal)) {
    return { ignored: true, reason: "tipo-documento-nao-suportado", eventType };
  }
  if (STATUS_DOCUMENTO_CANCELADO.includes(normalized.statusDocumentoOmie)) {
    return tratarCancelamentoDocumento(normalized);
  }
  if (normalized.statusDocumentoOmie !== "Pendente" || normalized.etapa !== ETAPA_FATURADO) {
    return { ignored: true, reason: "documento-fora-de-faturado-pendente", eventType };
  }

  const current = await Compra.findOne({ chaveExterna: normalized.chaveExterna }).lean();
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
  return agendarProcessamentoPendentes(compra);
}

async function localizarContaFinanceira(payload) {
  const { ContaPagarAgrupada } = models();
  const data = encontrarFinanceiro(payload) || {};
  const integrationCode = String(data.codigo_lancamento_integracao || "").trim();
  const omieCode = Number(primeiroValor(data.codigo_lancamento_omie, data.codigo_lancamento, 0));
  const query = [];
  if (integrationCode) query.push({ codigoLancamentoIntegracao: integrationCode });
  if (omieCode > 0) query.push({ codigoLancamentoOmie: omieCode });
  if (!query.length) return { conta: null, data };
  return { conta: await ContaPagarAgrupada.findOne({ $or: query }), data };
}

async function processarWebhookContaPagar(eventType, payload) {
  const { Compra, ContaPagarAgrupada } = models();
  const { conta, data } = await localizarContaFinanceira(payload);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", eventType };
  const omieCode = Number(primeiroValor(data.codigo_lancamento_omie, data.codigo_lancamento, conta.codigoLancamentoOmie, 0));
  const pagamento = classificarPagamentoContaPagar(data);
  const now = new Date();
  const commonSet = {
    codigoLancamentoOmie: omieCode > 0 ? omieCode : conta.codigoLancamentoOmie,
    statusEnvioOmie: "Enviado",
    statusTituloOmie: pagamento.statusTituloOmie,
    valorPagarOmie: pagamento.valorPagar,
    ultimaSincronizacaoEm: now,
    ultimaConsultaPagamentoEm: now,
    ultimoErro: "",
  };

  if (eventType === "Financas.ContaPagar.BaixaRealizada") {
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { ...commonSet, status: "Paga", statusPagamentoOmie: "Pago" },
      $unset: { chaveAtiva: 1 },
    });
    const compras = await Compra.find({ contaPagarId: conta._id }).lean();
    const ticketsConclusao = await enfileirarConclusaoCompras(compras, now);
    return { contaId: String(conta._id), status: "Paga", statusPagamentoOmie: "Pago", ticketsConclusao };
  }

  if (eventType === "Financas.ContaPagar.BaixaCancelada") {
    try {
      await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
        $set: {
          ...commonSet,
          status: "Aberta",
          statusPagamentoOmie: "Cancelado",
          chaveAtiva: chaveBase(conta),
        },
      }, { runValidators: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
        $set: { ...commonSet, status: "Pagamento cancelado", statusPagamentoOmie: "Cancelado" },
        $unset: { chaveAtiva: 1 },
      });
    }
    await Compra.updateMany(
      { contaPagarId: conta._id },
      {
        $set: {
          etapa: ETAPA_FATURADO,
          statusDocumentoOmie: "Pendente",
          situacaoPedidoOmieOrigem: "Pendente",
          statusConclusaoOmie: "Não enviado",
          statusIntegracao: "Sincronizado",
          ultimaSincronizacaoEm: now,
          ultimoErro: "",
        },
        $unset: { concluidaNoOmieEm: 1 },
      },
    );
    return { contaId: String(conta._id), status: "Aberta", statusPagamentoOmie: "Cancelado" };
  }

  if (eventType === "Financas.ContaPagar.Excluido") {
    return regenerarContaExcluida(conta._id);
  }

  const statusPagamentoOmie = pagamento.statusPagamentoOmie === "Pago"
    ? "Pago"
    : pagamento.statusPagamentoOmie === "Parcial"
      ? "Parcial"
      : "Pendente";
  const statusConta = statusPagamentoOmie === "Pago" ? "Paga" : "Aberta";
  const update = { $set: { ...commonSet, status: statusConta, statusPagamentoOmie } };
  if (statusPagamentoOmie === "Pago") update.$unset = { chaveAtiva: 1 };
  await ContaPagarAgrupada.findByIdAndUpdate(conta._id, update);
  let ticketsConclusao = [];
  if (statusPagamentoOmie === "Pago") {
    const compras = await Compra.find({ contaPagarId: conta._id }).lean();
    ticketsConclusao = await enfileirarConclusaoCompras(compras, now);
  } else {
    await Compra.updateMany(
      { contaPagarId: conta._id },
      { $set: { statusIntegracao: "Sincronizado", ultimaSincronizacaoEm: now, ultimoErro: "" } },
    );
  }
  return { contaId: String(conta._id), status: statusConta, statusPagamentoOmie, ticketsConclusao };
}

async function processarWebhookOmie(event, context = {}) {
  const payload = event?.payload || {};
  const eventType = String(payload.eventType || payload.topic || "");
  const body = payload.body || payload.payload || payload;
  const instanceId = String(payload.instanceId || "default");
  const result = eventType.startsWith("Financas.ContaPagar.")
    ? await processarWebhookContaPagar(eventType, body)
    : await processarWebhookCompra(eventType, body, instanceId);
  context.recordItem?.({ eventType, ...result });
  return result;
}

module.exports = { processarWebhookCompra, processarWebhookContaPagar, processarWebhookOmie };
