"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { models } = require("./runtime");

const CODIGO_ETAPA_FATURADO_FORNECEDOR = "50";

const DEFAULT_CONFIGURATION = Object.freeze({
  chave: "default",
  aprovarCompraAutomatico: true,
  enviarContaPagarOmieAutomatico: true,
  categoriaPadraoId: null,
  contaCorrentePadraoId: null,
});

function parametrosRecebimentosFaturados({ input = {} } = {}) {
  return [{
    nPagina: Math.max(1, Number(input.page || 1)),
    nRegistrosPorPagina: Math.max(1, Number(input.pageSize || 100)),
    cOrdenarPor: "CODIGO",
    cEtapa: CODIGO_ETAPA_FATURADO_FORNECEDOR,
    cExibirDetalhes: "S",
  }];
}

async function obterConfiguracao(options = {}) {
  const { ConfiguracaoContasPagar } = models();
  if (!ConfiguracaoContasPagar) return { ...DEFAULT_CONFIGURATION };
  let configuracao = await ConfiguracaoContasPagar.findOne({ chave: "default" }).lean();
  if (!configuracao && options.create === true) {
    configuracao = await ConfiguracaoContasPagar.findOneAndUpdate(
      { chave: "default" },
      { $setOnInsert: DEFAULT_CONFIGURATION },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }
  return { ...DEFAULT_CONFIGURATION, ...(configuracao || {}) };
}

function erroParametroFinanceiro(field, message) {
  return new GenericError(message, {
    statusCode: 422,
    details: { field, message },
  });
}

async function resolverCategoria(categoriaId) {
  const { CategoriaOmie } = models();
  if (!categoriaId || !CategoriaOmie) return null;
  const categoria = await CategoriaOmie.findById(categoriaId).lean();
  if (!categoria) throw erroParametroFinanceiro("categoriaId", "Categoria Omie selecionada não foi encontrada.");
  if (categoria.status === "Inativo") {
    throw erroParametroFinanceiro("categoriaId", `A categoria ${categoria.nome} está inativa no Omie.`);
  }
  return {
    id: String(categoria._id),
    codigo: String(categoria.codigoCategoriaOmie || "").trim(),
    nome: String(categoria.nome || categoria.descricao || "").trim(),
  };
}

async function resolverContaCorrente(contaCorrenteId) {
  const { ContaCorrenteOmie } = models();
  if (!contaCorrenteId || !ContaCorrenteOmie) return null;
  const conta = await ContaCorrenteOmie.findById(contaCorrenteId).lean();
  if (!conta) throw erroParametroFinanceiro("contaCorrenteId", "Conta corrente Omie selecionada não foi encontrada.");
  if (conta.status === "Inativo") {
    throw erroParametroFinanceiro("contaCorrenteId", `A conta corrente ${conta.nome} está inativa no Omie.`);
  }
  return {
    id: String(conta._id),
    codigo: Number(conta.codigoContaCorrenteOmie || 0),
    nome: String(conta.nome || "").trim(),
  };
}

async function resolverParametrosFinanceiros(input = {}, options = {}) {
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const obrigatorios = options.obrigatorios !== false;
  const categoriaId = input.categoriaId || input.categoriaFinanceiraId || input.categoriaOmieId
    || configuracao.categoriaPadraoId;
  const contaCorrenteId = input.contaCorrenteId || input.contaCorrenteFinanceiraId || input.contaCorrenteOmieId
    || configuracao.contaCorrentePadraoId;
  const [categoria, contaCorrente] = await Promise.all([
    resolverCategoria(categoriaId),
    resolverContaCorrente(contaCorrenteId),
  ]);
  if (obrigatorios && !categoria?.codigo) {
    throw erroParametroFinanceiro(
      "categoriaId",
      "Configure uma categoria padrão ou selecione uma categoria Omie antes de enviar a conta a pagar.",
    );
  }
  if (obrigatorios && !(contaCorrente?.codigo > 0)) {
    throw erroParametroFinanceiro(
      "contaCorrenteId",
      "Configure uma conta corrente padrão ou selecione uma conta corrente Omie antes de enviar a conta a pagar.",
    );
  }
  return { configuracao, categoria, contaCorrente };
}

module.exports = {
  CODIGO_ETAPA_FATURADO_FORNECEDOR,
  DEFAULT_CONFIGURATION,
  erroParametroFinanceiro,
  obterConfiguracao,
  parametrosRecebimentosFaturados,
  resolverCategoria,
  resolverContaCorrente,
  resolverParametrosFinanceiros,
};
