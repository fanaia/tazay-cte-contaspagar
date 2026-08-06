"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const backendSource = (relative) => fs.readFileSync(path.join(__dirname, relative), "utf8");
const frontendSource = (relative) => fs.readFileSync(path.join(__dirname, "../../frontend", relative), "utf8");

test("listagem calcula as ações manuais pela configuração vigente", () => {
  const service = backendSource("../src/services/contasPagar/documentosFiscaisOperacionais.js");
  const routes = backendSource("../src/routes/contasPagar.js");

  assert.match(service, /configuracao\.aprovarCompraAutomatico !== true/);
  assert.match(service, /acaoAprovacaoManualDisponivel: acaoAprovacaoManualDisponivel/);
  assert.match(routes, /private\.get\("\/documentos-fiscais"/);
});

test("frontend monta a coleção fiscal pelo endpoint operacional", () => {
  const main = frontendSource("src/main.tsx");

  assert.match(main, /CoreCollection/);
  assert.match(main, /collections\.filter\(\(collection\) => collection\.model !== "Compra"\)/);
  assert.match(main, /component: "DocumentosFiscaisPage"/);
  assert.match(main, /customComponents: \{ DocumentosFiscaisPage \}/);
  assert.match(main, /endpoint="\/api\/tazay\/contas-pagar\/documentos-fiscais"/);
});

test("recusar oculta a linha enquanto a exclusão está pendente e após o cancelamento", () => {
  const service = backendSource("../src/services/contasPagar/documentosFiscaisOperacionais.js");
  const actions = backendSource("../src/services/contasPagar/manualActions.js");
  const routes = backendSource("../src/routes/contasPagar.js");

  assert.match(service, /recusaOmiePendente: true/);
  assert.match(service, /statusAprovacao: "Recusada"/);
  assert.match(service, /statusDocumentoOmie: "Cancelado"/);
  assert.match(actions, /recusaOmiePendente: false/);
  assert.match(actions, /statusAprovacao: "Recusada"/);
  assert.match(routes, /recusarDocumentoFiscalOperacional/);
});

test("falha ao enfileirar recusa restaura o documento para nova tentativa", () => {
  const service = backendSource("../src/services/contasPagar/documentosFiscaisOperacionais.js");

  assert.match(service, /recusaOmieRevisao: revisaoEsperada/);
  assert.match(service, /recusaOmiePendente: false/);
  assert.match(service, /statusIntegracao: "Erro"/);
});

test("aprovação mantém o agrupamento por fornecedor e tipo de documento", () => {
  const reconciliation = backendSource("../src/services/contasPagar/reconciliation.js");

  assert.match(reconciliation, /codigoFornecedorOmie/);
  assert.match(reconciliation, /tipoDocumentoFiscal/);
  assert.match(reconciliation, /obterOuCriarContaAtiva/);
  assert.match(reconciliation, /recalcularConta/);
});
