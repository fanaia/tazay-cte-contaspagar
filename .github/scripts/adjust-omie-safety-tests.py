from pathlib import Path

Path("backend/test/conclusaoRecebimentoDireta.test.js").write_text(r'''"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  executarConclusaoRecebimentoOmie,
  identificacaoPersistida,
  resolverIdentificacaoRecebimento,
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
  assert.match(source, /origemIdentificacao: "persistida"/);
  assert.match(source, /chamadasListagem: 0/);
  assert.match(source, /"concluir-recebimento"/);
});

test("documento sem identificador falha localmente e não realiza pesquisa", () => {
  assert.throws(
    () => resolverIdentificacaoRecebimento({}),
    /não possui código de recebimento nem chave fiscal/i,
  );
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/contasPagar/conclusaoRecebimento.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /listarRecebimentosOmie/);
  assert.doesNotMatch(source, /fallback-legado/);
  assert.match(source, /RECEBIMENTO_SEM_IDENTIFICADOR/);
});

test("index sobrescreve a implementação antiga pela conclusão direta", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/contasPagar/index.js"),
    "utf8",
  );
  const operationsIndex = source.indexOf('require("./omieOperations")');
  const directIndex = source.indexOf('require("./conclusaoRecebimento")');
  assert.ok(operationsIndex >= 0 && directIndex > operationsIndex);
});
''')
