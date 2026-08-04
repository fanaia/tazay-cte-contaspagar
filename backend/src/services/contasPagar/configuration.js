"use strict";

const { models } = require("./runtime");

const DEFAULT_CONFIGURATION = Object.freeze({
  chave: "default",
  aprovarCompraAutomatico: true,
  enviarContaPagarOmieAutomatico: true,
  categoriaPadraoId: null,
  contaCorrentePadraoId: null,
});

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
  return configuracao || { ...DEFAULT_CONFIGURATION };
}

async function resolverCategoria(categoriaId) {
  const { CategoriaOmie } = models();
  if (!categoriaId || !CategoriaOmie) return null;
  const categoria = await CategoriaOmie.findById(categoriaId).lean();
  if (!categoria) throw new Error("Categoria Omie selecionada não foi encontrada.");
  if (categoria.status === "Inativo") throw new Error(`A categoria ${categoria.nome} está inativa no Omie.`);
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
  if (!conta) throw new Error("Conta corrente Omie selecionada não foi encontrada.");
  if (conta.status === "Inativo") throw new Error(`A conta corrente ${conta.nome} está inativa no Omie.`);
  return {
    id: String(conta._id),
    codigo: Number(conta.codigoContaCorrenteOmie || 0),
    nome: String(conta.nome || "").trim(),
  };
}

async function resolverParametrosFinanceiros(input = {}, options = {}) {
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const categoriaId = input.categoriaId || input.categoriaFinanceiraId || input.categoriaOmieId
    || configuracao.categoriaPadraoId;
  const contaCorrenteId = input.contaCorrenteId || input.contaCorrenteFinanceiraId || input.contaCorrenteOmieId
    || configuracao.contaCorrentePadraoId;
  const [categoria, contaCorrente] = await Promise.all([
    resolverCategoria(categoriaId),
    resolverContaCorrente(contaCorrenteId),
  ]);
  if (!categoria?.codigo) {
    throw new Error("Configure uma categoria padrão ou selecione uma categoria Omie para esta operação.");
  }
  if (!(contaCorrente?.codigo > 0)) {
    throw new Error("Configure uma conta corrente padrão ou selecione uma conta corrente Omie para esta operação.");
  }
  return { configuracao, categoria, contaCorrente };
}

module.exports = {
  DEFAULT_CONFIGURATION,
  obterConfiguracao,
  resolverCategoria,
  resolverContaCorrente,
  resolverParametrosFinanceiros,
};
