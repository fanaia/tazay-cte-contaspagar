"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = (relative) => fs.readFileSync(path.join(__dirname, relative), "utf8");

test("recusa fiscal executa ExcluirRecebimento uma única vez", () => {
  const actions = source("../src/services/contasPagar/manualActions.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(actions, /TAZAY_RECUSAR_DOCUMENTO_FISCAL_OMIE/);
  assert.match(actions, /executarChamadaOmie\(\s*"excluir-recebimento"/);
  assert.match(mapping, /call: "ExcluirRecebimento"/);
  assert.match(mapping, /"excluir-recebimento"[\s\S]*maxAttempts: 1/);
  assert.match(actions, /statusAprovacao: "Recusada"/);
  assert.match(actions, /statusDocumentoOmie: "Cancelado"/);
});

test("aprovação manual somente cria ou atualiza agrupamento na Central quando envio automático está desligado", () => {
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  assert.match(reconciliation, /aguardando-aprovacao/);
  assert.match(reconciliation, /options\.forceSend \|\| configuracao\.enviarContaPagarOmieAutomatico === true/);
  assert.match(reconciliation, /status: "Pendente envio"/);
});

test("verificação manual de pagamento evita consultas duplicadas", () => {
  const actions = source("../src/services/contasPagar/manualActions.js");
  const model = source("../src/models/ContaPagarAgrupada.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(model, /"Consultando"/);
  assert.match(model, /consultaPagamentoRevisao/);
  assert.match(actions, /consulta-ja-pendente/);
  assert.match(actions, /TAZAY_CONSULTAR_PAGAMENTO_OMIE/);
  assert.match(mapping, /call: "ConsultarContaPagar"/);
  assert.match(mapping, /"consultar-conta-pagar"[\s\S]*maxAttempts: 1/);
});

test("backend protege ações manuais quando a automação correspondente está ativa", () => {
  const actions = source("../src/services/contasPagar/manualActions.js");
  const routes = source("../src/routes/contasPagar.js");
  assert.match(actions, /exigirAprovacaoManual/);
  assert.match(actions, /exigirSincronizacaoManual/);
  assert.match(routes, /\/compras\/:id\/aprovar/);
  assert.match(routes, /\/compras\/:id\/recusar/);
  assert.match(routes, /\/contas\/:id\/enviar/);
  assert.match(routes, /\/contas\/:id\/consultar-pagamento/);
});

test("configuração materializa a visibilidade das ações nos registros", () => {
  const trigger = source("../src/triggers/configuracaoContasPagar.js");
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  assert.match(trigger, /acaoAprovacaoManualDisponivel/);
  assert.match(trigger, /acaoSincronizacaoManualDisponivel/);
  assert.match(sidecar, /aguardando-aprovacao-manual/);
});
