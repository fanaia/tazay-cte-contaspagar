"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { chaveBase, contaFoiSincronizada } = require("../src/services/contasPagar");

test("agrupa documentos por instância, fornecedor e tipo, independentemente do vencimento", () => {
  const julho = chaveBase({ instanceId: "default", codigoFornecedorOmie: 123, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-07-15" });
  const agosto = chaveBase({ instanceId: "default", codigoFornecedorOmie: 123, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-05" });
  const cte = chaveBase({ instanceId: "default", codigoFornecedorOmie: 123, tipoDocumentoFiscal: "CT-e", dataVencimento: "2026-08-05" });
  const outro = chaveBase({ instanceId: "default", codigoFornecedorOmie: 456, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-05" });
  assert.equal(julho, agosto);
  assert.notEqual(julho, cte);
  assert.notEqual(julho, outro);
});

test("identifica conta sincronizada por código, revisão ou status operacional", () => {
  assert.equal(contaFoiSincronizada({ revisao: 0, status: "Pendente envio" }), false);
  assert.equal(contaFoiSincronizada({ revisao: 1, status: "Pendente envio" }), true);
  assert.equal(contaFoiSincronizada({ codigoLancamentoOmie: 123 }), true);
  assert.equal(contaFoiSincronizada({ status: "Aberta" }), true);
});

test("interface é somente leitura e exclusão usa ação integrada por ícone", () => {
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8"));
  const compra = ui.collections.find((item) => item.model === "Compra");
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  assert.deepEqual(compra.list.builtInActions, { create: false, edit: false, delete: false });
  assert.equal(compra.list.rowActions.length, 0);
  assert.deepEqual(conta.list.builtInActions, { create: false, edit: false, delete: false });
  assert.equal(conta.detailModal.tabs.some((tab) => tab.id === "documentos" && tab.type === "readonlyGrid"), true);
  assert.equal(conta.list.rowActions.some((action) => action.method === "DELETE" && action.label === "🗑️"), true);
});

test("rota de exclusão usa a constante de perfis declarada", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");
  const start = source.indexOf('router.private.delete("/contas/:id"');
  const end = source.indexOf('router.private.post("/configuracao/inicializar"', start);
  const route = source.slice(start, end);
  assert.match(route, /roles: ROLES/);
  assert.match(route, /solicitarExclusaoContaOmie/);
  assert.doesNotMatch(source, /WRITE_ROLES/);
});

test("webhook de exclusão regenera automaticamente as contas e referências", () => {
  const webhooks = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/webhooks.js"), "utf8");
  const sidecar = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/sidecar.js"), "utf8");
  const start = webhooks.indexOf('eventType === "Financas.ContaPagar.Excluido"');
  const end = webhooks.indexOf("const statusPagamentoOmie", start);
  const branch = webhooks.slice(start, end);
  assert.match(branch, /regenerarContaExcluida/);
  assert.match(sidecar, /resetarDocumentosConta/);
  assert.match(sidecar, /reconciliarCompra/);
  assert.match(sidecar, /enviarContaParaOmie/);
});
