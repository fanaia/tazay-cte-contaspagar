"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extrairCooldownSegundos,
  normalizarParametrosOmie,
} = require("../src/services/contasPagar");

test("bloqueia chamada Omie sem parâmetros antes da requisição", () => {
  assert.throws(() => normalizarParametrosOmie({}), /parâmetros vazios|não possui parâmetros/i);
  assert.throws(() => normalizarParametrosOmie([]), /não possui parâmetros/i);
  assert.throws(() => normalizarParametrosOmie([{ campo: undefined }]), /não possui parâmetros/i);
});

test("remove valores vazios sem eliminar zero ou false", () => {
  assert.deepEqual(normalizarParametrosOmie([{
    codigo: 123,
    pagina: 0,
    ativo: false,
    vazio: "",
    ausente: undefined,
  }]), [{ codigo: 123, pagina: 0, ativo: false }]);
});

test("reconhece pausa informada pelo Omie", () => {
  assert.equal(extrairCooldownSegundos(new Error("Tente novamente em 1342 segundos.")), 1342);
  assert.equal(extrairCooldownSegundos(new Error("Aguarde 2 segundos para tentar novamente")), 2);
});

test("conclusão não possui pesquisa nem compatibilidade legada", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/conclusaoRecebimento.js"), "utf8");
  assert.doesNotMatch(source, /listarRecebimentosOmie/);
  assert.doesNotMatch(source, /fallback-legado/);
  assert.match(source, /chamadasListagem: 0/);
  assert.match(source, /RECEBIMENTO_SEM_IDENTIFICADOR/);
});

test("mapeamento não permite tentativa múltipla nem parâmetro padrão vazio", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  assert.doesNotMatch(source, /"listar-recebimentos"/);
  assert.doesNotMatch(source, /default: \[\{\}\]/);
  assert.doesNotMatch(source, /maxAttempts: [2-9]/);
  const calls = source.slice(source.indexOf("calls: {"), source.indexOf("lists: ["));
  const declaredCalls = [...calls.matchAll(/^    "[^"]+": \{/gm)].length;
  const singleAttempts = [...calls.matchAll(/maxAttempts: 1/g)].length;
  assert.equal(singleAttempts, declaredCalls);
});

test("pagamento automático continua orientado a eventos e a consulta é somente manual", () => {
  const operations = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/omieOperations.js"), "utf8");
  const actions = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/manualActions.js"), "utf8");
  const mapping = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const webhooks = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/webhooks.js"), "utf8");
  assert.doesNotMatch(operations, /consultarPagamentoContaPagar|executarConsultaPagamentoOmie/);
  assert.match(actions, /exigirSincronizacaoManual/);
  assert.match(actions, /consultarPagamentoContaPagar/);
  assert.match(mapping, /"consultar-conta-pagar"/);
  assert.match(mapping, /TAZAY_CONSULTAR_PAGAMENTO_OMIE/);
  assert.match(mapping, /"consultar-conta-pagar"[\s\S]*maxAttempts: 1/);
  assert.match(webhooks, /Financas\.ContaPagar\.BaixaRealizada/);
  assert.match(webhooks, /Financas\.ContaPagar\.BaixaCancelada/);
});

test("job não pesquisa documentos, não faz backfill e não reprocessa erro temporário", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/hooks/integrationAutoProcessor.js"), "utf8");
  assert.doesNotMatch(source, /Compra\.find/);
  assert.doesNotMatch(source, /reconciliar|consolidar/i);
  assert.match(source, /status: "Erro definitivo"/);
  assert.match(source, /batchSize:[\s\S]*\|\| 1/);
});

test("menu possui acesso direto aos tickets de integração", () => {
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/central.ui.json"), "utf8"));
  assert.equal(ui.navigation.mode, "mixed");
  assert.equal(ui.navigation.items.some((item) => (
    item.label === "Tickets de Integração"
    && item.href === "/configuracoes/integracao-omie/tickets"
  )), true);
});
