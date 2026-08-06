from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content if content.endswith("\n") else content + "\n")


def replace_once(source, old, new, label):
    if old not in source:
        raise RuntimeError(f"Trecho não encontrado: {label}")
    return source.replace(old, new, 1)

# Exporta o serviço do side-car.
index_path = "backend/src/services/contasPagar/index.js"
source = read(index_path)
if '...require("./sidecar")' not in source:
    source = source.replace('  ...require("./reconciliation"),', '  ...require("./reconciliation"),\n  ...require("./sidecar"),')
write(index_path, source)

# Documentos exclusivamente fiscais e controlados pela integração.
write("backend/src/models/Compra.js", r'''"use strict";

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
const STATUS_APROVACAO = ["Pendente", "Aprovada"];

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
''')

# Contas agrupadas exclusivamente derivadas de documentos Omie.
write("backend/src/models/ContaPagarAgrupada.js", r'''"use strict";

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

const TIPOS_DOCUMENTO_FISCAL = ["NF-e", "CT-e"];
const STATUS_CONTA = [
  "Pendente envio",
  "Pendente sincronização",
  "Aberta",
  "Paga",
  "Pagamento cancelado",
  "Exclusão pendente",
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
    tipoDocumentoFiscal: indexed(fields.enum(TIPOS_DOCUMENTO_FISCAL, {
      required: true,
      label: "Tipo de documento",
    })),
    dataVencimento: indexed(fields.string({ required: true, label: "Vencimento" })),
    geracao: fields.number({ required: true, label: "Geração", default: 1 }),
    codigoLancamentoIntegracao: unique(fields.string({ required: true, label: "Código de integração" })),
    codigoLancamentoOmie: indexed(fields.number({ label: "Código do lançamento Omie" })),
    quantidadeCompras: fields.number({ label: "Quantidade de documentos", default: 0 }),
    valorTotal: fields.currency({ label: "Valor total", default: 0 }),
    categoriaOmieId: fields.ref("CategoriaOmie", { label: "Categoria aplicada" }),
    codigoCategoriaOmie: indexed(fields.string({ label: "Código da categoria aplicada" })),
    nomeCategoriaOmie: fields.string({ label: "Categoria aplicada" }),
    contaCorrenteOmieId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente aplicada" }),
    codigoContaCorrenteOmie: fields.number({ label: "Código da conta corrente aplicada" }),
    nomeContaCorrenteOmie: fields.string({ label: "Conta corrente aplicada" }),
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
    exclusaoOmieRevisao: fields.number({ label: "Revisão da exclusão no Omie", default: 0 }),
    consultaPagamentoRevisao: fields.number({ label: "Revisão da consulta de pagamento", default: 0 }),
    ultimaConsultaPagamentoEm: fields.date({ label: "Última consulta do pagamento" }),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
    ultimoErro: fields.string({ label: "Último erro" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["integracao-sistema"] },
    populateRefs: true,
  },
});

module.exports = { STATUS_CONTA, STATUS_ENVIO_OMIE, STATUS_PAGAMENTO_OMIE, TIPOS_DOCUMENTO_FISCAL };
''')

# Configuração sem possibilidade de desligar a automação.
write("backend/src/models/ConfiguracaoContasPagar.js", r'''"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function unique(descriptor) {
  descriptor.unique = true;
  descriptor.index = true;
  return descriptor;
}

defineModel({
  name: "ConfiguracaoContasPagar",
  singular: "configuracaoContasPagar",
  basePath: "/configuracoes-contas-pagar",
  schema: {
    chave: unique(fields.string({ required: true, label: "Configuração", default: "default" })),
    versaoConfiguracao: fields.number({ label: "Versão da configuração", default: 4 }),
    categoriaPadraoId: fields.ref("CategoriaOmie", { label: "Categoria padrão" }),
    contaCorrentePadraoId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente padrão" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["admin", "desenvolvedor"] },
    populateRefs: true,
  },
});

module.exports = {};
''')

config_path = "backend/src/services/contasPagar/configuration.js"
config = read(config_path)
config = config.replace("const CONFIGURATION_VERSION = 3;", "const CONFIGURATION_VERSION = 4;")
config = re.sub(r'\n  aprovarCompraAutomatico: true,\n  enviarContaPagarOmieAutomatico: true,', '', config, count=1)
write(config_path, config)

# Chave de agrupamento separa fornecedor e tipo fiscal.
payload_path = "backend/src/services/contasPagar/payload.js"
payload = read(payload_path)
payload = replace_once(
    payload,
    'function chaveBase(compra) {\n  return `${compra.instanceId || "default"}|${Number(compra.codigoFornecedorOmie)}`;\n}',
    'function chaveBase(compra) {\n  const tipo = String(compra.tipoDocumentoFiscal || "").trim();\n  if (!["NF-e", "CT-e"].includes(tipo)) {\n    throw new Error("O agrupamento aceita exclusivamente NF-e ou CT-e.");\n  }\n  return `${compra.instanceId || "default"}|${Number(compra.codigoFornecedorOmie)}|${tipo}`;\n}',
    "chaveBase",
)
payload = payload.replace(
    'numero_documento: `OON-${String(fornecedor).slice(-6)}-${conta.dataVencimento.replaceAll("-", "").slice(2)}-${conta.geracao}`.slice(0, 20),',
    'numero_documento: `OON-${conta.tipoDocumentoFiscal === "CT-e" ? "CTE" : "NFE"}-${String(fornecedor).slice(-6)}-${conta.geracao}`.slice(0, 20),',
)
write(payload_path, payload)

# Reconciliação obrigatoriamente automática e por tipo.
recon_path = "backend/src/services/contasPagar/reconciliation.js"
recon = read(recon_path)
recon = recon.replace(
    'async function consolidarFornecedor(instanceId, codigoFornecedorOmie) {',
    'async function consolidarFornecedor(instanceId, codigoFornecedorOmie, tipoDocumentoFiscal) {',
)
recon = recon.replace(
    '    codigoFornecedorOmie,\n    status: { $in: STATUS_ATIVOS },',
    '    codigoFornecedorOmie,\n    tipoDocumentoFiscal,\n    status: { $in: STATUS_ATIVOS },',
    1,
)
recon = recon.replace(
    '  const baseKey = chaveBase({ instanceId, codigoFornecedorOmie });',
    '  const baseKey = chaveBase({ instanceId, codigoFornecedorOmie, tipoDocumentoFiscal });',
)
recon = recon.replace(
    '  const consolidada = await consolidarFornecedor(compra.instanceId, compra.codigoFornecedorOmie);',
    '  const consolidada = await consolidarFornecedor(\n    compra.instanceId,\n    compra.codigoFornecedorOmie,\n    compra.tipoDocumentoFiscal,\n  );',
)
recon = recon.replace(
    '    codigoFornecedorOmie: compra.codigoFornecedorOmie,\n  }).sort({ geracao: -1 }).lean();',
    '    codigoFornecedorOmie: compra.codigoFornecedorOmie,\n    tipoDocumentoFiscal: compra.tipoDocumentoFiscal,\n  }).sort({ geracao: -1 }).lean();',
)
recon = recon.replace(
    '      nomeFornecedor: compra.nomeFornecedor,\n      dataVencimento: compra.dataVencimento,',
    '      nomeFornecedor: compra.nomeFornecedor,\n      tipoDocumentoFiscal: compra.tipoDocumentoFiscal,\n      dataVencimento: compra.dataVencimento,',
)
recon = recon.replace(
    '  const automaticApproval = configuracao.aprovarCompraAutomatico === true;',
    '  const automaticApproval = true;',
)
recon = recon.replace(
    '  const shouldSend = options.forceSend || configuracao.enviarContaPagarOmieAutomatico === true;',
    '  const shouldSend = true;',
)
recon = recon.replace(
    '  if (!(Number(compra.valorFaturado) > 0)) throw new Error(`Compra ${compra.codigoPedidoOmie} sem valor faturado válido.`);',
    '  if (!(Number(compra.valorFaturado) > 0)) throw new Error(`Documento ${compra.numeroDocumentoFiscal} sem valor faturado válido.`);\n  if (!["NF-e", "CT-e"].includes(compra.tipoDocumentoFiscal)) {\n    return { ignored: true, reason: "tipo-documento-nao-suportado", compraId: String(compra._id) };\n  }',
)
recon = recon.replace(
    '.select("instanceId codigoFornecedorOmie")',
    '.select("instanceId codigoFornecedorOmie tipoDocumentoFiscal")',
)
recon = recon.replace(
    '  const grupos = unique(contas.map((conta) => `${conta.instanceId}|${conta.codigoFornecedorOmie}`)).slice(0, limit);',
    '  const grupos = unique(contas.map((conta) => (\n    `${conta.instanceId}|${conta.codigoFornecedorOmie}|${conta.tipoDocumentoFiscal}`\n  ))).slice(0, limit);',
)
old_group_loop = '''    const separator = grupo.lastIndexOf("|");
    const instanceId = grupo.slice(0, separator);
    const codigoFornecedorOmie = Number(grupo.slice(separator + 1));
    try {
      const before = await ContaPagarAgrupada.countDocuments({
        instanceId,
        codigoFornecedorOmie,
        status: { $in: STATUS_ATIVOS },
      });
      await consolidarFornecedor(instanceId, codigoFornecedorOmie);
      const after = await ContaPagarAgrupada.countDocuments({
        instanceId,
        codigoFornecedorOmie,
        status: { $in: STATUS_ATIVOS },
      });'''
new_group_loop = '''    const [instanceId, fornecedor, tipoDocumentoFiscal] = grupo.split("|");
    const codigoFornecedorOmie = Number(fornecedor);
    try {
      const before = await ContaPagarAgrupada.countDocuments({
        instanceId,
        codigoFornecedorOmie,
        tipoDocumentoFiscal,
        status: { $in: STATUS_ATIVOS },
      });
      await consolidarFornecedor(instanceId, codigoFornecedorOmie, tipoDocumentoFiscal);
      const after = await ContaPagarAgrupada.countDocuments({
        instanceId,
        codigoFornecedorOmie,
        tipoDocumentoFiscal,
        status: { $in: STATUS_ATIVOS },
      });'''
recon = replace_once(recon, old_group_loop, new_group_loop, "consolidar grupos")
recon = recon.replace(
    '      if (configuracao.enviarContaPagarOmieAutomatico === true) {\n        try {\n          const sent = await enviarContaParaOmie(contaId, { configuracao });\n          if (!sent.ignored) summary.accountsQueued += 1;\n        } catch (error) {\n          if (Number(error?.statusCode || 0) !== 422) throw error;\n        }\n      }',
    '      try {\n        const sent = await enviarContaParaOmie(contaId, { configuracao });\n        if (!sent.ignored) summary.accountsQueued += 1;\n      } catch (error) {\n        if (Number(error?.statusCode || 0) !== 422) throw error;\n      }',
)
write(recon_path, recon)

# Webhooks: cancelamentos fiscais, cancelamento de pagamento e regeneração após exclusão.
write("backend/src/services/contasPagar/webhooks.js", r'''"use strict";

const { ETAPA_FATURADO } = require("./constants");
const {
  encontrarFinanceiro,
  encontrarRecebimento,
  normalizarCompraOmie,
  normalizarRecebimentoOmie,
} = require("./normalization");
const { classificarPagamentoContaPagar, enfileirarConclusaoCompras } = require("./omieOperations");
const { chaveBase } = require("./payload");
const { models } = require("./runtime");
const { primeiroValor } = require("./utils");
const { reconciliarCompra } = require("./reconciliation");
const {
  STATUS_DOCUMENTO_CANCELADO,
  regenerarContaExcluida,
  tratarCancelamentoDocumento,
} = require("./sidecar");

async function processarWebhookCompra(eventType, payload, instanceId = "default") {
  const { Compra } = models();
  const recebimento = encontrarRecebimento(payload);
  const normalized = recebimento
    ? normalizarRecebimentoOmie(recebimento, { instanceId })
    : normalizarCompraOmie(payload, { instanceId, eventType });
  if (!normalized) return { ignored: true, reason: "documento-nao-reconhecido", eventType };
  if (!["NF-e", "CT-e"].includes(normalized.tipoDocumentoFiscal)) {
    return { ignored: true, reason: "tipo-documento-nao-suportado", eventType };
  }
  if (STATUS_DOCUMENTO_CANCELADO.includes(normalized.statusDocumentoOmie)) {
    return tratarCancelamentoDocumento(normalized);
  }
  if (normalized.statusDocumentoOmie !== "Pendente" || normalized.etapa !== ETAPA_FATURADO) {
    return { ignored: true, reason: "documento-fora-de-faturado-pendente", eventType };
  }

  const current = await Compra.findOne({ chaveExterna: normalized.chaveExterna }).lean();
  if (current?.entradaFaturadoEm) normalized.entradaFaturadoEm = current.entradaFaturadoEm;
  if (current?.dataVencimento) normalized.dataVencimento = current.dataVencimento;
  if (current?.statusAprovacao) normalized.statusAprovacao = current.statusAprovacao;
  if (current?.contaPagarId) normalized.contaPagarId = current.contaPagarId;
  if (!normalized.entradaFaturadoEm) normalized.entradaFaturadoEm = new Date();
  const compra = await Compra.findOneAndUpdate(
    { chaveExterna: normalized.chaveExterna },
    { $set: normalized },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return reconciliarCompra(compra._id);
}

async function localizarContaFinanceira(payload) {
  const { ContaPagarAgrupada } = models();
  const data = encontrarFinanceiro(payload) || {};
  const integrationCode = String(data.codigo_lancamento_integracao || "").trim();
  const omieCode = Number(primeiroValor(data.codigo_lancamento_omie, data.codigo_lancamento, 0));
  const query = [];
  if (integrationCode) query.push({ codigoLancamentoIntegracao: integrationCode });
  if (omieCode > 0) query.push({ codigoLancamentoOmie: omieCode });
  if (!query.length) return { conta: null, data };
  return { conta: await ContaPagarAgrupada.findOne({ $or: query }), data };
}

async function processarWebhookContaPagar(eventType, payload) {
  const { Compra, ContaPagarAgrupada } = models();
  const { conta, data } = await localizarContaFinanceira(payload);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", eventType };
  const omieCode = Number(primeiroValor(data.codigo_lancamento_omie, data.codigo_lancamento, conta.codigoLancamentoOmie, 0));
  const pagamento = classificarPagamentoContaPagar(data);
  const now = new Date();
  const commonSet = {
    codigoLancamentoOmie: omieCode > 0 ? omieCode : conta.codigoLancamentoOmie,
    statusEnvioOmie: "Enviado",
    statusTituloOmie: pagamento.statusTituloOmie,
    valorPagarOmie: pagamento.valorPagar,
    ultimaSincronizacaoEm: now,
    ultimaConsultaPagamentoEm: now,
    ultimoErro: "",
  };

  if (eventType === "Financas.ContaPagar.BaixaRealizada") {
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { ...commonSet, status: "Paga", statusPagamentoOmie: "Pago" },
      $unset: { chaveAtiva: 1 },
    });
    const compras = await Compra.find({ contaPagarId: conta._id }).lean();
    const ticketsConclusao = await enfileirarConclusaoCompras(compras, now);
    return { contaId: String(conta._id), status: "Paga", statusPagamentoOmie: "Pago", ticketsConclusao };
  }

  if (eventType === "Financas.ContaPagar.BaixaCancelada") {
    try {
      await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
        $set: {
          ...commonSet,
          status: "Aberta",
          statusPagamentoOmie: "Cancelado",
          chaveAtiva: chaveBase(conta),
        },
      }, { runValidators: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
        $set: { ...commonSet, status: "Pagamento cancelado", statusPagamentoOmie: "Cancelado" },
        $unset: { chaveAtiva: 1 },
      });
    }
    await Compra.updateMany(
      { contaPagarId: conta._id },
      {
        $set: {
          etapa: ETAPA_FATURADO,
          statusDocumentoOmie: "Pendente",
          situacaoPedidoOmieOrigem: "Pendente",
          statusConclusaoOmie: "Não enviado",
          statusIntegracao: "Sincronizado",
          ultimaSincronizacaoEm: now,
          ultimoErro: "",
        },
        $unset: { concluidaNoOmieEm: 1 },
      },
    );
    return { contaId: String(conta._id), status: "Aberta", statusPagamentoOmie: "Cancelado" };
  }

  if (eventType === "Financas.ContaPagar.Excluido") {
    return regenerarContaExcluida(conta._id);
  }

  const statusPagamentoOmie = pagamento.statusPagamentoOmie === "Pago"
    ? "Pago"
    : pagamento.statusPagamentoOmie === "Parcial"
      ? "Parcial"
      : "Pendente";
  const statusConta = statusPagamentoOmie === "Pago" ? "Paga" : "Aberta";
  const update = { $set: { ...commonSet, status: statusConta, statusPagamentoOmie } };
  if (statusPagamentoOmie === "Pago") update.$unset = { chaveAtiva: 1 };
  await ContaPagarAgrupada.findByIdAndUpdate(conta._id, update);
  let ticketsConclusao = [];
  if (statusPagamentoOmie === "Pago") {
    const compras = await Compra.find({ contaPagarId: conta._id }).lean();
    ticketsConclusao = await enfileirarConclusaoCompras(compras, now);
  } else {
    await Compra.updateMany(
      { contaPagarId: conta._id },
      { $set: { statusIntegracao: "Sincronizado", ultimaSincronizacaoEm: now, ultimoErro: "" } },
    );
  }
  return { contaId: String(conta._id), status: statusConta, statusPagamentoOmie, ticketsConclusao };
}

async function processarWebhookOmie(event, context = {}) {
  const payload = event?.payload || {};
  const eventType = String(payload.eventType || payload.topic || "");
  const body = payload.body || payload.payload || payload;
  const instanceId = String(payload.instanceId || "default");
  const result = eventType.startsWith("Financas.ContaPagar.")
    ? await processarWebhookContaPagar(eventType, body)
    : await processarWebhookCompra(eventType, body, instanceId);
  context.recordItem?.({ eventType, ...result });
  return result;
}

module.exports = { processarWebhookCompra, processarWebhookContaPagar, processarWebhookOmie };
''')

# Mapping inclui exclusão automática e captura estrita de eventos fiscais.
mapping_path = "backend/src/mappings/omie.js"
mapping = read(mapping_path)
mapping = mapping.replace(
    '  executarConclusaoRecebimentoOmie,\n  executarConsultaPagamentoOmie,',
    '  executarConclusaoRecebimentoOmie,\n  executarConsultaPagamentoOmie,\n  executarExclusaoContaPagarOmie,',
)
mapping = mapping.replace(
    '    webhookAction("Financas.ContaPagar.Excluido")\n  ],',
    '    webhookAction("Financas.ContaPagar.Excluido"),\n    webhookAction("*")\n  ],',
)
mapping = mapping.replace(
    '    TAZAY_CONCLUIR_RECEBIMENTO_OMIE: executarConclusaoRecebimentoOmie,',
    '    TAZAY_CONCLUIR_RECEBIMENTO_OMIE: executarConclusaoRecebimentoOmie,\n    TAZAY_EXCLUIR_CONTA_PAGAR_OMIE: executarExclusaoContaPagarOmie,',
)
write(mapping_path, mapping)

# Rotas somente operacionais: exclusão vai primeiro ao Omie; sem aprovar/enviar/consultar manual.
write("backend/src/routes/contasPagar.js", r'''"use strict";

const { defineRoutes, registry } = require("@oondemand/oon-core-back");
const {
  obterConfiguracao,
  reconciliarPendentes,
  solicitarExclusaoContaOmie,
} = require("../services/contasPagar");

const ROLES = ["admin", "desenvolvedor"];

defineRoutes("/api/tazay/contas-pagar", (router) => {
  router.private.post("/reconciliar", { roles: ROLES }, async (req, res) => {
    const result = await reconciliarPendentes({ timeZone: req.body?.timeZone });
    res.status(result.errors.length ? 207 : 200).json(result);
  });

  router.private.delete("/contas/:id", {
    roles: ROLES,
    audit: { action: "DELETE", entity: "ContaPagarAgrupada" },
  }, async (req, res) => {
    const result = await solicitarExclusaoContaOmie(req.params.id, {
      motivo: "Exclusão solicitada pelo usuário na Central.",
    });
    res.status(result.ignored ? 409 : 202).json(result);
  });

  router.private.post("/configuracao/inicializar", { roles: ROLES }, async (_req, res) => {
    res.json({ configuracao: await obterConfiguracao({ create: true }) });
  });

  router.private.get("/resumo", { roles: ROLES }, async (_req, res) => {
    const Compra = registry.getModel("Compra")?.mongooseModel;
    const Conta = registry.getModel("ContaPagarAgrupada")?.mongooseModel;
    const [documentosPendentes, documentosProcessados, documentosPagos, contasPendentes, contasAbertas, contasComErro] = await Promise.all([
      Compra.countDocuments({ etapa: "Faturado pelo fornecedor", statusDocumentoOmie: "Pendente" }),
      Compra.countDocuments({ statusAprovacao: "Aprovada" }),
      Compra.countDocuments({ etapa: "Pago" }),
      Conta.countDocuments({ status: { $in: ["Pendente envio", "Pendente sincronização", "Exclusão pendente"] } }),
      Conta.countDocuments({ status: { $in: ["Aberta", "Pagamento cancelado"] } }),
      Conta.countDocuments({ status: "Erro" }),
    ]);
    res.json({
      documentosPendentes,
      documentosProcessados,
      documentosPagos,
      contasPendentes,
      contasAbertas,
      contasComErro,
    });
  });
});
''')

# UI somente leitura, sem criação/edição manual.
ui_path = "frontend/central.ui.json"
ui = json.loads(read(ui_path))
for collection in ui.get("collections", []):
    model = collection.get("model")
    if model == "Compra":
        collection.pop("form", None)
        listing = collection.setdefault("list", {})
        listing["builtInActions"] = {"create": False, "edit": False, "delete": False}
        listing["rowActions"] = []
        for filter_def in listing.get("filters", []):
            if filter_def.get("field") == "tipoDocumentoFiscal":
                filter_def["options"] = [item for item in filter_def.get("options", []) if item.get("value") != "Outro"]
        for tab in collection.get("detailModal", {}).get("tabs", []):
            if tab.get("type") != "form":
                continue
            groups = []
            for group in tab.get("groups", []):
                if "aprovação manual" in group.get("label", "").lower():
                    continue
                if group.get("label") == "Integração":
                    fields = group.setdefault("fields", [])
                    for field in ["canceladaEm", "canceladaAposPagamento", "observacaoOperacional"]:
                        if field not in fields:
                            fields.append(field)
                groups.append(group)
            tab["groups"] = groups
    elif model == "ContaPagarAgrupada":
        collection.pop("form", None)
        listing = collection.setdefault("list", {})
        columns = listing.setdefault("columns", [])
        if "tipoDocumentoFiscal" not in columns:
            columns.insert(1, "tipoDocumentoFiscal")
        listing["rowActions"] = [{
            "id": "excluirContaOmie",
            "type": "apiAction",
            "label": "🗑️",
            "method": "DELETE",
            "endpoint": "/api/tazay/contas-pagar/contas/:id",
            "confirm": {
                "title": "Excluir e regenerar conta a pagar",
                "description": "A conta será excluída no Omie. A Central criará automaticamente uma nova conta e atualizará as referências dos documentos elegíveis."
            },
            "disabledWhen": {
                "field": "status",
                "in": ["Paga", "Excluída", "Exclusão pendente"]
            },
            "refresh": ["self", "all"]
        }]
        listing["builtInActions"] = {"create": False, "edit": False, "delete": False}
        for tab in collection.get("detailModal", {}).get("tabs", []):
            if tab.get("type") == "form":
                for group in tab.get("groups", []):
                    fields = group.setdefault("fields", [])
                    if group.get("label") == "Conta agrupada" and "tipoDocumentoFiscal" not in fields:
                        fields.insert(1, "tipoDocumentoFiscal")
                tab["groups"] = [
                    group for group in tab.get("groups", [])
                    if "envio manual" not in group.get("label", "").lower()
                ]
    elif model == "ConfiguracaoContasPagar":
        collection["form"] = [
            {"field": "categoriaPadraoId", "referenceFilters": {"status": "Ativo"}},
            {"field": "contaCorrentePadraoId", "referenceFilters": {"status": "Ativo"}},
        ]
        collection["list"]["columns"] = ["categoriaPadraoId", "contaCorrentePadraoId"]
        for tab in collection.get("detailModal", {}).get("tabs", []):
            if tab.get("type") == "form":
                tab["groups"] = [
                    {
                        "label": "Operação automática",
                        "description": "A Central atua exclusivamente como side-car do Omie: recebe NF-es e CT-es, agrupa por fornecedor e tipo de documento, cria ou atualiza o contas a pagar e conclui os recebimentos após a confirmação do pagamento.",
                        "fields": [],
                        "columns": 1,
                    },
                    {
                        "label": "Padrões financeiros",
                        "fields": ["categoriaPadraoId", "contaCorrentePadraoId"],
                        "columns": 2,
                    },
                ]
write(ui_path, json.dumps(ui, ensure_ascii=False, indent=2) + "\n")

# Testes de contrato do side-car.
write("backend/test/sidecarAutomatico.test.js", r'''"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chaveBase,
  observacaoDocumentoCancelado,
} = require("../src/services/contasPagar");

function source(relative) {
  return fs.readFileSync(path.join(__dirname, relative), "utf8");
}

test("agrupa por instância, fornecedor e tipo de documento", () => {
  assert.equal(chaveBase({ instanceId: "default", codigoFornecedorOmie: 10, tipoDocumentoFiscal: "NF-e" }), "default|10|NF-e");
  assert.equal(chaveBase({ instanceId: "default", codigoFornecedorOmie: 10, tipoDocumentoFiscal: "CT-e" }), "default|10|CT-e");
  assert.throws(() => chaveBase({ instanceId: "default", codigoFornecedorOmie: 10, tipoDocumentoFiscal: "Outro" }), /exclusivamente NF-e ou CT-e/i);
});

test("modelos são exclusivos da integração Omie", () => {
  const compra = source("../src/models/Compra.js");
  const conta = source("../src/models/ContaPagarAgrupada.js");
  assert.match(compra, /const TIPOS_DOCUMENTO_FISCAL = \["NF-e", "CT-e"\]/);
  assert.doesNotMatch(compra, /"Outro"/);
  assert.match(compra, /roles: \{ write: \["integracao-sistema"\] \}/);
  assert.match(conta, /tipoDocumentoFiscal/);
  assert.match(conta, /"Exclusão pendente"/);
  assert.match(conta, /roles: \{ write: \["integracao-sistema"\] \}/);
});

test("interface não oferece criação, edição ou ações financeiras manuais", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const compra = ui.collections.find((item) => item.model === "Compra");
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  assert.deepEqual(compra.list.builtInActions, { create: false, edit: false, delete: false });
  assert.deepEqual(conta.list.builtInActions, { create: false, edit: false, delete: false });
  assert.equal(compra.list.rowActions.length, 0);
  assert.equal(conta.list.rowActions.length, 1);
  assert.equal(conta.list.rowActions[0].label, "🗑️");
  assert.equal(conta.list.rowActions[0].method, "DELETE");
  const json = JSON.stringify(ui);
  assert.doesNotMatch(json, /Aprovar e gerar contas-pagar/);
  assert.doesNotMatch(json, /Enviar para o Omie/);
  assert.doesNotMatch(json, /Consultar pagamento no Omie/);
});

test("exclusão da conta é enviada ao Omie e gera substituta", () => {
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  const routes = source("../src/routes/contasPagar.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(sidecar, /TAZAY_EXCLUIR_CONTA_PAGAR_OMIE/);
  assert.match(sidecar, /regenerarContaExcluida/);
  assert.match(sidecar, /reconciliarCompra/);
  assert.match(sidecar, /enviarContaParaOmie/);
  assert.match(routes, /solicitarExclusaoContaOmie/);
  assert.doesNotMatch(routes, /excluirContaLocal/);
  assert.match(mapping, /TAZAY_EXCLUIR_CONTA_PAGAR_OMIE/);
});

test("cancelamento do pagamento devolve documentos para pendente", () => {
  const webhooks = source("../src/services/contasPagar/webhooks.js");
  assert.match(webhooks, /Financas\.ContaPagar\.BaixaCancelada/);
  assert.match(webhooks, /statusDocumentoOmie: "Pendente"/);
  assert.match(webhooks, /statusConclusaoOmie: "Não enviado"/);
  assert.match(webhooks, /\$unset: \{ concluidaNoOmieEm: 1 \}/);
});

test("cancelamento fiscal ajusta o agrupamento ou registra pagamento já realizado", () => {
  const sidecar = source("../src/services/contasPagar/sidecar.js");
  assert.match(sidecar, /\$unset = \{ contaPagarId: 1 \}/);
  assert.match(sidecar, /recalcularConta\(conta\._id\)/);
  assert.match(sidecar, /enviarContaParaOmie\(conta\._id/);
  assert.match(sidecar, /canceladaAposPagamento: pago/);
  assert.match(observacaoDocumentoCancelado(
    { tipoDocumentoFiscal: "NF-e", numeroDocumentoFiscal: "123" },
    { codigoLancamentoOmie: 99 },
    true,
  ), /pagamento já havia sido realizado/i);
});

test("webhook curinga captura eventos fiscais sem criar tipos desconhecidos", () => {
  const mapping = source("../src/mappings/omie.js");
  const webhooks = source("../src/services/contasPagar/webhooks.js");
  assert.match(mapping, /webhookAction\("\*"\)/);
  assert.match(webhooks, /tipo-documento-nao-suportado/);
  assert.match(webhooks, /tratarCancelamentoDocumento/);
});

test("configuração não permite desligar a automação", () => {
  const model = source("../src/models/ConfiguracaoContasPagar.js");
  const config = source("../src/services/contasPagar/configuration.js");
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  assert.doesNotMatch(model, /aprovarCompraAutomatico|enviarContaPagarOmieAutomatico/);
  assert.doesNotMatch(config, /aprovarCompraAutomatico|enviarContaPagarOmieAutomatico/);
  assert.match(reconciliation, /const automaticApproval = true/);
  assert.match(reconciliation, /const shouldSend = true/);
});
''')
