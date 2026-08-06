"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  executarConclusaoRecebimentoOmie,
  identificacaoPersistida,
} = require("../src/services/contasPagar");

test("usa o identificador de recebimento já persistido na compra", () => {
  assert.deepEqual(identificacaoPersistida({
    codigoRecebimentoOmie: 173516,
    chaveDocumentoFiscal: "3526080605722302664255300001735161555332640",
    codigoEtapaRecebimentoOmie: "50",
    statusDocumentoOmie: "Pendente",
  }), {
    codigoRecebimentoOmie: 173516,
    chaveDocumentoFiscal: "3526080605722302664255300001735161555332640",
    etapaOmie: "50",
    recebido: false,
  });
});

test("a exportação principal usa a implementação de conclusão direta", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/contasPagar/conclusaoRecebimento.js"),
    "utf8",
  );
  assert.equal(typeof executarConclusaoRecebimentoOmie, "function");
  assert.match(source, /origem: "persistida"/);
  assert.match(source, /chamadasListagem: 0/);
  assert.match(source, /"concluir-recebimento"/);
});

test("a listagem fica restrita ao fallback de registros legados", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/contasPagar/conclusaoRecebimento.js"),
    "utf8",
  );
  const persistedIndex = source.indexOf("persistida.codigoRecebimentoOmie > 0");
  const listIndex = source.indexOf("listarRecebimentosOmie(compra, context)");
  assert.ok(persistedIndex >= 0, "Validação do identificador persistido não encontrada.");
  assert.ok(listIndex > persistedIndex, "A listagem deve ocorrer somente depois da validação persistida.");
  assert.match(source, /fallback-legado/);
});

test("index sobrescreve a implementação antiga pela conclusão direta", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/contasPagar/index.js"),
    "utf8",
  );
  const legacyIndex = source.indexOf('require("./omieOperations")');
  const directIndex = source.indexOf('require("./conclusaoRecebimento")');
  assert.ok(legacyIndex >= 0 && directIndex > legacyIndex);
});
