"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  avaliarDocumentoFaturadoPendente,
  parametrosListagemDocumentosFiscais,
} = require("../src/services/contasPagar/documentosFiscais");

function recebimento(overrides = {}) {
  return {
    cabec: {
      nIdReceb: 173516,
      cModeloNFe: "55",
      cNumeroNFe: "000173516",
      cEtapa: "IGNORADA-PELA-CONSULTA",
      ...(overrides.cabec || {}),
    },
    infoCadastro: {
      cFaturado: "S",
      cRecebido: "N",
      cCancelada: "N",
      cDevolvido: "N",
      cDenegado: "N",
      ...(overrides.infoCadastro || {}),
    },
  };
}

test("ListarRecebimentos não envia cEtapa e pagina em lotes de 100", () => {
  assert.deepEqual(parametrosListagemDocumentosFiscais({
    input: { page: 2, pageSize: 100 },
  }), [{
    nPagina: 2,
    nRegistrosPorPagina: 100,
    cOrdenarPor: "CODIGO",
    cExibirDetalhes: "S",
  }]);
});

test("inclui NF-e faturada e pendente sem depender do código da etapa", () => {
  assert.deepEqual(avaliarDocumentoFaturadoPendente(recebimento()), {
    include: true,
    reason: "",
  });
});

test("inclui CT-e modelo 57 faturado e pendente", () => {
  assert.deepEqual(avaliarDocumentoFaturadoPendente(recebimento({
    cabec: { cModeloNFe: "57" },
  })), {
    include: true,
    reason: "",
  });
});

test("aceita descrição da etapa como alternativa ao indicador de faturamento", () => {
  assert.deepEqual(avaliarDocumentoFaturadoPendente(recebimento({
    cabec: { cDescEtapa: "Faturado pelo Fornecedor" },
    infoCadastro: { cFaturado: "N" },
  })), {
    include: true,
    reason: "",
  });
});

test("descarta documento recebido, cancelado, devolvido ou denegado", () => {
  assert.equal(avaliarDocumentoFaturadoPendente(recebimento({
    infoCadastro: { cRecebido: "S" },
  })).include, false);
  assert.equal(avaliarDocumentoFaturadoPendente(recebimento({
    infoCadastro: { cCancelada: "S" },
  })).include, false);
  assert.equal(avaliarDocumentoFaturadoPendente(recebimento({
    infoCadastro: { cDevolvido: "S" },
  })).include, false);
  assert.equal(avaliarDocumentoFaturadoPendente(recebimento({
    infoCadastro: { cDenegado: "S" },
  })).include, false);
});

test("descarta modelos diferentes de NF-e 55 e CT-e 57", () => {
  assert.deepEqual(avaliarDocumentoFaturadoPendente(recebimento({
    cabec: { cModeloNFe: "65" },
  })), {
    include: false,
    reason: "modelo-fiscal-65",
  });
});

test("mapping usa filtro local e uma única tentativa por página", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  assert.match(source, /call: "ListarRecebimentos"/);
  assert.match(source, /filter: avaliarDocumentoFaturadoPendente/);
  assert.match(source, /maxAttempts: 1/);
  assert.doesNotMatch(source, /cEtapa:\s*CODIGO_ETAPA_FATURADO_FORNECEDOR/);
});
