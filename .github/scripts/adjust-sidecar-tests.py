from pathlib import Path

Path("backend/test/agrupamentoExclusao.test.js").write_text(r'''"use strict";

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
''')

path = Path("backend/test/contasPagar.test.js")
source = path.read_text()
source = source.replace("assert.equal(DEFAULT_CONFIGURATION.versaoConfiguracao, 3);", "assert.equal(DEFAULT_CONFIGURATION.versaoConfiguracao, 4);")
source = source.replace(
'''test("agrupamento usa uma conta ativa por fornecedor", () => {
  const primeira = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, dataVencimento: "2026-08-12" });
  const segunda = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, dataVencimento: "2026-08-12" });
  const outroFornecedor = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4925595721, dataVencimento: "2026-08-12" });
  const outraSemana = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, dataVencimento: "2026-08-19" });
  assert.equal(primeira, segunda);
  assert.notEqual(primeira, outroFornecedor);
  assert.equal(primeira, outraSemana);
});''',
'''test("agrupamento usa uma conta ativa por fornecedor e tipo fiscal", () => {
  const primeira = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-12" });
  const segunda = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-12" });
  const cte = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "CT-e", dataVencimento: "2026-08-12" });
  const outroFornecedor = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4925595721, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-12" });
  const outraSemana = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-19" });
  assert.equal(primeira, segunda);
  assert.notEqual(primeira, cte);
  assert.notEqual(primeira, outroFornecedor);
  assert.equal(primeira, outraSemana);
});''')
source = source.replace(
    'test("modelagem mantém um agrupamento por fornecedor e vencimento", () => {',
    'test("modelagem mantém um agrupamento por fornecedor e tipo fiscal", () => {',
)
source = source.replace(
    '  assert.match(contaSource, /chaveAtiva: unique\\(fields\\.string/);',
    '  assert.match(contaSource, /chaveAtiva: unique\\(fields\\.string/);\n  assert.match(contaSource, /tipoDocumentoFiscal/);',
)
path.write_text(source)

path = Path("backend/test/pagamentoOmie.test.js")
source = path.read_text()
source = source.replace(
'''test("modelos e interface exibem envio, pagamento e etapa Pago", () => {
  const compra = fs.readFileSync(path.join(__dirname, "../src/models/Compra.js"), "utf8");
  const conta = fs.readFileSync(path.join(__dirname, "../src/models/ContaPagarAgrupada.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8");
  assert.match(compra, /"Pago"/);
  assert.match(compra, /tipoDocumentoFiscal/);
  assert.match(conta, /statusEnvioOmie/);
  assert.match(conta, /statusPagamentoOmie/);
  assert.match(routes, /\\/contas\\/:id\\/consultar-pagamento/);
  assert.match(ui, /"statusEnvioOmie"/);
  assert.match(ui, /"statusPagamentoOmie"/);
  assert.match(ui, /Consultar pagamento no Omie/);
});''',
'''test("modelos exibem situação Omie sem consulta manual na interface", () => {
  const compra = fs.readFileSync(path.join(__dirname, "../src/models/Compra.js"), "utf8");
  const conta = fs.readFileSync(path.join(__dirname, "../src/models/ContaPagarAgrupada.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8");
  assert.match(compra, /"Pago"/);
  assert.match(compra, /tipoDocumentoFiscal/);
  assert.match(conta, /statusEnvioOmie/);
  assert.match(conta, /statusPagamentoOmie/);
  assert.doesNotMatch(routes, /\\/contas\\/:id\\/consultar-pagamento/);
  assert.match(ui, /"statusEnvioOmie"/);
  assert.match(ui, /"statusPagamentoOmie"/);
  assert.doesNotMatch(ui, /Consultar pagamento no Omie/);
});''')
path.write_text(source)
