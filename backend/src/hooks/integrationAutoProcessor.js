"use strict";

const { integrations } = require("@oondemand/oon-core-back");
const { enfileirarConclusaoCompras } = require("../services/contasPagar");
const { models } = require("../services/contasPagar/runtime");

const DEFAULT_INTERVAL_MS = 3_000;
let processing = false;
let interval;

async function enfileirarComprasPagasExistentes(options = {}) {
  const { Compra } = models();
  const limit = Math.max(
    1,
    Number(options.backfillBatchSize || process.env.OON_INTEGRATION_AUTO_BACKFILL_BATCH_SIZE || 100),
  );
  const compras = await Compra.find({
    etapa: "Pago",
    $or: [
      { statusConclusaoOmie: { $exists: false } },
      { statusConclusaoOmie: "Não enviado" },
    ],
  })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(limit)
    .lean();
  return enfileirarConclusaoCompras(compras);
}

async function processarPendenciasIntegracao(options = {}) {
  if (processing) return { skipped: true, reason: "already-running" };
  processing = true;
  try {
    const ticketsGerados = await enfileirarComprasPagasExistentes(options);
    const resultados = await integrations.drainOnce({
      batchSize: Math.max(
        1,
        Number(options.batchSize || process.env.OON_INTEGRATION_AUTO_BATCH_SIZE || 100),
      ),
      webhookBatchSize: Math.max(
        1,
        Number(options.webhookBatchSize || process.env.OON_INTEGRATION_AUTO_WEBHOOK_BATCH_SIZE || 100),
      ),
      logger: false,
    });
    return { ticketsGerados, resultados };
  } catch (error) {
    if (options.logger !== false) {
      console.error(`[integration-auto-processor] ${error?.message || error}`);
    }
    return { error: String(error?.message || error) };
  } finally {
    processing = false;
  }
}

function iniciarProcessamentoAutomatico() {
  if (
    process.env.NODE_ENV === "test"
    || String(process.env.OON_INTEGRATION_AUTO_PROCESS || "true").toLowerCase() === "false"
  ) {
    return null;
  }

  const intervalMs = Math.max(
    1_000,
    Number(process.env.OON_INTEGRATION_AUTO_INTERVAL_MS || DEFAULT_INTERVAL_MS),
  );

  const initial = setTimeout(() => {
    processarPendenciasIntegracao().catch(() => undefined);
  }, intervalMs);
  initial.unref?.();

  interval = setInterval(() => {
    processarPendenciasIntegracao().catch(() => undefined);
  }, intervalMs);
  interval.unref?.();
  return interval;
}

iniciarProcessamentoAutomatico();

module.exports = {
  DEFAULT_INTERVAL_MS,
  enfileirarComprasPagasExistentes,
  iniciarProcessamentoAutomatico,
  processarPendenciasIntegracao,
};
