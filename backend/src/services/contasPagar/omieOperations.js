"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_FATURADO, ETAPA_PAGO } = require("./constants");
const { core, models } = require("./runtime");
const { primeiroValor } = require("./utils");

function dadosRespostaOmie(result = {}) {
  return result?.data || result?.response || result || {};
}

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numeroOmie(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function classificarPagamentoContaPagar(data = {}) {
  const statusOriginal = String(primeiroValor(
    data.status_titulo,
    data.statusTitulo,
    data.descricao_status,
    data.codigo_status,
    "",
  ) || "").trim();
  const status = normalizarTexto(statusOriginal);
  const valorPagarInformado = Object.prototype.hasOwnProperty.call(data, "valor_pag")
    || Object.prototype.hasOwnProperty.call(data, "valorPagar");
  const valorPagar = numeroOmie(primeiroValor(data.valor_pag, data.valorPagar));

  if (status.includes("CANCEL")) {
    return { statusPagamentoOmie: "Cancelado", statusTituloOmie: statusOriginal, valorPagar };
  }
  if (status.includes("PARCIAL") || status === "PAR" || status === "PPA") {
    return { statusPagamentoOmie: "Parcial", statusTituloOmie: statusOriginal, valorPagar };
  }
  if (
    ["PAG", "PAGO", "LIQ", "LIQUIDADO"].includes(status)
    || status.includes("LIQUIDADO")
    || (valorPagarInformado && valorPagar !== null && valorPagar <= 0)
  ) {
    return { statusPagamentoOmie: "Pago", statusTituloOmie: statusOriginal, valorPagar };
  }
  return { statusPagamentoOmie: "Pendente", statusTituloOmie: statusOriginal, valorPagar };
}

function chaveConsultaContaPagar(conta = {}) {
  const codigoOmie = Number(conta.codigoLancamentoOmie || 0);
  if (codigoOmie > 0) return { codigo_lancamento_omie: codigoOmie };
  const codigoIntegracao = String(conta.codigoLancamentoIntegracao || "").trim();
  if (codigoIntegracao) return { codigo_lancamento_integracao: codigoIntegracao };
  throw new GenericError("A conta não possui código Omie nem código de integração para consulta.", {
    statusCode: 422,
  });
}

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

async function executarEnvioContaPagarOmie(event, context = {}) {
  const { Compra, ContaPagarAgrupada } = models();
  const contaId = String(event.payload?.contaId || event.aggregateId || "");
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", contaId };

  const call = String(event.payload?.call || "").trim();
  if (!["incluir-conta-pagar", "alterar-conta-pagar"].includes(call)) {
    throw new GenericError(`Chamada de envio inválida: ${call || "não informada"}.`, { statusCode: 422 });
  }

  try {
    const result = await executarChamadaOmie(
      call,
      conta.instanceId,
      event.payload?.param || [],
      context,
    );
    const data = dadosRespostaOmie(result);
    const codigoLancamentoOmie = Number(primeiroValor(
      data.codigo_lancamento_omie,
      data.codigo_lancamento,
      conta.codigoLancamentoOmie,
      0,
    ));
    const now = new Date();
    const updated = await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: {
        codigoLancamentoOmie: codigoLancamentoOmie > 0
          ? codigoLancamentoOmie
          : conta.codigoLancamentoOmie,
        status: "Aberta",
        statusEnvioOmie: "Enviado",
        statusPagamentoOmie: conta.statusPagamentoOmie === "Pago" ? "Pago" : "Pendente",
        statusTituloOmie: String(primeiroValor(
          data.status_titulo,
          data.descricao_status,
          conta.statusTituloOmie,
          "",
        ) || ""),
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      },
    }, { new: true, runValidators: true });
    await Compra.updateMany(
      { contaPagarId: conta._id },
      { $set: { statusIntegracao: "Sincronizado", ultimaSincronizacaoEm: now, ultimoErro: "" } },
    );
    const response = {
      contaId: String(conta._id),
      codigoLancamentoOmie: Number(updated?.codigoLancamentoOmie || 0),
      statusEnvioOmie: "Enviado",
      statusPagamentoOmie: updated?.statusPagamentoOmie || "Pendente",
      metodoOmie: event.payload?.metodoOmie || call,
    };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { status: "Erro", statusEnvioOmie: "Erro", ultimoErro: message },
    });
    await Compra.updateMany(
      { contaPagarId: conta._id },
      { $set: { statusIntegracao: "Erro", ultimoErro: message } },
    );
    throw error;
  }
}

async function consultarPagamentoContaPagar(contaOrId) {
  const { ContaPagarAgrupada } = models();
  const contaId = String(contaOrId?._id || contaOrId || "");
  let conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada" };
  if (["Excluída"].includes(conta.status)) return { ignored: true, reason: "conta-inativa" };

  chaveConsultaContaPagar(conta);
  conta = await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
    $set: { statusPagamentoOmie: "Consultando", ultimoErro: "" },
    $inc: { consultaPagamentoRevisao: 1 },
  }, { new: true, runValidators: true });

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

    const purchaseSet = {
      statusIntegracao: "Sincronizado",
      ultimaSincronizacaoEm: now,
      ultimoErro: "",
    };
    if (pagamento.statusPagamentoOmie === "Pago") purchaseSet.etapa = ETAPA_PAGO;
    if (pagamento.statusPagamentoOmie === "Cancelado") purchaseSet.etapa = ETAPA_FATURADO;
    await Compra.updateMany({ contaPagarId: conta._id }, { $set: purchaseSet });

    const response = {
      contaId: String(conta._id),
      codigoLancamentoOmie: codigoLancamentoOmie > 0
        ? codigoLancamentoOmie
        : Number(conta.codigoLancamentoOmie || 0),
      statusPagamentoOmie: pagamento.statusPagamentoOmie,
      statusTituloOmie: pagamento.statusTituloOmie,
      valorPagarOmie: pagamento.valorPagar,
      pedidosAtualizadosParaPago: pagamento.statusPagamentoOmie === "Pago",
    };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { statusPagamentoOmie: "Erro", ultimoErro: message },
    });
    throw error;
  }
}

module.exports = {
  chaveConsultaContaPagar,
  classificarPagamentoContaPagar,
  consultarPagamentoContaPagar,
  dadosRespostaOmie,
  executarConsultaPagamentoOmie,
  executarEnvioContaPagarOmie,
  normalizarTexto,
};
