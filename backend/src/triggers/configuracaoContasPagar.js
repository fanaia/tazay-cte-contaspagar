"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const { agendarProcessamentoPendentes, models } = require("../services/contasPagar");

const STATUS_CONTAS_ATIVAS = [
  "Pendente envio",
  "Pendente sincronização",
  "Aberta",
  "Pagamento cancelado",
  "Erro",
];

async function atualizarDisponibilidadeAcoes(configuracao = {}) {
  const { Compra, ContaPagarAgrupada } = models();
  const aprovacaoManual = configuracao.aprovarCompraAutomatico !== true;
  const sincronizacaoManual = configuracao.enviarContaPagarOmieAutomatico !== true;

  await Compra.updateMany({}, {
    $set: { acaoAprovacaoManualDisponivel: false },
  });
  if (aprovacaoManual) {
    await Compra.updateMany({
      etapa: "Faturado pelo fornecedor",
      statusDocumentoOmie: "Pendente",
      statusAprovacao: "Pendente",
      recusaOmiePendente: { $ne: true },
    }, {
      $set: { acaoAprovacaoManualDisponivel: true },
    });
  }

  await ContaPagarAgrupada.updateMany({}, {
    $set: { acaoSincronizacaoManualDisponivel: false },
  });
  if (sincronizacaoManual) {
    await ContaPagarAgrupada.updateMany({
      status: { $in: STATUS_CONTAS_ATIVAS },
    }, {
      $set: { acaoSincronizacaoManualDisponivel: true },
    });
  }

  return { aprovacaoManual, sincronizacaoManual };
}

defineTrigger("ConfiguracaoContasPagar", {
  after: async (configuracao) => {
    if (String(configuracao?.chave || "default") !== "default") return;
    const disponibilidade = await atualizarDisponibilidadeAcoes(configuracao);
    if (!disponibilidade.aprovacaoManual) {
      const { Compra } = models();
      const documentos = await Compra.find({
        etapa: "Faturado pelo fornecedor",
        statusDocumentoOmie: "Pendente",
        statusAprovacao: "Pendente",
      }).select("_id instanceId etapa statusDocumentoOmie tipoDocumentoFiscal statusAprovacao statusIntegracao contaPagarId").lean();
      const porInstancia = new Map();
      for (const documento of documentos) {
        const instanceId = String(documento.instanceId || "default");
        if (!porInstancia.has(instanceId)) porInstancia.set(instanceId, documento);
      }
      for (const documento of porInstancia.values()) {
        await agendarProcessamentoPendentes(documento);
      }
    }
  },
});

module.exports = { atualizarDisponibilidadeAcoes };
