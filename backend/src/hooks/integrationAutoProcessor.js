"use strict";

const AUTO_PROCESSOR_SYMBOL = Symbol.for("tazay.integrationAutoProcessor");

async function tornarErrosOmieDefinitivos(integrations) {
  const { Outbox } = integrations.getIntegrationModels();
  const result = await Outbox.updateMany(
    { provider: "omie", status: "Erro temporário" },
    {
      $set: {
        previousStatus: "Erro temporário",
        status: "Erro definitivo",
        nextAttemptAt: null,
        leaseId: "",
        lockedAt: null,
        lockedBy: "",
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    },
  );
  return Number(result.modifiedCount || 0);
}

async function processarIntegracoesPendentes(options = {}) {
  const { integrations } = require("@oondemand/oon-core-back");
  const errosConvertidos = await tornarErrosOmieDefinitivos(integrations);
  const fila = await integrations.drainOnce({
    batchSize: Math.max(1, Number(options.batchSize || process.env.OON_INTEGRATION_AUTO_BATCH_SIZE || 1)),
    webhookBatchSize: Math.max(1, Number(
      options.webhookBatchSize || process.env.OON_INTEGRATION_AUTO_WEBHOOK_BATCH_SIZE || 10,
    )),
  });
  return { errosConvertidos, fila };
}

function iniciarProcessamentoAutomatico(options = {}) {
  if (globalThis[AUTO_PROCESSOR_SYMBOL]) return globalThis[AUTO_PROCESSOR_SYMBOL];
  const intervalMs = Math.max(
    5000,
    Number(options.intervalMs || process.env.OON_INTEGRATION_AUTO_INTERVAL_MS || 6000),
  );
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processarIntegracoesPendentes(options);
    } catch (error) {
      console.error("[tazay] Falha ao processar integrações pendentes:", error?.message || error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setImmediate(tick);
  const state = {
    timer,
    tick,
    stop() {
      clearInterval(timer);
      delete globalThis[AUTO_PROCESSOR_SYMBOL];
    },
  };
  globalThis[AUTO_PROCESSOR_SYMBOL] = state;
  return state;
}

module.exports = {
  iniciarProcessamentoAutomatico,
  processarIntegracoesPendentes,
  tornarErrosOmieDefinitivos,
};
