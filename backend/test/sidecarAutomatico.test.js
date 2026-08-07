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

test("interface mantém CRUD bloqueado e oferece ações manuais condicionais", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const compra = ui.collections.find((item) => item.model === "Compra");
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  assert.deepEqual(compra.list.builtInActions, { create: false, edit: false, delete: false });
  assert.deepEqual(conta.list.builtInActions, { create: false, edit: false, delete: false });
  assert.deepEqual(compra.list.rowActions.map((action) => action.label), ["Aprovar", "Recusar"]);
  assert.deepEqual(conta.list.rowActions.slice(0, 2).map((action) => action.label), ["Enviar para Omie", "Verificar pagamento"]);
  assert.equal(compra.list.rowActions[0].hiddenWhen.field, "acaoAprovacaoManualDisponivel");
  assert.equal(conta.list.rowActions[0].hiddenWhen.field, "acaoSincronizacaoManualDisponivel");
});

test("exclusão da conta é enviada ao Omie e gera substituta no fluxo de exclusão integral", () => {
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

test("importação agenda reconciliação em lote com guarda para o fluxo manual", () => {
  const trigger = source("../src/triggers/compras.js");
  const guard = source("../src/services/contasPagar/manualReconciliationGuard.js");
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(trigger, /agendarProcessamentoDocumentoOperacional/);
  assert.doesNotMatch(trigger, /reconciliarCompra/);
  assert.match(guard, /agendarProcessamentoPendentes/);
  assert.match(guard, /aguardando-geracao-pagamento-manual/);
  assert.match(sidecar, /TAZAY_PROCESSAR_PENDENTES_OMIE/);
  assert.match(sidecar, /janelaProcessamento/);
  assert.match(reconciliation, /statusAprovacao: \{ \$ne: "Aprovada" \}/);
  assert.match(reconciliation, /statusDocumentoOmie: "Pendente"/);
  assert.match(mapping, /TAZAY_PROCESSAR_PENDENTES_OMIE: executarProcessamentoPendentesOmie/);
});

test("webhook sem alteração não gera novo processamento e alterações respeitam a guarda manual", () => {
  const webhooks = source("../src/services/contasPagar/webhooks.js");
  assert.match(webhooks, /documento-sem-alteracao/);
  assert.match(webhooks, /normalized\.statusIntegracao = changed/);
  assert.match(webhooks, /agendarProcessamentoDocumentoOperacional\(compra\)/);
});

test("base de desenvolvimento usa configuração direta, sem migração de legado", () => {
  const model = source("../src/models/ConfiguracaoContasPagar.js");
  const config = source("../src/services/contasPagar/configuration.js");
  assert.doesNotMatch(model, /versaoConfiguracao/);
  assert.doesNotMatch(config, /CONFIGURATION_VERSION|versaoConfiguracao|\$lt/);
  assert.match(config, /aprovarCompraAutomatico: true/);
  assert.match(config, /enviarContaPagarOmieAutomatico: true/);
});

test("exclusão é exibida como ícone acessível e não emoji", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  const action = conta.list.rowActions.find((item) => item.id === "excluirContaOmie");
  assert.ok(action);
  assert.equal(action.label, "Excluir conta");
  assert.equal(action.icon, "trash");
  assert.equal(action.iconOnly, true);
  assert.notEqual(action.label, "🗑️");
});

test("configuração controla aprovação e sincronização automáticas", () => {
  const model = source("../src/models/ConfiguracaoContasPagar.js");
  const config = source("../src/services/contasPagar/configuration.js");
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  assert.match(model, /aprovarCompraAutomatico/);
  assert.match(model, /enviarContaPagarOmieAutomatico/);
  assert.match(config, /aprovarCompraAutomatico: true/);
  assert.match(config, /enviarContaPagarOmieAutomatico: true/);
  assert.match(reconciliation, /configuracao\.aprovarCompraAutomatico === true/);
  assert.match(reconciliation, /configuracao\.enviarContaPagarOmieAutomatico === true/);
  assert.doesNotMatch(reconciliation, /const automaticApproval = true/);
  assert.doesNotMatch(reconciliation, /const shouldSend = true/);
});
