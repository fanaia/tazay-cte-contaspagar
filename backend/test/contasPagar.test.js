"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  agruparCategorias,
  calcularProximaQuarta,
  codigoIntegracao,
  montarPayloadContaPagar,
  normalizarCompraOmie,
} = require("../src/services/contasPagar");

function utcDate(day) {
  return new Date(`${day}T15:00:00.000Z`);
}

test("calcula a quarta-feira estrita para todos os dias da semana", () => {
  assert.equal(calcularProximaQuarta(utcDate("2026-08-03")), "2026-08-05");
  assert.equal(calcularProximaQuarta(utcDate("2026-08-04")), "2026-08-05");
  assert.equal(calcularProximaQuarta(utcDate("2026-08-05")), "2026-08-12");
  assert.equal(calcularProximaQuarta(utcDate("2026-08-06")), "2026-08-12");
  assert.equal(calcularProximaQuarta(utcDate("2026-08-07")), "2026-08-12");
  assert.equal(calcularProximaQuarta(utcDate("2026-08-08")), "2026-08-12");
  assert.equal(calcularProximaQuarta(utcDate("2026-08-09")), "2026-08-12");
});

test("normaliza um pedido faturado retornado pela pesquisa Omie", () => {
  const compra = normalizarCompraOmie({
    cabecalho_consulta: {
      nCodPed: 77,
      cCodIntPed: "PED-77",
      cNumero: "000077",
      nCodFor: 1234,
      cCodCateg: "2.04.01",
      nCodCC: 987,
      cEtapa: "50",
    },
    produtos_consulta: [
      { nQtde: 2, nValUnit: 100, nDesconto: 10, cCodCateg: "2.04.01" },
      { nValTot: 55.5, cCodCateg: "2.04.01" },
    ],
  }, { instanceId: "default", forceFaturado: true });
  assert.equal(compra.chaveExterna, "default:77");
  assert.equal(compra.codigoFornecedorOmie, 1234);
  assert.equal(compra.valorFaturado, 245.5);
  assert.equal(compra.etapa, "Faturado pelo fornecedor");
});

test("agrupa categorias sem duplicar valores", () => {
  const result = agruparCategorias([
    { rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "A", valor: 10 }]) },
    { rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "A", valor: 5.25 }, { codigo_categoria: "B", valor: 4.75 }]) },
  ]);
  assert.deepEqual(result, [
    { codigo_categoria: "A", valor: 15.25 },
    { codigo_categoria: "B", valor: 4.75 },
  ]);
});

test("monta payload com rateio e vencimento Omie", () => {
  const conta = {
    codigoLancamentoIntegracao: "OON-TESTE-G1",
    codigoFornecedorOmie: 123,
    dataVencimento: "2026-08-12",
    geracao: 1,
  };
  const compras = [
    {
      codigoPedidoOmie: 1,
      numeroPedido: "P1",
      valorFaturado: 100,
      codigoContaCorrenteOmie: 10,
      rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "A", valor: 100 }]),
    },
    {
      codigoPedidoOmie: 2,
      numeroPedido: "P2",
      valorFaturado: 50,
      codigoContaCorrenteOmie: 10,
      rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "B", valor: 50 }]),
    },
  ];
  const payload = montarPayloadContaPagar(conta, compras);
  assert.equal(payload.valor_documento, 150);
  assert.equal(payload.data_vencimento, "12/08/2026");
  assert.equal(payload.id_conta_corrente, 10);
  assert.deepEqual(payload.categorias, [
    { codigo_categoria: "A", valor: 100 },
    { codigo_categoria: "B", valor: 50 },
  ]);
});

test("gera código diferente para cada geração", () => {
  const first = codigoIntegracao("default|123|2026-08-12", 1);
  const second = codigoIntegracao("default|123|2026-08-12", 2);
  assert.notEqual(first, second);
  assert.match(first, /^OON-TZ-[A-F0-9]{20}-G1$/);
});
