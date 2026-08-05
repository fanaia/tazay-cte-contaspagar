"use strict";

const { ETAPA_CONCLUIDO, ETAPA_FATURADO } = require("./constants");
const { arredondarMoeda, array, primeiroValor } = require("./utils");

function somarProdutos(record = {}) {
  const produtos = array(record.produtos_consulta || record.produtos_pesquisa || record.produtos || record.itens);
  return arredondarMoeda(produtos.reduce((total, item = {}) => {
    const direct = Number(primeiroValor(item.nValTot, item.nValorTotal, item.valor_total));
    if (Number.isFinite(direct)) return total + direct;
    const quantidade = Number(primeiroValor(item.nQtde, item.quantidade, 0));
    const unitario = Number(primeiroValor(item.nValUnit, item.valor_unitario, 0));
    const desconto = Number(primeiroValor(item.nDesconto, item.desconto, 0));
    return total + (quantidade * unitario) - desconto;
  }, 0));
}

function rateioCategoriasDaCompra(record = {}, valorTotal = 0) {
  const header = record.cabecalho_consulta || record.cabecalho || record;
  const produtos = array(record.produtos_consulta || record.produtos_pesquisa || record.produtos || record.itens);
  const sums = new Map();
  for (const item of produtos) {
    const codigo = String(primeiroValor(item?.cCodCateg, item?.codigo_categoria, "") || "").trim();
    if (!codigo) continue;
    const valor = arredondarMoeda(primeiroValor(
      item?.nValTot,
      item?.nValorTotal,
      Number(item?.nQtde || 0) * Number(item?.nValUnit || 0) - Number(item?.nDesconto || 0),
    ));
    sums.set(codigo, arredondarMoeda((sums.get(codigo) || 0) + valor));
  }
  if (!sums.size) {
    const codigo = String(primeiroValor(header.cCodCateg, header.codigo_categoria, "") || "").trim();
    if (codigo) sums.set(codigo, arredondarMoeda(valorTotal));
  }
  return [...sums.entries()].map(([codigo_categoria, valor]) => ({ codigo_categoria, valor }));
}

function encontrarPedido(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (value.cabecalho_consulta || value.nCodPed || value.codigo_pedido_omie || value.codigo_pedido) return value;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = encontrarPedido(child, seen);
    if (found) return found;
  }
  return null;
}

function encontrarFinanceiro(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (value.codigo_lancamento_integracao || value.codigo_lancamento_omie || value.codigo_lancamento) return value;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = encontrarFinanceiro(child, seen);
    if (found) return found;
  }
  return null;
}

function normalizarEtapa(value, eventType = "") {
  const text = `${value || ""} ${eventType || ""}`.toLowerCase();
  if (text.includes("fat parcial")) return "Faturado parcialmente";
  if (text.includes("rec parcial") || text.includes("recebid parcialmente")) return "Recebido parcialmente";
  if (text.includes("cancel")) return "Cancelado";
  if (text.includes("faturad")) return ETAPA_FATURADO;
  if (text.includes("recebid")) return "Recebido";
  if (text.includes("aprova")) return "Aprovação";
  if (text.includes("conclu") || text.includes("encerrad")) return ETAPA_CONCLUIDO;
  return "Pedido de Compra";
}

function normalizarCompraOmie(input = {}, options = {}) {
  const record = encontrarPedido(input) || input;
  const header = record.cabecalho_consulta || record.cabecalho_pesquisa || record.cabecalho || record;
  const instanceId = String(options.instanceId || input.instanceId || "default");
  const codigoPedidoOmie = Number(primeiroValor(
    header.nCodPed,
    record.nCodPed,
    header.codigo_pedido_omie,
    record.codigo_pedido_omie,
    header.codigo_pedido,
  ));
  if (!Number.isFinite(codigoPedidoOmie) || codigoPedidoOmie <= 0) return null;
  const codigoFornecedorOmie = Number(primeiroValor(
    header.nCodFor,
    record.nCodFor,
    header.codigo_cliente_fornecedor,
    header.codigo_fornecedor_omie,
  ));
  const valorFaturado = arredondarMoeda(primeiroValor(
    header.nValTot,
    header.nValorTotal,
    header.valor_total,
    record.nValTot,
    record.valor_total,
    somarProdutos(record),
  ));
  const rateio = rateioCategoriasDaCompra(record, valorFaturado);
  const eventType = String(options.eventType || input.eventType || input.topic || "");
  const etapa = options.forceEtapa
    ? String(options.forceEtapa)
    : options.forceFaturado
      ? ETAPA_FATURADO
      : normalizarEtapa(primeiroValor(header.cDescEtapa, header.etapa, header.cEtapa), eventType);
  return {
    chaveExterna: `${instanceId}:${codigoPedidoOmie}`,
    instanceId,
    codigoPedidoOmie,
    codigoPedidoIntegracao: String(primeiroValor(header.cCodIntPed, record.cCodIntPed, "") || ""),
    numeroPedido: String(primeiroValor(header.cNumero, header.cNumPedido, record.cNumero, "") || ""),
    codigoFornecedorOmie: Number.isFinite(codigoFornecedorOmie) ? codigoFornecedorOmie : 0,
    codigoFornecedorIntegracao: String(primeiroValor(header.cCodIntFor, record.cCodIntFor, "") || ""),
    nomeFornecedor: String(primeiroValor(
      header.cNomeFor,
      header.cNomeFornecedor,
      header.nome_fornecedor,
      record.nome_fornecedor,
      `Fornecedor ${Number.isFinite(codigoFornecedorOmie) ? codigoFornecedorOmie : "não identificado"}`,
    )),
    codigoCategoriaOmie: String(primeiroValor(
      header.cCodCateg,
      rateio.length === 1 ? rateio[0].codigo_categoria : "",
      "",
    )),
    rateioCategoriasJson: JSON.stringify(rateio),
    codigoContaCorrenteOmie: Number(primeiroValor(header.nCodCC, record.nCodCC, 0)) || undefined,
    valorFaturado,
    etapa,
    origem: "Omie",
    statusIntegracao: "Sincronizado",
    ultimaSincronizacaoEm: new Date(),
    ultimoErro: "",
  };
}

module.exports = {
  encontrarFinanceiro,
  encontrarPedido,
  normalizarCompraOmie,
  normalizarEtapa,
};
