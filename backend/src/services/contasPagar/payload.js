"use strict";

const crypto = require("crypto");
const { formatarDataOmie } = require("./date");
const { arredondarMoeda } = require("./utils");

function chaveBase(compra) {
  return `${compra.instanceId || "default"}|${Number(compra.codigoFornecedorOmie)}|${compra.dataVencimento}`;
}

function codigoIntegracao(baseKey, generation) {
  const hash = crypto.createHash("sha256").update(String(baseKey)).digest("hex").slice(0, 20).toUpperCase();
  return `OON-TZ-${hash}-G${generation}`;
}

function parseRateio(compra) {
  try {
    const parsed = JSON.parse(compra.rateioCategoriasJson || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function agruparCategorias(compras = []) {
  const sums = new Map();
  for (const compra of compras) {
    const rateio = parseRateio(compra);
    if (rateio.length) {
      for (const item of rateio) {
        const codigo = String(item.codigo_categoria || "").trim();
        if (!codigo) continue;
        sums.set(codigo, arredondarMoeda((sums.get(codigo) || 0) + Number(item.valor || 0)));
      }
      continue;
    }
    const codigo = String(compra.codigoCategoriaOmie || "").trim();
    if (codigo) sums.set(codigo, arredondarMoeda((sums.get(codigo) || 0) + Number(compra.valorFaturado || 0)));
  }
  return [...sums.entries()]
    .map(([codigo_categoria, valor]) => ({ codigo_categoria, valor: arredondarMoeda(valor) }))
    .filter((item) => item.codigo_categoria && item.valor > 0);
}

function montarPayloadContaPagar(conta, compras) {
  if (!compras.length) throw new Error("A conta a pagar não possui compras vinculadas.");
  const valorTotal = arredondarMoeda(compras.reduce((total, compra) => total + Number(compra.valorFaturado || 0), 0));
  if (!(valorTotal > 0)) throw new Error("O valor agrupado deve ser maior que zero.");
  const fornecedor = Number(conta.codigoFornecedorOmie || compras[0].codigoFornecedorOmie);
  if (!(fornecedor > 0)) throw new Error("Código do fornecedor Omie não informado.");
  const categorias = agruparCategorias(compras);
  if (!categorias.length) throw new Error("Nenhuma categoria Omie foi encontrada nas compras agrupadas.");
  const data = formatarDataOmie(conta.dataVencimento);
  const numeros = compras.map((compra) => compra.numeroPedido || compra.codigoPedidoOmie).filter(Boolean);
  const payload = {
    codigo_lancamento_integracao: conta.codigoLancamentoIntegracao,
    codigo_cliente_fornecedor: fornecedor,
    data_vencimento: data,
    data_previsao: data,
    valor_documento: valorTotal,
    numero_documento: `OON-${String(fornecedor).slice(-6)}-${conta.dataVencimento.replaceAll("-", "").slice(2)}-${conta.geracao}`.slice(0, 20),
    observacao: `Central Tazay: ${compras.length} compra(s) agrupada(s): ${numeros.join(", ")}`.slice(0, 500),
  };
  if (categorias.length === 1) payload.codigo_categoria = categorias[0].codigo_categoria;
  else payload.categorias = categorias;
  const contas = [...new Set(compras.map((compra) => Number(compra.codigoContaCorrenteOmie || 0)).filter(Boolean))];
  if (contas.length === 1) payload.id_conta_corrente = contas[0];
  return payload;
}

module.exports = { agruparCategorias, chaveBase, codigoIntegracao, montarPayloadContaPagar };
