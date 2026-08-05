"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function indexed(descriptor) {
  descriptor.index = true;
  return descriptor;
}

function unique(descriptor, { sparse = false } = {}) {
  descriptor.unique = true;
  descriptor.index = true;
  if (sparse) descriptor.sparse = true;
  return descriptor;
}

const STATUS_CONTA = [
  "Pendente envio",
  "Pendente sincronização",
  "Aberta",
  "Paga",
  "Pagamento cancelado",
  "Excluída",
  "Erro",
];

const STATUS_ENVIO_OMIE = ["Não enviado", "Pendente", "Enviado", "Erro"];
const STATUS_PAGAMENTO_OMIE = [
  "Não consultado",
  "Consultando",
  "Pendente",
  "Parcial",
  "Pago",
  "Cancelado",
  "Erro",
];

defineModel({
  name: "ContaPagarAgrupada",
  singular: "contaPagarAgrupada",
  basePath: "/contas-pagar-agrupadas",
  schema: {
    chaveAgrupamento: unique(fields.string({ required: true, label: "Chave do agrupamento" })),
    chaveAtiva: unique(fields.string({ label: "Chave ativa" }), { sparse: true }),
    instanceId: indexed(fields.string({ required: true, label: "Instância Omie", default: "default" })),
    codigoFornecedorOmie: indexed(fields.number({ required: true, label: "Código do fornecedor Omie" })),
    nomeFornecedor: indexed(fields.string({ label: "Fornecedor" })),
    dataVencimento: indexed(fields.string({ required: true, label: "Vencimento" })),
    geracao: fields.number({ required: true, label: "Geração", default: 1 }),
    codigoLancamentoIntegracao: unique(fields.string({ required: true, label: "Código de integração" })),
    codigoLancamentoOmie: indexed(fields.number({ label: "Código do lançamento Omie" })),
    quantidadeCompras: fields.number({ label: "Quantidade de documentos", default: 0 }),
    valorTotal: fields.currency({ label: "Valor total", default: 0 }),
    categoriaOmieId: fields.ref("CategoriaOmie", { label: "Categoria para envio" }),
    codigoCategoriaOmie: indexed(fields.string({ label: "Código da categoria para envio" })),
    nomeCategoriaOmie: fields.string({ label: "Categoria para envio" }),
    contaCorrenteOmieId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente para envio" }),
    codigoContaCorrenteOmie: fields.number({ label: "Código da conta corrente para envio" }),
    nomeContaCorrenteOmie: fields.string({ label: "Conta corrente para envio" }),
    status: indexed(fields.enum(STATUS_CONTA, {
      required: true,
      label: "Status",
      default: "Pendente envio",
    })),
    statusEnvioOmie: indexed(fields.enum(STATUS_ENVIO_OMIE, {
      required: true,
      label: "Envio para o Omie",
      default: "Não enviado",
    })),
    statusPagamentoOmie: indexed(fields.enum(STATUS_PAGAMENTO_OMIE, {
      required: true,
      label: "Pagamento no Omie",
      default: "Não consultado",
    })),
    statusTituloOmie: fields.string({ label: "Status original do título no Omie" }),
    valorPagarOmie: fields.currency({ label: "Valor pendente no Omie" }),
    revisao: fields.number({ label: "Revisão", default: 0 }),
    consultaPagamentoRevisao: fields.number({ label: "Revisão da consulta de pagamento", default: 0 }),
    ultimaConsultaPagamentoEm: fields.date({ label: "Última consulta do pagamento" }),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
    ultimoErro: fields.string({ label: "Último erro" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["desenvolvedor", "admin"] },
    populateRefs: true,
  },
});

module.exports = { STATUS_CONTA, STATUS_ENVIO_OMIE, STATUS_PAGAMENTO_OMIE };
