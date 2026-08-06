"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  identificacaoRecebimento,
  recebimentoVinculadoAoPedido,
  selecionarRecebimentoDaCompra,
} = require("../src/services/contasPagar");

function recebimento(overrides = {}) {
  return {
    cabec: {
      nIdReceb: 987,
      cChaveNfe: "35260813960300000164550010004190711645089113",
      cEtapa: "50",
      nIdFornecedor: 123,
      cNumeroNFe: "000419071",
      nValorNFe: 431.40,
      ...(overrides.cabec || {}),
    },
    itensRecebimento: overrides.itensRecebimento || [
      { itensCabec: { nIdPedido: 456, nIdItPedido: 1 } },
    ],
    infoCadastro: {
      cRecebido: "N",
      ...(overrides.infoCadastro || {}),
    },
  };
}

const compra = {
  codigoPedidoOmie: 456,
  codigoFornecedorOmie: 123,
  numeroPedido: "5",
  valorFaturado: 431.40,
};

test("identifica o recebimento fiscal retornado pelo Omie", () => {
  const result = identificacaoRecebimento(recebimento());
  assert.equal(result.codigoRecebimentoOmie, 987);
  assert.equal(result.chaveDocumentoFiscal, "35260813960300000164550010004190711645089113");
  assert.equal(result.etapaOmie, "50");
  assert.equal(result.codigoFornecedorOmie, 123);
  assert.equal(result.valorDocumento, 431.40);
  assert.equal(result.recebido, false);
});

test("relaciona o recebimento ao pedido pelo nIdPedido do item", () => {
  assert.equal(recebimentoVinculadoAoPedido(recebimento(), compra), true);
  assert.equal(recebimentoVinculadoAoPedido(recebimento({
    itensRecebimento: [{ itensCabec: { nIdPedido: 999 } }],
  }), compra), false);
});

test("prioriza o recebimento que contém o pedido de compra", () => {
  const unrelated = recebimento({
    cabec: { nIdReceb: 111, nValorNFe: 431.40 },
    itensRecebimento: [{ itensCabec: { nIdPedido: 999 } }],
  });
  const selected = selecionarRecebimentoDaCompra([unrelated, recebimento()], compra);
  assert.equal(selected.identificacao.codigoRecebimentoOmie, 987);
  assert.ok(selected.score >= 500);
});

test("mapeamento declara os métodos oficiais de recebimento e o handler", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  assert.match(source, /endpoint: "produtos\/recebimentonfe\/"/);
  assert.match(source, /call: "ListarRecebimentos"/);
  assert.match(source, /call: "ConcluirRecebimento"/);
  assert.match(source, /TAZAY_CONCLUIR_RECEBIMENTO_OMIE/);
});

test("compras mantêm rastreabilidade da conclusão no Omie", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/models/Compra.js"), "utf8");
  assert.match(source, /codigoRecebimentoOmie/);
  assert.match(source, /chaveDocumentoFiscal/);
  assert.match(source, /statusConclusaoOmie/);
  assert.match(source, /concluidaNoOmieEm/);
});

test("a Central drena automaticamente somente tickets novos, sem reprocessar erros", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/hooks/integrationAutoProcessor.js"),
    "utf8",
  );
  assert.match(source, /integrations\.drainOnce/);
  assert.match(source, /getIntegrationModels/);
  assert.match(source, /status: "Erro definitivo"/);
  assert.match(source, /OON_INTEGRATION_AUTO_BATCH_SIZE \|\| 1/);
  assert.match(source, /OON_INTEGRATION_AUTO_WEBHOOK_BATCH_SIZE \|\| 10/);
  assert.doesNotMatch(source, /enfileirarComprasPagasExistentes/);
  assert.doesNotMatch(source, /OON_INTEGRATION_AUTO_BACKFILL_BATCH_SIZE/);
  assert.doesNotMatch(source, /etapa: "Pago"/);
});
