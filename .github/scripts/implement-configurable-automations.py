from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content if content.endswith("\n") else content + "\n")


def replace_once(content, old, new, label):
    if old not in content:
        raise RuntimeError(f"Trecho não encontrado: {label}")
    return content.replace(old, new, 1)


# Configuração: duas automações independentes, sem versão/migração de legado.
path = "backend/src/models/ConfiguracaoContasPagar.js"
content = read(path)
content = replace_once(
    content,
    '    categoriaPadraoId: fields.ref("CategoriaOmie", { label: "Categoria padrão" }),',
    '''    aprovarCompraAutomatico: fields.boolean({
      label: "Aprovar automático documento fiscal e gerar contas a pagar agrupado",
      default: true,
    }),
    enviarContaPagarOmieAutomatico: fields.boolean({
      label: "Sincronizar automático o Contas a Pagar com o Omie",
      default: true,
    }),
    categoriaPadraoId: fields.ref("CategoriaOmie", { label: "Categoria padrão" }),''',
    "campos de automação no modelo de configuração",
)
write(path, content)

path = "backend/src/services/contasPagar/configuration.js"
content = read(path)
content = replace_once(
    content,
    '''const DEFAULT_CONFIGURATION = Object.freeze({
  chave: "default",
  categoriaPadraoId: null,''',
    '''const DEFAULT_CONFIGURATION = Object.freeze({
  chave: "default",
  aprovarCompraAutomatico: true,
  enviarContaPagarOmieAutomatico: true,
  categoriaPadraoId: null,''',
    "defaults das automações",
)
write(path, content)

# Campos operacionais usados para ocultar ações quando a automação correspondente está ativa.
path = "backend/src/models/Compra.js"
content = read(path)
content = content.replace(
    'const STATUS_APROVACAO = ["Pendente", "Aprovada"];',
    'const STATUS_APROVACAO = ["Pendente", "Aprovada", "Recusada"];',
)
content = replace_once(
    content,
    '    aprovadaPor: fields.string({ label: "Processada por" }),',
    '''    aprovadaPor: fields.string({ label: "Processada por" }),
    recusadaEm: fields.date({ label: "Recusada em" }),
    recusadaPor: fields.string({ label: "Recusada por" }),
    recusaOmieRevisao: fields.number({ label: "Revisão da recusa no Omie", default: 0 }),
    acaoAprovacaoManualDisponivel: fields.boolean({
      label: "Ações manuais de aprovação disponíveis",
      default: false,
    }),''',
    "campos de recusa e disponibilidade manual",
)
write(path, content)

path = "backend/src/models/ContaPagarAgrupada.js"
content = read(path)
content = replace_once(
    content,
    '  "Não consultado",\n  "Pendente",',
    '  "Não consultado",\n  "Consultando",\n  "Pendente",',
    "status Consultando",
)
content = replace_once(
    content,
    '    exclusaoOmieRevisao: fields.number({ label: "Revisão da exclusão no Omie", default: 0 }),',
    '''    exclusaoOmieRevisao: fields.number({ label: "Revisão da exclusão no Omie", default: 0 }),
    consultaPagamentoRevisao: fields.number({ label: "Revisão da consulta de pagamento", default: 0 }),
    ultimaConsultaPagamentoEm: fields.date({ label: "Última verificação de pagamento" }),
    acoesOmieManuaisDisponiveis: fields.boolean({
      label: "Ações manuais do Omie disponíveis",
      default: false,
    }),''',
    "campos de consulta e disponibilidade manual",
)
write(path, content)

# Reconciliação respeita cada automação e mantém o agrupamento local quando o envio está manual.
path = "backend/src/services/contasPagar/reconciliation.js"
content = read(path)
content = replace_once(
    content,
    "  const automaticApproval = true;",
    "  const automaticApproval = configuracao.aprovarCompraAutomatico === true;",
    "chave de aprovação automática",
)
content = replace_once(
    content,
    "  const shouldSend = true;",
    "  const shouldSend = options.forceSend === true || configuracao.enviarContaPagarOmieAutomatico === true;",
    "chave de envio automático",
)
content = replace_once(
    content,
    "  const conta = await obterOuCriarContaAtiva(compra);",
    '''  const conta = await obterOuCriarContaAtiva(compra);
  await models().ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
    $set: { acoesOmieManuaisDisponiveis: configuracao.enviarContaPagarOmieAutomatico !== true },
  });''',
    "disponibilidade manual na conta",
)
content = replace_once(
    content,
    '''      try {
        const sent = await enviarContaParaOmie(contaId, { configuracao });
        if (!sent.ignored) summary.accountsQueued += 1;
      } catch (error) {
        if (Number(error?.statusCode || 0) !== 422) throw error;
      }''',
    '''      if (configuracao.enviarContaPagarOmieAutomatico === true) {
        try {
          const sent = await enviarContaParaOmie(contaId, { configuracao });
          if (!sent.ignored) summary.accountsQueued += 1;
        } catch (error) {
          if (Number(error?.statusCode || 0) !== 422) throw error;
        }
      }''',
    "envio em lote condicionado à configuração",
)
write(path, content)

# Operações manuais, recusa do recebimento Omie, consulta de pagamento e reset da base.
write("backend/src/services/contasPagar/manualOperations.js", r'''"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_FATURADO } = require("./constants");
const { obterConfiguracao } = require("./configuration");
const {
  classificarPagamentoContaPagar,
  dadosRespostaOmie,
  enfileirarConclusaoCompras,
} = require("./omieOperations");
const { executarChamadaOmie } = require("./omieRequest");
const { core, models } = require("./runtime");
const { primeiroValor } = require("./utils");

function erroAutomacaoAtiva(mensagem) {
  return new GenericError(mensagem, { statusCode: 409, retryable: false });
}

function chaveConsultaContaPagar(conta = {}) {
  const codigoOmie = Number(conta.codigoLancamentoOmie || 0);
  if (codigoOmie > 0) return { codigo_lancamento_omie: codigoOmie };
  const codigoIntegracao = String(conta.codigoLancamentoIntegracao || "").trim();
  if (codigoIntegracao) return { codigo_lancamento_integracao: codigoIntegracao };
  throw new GenericError("A conta não possui código Omie nem código de integração para consulta.", {
    statusCode: 422,
  });
}

async function atualizarDisponibilidadeAcoesManuais(configuracao) {
  const config = configuracao || await obterConfiguracao({ create: true });
  const { Compra, ContaPagarAgrupada } = models();
  const [documentos, contas] = await Promise.all([
    Compra.updateMany({}, {
      $set: { acaoAprovacaoManualDisponivel: config.aprovarCompraAutomatico !== true },
    }),
    ContaPagarAgrupada.updateMany({}, {
      $set: { acoesOmieManuaisDisponiveis: config.enviarContaPagarOmieAutomatico !== true },
    }),
  ]);
  return {
    documentosAtualizados: Number(documentos.modifiedCount || 0),
    contasAtualizadas: Number(contas.modifiedCount || 0),
  };
}

async function sincronizarDisponibilidadeDocumento(documentoOrId) {
  const { Compra } = models();
  const documentoId = String(documentoOrId?._id || documentoOrId || "");
  if (!documentoId) return { ignored: true, reason: "documento-sem-id" };
  const config = await obterConfiguracao({ create: true });
  const disponivel = config.aprovarCompraAutomatico !== true;
  const documento = await Compra.findOneAndUpdate(
    { _id: documentoId, acaoAprovacaoManualDisponivel: { $ne: disponivel } },
    { $set: { acaoAprovacaoManualDisponivel: disponivel } },
    { new: true },
  );
  return { documentoId, atualizado: Boolean(documento), disponivel };
}

async function aprovarDocumentoFiscalManual(compraId, options = {}) {
  const configuracao = await obterConfiguracao({ create: true });
  if (configuracao.aprovarCompraAutomatico === true) {
    throw erroAutomacaoAtiva("A aprovação automática está habilitada. Desabilite-a nas Configurações para aprovar manualmente.");
  }
  const { aprovarCompra } = require("./reconciliation");
  return aprovarCompra(compraId, { ...options, configuracao });
}

async function enviarContaPagarManual(contaId, options = {}) {
  const configuracao = await obterConfiguracao({ create: true });
  if (configuracao.enviarContaPagarOmieAutomatico === true) {
    throw erroAutomacaoAtiva("A sincronização automática com o Omie está habilitada. Desabilite-a nas Configurações para enviar manualmente.");
  }
  const { enviarContaParaOmie } = require("./reconciliation");
  return enviarContaParaOmie(contaId, { ...options, configuracao });
}

async function recusarDocumentoFiscal(compraId, options = {}) {
  const configuracao = await obterConfiguracao({ create: true });
  if (configuracao.aprovarCompraAutomatico === true) {
    throw erroAutomacaoAtiva("A aprovação automática está habilitada. Desabilite-a nas Configurações para recusar manualmente.");
  }

  const { Compra } = models();
  const compra = await Compra.findById(compraId);
  if (!compra) throw new GenericError("Documento fiscal não encontrado.", { statusCode: 404 });
  if (compra.statusDocumentoOmie === "Cancelado" || compra.statusAprovacao === "Recusada") {
    return { ignored: true, reason: "documento-ja-recusado", compraId: String(compra._id) };
  }
  if (compra.statusAprovacao === "Aprovada" || compra.contaPagarId) {
    throw new GenericError("O documento já foi aprovado e não pode ser recusado por esta ação.", {
      statusCode: 409,
      retryable: false,
    });
  }
  if (!(Number(compra.codigoRecebimentoOmie || 0) > 0)) {
    throw new GenericError("O documento não possui o ID do recebimento necessário para exclusão no Omie.", {
      statusCode: 422,
      retryable: false,
    });
  }

  const updated = await Compra.findOneAndUpdate(
    { _id: compra._id, statusAprovacao: { $ne: "Recusada" } },
    {
      $set: {
        statusAprovacao: "Recusada",
        recusadaEm: new Date(),
        recusadaPor: options.usuario || "Usuário",
        statusIntegracao: "Pendente",
        ultimoErro: "",
      },
      $inc: { recusaOmieRevisao: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!updated) return { ignored: true, reason: "documento-ja-recusado", compraId: String(compra._id) };

  const { enqueueIntegration } = core();
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TAZAY_RECUSAR_DOCUMENTO_FISCAL_OMIE",
    resource: "documentos-fiscais",
    operation: "delete-receipt",
    aggregateType: "Compra",
    aggregateId: String(updated._id),
    idempotencyKey: `tazay:compra:${updated._id}:recusar:r${updated.recusaOmieRevisao}`,
    payload: {
      compraId: String(updated._id),
      param: [{ nIdReceb: Number(updated.codigoRecebimentoOmie) }],
    },
  });
  return {
    compraId: String(updated._id),
    ticketId: String(ticket?._id || ""),
    statusAprovacao: "Recusada",
    statusIntegracao: "Pendente",
  };
}

async function executarRecusaDocumentoFiscalOmie(event, context = {}) {
  const { Compra } = models();
  const compraId = String(event.payload?.compraId || event.aggregateId || "");
  const compra = await Compra.findById(compraId);
  if (!compra) return { ignored: true, reason: "documento-nao-encontrado", compraId };

  try {
    await executarChamadaOmie(
      "excluir-recebimento",
      compra.instanceId,
      event.payload?.param || [{ nIdReceb: Number(compra.codigoRecebimentoOmie) }],
      context,
    );
    const { tratarCancelamentoDocumento } = require("./sidecar");
    const result = await tratarCancelamentoDocumento({
      chaveExterna: compra.chaveExterna,
      instanceId: compra.instanceId,
      codigoRecebimentoOmie: compra.codigoRecebimentoOmie,
      chaveDocumentoFiscal: compra.chaveDocumentoFiscal,
      codigoEtapaRecebimentoOmie: compra.codigoEtapaRecebimentoOmie,
      statusDocumentoOmie: "Cancelado",
    });
    const response = { compraId, statusDocumentoOmie: "Cancelado", ...result };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await Compra.findByIdAndUpdate(compra._id, {
      $set: { statusIntegracao: "Erro", ultimoErro: message },
    });
    error.retryable = false;
    throw error;
  }
}

async function consultarPagamentoContaPagar(contaOrId) {
  const configuracao = await obterConfiguracao({ create: true });
  if (configuracao.enviarContaPagarOmieAutomatico === true) {
    throw erroAutomacaoAtiva("A sincronização automática com o Omie está habilitada. Desabilite-a nas Configurações para verificar o pagamento manualmente.");
  }

  const { ContaPagarAgrupada } = models();
  const contaId = String(contaOrId?._id || contaOrId || "");
  const atual = await ContaPagarAgrupada.findById(contaId);
  if (!atual) return { ignored: true, reason: "conta-nao-encontrada" };
  if (["Excluída"].includes(atual.status)) return { ignored: true, reason: "conta-inativa" };
  if (atual.statusPagamentoOmie === "Consultando") {
    return { ignored: true, reason: "consulta-ja-pendente", contaId };
  }

  chaveConsultaContaPagar(atual);
  const conta = await ContaPagarAgrupada.findOneAndUpdate(
    { _id: atual._id, statusPagamentoOmie: { $ne: "Consultando" } },
    {
      $set: { statusPagamentoOmie: "Consultando", ultimoErro: "" },
      $inc: { consultaPagamentoRevisao: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!conta) return { ignored: true, reason: "consulta-ja-pendente", contaId };

  const { enqueueIntegration } = core();
  const ticket = await enqueueIntegration({
    provider: "omie",
    handler: "TAZAY_CONSULTAR_PAGAMENTO_OMIE",
    resource: "contas-pagar-agrupadas",
    operation: "payment-status",
    aggregateType: "ContaPagarAgrupada",
    aggregateId: String(conta._id),
    idempotencyKey: `tazay:conta-pagar:${conta._id}:consultar-pagamento:r${conta.consultaPagamentoRevisao}`,
    payload: { contaId: String(conta._id) },
  });
  return {
    contaId: String(conta._id),
    ticketId: String(ticket?._id || ""),
    statusPagamentoOmie: "Consultando",
  };
}

async function executarConsultaPagamentoOmie(event, context = {}) {
  const { Compra, ContaPagarAgrupada } = models();
  const contaId = String(event.payload?.contaId || event.aggregateId || "");
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada", contaId };

  try {
    const result = await executarChamadaOmie(
      "consultar-conta-pagar",
      conta.instanceId,
      [chaveConsultaContaPagar(conta)],
      context,
    );
    const data = dadosRespostaOmie(result);
    const pagamento = classificarPagamentoContaPagar(data);
    const codigoLancamentoOmie = Number(primeiroValor(
      data.codigo_lancamento_omie,
      data.codigo_lancamento,
      conta.codigoLancamentoOmie,
      0,
    ));
    const now = new Date();
    const statusConta = pagamento.statusPagamentoOmie === "Pago"
      ? "Paga"
      : pagamento.statusPagamentoOmie === "Cancelado"
        ? "Pagamento cancelado"
        : "Aberta";
    const update = {
      $set: {
        codigoLancamentoOmie: codigoLancamentoOmie > 0
          ? codigoLancamentoOmie
          : conta.codigoLancamentoOmie,
        status: statusConta,
        statusEnvioOmie: "Enviado",
        statusPagamentoOmie: pagamento.statusPagamentoOmie,
        statusTituloOmie: pagamento.statusTituloOmie,
        valorPagarOmie: pagamento.valorPagar,
        ultimaConsultaPagamentoEm: now,
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      },
    };
    if (pagamento.statusPagamentoOmie === "Pago") update.$unset = { chaveAtiva: 1 };
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, update, { runValidators: true });

    const compras = await Compra.find({ contaPagarId: conta._id }).lean();
    let ticketsConclusao = [];
    if (pagamento.statusPagamentoOmie === "Pago") {
      ticketsConclusao = await enfileirarConclusaoCompras(compras, now);
    } else {
      const purchaseSet = {
        statusIntegracao: "Sincronizado",
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      };
      if (pagamento.statusPagamentoOmie === "Cancelado") {
        purchaseSet.etapa = ETAPA_FATURADO;
        purchaseSet.statusConclusaoOmie = "Não enviado";
      }
      await Compra.updateMany({ contaPagarId: conta._id }, { $set: purchaseSet });
    }

    const response = {
      contaId: String(conta._id),
      codigoLancamentoOmie: codigoLancamentoOmie > 0
        ? codigoLancamentoOmie
        : Number(conta.codigoLancamentoOmie || 0),
      statusPagamentoOmie: pagamento.statusPagamentoOmie,
      statusTituloOmie: pagamento.statusTituloOmie,
      valorPagarOmie: pagamento.valorPagar,
      pedidosAtualizadosParaPago: pagamento.statusPagamentoOmie === "Pago",
      ticketsConclusao,
    };
    context.recordItem?.(response);
    return response;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { statusPagamentoOmie: "Erro", ultimoErro: message },
    });
    throw error;
  }
}

async function resetarBaseDados() {
  const { Compra, ContaPagarAgrupada, ConfiguracaoContasPagar } = models();
  const connection = Compra?.db || ContaPagarAgrupada?.db || ConfiguracaoContasPagar?.db;
  if (!connection?.dropDatabase) {
    throw new GenericError("Não foi possível acessar a conexão do banco de dados.", { statusCode: 500 });
  }
  await connection.dropDatabase();
  return { resetada: true, primeiroAcesso: true };
}

module.exports = {
  aprovarDocumentoFiscalManual,
  atualizarDisponibilidadeAcoesManuais,
  chaveConsultaContaPagar,
  consultarPagamentoContaPagar,
  enviarContaPagarManual,
  executarConsultaPagamentoOmie,
  executarRecusaDocumentoFiscalOmie,
  recusarDocumentoFiscal,
  resetarBaseDados,
  sincronizarDisponibilidadeDocumento,
};
''')

path = "backend/src/services/contasPagar/index.js"
content = read(path)
content = replace_once(
    content,
    '  ...require("./omieOperations"),',
    '  ...require("./omieOperations"),\n  ...require("./manualOperations"),',
    "export das operações manuais",
)
write(path, content)

# Mapeamento Omie: exclusão do recebimento e consulta manual do título.
path = "backend/src/mappings/omie.js"
content = read(path)
content = replace_once(
    content,
    '  executarConclusaoRecebimentoOmie,',
    '  executarConclusaoRecebimentoOmie,\n  executarConsultaPagamentoOmie,\n  executarRecusaDocumentoFiscalOmie,',
    "imports dos handlers manuais",
)
content = replace_once(
    content,
    '''    "excluir-conta-pagar": {
      label: "Excluir conta a pagar agrupada",''',
    '''    "consultar-conta-pagar": {
      label: "Consultar conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "ConsultarContaPagar",
      param: { $path: "$input.param" },
      maxAttempts: 1
    },
    "excluir-recebimento": {
      label: "Recusar e excluir recebimento de documento fiscal",
      endpoint: "produtos/recebimentonfe/",
      call: "ExcluirRecebimento",
      param: { $path: "$input.param" },
      maxAttempts: 1
    },
    "excluir-conta-pagar": {
      label: "Excluir conta a pagar agrupada",''',
    "calls manuais Omie",
)
content = replace_once(
    content,
    '    TAZAY_ENVIAR_CONTA_PAGAR_OMIE: executarEnvioContaPagarOmie,',
    '''    TAZAY_ENVIAR_CONTA_PAGAR_OMIE: executarEnvioContaPagarOmie,
    TAZAY_CONSULTAR_PAGAMENTO_OMIE: executarConsultaPagamentoOmie,
    TAZAY_RECUSAR_DOCUMENTO_FISCAL_OMIE: executarRecusaDocumentoFiscalOmie,''',
    "handlers manuais Omie",
)
write(path, content)

# Rotas explícitas e protegidas.
write("backend/src/routes/contasPagar.js", r'''"use strict";

const { defineRoutes, registry } = require("@oondemand/oon-core-back");
const {
  aprovarDocumentoFiscalManual,
  consultarPagamentoContaPagar,
  enviarContaPagarManual,
  obterConfiguracao,
  recusarDocumentoFiscal,
  reconciliarPendentes,
  resetarBaseDados,
  solicitarExclusaoContaOmie,
} = require("../services/contasPagar");

const ROLES = ["admin", "desenvolvedor"];

defineRoutes("/api/tazay/contas-pagar", (router) => {
  router.private.post("/reconciliar", { roles: ROLES }, async (req, res) => {
    const result = await reconciliarPendentes({ timeZone: req.body?.timeZone });
    res.status(result.errors.length ? 207 : 200).json(result);
  });

  router.private.post("/compras/:id/aprovar", {
    roles: ROLES,
    audit: { action: "APPROVE", entity: "Compra" },
  }, async (req, res) => {
    const result = await aprovarDocumentoFiscalManual(req.params.id, {
      categoriaId: req.body?.categoriaId,
      contaCorrenteId: req.body?.contaCorrenteId,
      usuario: req.usuario?.email || req.usuario?.nome || "Usuário",
      timeZone: req.body?.timeZone,
    });
    res.status(result.ignored ? 409 : 200).json(result);
  });

  router.private.post("/compras/:id/recusar", {
    roles: ROLES,
    audit: { action: "REJECT", entity: "Compra" },
  }, async (req, res) => {
    const result = await recusarDocumentoFiscal(req.params.id, {
      usuario: req.usuario?.email || req.usuario?.nome || "Usuário",
    });
    res.status(result.ignored ? 409 : 202).json(result);
  });

  router.private.post("/contas/:id/enviar", { roles: ROLES }, async (req, res) => {
    const result = await enviarContaPagarManual(req.params.id, {
      categoriaId: req.body?.categoriaId,
      contaCorrenteId: req.body?.contaCorrenteId,
    });
    res.status(result.ignored ? 409 : 202).json(result);
  });

  router.private.post("/contas/:id/consultar-pagamento", { roles: ROLES }, async (req, res) => {
    const result = await consultarPagamentoContaPagar(req.params.id);
    res.status(result.ignored ? 409 : 202).json(result);
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

  router.private.post("/configuracao/resetar-base", {
    roles: ["admin"],
    audit: { action: "RESET_DATABASE", entity: "ConfiguracaoContasPagar" },
  }, async (_req, res) => {
    res.status(200).json(await resetarBaseDados());
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

# Triggers mantêm a visibilidade das ações alinhada às configurações.
write("backend/src/triggers/compras.js", r'''"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const {
  agendarProcessamentoPendentes,
  sincronizarDisponibilidadeDocumento,
} = require("../services/contasPagar");

defineTrigger("Compra", {
  after: async (document) => {
    await sincronizarDisponibilidadeDocumento(document);
    await agendarProcessamentoPendentes(document);
  },
});
''')

write("backend/src/triggers/configuracoesContasPagar.js", r'''"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const { atualizarDisponibilidadeAcoesManuais } = require("../services/contasPagar");

defineTrigger("ConfiguracaoContasPagar", {
  after: async (configuracao) => {
    await atualizarDisponibilidadeAcoesManuais(configuracao);
  },
});
''')

# Interface: ações manuais condicionadas e reset administrativo.
path = "frontend/central.ui.json"
ui = json.loads(read(path))
compra = next(item for item in ui["collections"] if item.get("model") == "Compra")
conta = next(item for item in ui["collections"] if item.get("model") == "ContaPagarAgrupada")
config = next(item for item in ui["collections"] if item.get("model") == "ConfiguracaoContasPagar")

status_filter = next(item for item in compra["list"]["filters"] if item.get("field") == "statusAprovacao")
if not any(option.get("value") == "Recusada" for option in status_filter["options"]):
    status_filter["options"].append({"label": "Recusada", "value": "Recusada"})

compra["list"]["rowActions"] = [
    {
        "id": "aprovarDocumentoFiscal",
        "type": "apiAction",
        "label": "Aprovar",
        "icon": "check",
        "method": "POST",
        "endpoint": "/api/tazay/contas-pagar/compras/:id/aprovar",
        "confirm": {
            "title": "Aprovar documento fiscal",
            "description": "O documento será aprovado e incluído ou atualizado na conta a pagar agrupada da Central.",
        },
        "hiddenWhen": {"field": "acaoAprovacaoManualDisponivel", "equals": False},
        "disabledWhen": {"field": "statusAprovacao", "in": ["Aprovada", "Recusada"]},
        "refresh": ["self", "all"],
    },
    {
        "id": "recusarDocumentoFiscal",
        "type": "apiAction",
        "label": "Recusar",
        "icon": "close",
        "method": "POST",
        "endpoint": "/api/tazay/contas-pagar/compras/:id/recusar",
        "confirm": {
            "title": "Recusar documento fiscal",
            "description": "O recebimento será excluído no Omie e ficará marcado como cancelado na Central.",
        },
        "hiddenWhen": {"field": "acaoAprovacaoManualDisponivel", "equals": False},
        "disabledWhen": {"field": "statusAprovacao", "in": ["Aprovada", "Recusada"]},
        "refresh": ["self", "all"],
    },
]

dados_compra = compra["detailModal"]["tabs"][0]["groups"]
integracao_compra = next(group for group in dados_compra if group.get("label") == "Integração")
for field in ["recusadaEm", "recusadaPor"]:
    if field not in integracao_compra["fields"]:
        integracao_compra["fields"].append(field)

manual_actions = [
    {
        "id": "enviarContaPagar",
        "type": "apiAction",
        "label": "Enviar para o Omie",
        "icon": "send",
        "method": "POST",
        "endpoint": "/api/tazay/contas-pagar/contas/:id/enviar",
        "confirm": {
            "title": "Enviar conta a pagar",
            "description": "A conta será criada ou atualizada no Omie.",
        },
        "hiddenWhen": {"field": "acoesOmieManuaisDisponiveis", "equals": False},
        "disabledWhen": {"field": "status", "in": ["Paga", "Excluída", "Exclusão pendente"]},
        "refresh": ["self", "all"],
    },
    {
        "id": "verificarPagamento",
        "type": "apiAction",
        "label": "Verificar pagamento",
        "icon": "refresh",
        "method": "POST",
        "endpoint": "/api/tazay/contas-pagar/contas/:id/consultar-pagamento",
        "confirm": {
            "title": "Verificar pagamento",
            "description": "Será criado um ticket para consultar a situação do título no Omie.",
        },
        "hiddenWhen": {"field": "acoesOmieManuaisDisponiveis", "equals": False},
        "disabledWhen": {"field": "status", "in": ["Pendente envio", "Pendente sincronização", "Excluída", "Exclusão pendente"]},
        "refresh": ["self", "all"],
    },
]
conta["list"]["rowActions"] = manual_actions + conta["list"].get("rowActions", [])

config["form"] = [
    {"field": "aprovarCompraAutomatico", "widget": "checkbox"},
    {"field": "enviarContaPagarOmieAutomatico", "widget": "checkbox"},
] + config.get("form", [])
config["list"]["columns"] = [
    "aprovarCompraAutomatico",
    "enviarContaPagarOmieAutomatico",
] + [field for field in config["list"].get("columns", []) if field not in {
    "aprovarCompraAutomatico", "enviarContaPagarOmieAutomatico"
}]
config["list"]["rowActions"].append({
    "id": "resetarBaseDados",
    "type": "apiAction",
    "label": "Resetar base de dados",
    "icon": "trash",
    "method": "POST",
    "endpoint": "/api/tazay/contas-pagar/configuracao/resetar-base",
    "confirm": {
        "title": "Resetar toda a base de dados",
        "description": "Todos os dados da Central serão apagados, incluindo configurações e acessos. A aplicação voltará ao primeiro acesso. Esta ação não pode ser desfeita.",
    },
    "refresh": ["all"],
})
parametros = config["detailModal"]["tabs"][0]["groups"]
automacao = next(group for group in parametros if group.get("label") == "Operação automática")
automacao["description"] = "Habilite cada automação separadamente. Quando desabilitada, a etapa correspondente passa a ser executada pelas ações manuais nas listas."
automacao["fields"] = ["aprovarCompraAutomatico", "enviarContaPagarOmieAutomatico"]
automacao["columns"] = 1

write(path, json.dumps(ui, ensure_ascii=False, indent=2) + "\n")

# Atualiza os contratos de teste do side-car e acrescenta cobertura dos novos fluxos.
path = "backend/test/sidecarAutomatico.test.js"
content = read(path)
content = re.sub(
    r'test\("interface não oferece criação, edição ou ações financeiras manuais", \(\) => \{[\s\S]*?\n\}\);',
    r'''test("interface mantém CRUD bloqueado e oferece ações condicionadas às automações", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const compra = ui.collections.find((item) => item.model === "Compra");
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  assert.deepEqual(compra.list.builtInActions, { create: false, edit: false, delete: false });
  assert.deepEqual(conta.list.builtInActions, { create: false, edit: false, delete: false });
  assert.deepEqual(compra.list.rowActions.map((action) => action.label), ["Aprovar", "Recusar"]);
  assert.match(JSON.stringify(conta.list.rowActions), /Enviar para o Omie/);
  assert.match(JSON.stringify(conta.list.rowActions), /Verificar pagamento/);
  assert.equal(compra.list.rowActions[0].hiddenWhen.field, "acaoAprovacaoManualDisponivel");
  assert.equal(conta.list.rowActions[0].hiddenWhen.field, "acoesOmieManuaisDisponiveis");
});''',
    content,
    count=1,
)
content = re.sub(
    r'test\("exclusão é exibida como ícone acessível e não emoji", \(\) => \{[\s\S]*?\n\}\);',
    r'''test("exclusão continua exibida como ícone acessível e não emoji", () => {
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const conta = ui.collections.find((item) => item.model === "ContaPagarAgrupada");
  const action = conta.list.rowActions.find((item) => item.label === "Excluir conta");
  assert.equal(action.icon, "trash");
  assert.equal(action.iconOnly, true);
  assert.notEqual(action.label, "🗑️");
});''',
    content,
    count=1,
)
content = re.sub(
    r'test\("configuração não permite desligar a automação", \(\) => \{[\s\S]*?\n\}\);',
    r'''test("configuração permite controlar as duas automações sem migração de legado", () => {
  const model = source("../src/models/ConfiguracaoContasPagar.js");
  const config = source("../src/services/contasPagar/configuration.js");
  const reconciliation = source("../src/services/contasPagar/reconciliation.js");
  assert.match(model, /aprovarCompraAutomatico/);
  assert.match(model, /enviarContaPagarOmieAutomatico/);
  assert.match(config, /aprovarCompraAutomatico: true/);
  assert.match(config, /enviarContaPagarOmieAutomatico: true/);
  assert.match(reconciliation, /configuracao\.aprovarCompraAutomatico === true/);
  assert.match(reconciliation, /configuracao\.enviarContaPagarOmieAutomatico === true/);
  assert.doesNotMatch(model, /versaoConfiguracao/);
  assert.doesNotMatch(config, /CONFIGURATION_VERSION|versaoConfiguracao/);
});''',
    content,
    count=1,
)
write(path, content)

write("backend/test/automacoesConfiguraveis.test.js", r'''"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function source(relative) {
  return fs.readFileSync(path.join(__dirname, relative), "utf8");
}

test("aprovação e recusa manuais são protegidas pela configuração", () => {
  const operations = source("../src/services/contasPagar/manualOperations.js");
  const routes = source("../src/routes/contasPagar.js");
  assert.match(operations, /aprovarDocumentoFiscalManual/);
  assert.match(operations, /recusarDocumentoFiscal/);
  assert.match(operations, /aprovarCompraAutomatico === true/);
  assert.match(routes, /compras\/:id\/aprovar/);
  assert.match(routes, /compras\/:id\/recusar/);
});

test("recusa usa ExcluirRecebimento e marca cancelamento após retorno do Omie", () => {
  const operations = source("../src/services/contasPagar/manualOperations.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(mapping, /call: "ExcluirRecebimento"/);
  assert.match(mapping, /TAZAY_RECUSAR_DOCUMENTO_FISCAL_OMIE/);
  assert.match(operations, /tratarCancelamentoDocumento/);
  assert.match(operations, /statusDocumentoOmie: "Cancelado"/);
});

test("envio e verificação de pagamento só operam no modo manual", () => {
  const operations = source("../src/services/contasPagar/manualOperations.js");
  const mapping = source("../src/mappings/omie.js");
  assert.match(operations, /enviarContaPagarManual/);
  assert.match(operations, /consultarPagamentoContaPagar/);
  assert.match(operations, /enviarContaPagarOmieAutomatico === true/);
  assert.match(mapping, /call: "ConsultarContaPagar"/);
  assert.match(mapping, /TAZAY_CONSULTAR_PAGAMENTO_OMIE/);
});

test("reset administrativo apaga a base e volta ao primeiro acesso", () => {
  const operations = source("../src/services/contasPagar/manualOperations.js");
  const routes = source("../src/routes/contasPagar.js");
  const ui = JSON.parse(source("../../frontend/central.ui.json"));
  const config = ui.collections.find((item) => item.model === "ConfiguracaoContasPagar");
  assert.match(operations, /dropDatabase\(\)/);
  assert.match(routes, /configuracao\/resetar-base/);
  assert.match(routes, /roles: \["admin"\]/);
  assert.ok(config.list.rowActions.some((action) => action.label === "Resetar base de dados"));
});
''')
