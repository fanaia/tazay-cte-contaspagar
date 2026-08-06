"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function source(relative) {
  return fs.readFileSync(path.join(__dirname, relative), "utf8");
}

test("reset administrativo apaga a base e retorna a aplicação ao primeiro acesso", () => {
  const service = source("../src/services/contasPagar/resetDatabase.js");
  const routes = source("../src/routes/contasPagar.js");
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const config = ui.collections.find((item) => item.model === "ConfiguracaoContasPagar");
  assert.match(service, /dropDatabase\(\)/);
  assert.match(service, /primeiroAcesso: true/);
  assert.match(routes, /configuracao\/resetar-base/);
  assert.match(routes, /roles: \["admin"\]/);
  assert.ok(config.list.rowActions.some((action) => action.label === "Resetar base de dados"));
});
