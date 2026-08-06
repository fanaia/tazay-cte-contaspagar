"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_CONCLUIDO, ETAPA_FATURADO } = require("./constants");
const { obterConfiguracao } = require("./configuration");
const { executarChamadaOmie } = require("./omieRequest");
const { core, models } = require("./runtime");

const STATUS_DOCUMENTO_CANCELADO = ["Cancelado", "Devolvido", "Denegado"];

function chaveContaPagarOmie(conta = {}) {
  const codigoOmie = Number(conta.codigoLancamentoOmie || 0);
  if (codigoOmie > 0) return { codigo_lancamento_omie: codigoOmie };
  const codigoIntegracao = String(conta.codigoLancamentoIntegracao || "").trim();
  if (codigoIntegracao) return { codigo_lancamento_integracao: codigoIntegracao };
  throw new GenericError("A conta não possui identificação Omie para exclusão.", {
    statusCode: 422,
    retryable: false,
  });
}

function pagamentoRealizado(conta = {}) {
  return conta.status === "Paga" || conta.statusPagamentoOmie === "Pago";
}

function observacaoDocumentoCancelado(compra = {}, conta = {}, pago = false) {
  const documento = `${compra.tipoDocumentoFiscal || "Documento"} ${compra.numeroDocumentoFiscal || compra.codigoRecebimentoOmie}`;
  const titulo = conta.codigoLancamentoOmie || conta.codigoLancamentoIntegracao || "sem identificação";
  if (pago) {
    return `${documento} cancelado no Omie após a realização do pagamento da conta agrupada ${titulo}. O pagamento já havia sido realizado.`;
  }
  return `${documento} cancelado no Omie e removido da conta a pagar agrupada ${titulo}.`;
}

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

  const configuracao = await obterConfiguracao({ create: true });
  const aprovacaoManual = configuracao.aprovarCompraAutomatico !== true;
  const acaoManualDisponivel = aprovacaoManual && documento.statusAprovacao === "Pendente";
  if (documento._id && documento.acaoAprovacaoManualDisponivel !== acaoManualDisponivel) {
    const { Compra } = models();
    await Compra.findByIdAndUpdate(documento._id, {
      $set: { acaoAprovacaoManualDisponivel: acaoManualDisponivel },
    });
  }
  if (acaoManualDisponivel) {
    return {
      ignored: true,
      reason: "aguardando-aprovacao-manual",
      compraId: String(documento._id || ""),
    };
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

async function solicitarExclusaoContaOmie(contaOrId, options = {}) {
  const { ContaPagarAgrupada } = models();
  const contaId = String(contaOrId?._id || contaOrId || "");
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) throw new GenericError("Conta a pagar não encontrada.", { statusCode: 404 });
  if (conta.status === "Excluída") {
    return { ignored: true, reason: "conta-ja-excluida", contaId };
  }
  if (pagamentoRealizado(conta) && options.allowPaid !== true) {
    throw new GenericError("Uma conta já paga não pode ser excluída pela Central.", {
      statusCode: 409,
      retryable: false,
    });
  }
  if (conta.status === "Exclusão pendente") {
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
  const updated = await ContaPagarAgrupada.findOneAndUpdate(
    { _id: conta._id, status: { $nin: ["Excluída", "Exclusão pendente"] } },
    {
      $set: {
        status: "Exclusão pendente",
        statusEnvioOmie: "Pendente",
        ultimoErro: "",
      },
      $inc: { exclusaoOmieRevisao: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!updated) return { ignored: true, reason: "exclusao-ja-pendente", contaId };

  const { enqueueIntegration } = core();
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TAZAY_EXCLUIR_CONTA_PAGAR_OMIE",
    resource: "contas-pagar-agrupadas",
    operation: "delete",
    aggregateType: "ContaPagarAgrupada",
    aggregateId: String(updated._id),
    idempotencyKey: `tazay:conta-pagar:${updated._id}:delete:r${updated.exclusaoOmieRevisao}`,
    payload: {
      contaId: String(updated._id),
      param: [param],
      motivo: String(options.motivo || "Exclusão solicitada pela operação da Central."),
    },
  });
  return {
    contaId: String(updated._id),
    ticketId: String(ticket?._id || ""),
    status: "Exclusão pendente",
  };
}

async function regenerarContaExcluida(contaOrId, options = {}) {
  const {
    enviarContaParaOmie,
    recalcularConta,
    reconciliarCompra,
    resetarDocumentosConta,
  } = require("./reconciliation");
  const { Compra, ContaPagarAgrupada } = models();
  const contaId = String(contaOrId?._id || contaOrId || "");
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", contaId };

  const documentos = await Compra.find({ contaPagarId: conta._id }).lean();
  await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
    $set: {
      status: "Excluída",
      statusEnvioOmie: "Enviado",
      statusPagamentoOmie: "Cancelado",
      ultimaSincronizacaoEm: new Date(),
      ultimoErro: "",
    },
    $unset: { chaveAtiva: 1 },
  }, { runValidators: true });

  if (!documentos.length) {
    return {
      contaId: String(conta._id),
      status: "Excluída",
      documentosRestaurados: 0,
      contasSubstitutas: [],
    };
  }

  const documentosElegiveis = documentos.filter((documento) => (
    !STATUS_DOCUMENTO_CANCELADO.includes(documento.statusDocumentoOmie)
    && ["NF-e", "CT-e"].includes(documento.tipoDocumentoFiscal)
  ));
  await resetarDocumentosConta(conta._id);

  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const contasSubstitutas = new Set();
  const errors = [];
  for (const documento of documentosElegiveis) {
    try {
      const result = await reconciliarCompra(documento._id, {
        configuracao,
        forceApproval: true,
        deferRecalculate: true,
      });
      if (result.contaId) contasSubstitutas.add(result.contaId);
    } catch (error) {
      errors.push({ documentoId: String(documento._id), message: String(error?.message || error) });
    }
  }

  const contasGeradas = [];
  for (const novaContaId of contasSubstitutas) {
    try {
      const recalculada = await recalcularConta(novaContaId);
      if (recalculada.ignored) continue;
      const envio = await enviarContaParaOmie(novaContaId, { configuracao });
      contasGeradas.push({ contaId: novaContaId, ticketId: envio.ticketId || "" });
    } catch (error) {
      errors.push({ contaId: novaContaId, message: String(error?.message || error) });
    }
  }

  return {
    contaId: String(conta._id),
    status: "Excluída",
    documentosRestaurados: documentosElegiveis.length,
    contasSubstitutas: contasGeradas,
    errors,
  };
}

async function executarExclusaoContaPagarOmie(event, context = {}) {
  const { ContaPagarAgrupada } = models();
  const contaId = String(event.payload?.contaId || event.aggregateId || "");
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", contaId };
  if (conta.status === "Excluída") {
    return { ignored: true, reason: "conta-ja-excluida", contaId };
  }

  try {
    await executarChamadaOmie(
      "excluir-conta-pagar",
      conta.instanceId,
      event.payload?.param || [chaveContaPagarOmie(conta)],
      context,
    );
    const result = await regenerarContaExcluida(conta._id);
    context.recordItem?.(result);
    return result;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { status: "Erro", statusEnvioOmie: "Erro", ultimoErro: message },
    });
    error.retryable = false;
    throw error;
  }
}

async function tratarCancelamentoDocumento(normalized = {}, options = {}) {
  const { enviarContaParaOmie, recalcularConta } = require("./reconciliation");
  const { Compra, ContaPagarAgrupada } = models();
  const clauses = [];
  if (normalized.chaveExterna) clauses.push({ chaveExterna: normalized.chaveExterna });
  if (Number(normalized.codigoRecebimentoOmie || 0) > 0) {
    clauses.push({
      instanceId: normalized.instanceId || "default",
      codigoRecebimentoOmie: Number(normalized.codigoRecebimentoOmie),
    });
  }
  if (normalized.chaveDocumentoFiscal) {
    clauses.push({
      instanceId: normalized.instanceId || "default",
      chaveDocumentoFiscal: String(normalized.chaveDocumentoFiscal),
    });
  }
  if (!clauses.length) return { ignored: true, reason: "documento-sem-identificador" };

  const compra = await Compra.findOne({ $or: clauses });
  if (!compra) {
    return { ignored: true, reason: "documento-cancelado-nao-rastreado" };
  }
  if (!STATUS_DOCUMENTO_CANCELADO.includes(normalized.statusDocumentoOmie)) {
    return { ignored: true, reason: "documento-nao-cancelado", compraId: String(compra._id) };
  }

  const conta = compra.contaPagarId
    ? await ContaPagarAgrupada.findById(compra.contaPagarId)
    : null;
  const pago = pagamentoRealizado(conta || {});
  const now = new Date();
  const set = {
    statusDocumentoOmie: normalized.statusDocumentoOmie,
    codigoEtapaRecebimentoOmie: normalized.codigoEtapaRecebimentoOmie || compra.codigoEtapaRecebimentoOmie,
    etapa: ETAPA_CONCLUIDO,
    canceladaEm: now,
    canceladaAposPagamento: pago,
    observacaoOperacional: observacaoDocumentoCancelado(compra.toObject(), conta || {}, pago),
    statusIntegracao: "Sincronizado",
    ultimaSincronizacaoEm: now,
    ultimoErro: "",
  };
  const update = { $set: set };
  if (!pago) update.$unset = { contaPagarId: 1 };
  await Compra.findByIdAndUpdate(compra._id, update, { runValidators: true });

  if (!conta || pago) {
    return {
      compraId: String(compra._id),
      contaId: conta ? String(conta._id) : "",
      statusDocumentoOmie: normalized.statusDocumentoOmie,
      canceladaAposPagamento: pago,
      contaAlteradaNoOmie: false,
    };
  }

  const restantes = await Compra.countDocuments({
    contaPagarId: conta._id,
    etapa: ETAPA_FATURADO,
    statusDocumentoOmie: "Pendente",
  });
  if (!restantes) {
    const exclusao = await solicitarExclusaoContaOmie(conta._id, {
      motivo: `Último documento da conta cancelado no Omie: ${compra.numeroDocumentoFiscal}.`,
    });
    return {
      compraId: String(compra._id),
      contaId: String(conta._id),
      statusDocumentoOmie: normalized.statusDocumentoOmie,
      canceladaAposPagamento: false,
      exclusao,
    };
  }

  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  await recalcularConta(conta._id);
  const envio = await enviarContaParaOmie(conta._id, { configuracao });
  return {
    compraId: String(compra._id),
    contaId: String(conta._id),
    statusDocumentoOmie: normalized.statusDocumentoOmie,
    canceladaAposPagamento: false,
    contaAlteradaNoOmie: true,
    ticketId: envio.ticketId || "",
  };
}

module.exports = {
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
};
