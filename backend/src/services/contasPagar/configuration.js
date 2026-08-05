"use strict";

const { models } = require("./runtime");

const CONFIGURATION_VERSION = 2;

const ETAPAS_PEDIDO_OMIE = Object.freeze([
  "Pendente",
  "Faturado",
  "Recebido",
  "Cancelado",
  "Encerrado",
  "Recebido parcialmente",
  "Faturado parcialmente",
]);

const DEFAULT_CONFIGURATION = Object.freeze({
  chave: "default",
  versaoConfiguracao: CONFIGURATION_VERSION,
  aprovarCompraAutomatico: true,
  enviarContaPagarOmieAutomatico: true,
  categoriaPadraoId: null,
  contaCorrentePadraoId: null,
  etapaPedidoOmieCarregar: "Pendente",
});

function normalizarEtapaPedidoOmie(value) {
  const etapa = String(value || DEFAULT_CONFIGURATION.etapaPedidoOmieCarregar).trim();
  return ETAPAS_PEDIDO_OMIE.includes(etapa)
    ? etapa
    : DEFAULT_CONFIGURATION.etapaPedidoOmieCarregar;
}

function filtrosPesquisaPedidoCompra(etapaInput) {
  const etapa = normalizarEtapaPedidoOmie(etapaInput);
  return {
    etapaPedidoOmie: etapa,
    lApenasImportadoApi: "F",
    lExibirPedidosPendentes: etapa === "Pendente" ? "T" : "F",
    lExibirPedidosFaturados: etapa === "Faturado" ? "T" : "F",
    lExibirPedidosRecebidos: etapa === "Recebido" ? "T" : "F",
    lExibirPedidosCancelados: etapa === "Cancelado" ? "T" : "F",
    lExibirPedidosEncerrados: etapa === "Encerrado" ? "T" : "F",
    lExibirPedidosRecParciais: etapa === "Recebido parcialmente" ? "T" : "F",
    lExibirPedidosFatParciais: etapa === "Faturado parcialmente" ? "T" : "F",
    lApenasAlterados: "F",
  };
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
  } else if (
    configuracao
    && options.create === true
    && Number(configuracao.versaoConfiguracao || 0) < CONFIGURATION_VERSION
  ) {
    configuracao = await ConfiguracaoContasPagar.findOneAndUpdate(
      {
        chave: "default",
        $or: [
          { versaoConfiguracao: { $lt: CONFIGURATION_VERSION } },
          { versaoConfiguracao: { $exists: false } },
        ],
      },
      {
        $set: {
          versaoConfiguracao: CONFIGURATION_VERSION,
          etapaPedidoOmieCarregar: "Pendente",
        },
      },
      { new: true },
    ).lean() || configuracao;
  }
  return {
    ...DEFAULT_CONFIGURATION,
    ...(configuracao || {}),
    etapaPedidoOmieCarregar: normalizarEtapaPedidoOmie(configuracao?.etapaPedidoOmieCarregar),
  };
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
  CONFIGURATION_VERSION,
  DEFAULT_CONFIGURATION,
  ETAPAS_PEDIDO_OMIE,
  filtrosPesquisaPedidoCompra,
  normalizarEtapaPedidoOmie,
  obterConfiguracao,
  resolverCategoria,
  resolverContaCorrente,
  resolverParametrosFinanceiros,
};
