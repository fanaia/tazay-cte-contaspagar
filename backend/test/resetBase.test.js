"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COLECOES_PROTEGIDAS,
  excluirTodasColecoes,
} = require("../src/services/contasPagar/resetDatabase");

function source(relative) {
  return fs.readFileSync(path.join(__dirname, relative), "utf8");
}

test("reset administrativo exclui coleções sem executar dropDatabase", () => {
  const service = source("../src/services/contasPagar/resetDatabase.js");
  const routes = source("../src/routes/contasPagar.js");
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const config = ui.collections.find((item) => item.model === "ConfiguracaoContasPagar");
  const routeStart = routes.indexOf('router.private.post("/configuracao/resetar-base"');
  const routeEnd = routes.indexOf('router.private.get("/resumo"', routeStart);
  const resetRoute = routes.slice(routeStart, routeEnd);

  assert.doesNotMatch(service, /dropDatabase\s*\(/);
  assert.match(service, /listCollections\s*\(/);
  assert.match(service, /dropCollection\s*\(/);
  assert.match(service, /primeiroAcesso: true/);
  assert.match(resetRoute, /roles: \["admin"\]/);
  assert.doesNotMatch(resetRoute, /audit\s*:/);
  assert.ok(config.list.rowActions.some((action) => action.label === "Resetar base de dados"));
});

test("reset exclui dados operacionais e técnicos, mas preserva identidade de ativação do OonCore", async () => {
  const excluidas = [];
  const database = {
    listCollections() {
      return {
        async toArray() {
          return [
            { name: "compras" },
            { name: "contaspagaragrupadas" },
            { name: "integrationtickets" },
            { name: "controlealteracaos" },
            { name: "oon_instancia_ecossistema" },
            { name: "system.views" },
          ];
        },
      };
    },
    async dropCollection(nome) {
      excluidas.push(nome);
    },
  };

  const total = await excluirTodasColecoes(database);

  assert.equal(total, 4);
  assert.equal(COLECOES_PROTEGIDAS.has("oon_instancia_ecossistema"), true);
  assert.deepEqual(excluidas, [
    "compras",
    "contaspagaragrupadas",
    "integrationtickets",
    "controlealteracaos",
  ]);
});

test("reset tolera coleção que já desapareceu durante a exclusão", async () => {
  const excluidas = [];
  const database = {
    listCollections() {
      return {
        async toArray() {
          return [{ name: "compras" }, { name: "configuracoes" }];
        },
      };
    },
    async dropCollection(nome) {
      if (nome === "compras") {
        const error = new Error("ns not found");
        error.code = 26;
        throw error;
      }
      excluidas.push(nome);
    },
  };

  const total = await excluirTodasColecoes(database);

  assert.equal(total, 1);
  assert.deepEqual(excluidas, ["configuracoes"]);
});
