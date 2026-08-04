"use strict";

const { ETAPA_FATURADO, STATUS_ATIVOS } = require("./constants");
const { calcularProximaQuarta } = require("./date");
const { chaveBase, codigoIntegracao, montarPayloadContaPagar } = require("./payload");
const { core, models } = require("./runtime");

async function obterOuCriarContaAtiva(compra) {
  const { ContaPagarAgrupada } = models();
  const baseKey = chaveBase(compra);
  let conta = await ContaPagarAgrupada.findOne({ chaveAtiva: baseKey });
  if (conta) return conta;
  const latest = await ContaPagarAgrupada.findOne({
    instanceId: compra.instanceId,
    codigoFornecedorOmie: compra.codigoFornecedorOmie,
    dataVencimento: compra.dataVencimento,
  }).sort({ geracao: -1 }).lean();
  const generation = Number(latest?.geracao || 0) + 1;
  try {
    return await ContaPagarAgrupada.create({
      chaveAgrupamento: `${baseKey}|g${generation}`,
      chaveAtiva: baseKey,
      instanceId: compra.instanceId,
      codigoFornecedorOmie: compra.codigoFornecedorOmie,
      nomeFornecedor: compra.nomeFornecedor,
      dataVencimento: compra.dataVencimento,
      geracao: generation,
      codigoLancamentoIntegracao: codigoIntegracao(baseKey, generation),
      status: "Pendente sincronização",
      revisao: 0,
      quantidadeCompras: 0,
      valorTotal: 0,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    conta = await ContaPagarAgrupada.findOne({ chaveAtiva: baseKey });
    if (!conta) throw error;
    return conta;
  }
}

async function recalcularEEnfileirar(contaId) {
  const { Compra, ContaPagarAgrupada } = models();
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta || !STATUS_ATIVOS.includes(conta.status)) return { ignored: true, reason: "conta-inativa" };
  const compras = await Compra.find({ contaPagarId: conta._id, etapa: ETAPA_FATURADO })
    .sort({ codigoPedidoOmie: 1 })
    .lean();
  try {
    const payload = montarPayloadContaPagar(conta.toObject(), compras);
    const updated = await ContaPagarAgrupada.findByIdAndUpdate(
      conta._id,
      {
        $set: {
          quantidadeCompras: compras.length,
          valorTotal: payload.valor_documento,
          status: "Pendente sincronização",
          ultimoErro: "",
        },
        $inc: { revisao: 1 },
      },
      { new: true, runValidators: true },
    );
    await Compra.updateMany(
      { _id: { $in: compras.map((compra) => compra._id) } },
      { $set: { statusIntegracao: "Pendente", ultimoErro: "" } },
    );
    const { enqueueOmieCall } = core();
    const ticket = await enqueueOmieCall({
      call: "upsert-conta-pagar",
      instanceId: updated.instanceId,
      resource: "contas-pagar-agrupadas",
      operation: "upsert",
      aggregateType: "ContaPagarAgrupada",
      aggregateId: String(updated._id),
      idempotencyKey: `tazay:conta-pagar:${updated._id}:r${updated.revisao}`,
      payload: { param: [payload] },
    });
    return {
      contaId: String(updated._id),
      revisao: updated.revisao,
      ticketId: String(ticket?._id || ""),
      payload,
    };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, { $set: { status: "Erro", ultimoErro: message } });
    await Compra.updateMany(
      { contaPagarId: conta._id, etapa: ETAPA_FATURADO },
      { $set: { statusIntegracao: "Erro", ultimoErro: message } },
    );
    throw error;
  }
}

async function reconciliarCompra(compraOrId, options = {}) {
  const { Compra } = models();
  const compra = typeof compraOrId === "object" && compraOrId?._id
    ? await Compra.findById(compraOrId._id)
    : await Compra.findById(compraOrId);
  if (!compra) return { ignored: true, reason: "compra-nao-encontrada" };
  if (compra.etapa !== ETAPA_FATURADO) return { ignored: true, reason: "etapa-nao-elegivel" };
  if (!(Number(compra.codigoFornecedorOmie) > 0)) throw new Error(`Compra ${compra.codigoPedidoOmie} sem fornecedor Omie.`);
  if (!(Number(compra.valorFaturado) > 0)) throw new Error(`Compra ${compra.codigoPedidoOmie} sem valor faturado válido.`);
  const entrada = compra.entradaFaturadoEm || options.now || new Date();
  compra.entradaFaturadoEm = entrada;
  compra.dataVencimento = compra.dataVencimento || calcularProximaQuarta(entrada, options.timeZone);
  const conta = await obterOuCriarContaAtiva(compra);
  const previousAccountId = compra.contaPagarId ? String(compra.contaPagarId) : "";
  await Compra.findByIdAndUpdate(compra._id, {
    $set: {
      entradaFaturadoEm: entrada,
      dataVencimento: compra.dataVencimento,
      contaPagarId: conta._id,
      statusIntegracao: "Pendente",
      ultimoErro: "",
    },
  }, { runValidators: true });
  if (options.deferEnqueue) {
    return {
      deferred: true,
      contaId: String(conta._id),
      previousAccountId: previousAccountId && previousAccountId !== String(conta._id) ? previousAccountId : "",
      compraId: String(compra._id),
    };
  }
  const result = await recalcularEEnfileirar(conta._id);
  if (previousAccountId && previousAccountId !== String(conta._id)) {
    await recalcularEEnfileirar(previousAccountId).catch(() => undefined);
  }
  return { ...result, compraId: String(compra._id) };
}

async function reconciliarPendentes(options = {}) {
  const { Compra } = models();
  const compras = await Compra.find({ etapa: ETAPA_FATURADO })
    .sort({ codigoFornecedorOmie: 1, codigoPedidoOmie: 1 })
    .lean();
  const summary = { total: compras.length, processed: 0, ignored: 0, accountsQueued: 0, errors: [] };
  const accounts = new Set();
  for (const compra of compras) {
    try {
      const result = await reconciliarCompra(compra._id, { ...options, deferEnqueue: true });
      if (result.ignored) summary.ignored += 1;
      else {
        summary.processed += 1;
        if (result.contaId) accounts.add(result.contaId);
        if (result.previousAccountId) accounts.add(result.previousAccountId);
      }
    } catch (error) {
      summary.errors.push({ compraId: String(compra._id), message: String(error?.message || error) });
    }
  }
  for (const contaId of accounts) {
    try {
      const result = await recalcularEEnfileirar(contaId);
      if (!result.ignored) summary.accountsQueued += 1;
    } catch (error) {
      summary.errors.push({ contaId, message: String(error?.message || error) });
    }
  }
  return summary;
}

module.exports = { recalcularEEnfileirar, reconciliarCompra, reconciliarPendentes };
