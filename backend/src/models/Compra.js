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

const TIPOS_DOCUMENTO_FISCAL = ["NF-e", "CT-e"];
const STATUS_DOCUMENTO_OMIE = ["Pendente", "Recebido", "Cancelado", "Devolvido", "Denegado"];
const STATUS_INTEGRACAO = ["Não sincronizado", "Sincronizado", "Pendente", "Erro"];
const STATUS_CONCLUSAO_OMIE = ["Não enviado", "Pendente", "Concluído", "Erro"];
const STATUS_APROVACAO = ["Pendente", "Aprovada", "Recusada"];

defineModel({
  name: "Compra",
  singular: "documentoFiscal",
  basePath: "/compras",
  schema: {
    chaveExterna: unique(fields.string({ required: true, label: "Chave externa" })),
    instanceId: indexed(fields.string({ required: true, label: "Instância Omie", default: "default" })),
    codigoRecebimentoOmie: indexed(fields.number({ required: true, label: "Código do recebimento Omie" })),
    chaveDocumentoFiscal: indexed(fields.string({ label: "Chave do documento fiscal" })),
    tipoDocumentoFiscal: indexed(fields.enum(TIPOS_DOCUMENTO_FISCAL, {
      required: true,
      label: "Tipo de documento",
    })),
    modeloDocumentoFiscal: indexed(fields.string({ label: "Modelo fiscal" })),
    numeroDocumentoFiscal: indexed(fields.string({ required: true, label: "Número do documento" })),
    serieDocumentoFiscal: fields.string({ label: "Série" }),
    dataEmissaoDocumentoFiscal: indexed(fields.string({ label: "Data de emissão" })),
    codigoEtapaRecebimentoOmie: indexed(fields.string({ label: "Código da etapa no Omie" })),
    statusDocumentoOmie: indexed(fields.enum(STATUS_DOCUMENTO_OMIE, {
      required: true,
      label: "Status no Omie",
      default: "Pendente",
    })),
    codigoPedidoOmie: indexed(fields.number({ label: "Código do pedido de compra vinculado" })),
    codigoPedidoIntegracao: fields.string({ label: "Código de integração do pedido" }),
    numeroPedido: fields.string({ label: "Número do pedido de compra vinculado" }),
    codigoFornecedorOmie: indexed(fields.number({ required: true, label: "Código do fornecedor Omie" })),
    codigoFornecedorIntegracao: fields.string({ label: "Código de integração do fornecedor" }),
    nomeFornecedor: indexed(fields.string({ label: "Fornecedor" })),
    codigoCategoriaOmie: indexed(fields.string({ label: "Categoria original do documento" })),
    rateioCategoriasJson: fields.string({ label: "Rateio original de categorias" }),
    codigoContaCorrenteOmie: fields.number({ label: "Conta corrente original do documento" }),
    valorFaturado: fields.currency({ required: true, label: "Valor do documento", default: 0 }),
    situacaoPedidoOmieOrigem: indexed(fields.enum(SITUACOES_PEDIDO_OMIE, {
      label: "Situação no Omie",
      default: "Pendente",
    })),
    etapa: indexed(fields.enum(ETAPAS, {
      required: true,
      label: "Etapa operacional",
      default: "Faturado pelo fornecedor",
    })),
    statusAprovacao: indexed(fields.enum(STATUS_APROVACAO, {
      required: true,
      label: "Processamento automático",
      default: "Pendente",
    })),
    aprovadaEm: fields.date({ label: "Processada em" }),
    aprovadaPor: fields.string({ label: "Processada por" }),
    recusadaEm: fields.date({ label: "Recusada em" }),
    recusadaPor: fields.string({ label: "Recusada por" }),
    recusaOmieRevisao: fields.number({ label: "Revisão da recusa no Omie", default: 0 }),
    recusaOmiePendente: fields.boolean({ label: "Recusa pendente no Omie", default: false }),
    acaoAprovacaoManualDisponivel: fields.boolean({
      label: "Ações manuais de aprovação disponíveis",
      default: false,
    }),
    categoriaFinanceiraId: fields.ref("CategoriaOmie", { label: "Categoria aplicada" }),
    codigoCategoriaFinanceiraOmie: indexed(fields.string({ label: "Código da categoria aplicada" })),
    nomeCategoriaFinanceira: fields.string({ label: "Categoria aplicada" }),
    contaCorrenteFinanceiraId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente aplicada" }),
    codigoContaCorrenteFinanceiraOmie: fields.number({ label: "Código da conta corrente aplicada" }),
    nomeContaCorrenteFinanceira: fields.string({ label: "Conta corrente aplicada" }),
    entradaFaturadoEm: fields.date({ label: "Entrada em faturado pelo fornecedor" }),
    dataVencimento: indexed(fields.string({ label: "Vencimento calculado" })),
    contaPagarId: fields.ref("ContaPagarAgrupada", { label: "Conta a pagar agrupada" }),
    origem: fields.enum(["Omie"], { label: "Origem", default: "Omie" }),
    statusConclusaoOmie: indexed(fields.enum(STATUS_CONCLUSAO_OMIE, {
      label: "Conclusão no Omie",
      default: "Não enviado",
    })),
    conclusaoOmieRevisao: fields.number({ label: "Revisão da conclusão no Omie", default: 0 }),
    concluidaNoOmieEm: fields.date({ label: "Concluída no Omie em" }),
    canceladaEm: fields.date({ label: "Cancelada no Omie em" }),
    canceladaAposPagamento: fields.boolean({ label: "Cancelada após pagamento", default: false }),
    observacaoOperacional: fields.string({ label: "Observação operacional" }),
    statusIntegracao: indexed(fields.enum(STATUS_INTEGRACAO, {
      label: "Status da integração",
      default: "Não sincronizado",
    })),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
    ultimoErro: fields.string({ label: "Último erro" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["integracao-sistema"] },
    populateRefs: true,
  },
});

module.exports = {
  ETAPAS,
  SITUACOES_PEDIDO_OMIE,
  STATUS_APROVACAO,
  STATUS_CONCLUSAO_OMIE,
  STATUS_DOCUMENTO_OMIE,
  STATUS_INTEGRACAO,
  TIPOS_DOCUMENTO_FISCAL,
};
