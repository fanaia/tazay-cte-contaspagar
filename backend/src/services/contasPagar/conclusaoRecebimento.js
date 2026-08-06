"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_CONCLUIDO } = require("./constants");
const { core, models } = require("./runtime");
const { primeiroValor } = require("./utils");
const {
  dadosRespostaOmie,
  listarRecebimentosOmie,
  selecionarRecebimentoDaCompra,
} = require("./omieOperations");

async function executarChamadaOmie(call, instanceId, param, context = {}) {
  const { omie } = core();
  if (!omie?.call) {
    throw new GenericError("O runtime Omie não disponibiliza execução de chamadas declaradas.", {
      statusCode: 500,
    });
  }
  return omie.call({
    callKey: call,
    instanceId,
    payload: { param: Array.isArray(param) ? param : [param] },
  }, { context });
}

function identificacaoPersistida(compra = {}) {
  return {
    codigoRecebimentoOmie: Number(compra.codigoRecebimentoOmie || 0),
    chaveDocumentoFiscal: String(compra.chaveDocumentoFiscal || "").trim(),
    etapaOmie: String(compra.codigoEtapaRecebimentoOmie || "50").trim() || "50",
    recebido: compra.statusDocumentoOmie === "Recebido"
      || compra.situacaoPedidoOmieOrigem === "Recebido",
  };
}

async function resolverIdentificacaoRecebimento(compra, context = {}) {
  const persistida = identificacaoPersistida(compra);
  if (persistida.codigoRecebimentoOmie > 0 || persistida.chaveDocumentoFiscal) {
    return { identificacao: persistida, origem: "persistida", chamadasListagem: 0 };
  }

  // Compatibilidade exclusiva para registros antigos que ainda não possuem
  // nIdReceb nem chave fiscal armazenados. Novos registros não passam por esta listagem.
  const recebimentos = await listarRecebimentosOmie(compra, context);
  const selecionado = selecionarRecebimentoDaCompra(recebimentos, compra);
  return {
    identificacao: selecionado.identificacao,
    origem: "fallback-legado",
    chamadasListagem: 1,
  };
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
    const compraData = compra.toObject();
    const resolucao = await resolverIdentificacaoRecebimento(compraData, context);
    const { identificacao } = resolucao;
    if (!(identificacao.codigoRecebimentoOmie > 0) && !identificacao.chaveDocumentoFiscal) {
      throw new GenericError("A compra não possui ID nem chave fiscal para concluir o recebimento.", {
        statusCode: 422,
        retryable: false,
      });
    }

    let resposta = {};
    if (!identificacao.recebido) {
      const result = await executarChamadaOmie(
        "concluir-recebimento",
        compra.instanceId,
        [{
          nIdReceb: identificacao.codigoRecebimentoOmie || undefined,
          cChaveNfe: identificacao.chaveDocumentoFiscal || undefined,
          cEtapa: identificacao.etapaOmie || "50",
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
      origemIdentificacao: resolucao.origem,
      chamadasListagem: resolucao.chamadasListagem,
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
    throw error;
  }
}

module.exports = {
  executarConclusaoRecebimentoOmie,
  identificacaoPersistida,
  resolverIdentificacaoRecebimento,
};
