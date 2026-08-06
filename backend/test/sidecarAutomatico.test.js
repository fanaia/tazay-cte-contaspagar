"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chaveBase,
  observacaoDocumentoCancelado,
} = require("../src/services/contasPagar");

function source(relative) {
  return fs.readFileSync(path.join(__dirname, relative), "utf8");
}

test("agrupa por instância, fornecedor e tipo de documento", () => {
  assert.equal(chaveBase({ instanceId: "default", codigoFornecedorOmie: 10, tipoDocumentoFiscal: "NF-e" }), "default|10|NF-e");
  assert.equal(chaveBase({ instanceId: "default", codigoFornecedorOmie: 10, tipoDocumentoFiscal: "CT-e" }), "default|10|CT-e");
  assert.throws(() => chaveBase({ instanceId: "default", codigoFornecedorOmie: 10, tipoDocumentoFiscal: "Outro" }), /exclusivamente NF-e ou CT-e/i);
});

test("modelos são exclusivos da integração Omie", () => {
  const compra = source("../src/models/Compra.js");
  const conta = source("../src/models/ContaPagarAgrupada.js");
  assert.match(compra, /const TIPOS_DOCUMENTO_FISCAL = \["NF-e", "CT-e"\]/);
  assert.doesNotMatch(compra, /"Outro"/);
  assert.match(compra, /roles: \{ write: \["integracao-sistema"\] \}/);
  assert.match(conta, /tipoDocumentoFiscal/);
  assert.match(conta, /"Exclusão pendente"/);
  assert.match(conta, /roles: \{ write: \["integracao-sistema"\] \}/);
});

test("interface não oferece criação, edição ou ações financeiras manuais", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const compra = ui.collections.find((item) => item.model === "Compra");
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  assert.deepEqual(compra.list.builtInActions, { create: false, edit: false, delete: false });
  assert.deepEqual(conta.list.builtInActions, { create: false, edit: false, delete: false });
  assert.equal(compra.list.rowActions.length, 0);
  assert.equal(conta.list.rowActions.length, 1);
  assert.equal(conta.list.rowActions[0].label, "🗑️");
  assert.equal(conta.list.rowActions[0].method, "DELETE");
  const json = JSON.stringify(ui);
  assert.doesNotMatch(json, /Aprovar e gerar contas-pagar/);
  assert.doesNotMatch(json, /Enviar para o Omie/);
  assert.doesNotMatch(json, /Consultar pagamento no Omie/);
});

test("exclusão da conta é enviada ao Omie e gera substituta", () => {
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  const routes = source("../src/routes/contasPagar.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(sidecar, /TAZAY_EXCLUIR_CONTA_PAGAR_OMIE/);
  assert.match(sidecar, /regenerarContaExcluida/);
  assert.match(sidecar, /reconciliarCompra/);
  assert.match(sidecar, /enviarContaParaOmie/);
  assert.match(routes, /solicitarExclusaoContaOmie/);
  assert.doesNotMatch(routes, /excluirContaLocal/);
  assert.match(mapping, /TAZAY_EXCLUIR_CONTA_PAGAR_OMIE/);
});

test("cancelamento do pagamento devolve documentos para pendente", () => {
  const webhooks = source("../src/services/contasPagar/webhooks.js");
  assert.match(webhooks, /Financas\.ContaPagar\.BaixaCancelada/);
  assert.match(webhooks, /statusDocumentoOmie: "Pendente"/);
  assert.match(webhooks, /statusConclusaoOmie: "Não enviado"/);
  assert.match(webhooks, /\$unset: \{ concluidaNoOmieEm: 1 \}/);
});

test("cancelamento fiscal ajusta o agrupamento ou registra pagamento já realizado", () => {
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  assert.match(sidecar, /\$unset = \{ contaPagarId: 1 \}/);
  assert.match(sidecar, /recalcularConta\(conta\._id\)/);
  assert.match(sidecar, /enviarContaParaOmie\(conta\._id/);
  assert.match(sidecar, /canceladaAposPagamento: pago/);
  assert.match(observacaoDocumentoCancelado(
    { tipoDocumentoFiscal: "NF-e", numeroDocumentoFiscal: "123" },
    { codigoLancamentoOmie: 99 },
    true,
  ), /pagamento já havia sido realizado/i);
});

test("webhook curinga captura eventos fiscais sem criar tipos desconhecidos", () => {
  const mapping = source("../src/mappings/omie.js");
  const webhooks = source("../src/services/contasPagar/webhooks.js");
  assert.match(mapping, /webhookAction\("\*"\)/);
  assert.match(webhooks, /tipo-documento-nao-suportado/);
  assert.match(webhooks, /tratarCancelamentoDocumento/);
});

test("configuração não permite desligar a automação", () => {
  const model = source("../src/models/ConfiguracaoContasPagar.js");
  const config = source("../src/services/contasPagar/configuration.js");
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  assert.doesNotMatch(model, /aprovarCompraAutomatico|enviarContaPagarOmieAutomatico/);
  assert.doesNotMatch(config, /aprovarCompraAutomatico|enviarContaPagarOmieAutomatico/);
  assert.match(reconciliation, /const automaticApproval = true/);
  assert.match(reconciliation, /const shouldSend = true/);
});
