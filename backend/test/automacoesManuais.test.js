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

test("aprovação manual é independente da geração do contas a pagar", () => {
  const workflow = source("../src/services/contasPagar/paymentWorkflow.js");
  const routes = source("../src/routes/contasPagar.js");
  assert.match(workflow, /async function aprovarDocumentosLote/);
  assert.match(workflow, /statusAprovacao: "Aprovada"/);
  assert.doesNotMatch(workflow.match(/async function aprovarDocumentosLote[\s\S]*?\n}\n/)?.[0] || "", /contaPagarId/);
  assert.match(routes, /\/compras\/aprovar-lote/);
  assert.match(routes, /aprovarDocumentosLote\(\[req\.params\.id\]/);
});

test("geração de pagamento exige documentos aprovados e compatíveis", () => {
  const workflow = source("../src/services/contasPagar/paymentWorkflow.js");
  assert.match(workflow, /documento\.statusAprovacao !== "Aprovada"/);
  assert.match(workflow, /documento\.contaPagarId/);
  assert.match(workflow, /mesma instância, fornecedor e tipo fiscal/);
  assert.match(workflow, /STATUS_CONTAS_ABERTAS/);
});

test("confirmação do pagamento permite conta existente, categoria, conta corrente e vencimento", () => {
  const workflow = source("../src/services/contasPagar/paymentWorkflow.js");
  const routes = source("../src/routes/contasPagar.js");
  assert.match(workflow, /obterContextoGeracaoPagamento/);
  assert.match(workflow, /contasAbertas/);
  assert.match(workflow, /categorias/);
  assert.match(workflow, /contasCorrentes/);
  assert.match(workflow, /dataVencimento/);
  assert.match(routes, /\/compras\/contexto-pagamento/);
  assert.match(routes, /\/compras\/gerar-pagamento/);
});

test("documentos podem ser removidos do pagamento e a conta é recalculada", () => {
  const workflow = source("../src/services/contasPagar/paymentWorkflow.js");
  const routes = source("../src/routes/contasPagar.js");
  assert.match(workflow, /async function removerDocumentoDaConta/);
  assert.match(workflow, /\$unset: \{ contaPagarId: 1 \}/);
  assert.match(workflow, /recalcularConta\(conta\._id\)/);
  assert.match(routes, /\/contas\/:id\/documentos\/:documentoId/);
});

test("fluxo manual não reconcilia documento aprovado antes da geração explícita", () => {
  const guard = source("../src/services/contasPagar/manualReconciliationGuard.js");
  const trigger = source("../src/triggers/compras.js");
  assert.match(guard, /aguardando-geracao-pagamento-manual/);
  assert.match(guard, /configuracao\.aprovarCompraAutomatico !== true/);
  assert.match(trigger, /agendarProcessamentoDocumentoOperacional/);
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
