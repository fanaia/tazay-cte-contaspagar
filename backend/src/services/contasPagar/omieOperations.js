"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_CONCLUIDO, ETAPA_PAGO } = require("./constants");
const { core, models } = require("./runtime");
const { array, primeiroValor } = require("./utils");
const { executarChamadaOmie } = require("./omieRequest");

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
    data.situacao,
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

function cabecalhoRecebimento(recebimento = {}) {
  return recebimento.cabec || recebimento.cabecalho || recebimento.ide || recebimento;
}

function itensRecebimento(recebimento = {}) {
  return array(
    recebimento.itensRecebimento
    || recebimento.itens_recebimento
    || recebimento.itens
    || recebimento.produtos,
  );
}

function cabecalhoItemRecebimento(item = {}) {
  return item.itensCabec || item.cabec || item.cabecalho || item;
}

function identificacaoRecebimento(recebimento = {}) {
  const cabec = cabecalhoRecebimento(recebimento);
  return {
    codigoRecebimentoOmie: Number(primeiroValor(
      cabec.nIdReceb,
      recebimento.nIdReceb,
      cabec.codigo_recebimento,
      0,
    )) || 0,
    chaveDocumentoFiscal: String(primeiroValor(
      cabec.cChaveNfe,
      recebimento.cChaveNfe,
      cabec.chave_nfe,
      "",
    ) || "").trim(),
    etapaOmie: String(primeiroValor(cabec.cEtapa, recebimento.cEtapa, "50") || "50").trim(),
    codigoFornecedorOmie: Number(primeiroValor(
      cabec.nIdFornecedor,
      cabec.nCodFor,
      recebimento.nIdFornecedor,
      0,
    )) || 0,
    numeroDocumento: String(primeiroValor(
      cabec.cNumeroNFe,
      cabec.cNumero,
      recebimento.cNumeroNFe,
      "",
    ) || "").trim(),
    valorDocumento: numeroOmie(primeiroValor(
      cabec.nValorNFe,
      cabec.vTotal,
      recebimento.nValorNFe,
      recebimento.totais?.vTotalNFe,
    )),
    recebido: normalizarTexto(primeiroValor(
      recebimento.infoCadastro?.cRecebido,
      cabec.cRecebido,
      "N",
    )) === "S",
  };
}

function recebimentoVinculadoAoPedido(recebimento = {}, compra = {}) {
  const codigoPedido = Number(compra.codigoPedidoOmie || 0);
  if (!(codigoPedido > 0)) return false;
  return itensRecebimento(recebimento).some((item) => {
    const cabec = cabecalhoItemRecebimento(item);
    return Number(primeiroValor(
      cabec.nIdPedido,
      cabec.nCodPed,
      item.nIdPedido,
      item.nCodPed,
      0,
    )) === codigoPedido;
  });
}

function pontuarRecebimento(recebimento = {}, compra = {}) {
  const identificacao = identificacaoRecebimento(recebimento);
  let score = 0;
  if (
    Number(compra.codigoRecebimentoOmie || 0) > 0
    && identificacao.codigoRecebimentoOmie === Number(compra.codigoRecebimentoOmie)
  ) score += 1000;
  if (recebimentoVinculadoAoPedido(recebimento, compra)) score += 500;
  if (identificacao.codigoRecebimentoOmie === Number(compra.codigoPedidoOmie || 0)) score += 100;
  if (
    identificacao.codigoFornecedorOmie > 0
    && identificacao.codigoFornecedorOmie === Number(compra.codigoFornecedorOmie || 0)
  ) score += 20;
  if (
    identificacao.valorDocumento !== null
    && Math.abs(identificacao.valorDocumento - Number(compra.valorFaturado || 0)) < 0.01
  ) score += 20;
  if (
    identificacao.numeroDocumento
    && identificacao.numeroDocumento === String(compra.numeroPedido || "").trim()
  ) score += 10;
  return { recebimento, identificacao, score };
}

function selecionarRecebimentoDaCompra(recebimentos = [], compra = {}) {
  const classificados = recebimentos
    .map((recebimento) => pontuarRecebimento(recebimento, compra))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!classificados.length) {
    throw new GenericError(
      `Nenhum recebimento Omie foi localizado para o pedido ${compra.numeroPedido || compra.codigoPedidoOmie}.`,
      { statusCode: 422, retryable: true },
    );
  }
  if (
    classificados.length > 1
    && classificados[0].score === classificados[1].score
    && classificados[0].score < 500
  ) {
    throw new GenericError(
      `Mais de um recebimento Omie corresponde ao pedido ${compra.numeroPedido || compra.codigoPedidoOmie}.`,
      { statusCode: 409, retryable: true },
    );
  }
  return classificados[0];
}

async function enfileirarConclusaoCompras(compras = [], now = new Date()) {
  const { Compra } = models();
  const { enqueueIntegration } = core();
  const tickets = [];
  for (const compra of compras) {
    if (["Pendente", "Concluído"].includes(compra.statusConclusaoOmie)) continue;
    const updated = await Compra.findOneAndUpdate(
      {
        _id: compra._id,
        statusConclusaoOmie: { $nin: ["Pendente", "Concluído"] },
      },
      {
        $set: {
          etapa: ETAPA_PAGO,
          statusConclusaoOmie: "Pendente",
          statusIntegracao: "Pendente",
          ultimaSincronizacaoEm: now,
          ultimoErro: "",
        },
        $inc: { conclusaoOmieRevisao: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!updated) continue;
    const ticket = await enqueueIntegration({
      provider: "omie",
      handler: "TAZAY_CONCLUIR_RECEBIMENTO_OMIE",
      resource: "compras",
      operation: "concluir-recebimento",
      aggregateType: "Compra",
      aggregateId: String(updated._id),
      idempotencyKey: `tazay:compra:${updated._id}:concluir-recebimento:r${updated.conclusaoOmieRevisao}`,
      payload: { compraId: String(updated._id) },
    });
    tickets.push({ compraId: String(updated._id), ticketId: String(ticket?._id || "") });
  }
  return tickets;
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

module.exports = {
  cabecalhoRecebimento,
  classificarPagamentoContaPagar,
  dadosRespostaOmie,
  enfileirarConclusaoCompras,
  executarEnvioContaPagarOmie,
  identificacaoRecebimento,
  normalizarTexto,
  pontuarRecebimento,
  recebimentoVinculadoAoPedido,
  selecionarRecebimentoDaCompra,
};
