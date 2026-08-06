"use strict";

const { ETAPA_FATURADO } = require("./constants");
const { obterConfiguracao } = require("./configuration");
const { models } = require("./runtime");

const CAMPOS_FILTRO = new Set([
  "tipoDocumentoFiscal",
  "statusDocumentoOmie",
  "etapa",
  "statusAprovacao",
  "statusIntegracao",
]);

const CAMPOS_BUSCA = [
  "numeroDocumentoFiscal",
  "chaveDocumentoFiscal",
  "nomeFornecedor",
  "numeroPedido",
  "modeloDocumentoFiscal",
  "serieDocumentoFiscal",
];

const CAMPOS_ORDENACAO = new Set([
  "numeroDocumentoFiscal",
  "tipoDocumentoFiscal",
  "nomeFornecedor",
  "valorFaturado",
  "statusDocumentoOmie",
  "etapa",
  "statusAprovacao",
  "dataVencimento",
  "statusIntegracao",
  "createdAt",
  "updatedAt",
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inteiroEntre(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizarOrdenacao(value) {
  if (!value) return { createdAt: -1 };
  const [field, direction] = String(value).split(/[.:]/);
  if (!CAMPOS_ORDENACAO.has(field)) return { createdAt: -1 };
  return { [field]: direction === "asc" ? 1 : -1 };
}

function acaoAprovacaoManualDisponivel(compra = {}, configuracao = {}) {
  return configuracao.aprovarCompraAutomatico !== true
    && compra.statusAprovacao === "Pendente"
    && compra.statusDocumentoOmie === "Pendente"
    && compra.etapa === ETAPA_FATURADO
    && compra.recusaOmiePendente !== true;
}

function montarFiltroDocumentosFiscais(query = {}) {
  const filtro = {
    $nor: [
      { recusaOmiePendente: true },
      { statusAprovacao: "Recusada" },
      { statusDocumentoOmie: "Cancelado" },
    ],
  };

  for (const field of CAMPOS_FILTRO) {
    const value = query[field];
    if (value !== undefined && value !== null && value !== "") filtro[field] = value;
  }

  const searchTerm = String(query.searchTerm || "").trim();
  if (searchTerm) {
    const rx = new RegExp(escapeRegex(searchTerm), "i");
    filtro.$or = CAMPOS_BUSCA.map((field) => ({ [field]: rx }));
  }

  return filtro;
}

async function listarDocumentosFiscaisOperacionais(query = {}) {
  const { Compra } = models();
  const configuracao = await obterConfiguracao({ create: true });
  const pageIndex = inteiroEntre(query.pageIndex, 0, 0, Number.MAX_SAFE_INTEGER);
  const pageSize = inteiroEntre(query.pageSize, 20, 1, 200);
  const filtro = montarFiltroDocumentosFiscais(query);
  const sort = normalizarOrdenacao(query.sort);

  const [rows, totalItems] = await Promise.all([
    Compra.find(filtro)
      .sort(sort)
      .skip(pageIndex * pageSize)
      .limit(pageSize)
      .lean(),
    Compra.countDocuments(filtro),
  ]);

  const results = rows.map((row) => ({
    ...row,
    acaoAprovacaoManualDisponivel: acaoAprovacaoManualDisponivel(row, configuracao),
  }));

  return {
    results,
    pagination: {
      currentPage: pageIndex,
      itemsPerPage: pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize) || 1,
    },
  };
}

module.exports = {
  acaoAprovacaoManualDisponivel,
  listarDocumentosFiscaisOperacionais,
  montarFiltroDocumentosFiscais,
  normalizarOrdenacao,
};
