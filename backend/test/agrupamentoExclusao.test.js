"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { chaveBase, contaFoiSincronizada } = require("../src/services/contasPagar");

test("agrupa documentos por instância e fornecedor, independentemente do vencimento", () => {
  const julho = chaveBase({ instanceId: "default", codigoFornecedorOmie: 123, dataVencimento: "2026-07-15" });
  const agosto = chaveBase({ instanceId: "default", codigoFornecedorOmie: 123, dataVencimento: "2026-08-05" });
  const outro = chaveBase({ instanceId: "default", codigoFornecedorOmie: 456, dataVencimento: "2026-08-05" });
  assert.equal(julho, agosto);
  assert.notEqual(julho, outro);
});

test("identifica conta sincronizada por código, revisão ou status operacional", () => {
  assert.equal(contaFoiSincronizada({ revisao: 0, status: "Pendente envio" }), false);
  assert.equal(contaFoiSincronizada({ revisao: 1, status: "Pendente envio" }), true);
  assert.equal(contaFoiSincronizada({ codigoLancamentoOmie: 123 }), true);
  assert.equal(contaFoiSincronizada({ status: "Aberta" }), true);
});

test("interface usa ação de negócio, aba relacionada e exclusão protegida", () => {
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8"));
  const compra = ui.collections.find((item) => item.model === "Compra");
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  assert.equal(compra.list.rowActions.some((action) => action.label === "Dados e parâmetros"), false);
  assert.equal(compra.list.rowActions.some((action) => action.label === "Aprovar e gerar contas-pagar"), true);
  assert.deepEqual(conta.list.builtInActions, { create: false, edit: true, delete: false });
  assert.equal(conta.detailModal.tabs.some((tab) => tab.id === "documentos" && tab.type === "readonlyGrid"), true);
  assert.equal(conta.list.rowActions.some((action) => action.method === "DELETE"), true);
});

test("rota de exclusão usa a constante de perfis declarada", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");
  const start = source.indexOf('router.private.delete("/contas/:id"');
  const end = source.indexOf('router.private.post("/contas/:id/consultar-pagamento"', start);
  const route = source.slice(start, end);
  assert.match(route, /roles: ROLES/);
  assert.doesNotMatch(source, /WRITE_ROLES/);
});

test("webhook de exclusão não recria automaticamente outra conta", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/webhooks.js"), "utf8");
  const start = source.indexOf('eventType === "Financas.ContaPagar.Excluido"');
  const end = source.indexOf("const statusPagamentoOmie", start);
  const branch = source.slice(start, end);
  assert.match(branch, /resetarDocumentosConta/);
  assert.doesNotMatch(branch, /reconciliarCompra/);
  assert.doesNotMatch(branch, /enviarContaParaOmie/);
});
