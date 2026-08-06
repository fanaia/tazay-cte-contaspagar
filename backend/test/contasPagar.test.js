"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  agruparCategorias,
  calcularProximaQuarta,
  chaveBase,
  CODIGO_ETAPA_FATURADO_FORNECEDOR,
  codigoIntegracao,
  DEFAULT_CONFIGURATION,
  montarDadosAprovacao,
  montarPayloadContaPagar,
  normalizarRecebimentoOmie,
  parametrosRecebimentosFaturados,
  selecionarOperacaoContaPagar,
} = require("../src/services/contasPagar");

function utcDate(day) {
  return new Date(`${day}T15:00:00.000Z`);
}

function recebimentoFiscal(overrides = {}) {
  return {
    cabec: {
      nIdReceb: 173516,
      nIdFornecedor: 6057223,
      cNome: "SENDAS DISTRIBUIDORA S/A LJ09",
      cRazaoSocial: "SENDAS DISTRIBUIDORA S/A LJ09",
      cChaveNfe: "3526080605722302664255300001735161555332640",
      cEtapa: "50",
      cNumeroNFe: "000173516",
      cSerieNFe: "300",
      cModeloNFe: "55",
      dEmissaoNFe: "04/08/2026",
      nValorNFe: 949.10,
      ...(overrides.cabec || {}),
    },
    itensRecebimento: overrides.itensRecebimento || [
      {
        itensCabec: { nIdPedido: 456, nIdItPedido: 1 },
        itensInfoAdic: { nNumPedCompra: "000456" },
      },
    ],
    categorias: overrides.categorias || [
      { cCategoria: "2.04.01", vCategoria: 949.10 },
    ],
    infoAdicionais: {
      cCategCompra: "2.04.01",
      nIdConta: 987,
      ...(overrides.infoAdicionais || {}),
    },
    infoCadastro: {
      cFaturado: "S",
      cRecebido: "N",
      cCancelada: "N",
      cDenegado: "N",
      cDevolvido: "N",
      dFat: "05/08/2026",
      hFat: "12:19:01",
      ...(overrides.infoCadastro || {}),
    },
  };
}

test("teste de conexão Omie não reutiliza a consulta operacional de documentos fiscais", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const start = source.indexOf('"testar-conexao":');
  const end = source.indexOf('"listar-documentos-faturados-pendentes":', start);
  assert.ok(start >= 0 && end > start, "Chamadas Omie esperadas não foram encontradas.");
  const connectionTest = source.slice(start, end);
  assert.match(connectionTest, /endpoint: "geral\/clientes\/"/);
  assert.match(connectionTest, /call: "ListarClientes"/);
  assert.doesNotMatch(connectionTest, /ListarRecebimentos/);
});

test("mapeamento financeiro usa IncluirContaPagar e AlterarContaPagar", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  assert.match(source, /"incluir-conta-pagar"/);
  assert.match(source, /call: "IncluirContaPagar"/);
  assert.match(source, /"alterar-conta-pagar"/);
  assert.match(source, /call: "AlterarContaPagar"/);
  assert.doesNotMatch(source, /UpsertContaPagar/);
  assert.doesNotMatch(source, /"upsert-conta-pagar"/);
});

test("primeiro envio inclui e revisões seguintes alteram a conta no Omie", () => {
  assert.deepEqual(selecionarOperacaoContaPagar({ revisao: 0 }), {
    call: "incluir-conta-pagar",
    operation: "create",
    metodo: "IncluirContaPagar",
  });
  assert.deepEqual(selecionarOperacaoContaPagar({ revisao: 1 }), {
    call: "alterar-conta-pagar",
    operation: "update",
    metodo: "AlterarContaPagar",
  });
  assert.deepEqual(selecionarOperacaoContaPagar({ revisao: 0, codigoLancamentoOmie: 987 }), {
    call: "alterar-conta-pagar",
    operation: "update",
    metodo: "AlterarContaPagar",
  });
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

test("normaliza NF-e pendente da etapa Faturado pelo Fornecedor", () => {
  const documento = normalizarRecebimentoOmie(recebimentoFiscal(), {
    instanceId: "default",
    onlyPendingFaturado: true,
  });
  assert.equal(documento.chaveExterna, "default:recebimento:173516");
  assert.equal(documento.codigoRecebimentoOmie, 173516);
  assert.equal(documento.tipoDocumentoFiscal, "NF-e");
  assert.equal(documento.modeloDocumentoFiscal, "55");
  assert.equal(documento.numeroDocumentoFiscal, "000173516");
  assert.equal(documento.codigoEtapaRecebimentoOmie, "50");
  assert.equal(documento.statusDocumentoOmie, "Pendente");
  assert.equal(documento.codigoPedidoOmie, 456);
  assert.equal(documento.numeroPedido, "000456");
  assert.equal(documento.codigoFornecedorOmie, 6057223);
  assert.equal(documento.valorFaturado, 949.10);
  assert.equal(documento.etapa, "Faturado pelo fornecedor");
  assert.equal(documento.codigoContaCorrenteOmie, 987);
  assert.deepEqual(JSON.parse(documento.rateioCategoriasJson), [
    { codigo_categoria: "2.04.01", valor: 949.10 },
  ]);
});

test("normaliza CT-e modelo 57 mesmo sem pedido de compra relacionado", () => {
  const documento = normalizarRecebimentoOmie(recebimentoFiscal({
    cabec: {
      nIdReceb: 9001,
      cModeloNFe: "57",
      cNumeroNFe: "000009001",
      cChaveNfe: "3526080605722302664257000000090011555332640",
      nValorNFe: 431.40,
    },
    itensRecebimento: [{ itensCabec: { nIdPedido: 0 } }],
    categorias: [{ cCategoria: "2.04.02", vCategoria: 431.40 }],
  }), { instanceId: "default", onlyPendingFaturado: true });
  assert.equal(documento.tipoDocumentoFiscal, "CT-e");
  assert.equal(documento.numeroDocumentoFiscal, "000009001");
  assert.equal(documento.codigoPedidoOmie, undefined);
  assert.equal(documento.statusDocumentoOmie, "Pendente");
  assert.equal(documento.etapa, "Faturado pelo fornecedor");
});

test("ignora documentos recebidos ou fora da etapa Faturado pelo Fornecedor", () => {
  const recebido = normalizarRecebimentoOmie(recebimentoFiscal({
    infoCadastro: { cRecebido: "S" },
  }), { onlyPendingFaturado: true });
  const outraEtapa = normalizarRecebimentoOmie(recebimentoFiscal({
    cabec: { cEtapa: "60" },
  }), { onlyPendingFaturado: true });
  assert.equal(recebido, null);
  assert.equal(outraEtapa, null);
});

test("consulta recebimentos com etapa fixa e detalhes para distinguir NF-e e CT-e", () => {
  assert.equal(DEFAULT_CONFIGURATION.versaoConfiguracao, 4);
  assert.equal(CODIGO_ETAPA_FATURADO_FORNECEDOR, "50");
  assert.deepEqual(parametrosRecebimentosFaturados({
    input: { page: 2, pageSize: 50 },
  }), [{
    nPagina: 2,
    nRegistrosPorPagina: 50,
    cOrdenarPor: "CODIGO",
    cEtapa: "50",
    cExibirDetalhes: "S",
  }]);
});

test("aprovação gera vínculo central mesmo sem categoria e conta corrente definidas", () => {
  const dados = montarDadosAprovacao({ aprovadaEm: null, aprovadaPor: "" }, {}, { usuario: "fabio" });
  assert.equal(dados.statusAprovacao, "Aprovada");
  assert.equal(dados.aprovadaPor, "fabio");
  assert.equal(dados.statusIntegracao, "Pendente");
  assert.equal(Object.hasOwn(dados, "categoriaFinanceiraId"), false);
  assert.equal(Object.hasOwn(dados, "contaCorrenteFinanceiraId"), false);
});

test("aprovação aplica categoria e conta corrente quando foram definidas", () => {
  const dados = montarDadosAprovacao({}, {
    categoria: { id: "categoria-1", codigo: "2.01.01", nome: "Serviços" },
    contaCorrente: { id: "conta-1", codigo: 123, nome: "Banco" },
  }, { automatico: true });
  assert.equal(dados.categoriaFinanceiraId, "categoria-1");
  assert.equal(dados.codigoCategoriaFinanceiraOmie, "2.01.01");
  assert.equal(dados.contaCorrenteFinanceiraId, "conta-1");
  assert.equal(dados.codigoContaCorrenteFinanceiraOmie, 123);
  assert.equal(dados.aprovadaPor, "Automático");
});

test("agrupamento usa uma conta ativa por fornecedor e tipo fiscal", () => {
  const primeira = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-12" });
  const segunda = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-12" });
  const cte = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "CT-e", dataVencimento: "2026-08-12" });
  const outroFornecedor = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4925595721, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-12" });
  const outraSemana = chaveBase({ instanceId: "default", codigoFornecedorOmie: 4944909335, tipoDocumentoFiscal: "NF-e", dataVencimento: "2026-08-19" });
  assert.equal(primeira, segunda);
  assert.notEqual(primeira, cte);
  assert.notEqual(primeira, outroFornecedor);
  assert.equal(primeira, outraSemana);
});

test("modelagem mantém um agrupamento por fornecedor e tipo fiscal", () => {
  const compraSource = fs.readFileSync(path.join(__dirname, "../src/models/Compra.js"), "utf8");
  const contaSource = fs.readFileSync(path.join(__dirname, "../src/models/ContaPagarAgrupada.js"), "utf8");
  assert.match(compraSource, /contaPagarId: fields\.ref\("ContaPagarAgrupada"/);
  assert.match(compraSource, /tipoDocumentoFiscal/);
  assert.match(compraSource, /numeroDocumentoFiscal/);
  assert.match(compraSource, /statusDocumentoOmie/);
  assert.doesNotMatch(compraSource, /contaPagarIds/);
  assert.match(contaSource, /chaveAtiva: unique\(fields\.string/);
  assert.match(contaSource, /tipoDocumentoFiscal/);
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

test("monta payload com rateio, vencimento e identificação dos documentos", () => {
  const conta = {
    codigoLancamentoIntegracao: "OON-TESTE-G1",
    codigoFornecedorOmie: 123,
    dataVencimento: "2026-08-12",
    geracao: 1,
  };
  const documentos = [
    {
      tipoDocumentoFiscal: "NF-e",
      numeroDocumentoFiscal: "100",
      valorFaturado: 100,
      codigoContaCorrenteFinanceiraOmie: 10,
      rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "A", valor: 100 }]),
    },
    {
      tipoDocumentoFiscal: "CT-e",
      numeroDocumentoFiscal: "200",
      valorFaturado: 50,
      codigoContaCorrenteFinanceiraOmie: 10,
      rateioCategoriasJson: JSON.stringify([{ codigo_categoria: "B", valor: 50 }]),
    },
  ];
  const payload = montarPayloadContaPagar(conta, documentos);
  assert.equal(payload.valor_documento, 150);
  assert.equal(payload.data_vencimento, "12/08/2026");
  assert.equal(payload.id_conta_corrente, 10);
  assert.match(payload.observacao, /NF-e 100 - R\$ 100,00/);
  assert.match(payload.observacao, /CT-e 200 - R\$ 50,00/);
  assert.deepEqual(payload.categorias, [
    { codigo_categoria: "A", valor: 100 },
    { codigo_categoria: "B", valor: 50 },
  ]);
});

test("payload de alteração informa o código do lançamento Omie", () => {
  const payload = montarPayloadContaPagar({
    codigoLancamentoIntegracao: "OON-ALTERAR-G1",
    codigoLancamentoOmie: 456789,
    codigoFornecedorOmie: 123,
    dataVencimento: "2026-08-12",
    geracao: 1,
    codigoCategoriaOmie: "2.01.01",
    codigoContaCorrenteOmie: 10,
  }, [{
    tipoDocumentoFiscal: "NF-e",
    numeroDocumentoFiscal: "P1",
    valorFaturado: 100,
  }]);
  assert.equal(payload.codigo_lancamento_integracao, "OON-ALTERAR-G1");
  assert.equal(payload.codigo_lancamento_omie, 456789);
});

test("parâmetros escolhidos na conta agrupada substituem os valores dos documentos", () => {
  const payload = montarPayloadContaPagar({
    codigoLancamentoIntegracao: "OON-MANUAL-G1",
    codigoFornecedorOmie: 123,
    dataVencimento: "2026-08-12",
    geracao: 1,
    codigoCategoriaOmie: "MANUAL",
    codigoContaCorrenteOmie: 99,
  }, [{
    tipoDocumentoFiscal: "CT-e",
    numeroDocumentoFiscal: "P1",
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
    tipoDocumentoFiscal: "NF-e",
    numeroDocumentoFiscal: "1",
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

test("mapeamento operacional usa ListarRecebimentos e não pesquisa pedidos de compra", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/mappings/omie.js"), "utf8");
  const start = source.indexOf('"listar-documentos-faturados-pendentes":');
  const end = source.indexOf('"listar-categorias":', start);
  assert.ok(start >= 0 && end > start, "Consulta operacional de documentos não encontrada.");
  const documentSearch = source.slice(start, end);
  assert.match(documentSearch, /label: "Listar NF-es e CT-es pendentes"/);
  assert.match(documentSearch, /endpoint: "produtos\/recebimentonfe\/"/);
  assert.match(documentSearch, /call: "ListarRecebimentos"/);
  assert.match(documentSearch, /param: parametrosRecebimentosFaturados/);
  assert.match(documentSearch, /itemsPath: "recebimentos"/);
  assert.match(documentSearch, /totalPagesPath: "nTotalPaginas"/);
  assert.match(source, /key: "documentos-faturados-pendentes"/);
  assert.match(source, /mode: "import"/);
  assert.match(source, /mapearDocumentoFaturado/);
  assert.doesNotMatch(source, /PesquisarPedCompra/);
});
