"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function indexed(descriptor) {
  descriptor.index = true;
  return descriptor;
}

function unique(descriptor) {
  descriptor.unique = true;
  descriptor.index = true;
  return descriptor;
}

const ETAPAS = [
  "Pedido de Compra",
  "Aprovação",
  "Faturado pelo fornecedor",
  "Recebido",
  "Pago",
  "Concluído",
];

const SITUACOES_PEDIDO_OMIE = [
  "Pendente",
  "Faturado",
  "Recebido",
  "Cancelado",
  "Encerrado",
  "Recebido parcialmente",
  "Faturado parcialmente",
];

const STATUS_INTEGRACAO = [
  "Não sincronizado",
  "Sincronizado",
  "Pendente",
  "Erro",
];

const STATUS_APROVACAO = ["Pendente", "Aprovada"];

defineModel({
  name: "Compra",
  singular: "compra",
  basePath: "/compras",
  schema: {
    chaveExterna: unique(fields.string({ required: true, label: "Chave externa" })),
    instanceId: indexed(fields.string({ required: true, label: "Instância Omie", default: "default" })),
    codigoPedidoOmie: indexed(fields.number({ required: true, label: "Código do pedido Omie" })),
    codigoPedidoIntegracao: fields.string({ label: "Código de integração do pedido" }),
    numeroPedido: fields.string({ label: "Número do pedido" }),
    codigoFornecedorOmie: indexed(fields.number({ required: true, label: "Código do fornecedor Omie" })),
    codigoFornecedorIntegracao: fields.string({ label: "Código de integração do fornecedor" }),
    nomeFornecedor: indexed(fields.string({ label: "Fornecedor" })),
    codigoCategoriaOmie: indexed(fields.string({ label: "Categoria original do pedido" })),
    rateioCategoriasJson: fields.string({ label: "Rateio original de categorias" }),
    codigoContaCorrenteOmie: fields.number({ label: "Conta corrente original do pedido" }),
    valorFaturado: fields.currency({ required: true, label: "Valor faturado", default: 0 }),
    situacaoPedidoOmieOrigem: indexed(fields.enum(SITUACOES_PEDIDO_OMIE, {
      label: "Situação carregada do Omie",
      default: "Faturado",
    })),
    etapa: indexed(fields.enum(ETAPAS, {
      required: true,
      label: "Etapa",
      default: "Faturado pelo fornecedor",
    })),
    statusAprovacao: indexed(fields.enum(STATUS_APROVACAO, {
      required: true,
      label: "Aprovação da compra",
      default: "Pendente",
    })),
    aprovadaEm: fields.date({ label: "Aprovada em" }),
    aprovadaPor: fields.string({ label: "Aprovada por" }),
    categoriaFinanceiraId: fields.ref("CategoriaOmie", { label: "Categoria para o contas a pagar" }),
    codigoCategoriaFinanceiraOmie: indexed(fields.string({ label: "Código da categoria selecionada" })),
    nomeCategoriaFinanceira: fields.string({ label: "Categoria selecionada" }),
    contaCorrenteFinanceiraId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente para o contas a pagar" }),
    codigoContaCorrenteFinanceiraOmie: fields.number({ label: "Código da conta corrente selecionada" }),
    nomeContaCorrenteFinanceira: fields.string({ label: "Conta corrente selecionada" }),
    entradaFaturadoEm: fields.date({ label: "Entrada em faturado pelo fornecedor" }),
    dataVencimento: indexed(fields.string({ label: "Vencimento calculado" })),
    contaPagarId: fields.ref("ContaPagarAgrupada", { label: "Conta a pagar agrupada" }),
    origem: fields.enum(["Omie", "Central"], { label: "Origem", default: "Omie" }),
    statusIntegracao: indexed(fields.enum(STATUS_INTEGRACAO, {
      label: "Status da integração",
      default: "Não sincronizado",
    })),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
    ultimoErro: fields.string({ label: "Último erro" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["desenvolvedor", "admin"] },
    populateRefs: true,
  },
});

module.exports = { ETAPAS, SITUACOES_PEDIDO_OMIE, STATUS_APROVACAO, STATUS_INTEGRACAO };
