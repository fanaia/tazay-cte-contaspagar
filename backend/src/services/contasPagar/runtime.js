"use strict";

const AUTO_PROCESS_BATCH_SIZE = 50;
const providersPendentes = new Set();
let processamentoAgendado = false;

function carregarCore() {
  return require("@oondemand/oon-core-back");
}

function agendarProcessamentoIntegracoes(provider) {
  const providerKey = String(provider || "").trim().toLowerCase();
  if (!providerKey) return;

  providersPendentes.add(providerKey);
  if (processamentoAgendado) return;
  processamentoAgendado = true;

  setImmediate(async () => {
    processamentoAgendado = false;
    const providers = [...providersPendentes];
    providersPendentes.clear();
    const runtime = carregarCore();
    const processIntegrationQueue = runtime.integrations?.processIntegrationQueue;

    if (typeof processIntegrationQueue !== "function") return;

    for (const providerAtual of providers) {
      try {
        const result = await processIntegrationQueue({
          provider: providerAtual,
          limit: AUTO_PROCESS_BATCH_SIZE,
        });

        // Se o lote ficou cheio, pode haver mais tickets já elegíveis na fila.
        // Agenda outro ciclo sem bloquear a requisição que criou o ticket.
        if (Array.isArray(result?.results) && result.results.length >= AUTO_PROCESS_BATCH_SIZE) {
          providersPendentes.add(providerAtual);
        }
      } catch (error) {
        console.error(
          `[tazay] Falha ao acionar processamento automático da fila ${providerAtual}: ${String(error?.message || error)}`,
        );
      }
    }

    if (providersPendentes.size) {
      agendarProcessamentoIntegracoes([...providersPendentes][0]);
    }
  });
}

async function enqueueIntegration(input = {}) {
  const runtime = carregarCore();
  const ticket = await runtime.enqueueIntegration(input);
  agendarProcessamentoIntegracoes(input.provider);
  return ticket;
}

function core() {
  const runtime = carregarCore();
  return {
    ...runtime,
    enqueueIntegration,
  };
}

function models() {
  const { registry } = core();
  const names = [
    "Compra",
    "ContaPagarAgrupada",
    "ConfiguracaoContasPagar",
    "CategoriaOmie",
    "ContaCorrenteOmie",
  ];
  const result = Object.fromEntries(
    names.map((name) => [name, registry.getModel(name)?.mongooseModel]),
  );
  if (!result.Compra || !result.ContaPagarAgrupada) {
    throw new Error("Models Compra e ContaPagarAgrupada devem estar registradas antes da operação.");
  }
  return result;
}

module.exports = {
  agendarProcessamentoIntegracoes,
  core,
  enqueueIntegration,
  models,
};
