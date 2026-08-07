"use strict";

const { obterConfiguracao } = require("./configuration");
const { ETAPA_FATURADO } = require("./constants");
const { models } = require("./runtime");

async function agendarProcessamentoDocumentoOperacional(documento = {}, options = {}) {
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  if (
    configuracao.aprovarCompraAutomatico !== true
    && documento.statusAprovacao === "Aprovada"
  ) {
    return {
      ignored: true,
      reason: "aguardando-geracao-pagamento-manual",
      compraId: String(documento._id || ""),
    };
  }
  const { agendarProcessamentoPendentes } = require("./sidecar");
  return agendarProcessamentoPendentes(documento, options);
}

async function resumoFluxoManual(options = {}) {
  const { Compra } = models();
  const filtroBase = {
    etapa: ETAPA_FATURADO,
    statusDocumentoOmie: "Pendente",
  };
  if (options.instanceId) filtroBase.instanceId = String(options.instanceId);
  const [aguardandoAprovacao, aguardandoGeracao] = await Promise.all([
    Compra.countDocuments({ ...filtroBase, statusAprovacao: "Pendente" }),
    Compra.countDocuments({
      ...filtroBase,
      statusAprovacao: "Aprovada",
      contaPagarId: { $exists: false },
    }),
  ]);
  return {
    total: aguardandoAprovacao + aguardandoGeracao,
    processed: 0,
    awaitingApproval: aguardandoAprovacao,
    awaitingPaymentGeneration: aguardandoGeracao,
    ignored: aguardandoGeracao,
    accountsGenerated: 0,
    accountsQueued: 0,
    errors: [],
    mode: "manual",
  };
}

async function reconciliarPendentes(options = {}) {
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  if (configuracao.aprovarCompraAutomatico !== true) {
    return resumoFluxoManual(options);
  }
  const legacy = require("./reconciliation");
  return legacy.reconciliarPendentes({ ...options, configuracao });
}

async function executarProcessamentoPendentesOmie(event, context = {}) {
  const instanceId = String(event.payload?.instanceId || "default");
  const result = await reconciliarPendentes({ instanceId });
  context.recordItem?.({ instanceId, ...result });
  return { instanceId, ...result };
}

module.exports = {
  agendarProcessamentoDocumentoOperacional,
  executarProcessamentoPendentesOmie,
  reconciliarPendentes,
  resumoFluxoManual,
};
