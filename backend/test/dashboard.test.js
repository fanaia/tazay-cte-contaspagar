"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("dashboard autenticado é a rota inicial e exibe os indicadores operacionais", () => {
  const main = fs.readFileSync(path.join(__dirname, "../../frontend/src/main.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(__dirname, "../../frontend/src/DashboardPage.tsx"), "utf8");

  assert.match(main, /id: "dashboard"/);
  assert.match(main, /path: "\/"/);
  assert.match(main, /component: "DashboardPage"/);
  assert.match(main, /customComponents: \{ DashboardPage,/);

  for (const label of [
    "Total de documentos",
    "Aprovados",
    "Reprovados",
    "Pagamentos gerados",
    "Pagamentos concluídos",
    "Total pago",
  ]) {
    assert.match(dashboard, new RegExp(label));
  }
});

test("resumo calcula documentos, pagamentos concluídos e total pago", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");

  assert.match(source, /Compra\.countDocuments\(\{\}\)/);
  assert.match(source, /statusAprovacao: "Aprovada"/);
  assert.match(source, /statusAprovacao: "Recusada"/);
  assert.match(source, /status: \{ \$ne: "Excluída" \}/);
  assert.match(source, /statusPagamentoOmie: "Pago"/);
  assert.match(source, /\$sum: "\$valorTotal"/);
  assert.match(source, /totalPago:/);
});
