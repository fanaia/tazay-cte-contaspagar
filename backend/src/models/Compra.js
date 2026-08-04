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
  "Concluído",
];

const STATUS_INTEGRACAO = [
  "Não sincronizado",
  "Sincronizado",
  "Pendente",
  "Erro",
];

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
    codigoCategoriaOmie: indexed(fields.string({ label: "Categoria Omie" })),
    rateioCategoriasJson: fields.string({ label: "Rateio de categorias" }),
    codigoContaCorrenteOmie: fields.number({ label: "Conta corrente Omie" }),
    valorFaturado: fields.currency({ required: true, label: "Valor faturado", default: 0 }),
    etapa: indexed(fields.enum(ETAPAS, {
      required: true,
      label: "Etapa",
      default: "Faturado pelo fornecedor",
    })),
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
    roles: { write: ["desenvolvedor"] },
    populateRefs: true,
  },
});

module.exports = { ETAPAS, STATUS_INTEGRACAO };
