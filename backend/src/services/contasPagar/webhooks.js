"use strict";

const { ETAPA_CONCLUIDO, ETAPA_FATURADO } = require("./constants");
const { obterConfiguracao } = require("./configuration");
const { encontrarFinanceiro, normalizarCompraOmie } = require("./normalization");
const { chaveBase } = require("./payload");
const { models } = require("./runtime");
const { primeiroValor } = require("./utils");
const { enviarContaParaOmie, recalcularConta, reconciliarCompra } = require("./reconciliation");

async function processarWebhookCompra(eventType, payload, instanceId = "default") {
  const { Compra } = models();
  const normalized = normalizarCompraOmie(payload, { instanceId, eventType });
  if (!normalized) return { ignored: true, reason: "pedido-nao-reconhecido", eventType };
  const current = await Compra.findOne({ chaveExterna: normalized.chaveExterna }).lean();
  if (current?.entradaFaturadoEm) normalized.entradaFaturadoEm = current.entradaFaturadoEm;
  if (current?.dataVencimento) normalized.dataVencimento = current.dataVencimento;
  if (current?.statusAprovacao) normalized.statusAprovacao = current.statusAprovacao;
  if (normalized.etapa === ETAPA_FATURADO && !normalized.entradaFaturadoEm) normalized.entradaFaturadoEm = new Date();
  const compra = await Compra.findOneAndUpdate(
    { chaveExterna: normalized.chaveExterna },
    { $set: normalized },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (compra.etapa !== ETAPA_FATURADO) {
    return { ignored: true, reason: "etapa-nao-elegivel", compraId: String(compra._id) };
  }
  return reconciliarCompra(compra._id);
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
  const commonSet = {
    codigoLancamentoOmie: omieCode > 0 ? omieCode : conta.codigoLancamentoOmie,
    ultimaSincronizacaoEm: new Date(),
    ultimoErro: "",
  };
  if (eventType === "Financas.ContaPagar.BaixaRealizada") {
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { ...commonSet, status: "Paga" },
      $unset: { chaveAtiva: 1 },
    });
    await Compra.updateMany(
      { contaPagarId: conta._id },
      { $set: { etapa: ETAPA_CONCLUIDO, statusIntegracao: "Sincronizado", ultimoErro: "" } },
    );
    return { contaId: String(conta._id), status: "Paga" };
  }
  if (eventType === "Financas.ContaPagar.BaixaCancelada") {
    try {
      await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
        $set: { ...commonSet, status: "Aberta", chaveAtiva: chaveBase(conta) },
      }, { runValidators: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
        $set: { ...commonSet, status: "Pagamento cancelado" },
        $unset: { chaveAtiva: 1 },
      });
    }
    await Compra.updateMany(
      { contaPagarId: conta._id },
      { $set: { etapa: ETAPA_FATURADO, statusIntegracao: "Sincronizado", ultimoErro: "" } },
    );
    return { contaId: String(conta._id), status: "Aberta" };
  }
  if (eventType === "Financas.ContaPagar.Excluido") {
    const configuracao = await obterConfiguracao({ create: true });
    const compras = await Compra.find({ contaPagarId: conta._id }).select("_id").lean();
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { ...commonSet, status: "Excluída" },
      $unset: { chaveAtiva: 1 },
    });
    await Compra.updateMany(
      { contaPagarId: conta._id },
      {
        $set: { etapa: ETAPA_FATURADO, statusIntegracao: "Pendente", ultimoErro: "" },
        $unset: { contaPagarId: 1 },
      },
    );
    const accounts = new Set();
    for (const compra of compras) {
      const result = await reconciliarCompra(compra._id, {
        configuracao,
        deferRecalculate: true,
      });
      if (result.contaId) accounts.add(result.contaId);
    }
    for (const contaId of accounts) {
      await recalcularConta(contaId);
      if (configuracao.enviarContaPagarOmieAutomatico === true) {
        await enviarContaParaOmie(contaId, { configuracao });
      }
    }
    return { contaId: String(conta._id), status: "Excluída", regenerated: compras.length };
  }
  await ContaPagarAgrupada.findByIdAndUpdate(conta._id, { $set: { ...commonSet, status: "Aberta" } });
  await Compra.updateMany(
    { contaPagarId: conta._id },
    { $set: { statusIntegracao: "Sincronizado", ultimoErro: "" } },
  );
  return { contaId: String(conta._id), status: "Aberta" };
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
