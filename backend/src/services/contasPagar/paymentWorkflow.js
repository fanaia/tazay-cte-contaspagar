"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_FATURADO, STATUS_ATIVOS } = require("./constants");
const { calcularProximaQuarta } = require("./date");
const {
  obterConfiguracao,
  resolverCategoria,
  resolverContaCorrente,
} = require("./configuration");
const { chaveBase, codigoIntegracao } = require("./payload");
const { models } = require("./runtime");

const STATUS_CONTAS_ABERTAS = ["Pendente envio", "Pendente sincronização", "Aberta", "Pagamento cancelado"];

function erro(message, statusCode = 422, details = {}) {
  return new GenericError(message, { statusCode, retryable: false, details });
}

function normalizarIds(input) {
  const values = Array.isArray(input) ? input : [input];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function validarDataVencimento(value) {
  const data = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw erro("Informe uma data de vencimento válida.", 422, { field: "dataVencimento" });
  }
  return data;
}

function validarDocumentoAprovavel(compra) {
  if (!compra) throw erro("Documento fiscal não encontrado.", 404);
  if (compra.statusAprovacao === "Aprovada") return "ja-aprovado";
  if (
    compra.statusAprovacao !== "Pendente"
    || compra.statusDocumentoOmie !== "Pendente"
    || compra.etapa !== ETAPA_FATURADO
    || compra.recusaOmiePendente === true
  ) {
    throw erro(`O documento ${compra.numeroDocumentoFiscal || compra._id} não pode ser aprovado no estado atual.`, 409);
  }
  return "aprovar";
}

async function aprovarDocumentosLote(input, options = {}) {
  const ids = normalizarIds(input);
  if (!ids.length) throw erro("Selecione ao menos um documento fiscal para aprovar.");
  const { Compra } = models();
  const documentos = await Compra.find({ _id: { $in: ids } });
  if (documentos.length !== ids.length) throw erro("Um ou mais documentos selecionados não foram encontrados.", 404);

  const pendentes = [];
  const jaAprovados = [];
  for (const documento of documentos) {
    const resultado = validarDocumentoAprovavel(documento);
    if (resultado === "aprovar") pendentes.push(documento._id);
    else jaAprovados.push(String(documento._id));
  }

  const now = new Date();
  if (pendentes.length) {
    await Compra.updateMany(
      { _id: { $in: pendentes } },
      {
        $set: {
          statusAprovacao: "Aprovada",
          aprovadaEm: now,
          aprovadaPor: String(options.usuario || "Usuário"),
          acaoAprovacaoManualDisponivel: false,
          statusIntegracao: "Sincronizado",
          ultimoErro: "",
        },
      },
      { runValidators: true },
    );
  }

  return {
    selecionados: ids.length,
    aprovados: pendentes.length,
    jaAprovados,
    ids: ids.map(String),
  };
}

function validarDocumentosParaPagamento(documentos, ids) {
  if (documentos.length !== ids.length) throw erro("Um ou mais documentos selecionados não foram encontrados.", 404);
  const primeiro = documentos[0];
  for (const documento of documentos) {
    if (documento.statusAprovacao !== "Aprovada") {
      throw erro(`O documento ${documento.numeroDocumentoFiscal || documento._id} ainda não foi aprovado.`, 409);
    }
    if (documento.etapa !== ETAPA_FATURADO || documento.statusDocumentoOmie !== "Pendente") {
      throw erro(`O documento ${documento.numeroDocumentoFiscal || documento._id} não está disponível para geração de pagamento.`, 409);
    }
    if (documento.contaPagarId) {
      throw erro(`O documento ${documento.numeroDocumentoFiscal || documento._id} já pertence a um contas a pagar.`, 409);
    }
    if (
      documento.instanceId !== primeiro.instanceId
      || Number(documento.codigoFornecedorOmie) !== Number(primeiro.codigoFornecedorOmie)
      || documento.tipoDocumentoFiscal !== primeiro.tipoDocumentoFiscal
    ) {
      throw erro("Os documentos selecionados precisam pertencer à mesma instância, fornecedor e tipo fiscal.", 409);
    }
  }
  return primeiro;
}

async function carregarDocumentosParaPagamento(input) {
  const ids = normalizarIds(input);
  if (!ids.length) throw erro("Selecione ao menos um documento fiscal aprovado.");
  const { Compra } = models();
  const documentos = await Compra.find({ _id: { $in: ids } }).sort({ numeroDocumentoFiscal: 1 });
  const primeiro = validarDocumentosParaPagamento(documentos, ids);
  return { ids, documentos, primeiro };
}

async function listarContasAbertasCompativeis(documento) {
  const { ContaPagarAgrupada } = models();
  return ContaPagarAgrupada.find({
    instanceId: documento.instanceId,
    codigoFornecedorOmie: Number(documento.codigoFornecedorOmie),
    tipoDocumentoFiscal: documento.tipoDocumentoFiscal,
    status: { $in: STATUS_CONTAS_ABERTAS },
  }).sort({ dataVencimento: 1, createdAt: -1 }).lean();
}

async function listarOpcoesFinanceiras() {
  const { CategoriaOmie, ContaCorrenteOmie } = models();
  const [categorias, contasCorrentes, configuracao] = await Promise.all([
    CategoriaOmie ? CategoriaOmie.find({ status: { $ne: "Inativo" } }).sort({ nome: 1 }).lean() : [],
    ContaCorrenteOmie ? ContaCorrenteOmie.find({ status: { $ne: "Inativo" } }).sort({ nome: 1 }).lean() : [],
    obterConfiguracao({ create: true }),
  ]);
  return { categorias, contasCorrentes, configuracao };
}

async function obterContextoGeracaoPagamento(input, options = {}) {
  const { documentos, primeiro } = await carregarDocumentosParaPagamento(input);
  const [contasAbertas, opcoes] = await Promise.all([
    listarContasAbertasCompativeis(primeiro),
    listarOpcoesFinanceiras(),
  ]);
  const vencimentos = documentos.map((item) => String(item.dataVencimento || "")).filter(Boolean).sort();
  const dataVencimento = vencimentos.at(-1)
    || calcularProximaQuarta(primeiro.entradaFaturadoEm || new Date(), options.timeZone);
  const valorTotal = Number(documentos.reduce((total, item) => total + Number(item.valorFaturado || 0), 0).toFixed(2));

  return {
    fornecedor: {
      codigo: Number(primeiro.codigoFornecedorOmie),
      nome: primeiro.nomeFornecedor || "",
      tipoDocumentoFiscal: primeiro.tipoDocumentoFiscal,
    },
    documentos: documentos.map((item) => ({
      _id: String(item._id),
      numeroDocumentoFiscal: item.numeroDocumentoFiscal,
      tipoDocumentoFiscal: item.tipoDocumentoFiscal,
      valorFaturado: Number(item.valorFaturado || 0),
      dataVencimento: item.dataVencimento || "",
    })),
    valorTotal,
    dataVencimento,
    contasAbertas: contasAbertas.map((conta) => ({
      _id: String(conta._id),
      codigoLancamentoOmie: Number(conta.codigoLancamentoOmie || 0),
      codigoLancamentoIntegracao: conta.codigoLancamentoIntegracao,
      dataVencimento: conta.dataVencimento,
      valorTotal: Number(conta.valorTotal || 0),
      quantidadeCompras: Number(conta.quantidadeCompras || 0),
      status: conta.status,
      categoriaOmieId: conta.categoriaOmieId ? String(conta.categoriaOmieId) : "",
      contaCorrenteOmieId: conta.contaCorrenteOmieId ? String(conta.contaCorrenteOmieId) : "",
    })),
    categorias: opcoes.categorias.map((item) => ({
      _id: String(item._id),
      codigo: item.codigoCategoriaOmie,
      nome: item.nome || item.descricao || item.codigoCategoriaOmie,
    })),
    contasCorrentes: opcoes.contasCorrentes.map((item) => ({
      _id: String(item._id),
      codigo: Number(item.codigoContaCorrenteOmie || 0),
      nome: item.nome || String(item.codigoContaCorrenteOmie || ""),
    })),
    defaults: {
      categoriaId: opcoes.configuracao.categoriaPadraoId ? String(opcoes.configuracao.categoriaPadraoId) : "",
      contaCorrenteId: opcoes.configuracao.contaCorrentePadraoId ? String(opcoes.configuracao.contaCorrentePadraoId) : "",
      dataVencimento,
    },
  };
}

async function criarNovaConta(documento, configuracao, dataVencimento) {
  const { ContaPagarAgrupada } = models();
  const baseKey = chaveBase(documento);
  const latest = await ContaPagarAgrupada.findOne({
    instanceId: documento.instanceId,
    codigoFornecedorOmie: documento.codigoFornecedorOmie,
    tipoDocumentoFiscal: documento.tipoDocumentoFiscal,
  }).sort({ geracao: -1 }).lean();
  const geracao = Number(latest?.geracao || 0) + 1;

  // A chave ativa indica apenas o destino preferencial para automações futuras.
  // Contas abertas anteriores permanecem independentes e selecionáveis pelo usuário.
  await ContaPagarAgrupada.updateMany({ chaveAtiva: baseKey }, { $unset: { chaveAtiva: 1 } });
  return ContaPagarAgrupada.create({
    chaveAgrupamento: `${baseKey}|g${geracao}`,
    chaveAtiva: baseKey,
    instanceId: documento.instanceId,
    codigoFornecedorOmie: Number(documento.codigoFornecedorOmie),
    nomeFornecedor: documento.nomeFornecedor,
    tipoDocumentoFiscal: documento.tipoDocumentoFiscal,
    dataVencimento,
    geracao,
    codigoLancamentoIntegracao: codigoIntegracao(baseKey, geracao),
    status: "Pendente envio",
    statusEnvioOmie: "Não enviado",
    statusPagamentoOmie: "Não consultado",
    revisao: 0,
    quantidadeCompras: 0,
    valorTotal: 0,
    acaoSincronizacaoManualDisponivel: configuracao.enviarContaPagarOmieAutomatico !== true,
  });
}

async function aplicarParametrosConta(conta, input = {}) {
  const { ContaPagarAgrupada } = models();
  const set = { dataVencimento: validarDataVencimento(input.dataVencimento) };
  if (input.categoriaId) {
    const categoria = await resolverCategoria(input.categoriaId);
    set.categoriaOmieId = categoria.id;
    set.codigoCategoriaOmie = categoria.codigo;
    set.nomeCategoriaOmie = categoria.nome;
  }
  if (input.contaCorrenteId) {
    const contaCorrente = await resolverContaCorrente(input.contaCorrenteId);
    set.contaCorrenteOmieId = contaCorrente.id;
    set.codigoContaCorrenteOmie = contaCorrente.codigo;
    set.nomeContaCorrenteOmie = contaCorrente.nome;
  }
  return ContaPagarAgrupada.findByIdAndUpdate(conta._id, { $set: set }, { new: true, runValidators: true });
}

async function gerarPagamentoDocumentos(input = {}, options = {}) {
  const { documentos, primeiro } = await carregarDocumentosParaPagamento(input.ids);
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const dataVencimento = validarDataVencimento(input.dataVencimento);
  const { Compra, ContaPagarAgrupada } = models();

  let conta;
  if (input.contaPagarId) {
    conta = await ContaPagarAgrupada.findById(input.contaPagarId);
    if (!conta || !STATUS_CONTAS_ABERTAS.includes(conta.status)) {
      throw erro("O contas a pagar selecionado não está mais disponível.", 409);
    }
    if (
      conta.instanceId !== primeiro.instanceId
      || Number(conta.codigoFornecedorOmie) !== Number(primeiro.codigoFornecedorOmie)
      || conta.tipoDocumentoFiscal !== primeiro.tipoDocumentoFiscal
    ) {
      throw erro("O contas a pagar selecionado não é compatível com os documentos.", 409);
    }
  } else {
    conta = await criarNovaConta(primeiro, configuracao, dataVencimento);
  }

  conta = await aplicarParametrosConta(conta, input);
  const ids = documentos.map((documento) => documento._id);
  const update = await Compra.updateMany(
    {
      _id: { $in: ids },
      statusAprovacao: "Aprovada",
      contaPagarId: { $exists: false },
    },
    {
      $set: {
        contaPagarId: conta._id,
        dataVencimento,
        statusIntegracao: "Pendente",
        ultimoErro: "",
      },
    },
    { runValidators: true },
  );
  if (Number(update.modifiedCount || 0) !== ids.length) {
    if (!input.contaPagarId && Number(conta.quantidadeCompras || 0) === 0) {
      await ContaPagarAgrupada.findByIdAndDelete(conta._id).catch(() => undefined);
    }
    throw erro("Os documentos foram alterados por outra operação. Atualize a lista e tente novamente.", 409);
  }

  const { recalcularConta, enviarContaParaOmie } = require("./reconciliation");
  const recalculada = await recalcularConta(conta._id);
  let envio = null;
  if (configuracao.enviarContaPagarOmieAutomatico === true) {
    envio = await enviarContaParaOmie(conta._id, { configuracao });
  } else {
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { acaoSincronizacaoManualDisponivel: true },
    });
  }

  return {
    contaId: String(conta._id),
    documentosIncluidos: ids.length,
    valorTotal: recalculada.valorTotal,
    quantidadeCompras: recalculada.quantidadeCompras,
    dataVencimento,
    contaExistente: Boolean(input.contaPagarId),
    envio,
  };
}

async function listarDocumentosConta(contaId) {
  const { Compra, ContaPagarAgrupada } = models();
  const conta = await ContaPagarAgrupada.findById(contaId).lean();
  if (!conta) throw erro("Conta a pagar não encontrada.", 404);
  const documentos = await Compra.find({ contaPagarId: conta._id })
    .sort({ numeroDocumentoFiscal: 1 })
    .select("numeroDocumentoFiscal tipoDocumentoFiscal nomeFornecedor valorFaturado statusAprovacao statusDocumentoOmie etapa statusIntegracao dataVencimento")
    .lean();
  return { conta, documentos };
}

async function listarContasPagarOperacionais(query = {}) {
  const { ContaPagarAgrupada } = models();
  const pageIndex = Math.max(0, Number(query.pageIndex || 0));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
  const filtro = {};
  const searchTerm = String(query.searchTerm || "").trim();
  if (searchTerm) {
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");
    filtro.$or = [{ nomeFornecedor: rx }, { codigoLancamentoIntegracao: rx }, { status: rx }];
  }
  const [results, totalItems] = await Promise.all([
    ContaPagarAgrupada.find(filtro).sort({ createdAt: -1 }).skip(pageIndex * pageSize).limit(pageSize).lean(),
    ContaPagarAgrupada.countDocuments(filtro),
  ]);
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

async function removerDocumentoDaConta(contaId, compraId, options = {}) {
  const { Compra, ContaPagarAgrupada } = models();
  const [conta, documento] = await Promise.all([
    ContaPagarAgrupada.findById(contaId),
    Compra.findById(compraId),
  ]);
  if (!conta) throw erro("Conta a pagar não encontrada.", 404);
  if (!documento || String(documento.contaPagarId || "") !== String(conta._id)) {
    throw erro("O documento fiscal não pertence a este contas a pagar.", 404);
  }
  if (conta.status === "Paga" || conta.statusPagamentoOmie === "Pago") {
    throw erro("Não é possível retirar documentos de uma conta já paga.", 409);
  }

  await Compra.findByIdAndUpdate(documento._id, {
    $set: {
      statusAprovacao: "Aprovada",
      etapa: ETAPA_FATURADO,
      statusIntegracao: "Sincronizado",
      ultimoErro: "",
    },
    $unset: { contaPagarId: 1 },
  }, { runValidators: true });

  const restantes = await Compra.countDocuments({ contaPagarId: conta._id });
  if (!restantes) {
    const { contaFoiSincronizada } = require("./reconciliation");
    if (!contaFoiSincronizada(conta)) {
      await ContaPagarAgrupada.findByIdAndDelete(conta._id);
      return { contaId: String(conta._id), compraId: String(documento._id), contaExcluida: true, documentosRestantes: 0 };
    }
    const { solicitarExclusaoContaOmie } = require("./sidecar");
    const exclusao = await solicitarExclusaoContaOmie(conta._id, {
      motivo: "Último documento removido manualmente do pagamento na Central.",
      regenerar: false,
    });
    return { contaId: String(conta._id), compraId: String(documento._id), contaExcluida: true, documentosRestantes: 0, exclusao };
  }

  const { recalcularConta, enviarContaParaOmie } = require("./reconciliation");
  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const recalculada = await recalcularConta(conta._id);
  let envio = null;
  if (configuracao.enviarContaPagarOmieAutomatico === true) {
    envio = await enviarContaParaOmie(conta._id, { configuracao });
  } else {
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { acaoSincronizacaoManualDisponivel: true },
    });
  }
  return {
    contaId: String(conta._id),
    compraId: String(documento._id),
    documentosRestantes: restantes,
    valorTotal: recalculada.valorTotal,
    envio,
  };
}

module.exports = {
  STATUS_CONTAS_ABERTAS,
  aprovarDocumentosLote,
  gerarPagamentoDocumentos,
  listarContasAbertasCompativeis,
  listarContasPagarOperacionais,
  listarDocumentosConta,
  obterContextoGeracaoPagamento,
  removerDocumentoDaConta,
};
