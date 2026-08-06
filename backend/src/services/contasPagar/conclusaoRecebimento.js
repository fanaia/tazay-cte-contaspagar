"use strict";

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
