"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classificarPagamentoContaPagar,
  montarObservacaoDocumentosFiscais,
  montarPayloadContaPagar,
} = require("../src/services/contasPagar");

test("descrição do contas a pagar detalha NF-es, CT-es e valores", () => {
  const documentos = [
    { tipoDocumentoFiscal: "NF-e", numeroDocumentoFiscal: "00000", valorFaturado: 100 },
    { tipoDocumentoFiscal: "CT-e", numeroDocumentoFiscal: "00001", valorFaturado: 200 },
  ];
  assert.equal(
    montarObservacaoDocumentosFiscais(documentos),
    "Contas a Pagar gerada pela Central Oon referente aos documentos fiscais:\nNF-e 00000 - R$ 100,00\nCT-e 00001 - R$ 200,00",
  );
  const payload = montarPayloadContaPagar({
    codigoLancamentoIntegracao: "OON-DOCS-G1",
    codigoFornecedorOmie: 123,
    tipoDocumentoFiscal: "NF-e",
    dataVencimento: "2026-08-12",
    geracao: 1,
    codigoCategoriaOmie: "2.01.01",
    codigoContaCorrenteOmie: 10,
  }, documentos);
  assert.equal(payload.observacao, montarObservacaoDocumentosFiscais(documentos));
});

test("classifica situação de pagamento recebida nos eventos Omie", () => {
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "PAG" }).statusPagamentoOmie, "Pago");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "LIQ" }).statusPagamentoOmie, "Pago");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "PAGTO_PARCIAL" }).statusPagamentoOmie, "Parcial");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "CANCELADO" }).statusPagamentoOmie, "Cancelado");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "EMABERTO", valor_pag: 100 }).statusPagamentoOmie, "Pendente");
  assert.equal(classificarPagamentoContaPagar({ status_titulo: "EMABERTO", valor_pag: 0 }).statusPagamentoOmie, "Pago");
});

test("envio possui handler próprio e pagamento não possui polling", () => {
  const mapping = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const operations = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/omieOperations.js"), "utf8");
  const reconciliation = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/reconciliation.js"), "utf8");
  assert.match(mapping, /TAZAY_ENVIAR_CONTA_PAGAR_OMIE: executarEnvioContaPagarOmie/);
  assert.doesNotMatch(mapping, /consultar-conta-pagar|TAZAY_CONSULTAR_PAGAMENTO_OMIE/);
  assert.doesNotMatch(operations, /consultarPagamentoContaPagar|executarConsultaPagamentoOmie|Consultando/);
  assert.match(reconciliation, /handler: "TAZAY_ENVIAR_CONTA_PAGAR_OMIE"/);
  assert.doesNotMatch(reconciliation, /enqueueOmieCall/);
});

test("modelos exibem situação Omie sem consulta manual ou periódica", () => {
  const compra = fs.readFileSync(path.join(__dirname, "../src/models/Compra.js"), "utf8");
  const conta = fs.readFileSync(path.join(__dirname, "../src/models/ContaPagarAgrupada.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/contasPagar.js"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8");
  assert.match(compra, /"Pago"/);
  assert.match(conta, /statusPagamentoOmie/);
  assert.doesNotMatch(conta, /Consultando|consultaPagamentoRevisao|ultimaConsultaPagamentoEm/);
  assert.doesNotMatch(routes, /consultar-pagamento/);
  assert.doesNotMatch(ui, /Consultar pagamento no Omie/);
});
