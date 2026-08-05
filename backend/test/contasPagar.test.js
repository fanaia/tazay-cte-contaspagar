"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  agruparCategorias,
  calcularProximaQuarta,
  codigoIntegracao,
  filtrosPesquisaPedidoCompra,
  montarPayloadContaPagar,
  normalizarCompraOmie,
} = require("../src/services/contasPagar");

function utcDate(day) {
  return new Date(`${day}T15:00:00.000Z`);
}

test("teste de conexão Omie não reutiliza a pesquisa operacional de compras", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const start = source.indexOf('"testar-conexao":');
  const end = source.indexOf('"pesquisar-compras-faturadas":', start);
  assert.ok(start >= 0 && end > start, "Chamadas Omie esperadas não foram encontradas.");
  const connectionTest = source.slice(start, end);
  assert.match(connectionTest, /endpoint: "geral\/clientes\/"/);
  assert.match(connectionTest, /call: "ListarClientes"/);
  assert.doesNotMatch(connectionTest, /PesquisarPedCompra/);
});

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

test("aplica a etapa local selecionada na configuração", () => {
  const compra = normalizarCompraOmie({
    cabecalho_consulta: {
      nCodPed: 88,
      nCodFor: 1234,
      nValTot: 100,
    },
  }, { instanceId: "default", forceEtapa: "Recebido parcialmente" });
  assert.equal(compra.etapa, "Recebido parcialmente");
});

test("gera exatamente um filtro ativo para cada situação de pedido Omie", () => {
  const fields = [
    "lExibirPedidosPendentes",
    "lExibirPedidosFaturados",
    "lExibirPedidosRecebidos",
    "lExibirPedidosCancelados",
    "lExibirPedidosEncerrados",
    "lExibirPedidosRecParciais",
    "lExibirPedidosFatParciais",
  ];
  for (const etapa of [
    "Pendente",
    "Faturado",
    "Recebido",
    "Cancelado",
    "Encerrado",
    "Recebido parcialmente",
    "Faturado parcialmente",
  ]) {
    const filtro = filtrosPesquisaPedidoCompra(etapa);
    assert.equal(fields.filter((field) => filtro[field] === "T").length, 1, etapa);
    assert.equal(filtro.etapaPedidoOmie, etapa);
  }
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

test("categoria selecionada na aprovação substitui a categoria original", () => {
  const result = agruparCategorias([
    {
      valorFaturado: 100,
      codigoCategoriaFinanceiraOmie: "PADRAO",
      rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "ORIGINAL", valor: 100 }]),
    },
  ]);
  assert.deepEqual(result, [{ codigo_categoria: "PADRAO", valor: 100 }]);
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
      codigoContaCorrenteFinanceiraOmie: 10,
      rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "A", valor: 100 }]),
    },
    {
      codigoPedidoOmie: 2,
      numeroPedido: "P2",
      valorFaturado: 50,
      codigoContaCorrenteFinanceiraOmie: 10,
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

test("parâmetros escolhidos na conta agrupada substituem os valores das compras", () => {
  const payload = montarPayloadContaPagar({
    codigoLancamentoIntegracao: "OON-MANUAL-G1",
    codigoFornecedorOmie: 123,
    dataVencimento: "2026-08-12",
    geracao: 1,
    codigoCategoriaOmie: "MANUAL",
    codigoContaCorrenteOmie: 99,
  }, [{
    codigoPedidoOmie: 1,
    numeroPedido: "P1",
    valorFaturado: 100,
    codigoCategoriaFinanceiraOmie: "PADRAO",
    codigoContaCorrenteFinanceiraOmie: 10,
  }]);
  assert.equal(payload.codigo_categoria, "MANUAL");
  assert.equal(payload.id_conta_corrente, 99);
});

test("exige conta corrente quando o agrupamento não possui uma seleção única", () => {
  assert.throws(() => montarPayloadContaPagar({
    codigoLancamentoIntegracao: "OON-SEM-CONTA-G1",
    codigoFornecedorOmie: 123,
    dataVencimento: "2026-08-12",
    geracao: 1,
  }, [{
    codigoPedidoOmie: 1,
    valorFaturado: 100,
    codigoCategoriaFinanceiraOmie: "A",
  }]), /Selecione uma conta corrente Omie/);
});

test("gera código diferente para cada geração", () => {
  const first = codigoIntegracao("default|123|2026-08-12", 1);
  const second = codigoIntegracao("default|123|2026-08-12", 2);
  assert.notEqual(first, second);
  assert.match(first, /^OON-TZ-[A-F0-9]{20}-G1$/);
});

test("pesquisa de compras usa parâmetros dinâmicos da configuração", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const start = source.indexOf('"pesquisar-compras-faturadas":');
  const end = source.indexOf('"listar-categorias":', start);
  assert.ok(start >= 0 && end > start, "Chamada de pesquisa de compras não encontrada.");
  const purchaseSearch = source.slice(start, end);
  assert.match(purchaseSearch, /call: "PesquisarPedCompra"/);
  assert.match(purchaseSearch, /param: parametrosPesquisaCompras/);
});
