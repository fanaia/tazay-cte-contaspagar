"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_CONCLUIDO, ETAPA_FATURADO } = require("./constants");
const { obterConfiguracao } = require("./configuration");
const {
  classificarPagamentoContaPagar,
  enfileirarConclusaoCompras,
} = require("./omieOperations");
const { executarChamadaOmie } = require("./omieRequest");
const { core, models } = require("./runtime");
const { primeiroValor } = require("./utils");

function dadosRespostaOmie(result = {}) {
  return result?.data || result?.response || result || {};
}

function identidadeUsuario(options = {}) {
  return String(options.usuario || "Usuário").trim() || "Usuário";
}

function chaveConsultaContaPagar(conta = {}) {
  const codigoOmie = Number(conta.codigoLancamentoOmie || 0);
  if (codigoOmie > 0) return { codigo_lancamento_omie: codigoOmie };
  const codigoIntegracao = String(conta.codigoLancamentoIntegracao || "").trim();
  if (codigoIntegracao) return { codigo_lancamento_integracao: codigoIntegracao };
  throw new GenericError("A conta não possui código Omie nem código de integração para consulta.", {
    statusCode: 422,
    retryable: false,
  });
}

async function exigirAprovacaoManual() {
  const configuracao = await obterConfiguracao({ create: true });
  if (configuracao.aprovarCompraAutomatico === true) {
    throw new GenericError(
      "A aprovação automática está habilitada. Desabilite-a nas configurações para aprovar ou recusar manualmente.",
      { statusCode: 409, retryable: false },
    );
  }
  return configuracao;
}

async function exigirSincronizacaoManual() {
  const configuracao = await obterConfiguracao({ create: true });
  if (configuracao.enviarContaPagarOmieAutomatico === true) {
    throw new GenericError(
      "A sincronização automática com o Omie está habilitada. Desabilite-a nas configurações para executar esta ação manualmente.",
      { statusCode: 409, retryable: false },
    );
  }
  return configuracao;
}

async function recusarDocumentoFiscal(compraOrId, options = {}) {
  await exigirAprovacaoManual();
  const { Compra } = models();
  const compraId = String(compraOrId?._id || compraOrId || "");
  const compra = await Compra.findById(compraId);
  if (!compra) throw new GenericError("Documento fiscal não encontrado.", { statusCode: 404 });
  if (compra.statusAprovacao === "Recusada" || compra.statusDocumentoOmie === "Cancelado") {
    return { ignored: true, reason: "documento-ja-recusado", compraId };
  }
  if (compra.statusAprovacao !== "Pendente" || compra.etapa !== ETAPA_FATURADO) {
    throw new GenericError("Somente documentos fiscais pendentes podem ser recusados.", {
      statusCode: 409,
      retryable: false,
    });
  }
  if (compra.contaPagarId) {
    throw new GenericError("O documento já está vinculado a uma conta agrupada e não pode ser recusado por esta ação.", {
      statusCode: 409,
      retryable: false,
    });
  }
  if (compra.recusaOmiePendente === true) {
    return { ignored: true, reason: "recusa-ja-pendente", compraId };
  }
  const codigoRecebimentoOmie = Number(compra.codigoRecebimentoOmie || 0);
  if (!(codigoRecebimentoOmie > 0)) {
    throw new GenericError("O documento não possui código de recebimento Omie para recusa.", {
      statusCode: 422,
      retryable: false,
    });
  }

  const updated = await Compra.findOneAndUpdate(
    {
      _id: compra._id,
      statusAprovacao: "Pendente",
      recusaOmiePendente: { $ne: true },
    },
    {
      $set: {
        recusaOmiePendente: true,
        statusIntegracao: "Pendente",
        ultimoErro: "",
      },
      $inc: { recusaOmieRevisao: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!updated) return { ignored: true, reason: "recusa-ja-pendente", compraId };

  const { enqueueIntegration } = core();
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TAZAY_RECUSAR_DOCUMENTO_FISCAL_OMIE",
    resource: "documentos-fiscais",
    operation: "reject",
    aggregateType: "Compra",
    aggregateId: String(updated._id),
    idempotencyKey: `tazay:documento-fiscal:${updated._id}:recusar:r${updated.recusaOmieRevisao}`,
    payload: {
      compraId: String(updated._id),
      param: [{ nIdReceb: codigoRecebimentoOmie }],
      usuario: identidadeUsuario(options),
    },
  });
  return {
    compraId: String(updated._id),
    ticketId: String(ticket?._id || ""),
    status: "Recusa pendente",
  };
}

async function executarRecusaDocumentoFiscalOmie(event, context = {}) {
  const { Compra } = models();
  const compraId = String(event.payload?.compraId || event.aggregateId || "");
  const compra = await Compra.findById(compraId);
  if (!compra) return { ignored: true, reason: "documento-nao-encontrado", compraId };
  if (compra.statusAprovacao === "Recusada" || compra.statusDocumentoOmie === "Cancelado") {
    return { ignored: true, reason: "documento-ja-recusado", compraId };
  }

  try {
    await executarChamadaOmie(
      "excluir-recebimento",
      compra.instanceId,
      event.payload?.param || [{ nIdReceb: Number(compra.codigoRecebimentoOmie) }],
      context,
    );
    const now = new Date();
    const updated = await Compra.findByIdAndUpdate(
      compra._id,
      {
        $set: {
          statusAprovacao: "Recusada",
          statusDocumentoOmie: "Cancelado",
          etapa: ETAPA_CONCLUIDO,
          recusadaEm: now,
          recusadaPor: identidadeUsuario({ usuario: event.payload?.usuario }),
          canceladaEm: now,
          recusaOmiePendente: false,
          acaoAprovacaoManualDisponivel: false,
          statusIntegracao: "Sincronizado",
          ultimaSincronizacaoEm: now,
          observacaoOperacional: "Documento fiscal recusado na Central e excluído do recebimento fiscal no Omie.",
          ultimoErro: "",
        },
      },
      { new: true, runValidators: true },
    );
    const response = {
      compraId: String(updated?._id || compra._id),
      statusAprovacao: "Recusada",
      statusDocumentoOmie: "Cancelado",
    };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await Compra.findByIdAndUpdate(compra._id, {
      $set: {
        recusaOmiePendente: false,
        statusIntegracao: "Erro",
        ultimoErro: message,
      },
    });
    error.retryable = false;
    throw error;
  }
}

async function consultarPagamentoContaPagar(contaOrId) {
  await exigirSincronizacaoManual();
  const { ContaPagarAgrupada } = models();
  const contaId = String(contaOrId?._id || contaOrId || "");
  const atual = await ContaPagarAgrupada.findById(contaId);
  if (!atual) return { ignored: true, reason: "conta-nao-encontrada" };
  if (["Excluída", "Exclusão pendente"].includes(atual.status)) {
    return { ignored: true, reason: "conta-inativa", contaId };
  }
  if (atual.statusEnvioOmie !== "Enviado" && !(Number(atual.codigoLancamentoOmie || 0) > 0)) {
    throw new GenericError("Envie a conta para o Omie antes de verificar o pagamento.", {
      statusCode: 409,
      retryable: false,
    });
  }
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

async function executarConsultaPagamentoOmie(event, context = {}) {
  const { Compra, ContaPagarAgrupada } = models();
  const contaId = String(event.payload?.contaId || event.aggregateId || "");
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", contaId };

  try {
    const result = await executarChamadaOmie(
      "consultar-conta-pagar",
      conta.instanceId,
      [chaveConsultaContaPagar(conta)],
      context,
    );
    const data = dadosRespostaOmie(result);
    const pagamento = classificarPagamentoContaPagar(data);
    const codigoLancamentoOmie = Number(primeiroValor(
      data.codigo_lancamento_omie,
      data.codigo_lancamento,
      conta.codigoLancamentoOmie,
      0,
    ));
    const now = new Date();
    const statusConta = pagamento.statusPagamentoOmie === "Pago"
      ? "Paga"
      : pagamento.statusPagamentoOmie === "Cancelado"
        ? "Pagamento cancelado"
        : "Aberta";
    const update = {
      $set: {
        codigoLancamentoOmie: codigoLancamentoOmie > 0
          ? codigoLancamentoOmie
          : conta.codigoLancamentoOmie,
        status: statusConta,
        statusEnvioOmie: "Enviado",
        statusPagamentoOmie: pagamento.statusPagamentoOmie,
        statusTituloOmie: pagamento.statusTituloOmie,
        valorPagarOmie: pagamento.valorPagar,
        ultimaConsultaPagamentoEm: now,
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      },
    };
    if (pagamento.statusPagamentoOmie === "Pago") update.$unset = { chaveAtiva: 1 };
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, update, { runValidators: true });

    const compras = await Compra.find({ contaPagarId: conta._id }).lean();
    let ticketsConclusao = [];
    if (pagamento.statusPagamentoOmie === "Pago") {
      ticketsConclusao = await enfileirarConclusaoCompras(compras, now);
    } else {
      const purchaseSet = {
        statusIntegracao: "Sincronizado",
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      };
      if (pagamento.statusPagamentoOmie === "Cancelado") {
        purchaseSet.etapa = ETAPA_FATURADO;
        purchaseSet.statusDocumentoOmie = "Pendente";
        purchaseSet.statusConclusaoOmie = "Não enviado";
      }
      await Compra.updateMany({ contaPagarId: conta._id }, { $set: purchaseSet });
    }

    const response = {
      contaId: String(conta._id),
      codigoLancamentoOmie: codigoLancamentoOmie > 0
        ? codigoLancamentoOmie
        : Number(conta.codigoLancamentoOmie || 0),
      statusPagamentoOmie: pagamento.statusPagamentoOmie,
      statusTituloOmie: pagamento.statusTituloOmie,
      valorPagarOmie: pagamento.valorPagar,
      ticketsConclusao,
    };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { statusPagamentoOmie: "Erro", ultimoErro: message },
    });
    error.retryable = false;
    throw error;
  }
}

module.exports = {
  chaveConsultaContaPagar,
  consultarPagamentoContaPagar,
  executarConsultaPagamentoOmie,
  executarRecusaDocumentoFiscalOmie,
  exigirAprovacaoManual,
  exigirSincronizacaoManual,
  recusarDocumentoFiscal,
};
