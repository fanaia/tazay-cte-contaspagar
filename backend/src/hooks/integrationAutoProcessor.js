"use strict";

const { integrations } = require("@oondemand/oon-core-back");

const DEFAULT_INTERVAL_MS = 3_000;
let processing = false;
let interval;

async function processarPendenciasIntegracao(options = {}) {
  if (processing) return { skipped: true, reason: "already-running" };
  processing = true;
  try {
    return await integrations.drainOnce({
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
  iniciarProcessamentoAutomatico,
  processarPendenciasIntegracao,
};
