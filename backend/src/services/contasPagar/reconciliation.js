"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { ETAPA_FATURADO, STATUS_ATIVOS } = require("./constants");
const { calcularProximaQuarta } = require("./date");
const {
  obterConfiguracao,
  resolverCategoria,
  resolverContaCorrente,
  resolverParametrosFinanceiros,
} = require("./configuration");
const { chaveBase, codigoIntegracao, montarPayloadContaPagar } = require("./payload");
const { core, models } = require("./runtime");

function id(value) {
  return String(value?._id || value || "");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function contaFoiSincronizada(conta = {}) {
  return Number(conta.codigoLancamentoOmie || 0) > 0
    || Number(conta.revisao || 0) > 0
    || conta.statusEnvioOmie === "Enviado"
    || ["Pendente sincronização", "Aberta", "Paga", "Pagamento cancelado"].includes(conta.status);
}

function selecionarOperacaoContaPagar(conta = {}) {
  const existenteNoOmie = Number(conta.codigoLancamentoOmie || 0) > 0
    || Number(conta.revisao || 0) > 0;
  return existenteNoOmie
    ? {
      call: "alterar-conta-pagar",
      operation: "update",
      metodo: "AlterarContaPagar",
    }
    : {
      call: "incluir-conta-pagar",
      operation: "create",
      metodo: "IncluirContaPagar",
    };
}

function montarDadosAprovacao(compra, parametros = {}, options = {}) {
  const set = {
    statusAprovacao: "Aprovada",
    aprovadaEm: compra.aprovadaEm || new Date(),
    aprovadaPor: options.usuario || compra.aprovadaPor || (options.automatico ? "Automático" : "Usuário"),
    statusIntegracao: "Pendente",
    acaoAprovacaoManualDisponivel: false,
    ultimoErro: "",
  };
  if (parametros.categoria?.codigo) {
    set.categoriaFinanceiraId = parametros.categoria.id;
    set.codigoCategoriaFinanceiraOmie = parametros.categoria.codigo;
    set.nomeCategoriaFinanceira = parametros.categoria.nome;
  }
  if (parametros.contaCorrente?.codigo > 0) {
    set.contaCorrenteFinanceiraId = parametros.contaCorrente.id;
    set.codigoContaCorrenteFinanceiraOmie = parametros.contaCorrente.codigo;
    set.nomeContaCorrenteFinanceira = parametros.contaCorrente.nome;
  }
  return set;
}

async function aplicarAprovacao(compra, options = {}, configuracao) {
  const { Compra } = models();
  const parametros = await resolverParametrosFinanceiros({
    categoriaId: options.categoriaId || compra.categoriaFinanceiraId,
    contaCorrenteId: options.contaCorrenteId || compra.contaCorrenteFinanceiraId,
  }, { configuracao, obrigatorios: false });
  return Compra.findByIdAndUpdate(
    compra._id,
    { $set: montarDadosAprovacao(compra, parametros, options) },
    { new: true, runValidators: true },
  );
}

async function consolidarFornecedor(instanceId, codigoFornecedorOmie, tipoDocumentoFiscal) {
  const { Compra, ContaPagarAgrupada } = models();
  const contas = await ContaPagarAgrupada.find({
    instanceId,
    codigoFornecedorOmie,
    tipoDocumentoFiscal,
    status: { $in: STATUS_ATIVOS },
  }).sort({ codigoLancamentoOmie: -1, revisao: -1, dataVencimento: -1, updatedAt: -1 });
  if (!contas.length) return null;

  const sincronizada = contas.find((conta) => contaFoiSincronizada(conta));
  const canonical = sincronizada || contas[0];
  const duplicadasLocais = contas.filter((conta) => (
    String(conta._id) !== String(canonical._id) && !contaFoiSincronizada(conta)
  ));
  const historicasSincronizadas = contas.filter((conta) => (
    String(conta._id) !== String(canonical._id) && contaFoiSincronizada(conta)
  ));

  if (duplicadasLocais.length) {
    const ids = duplicadasLocais.map((conta) => conta._id);
    await Compra.updateMany(
      { contaPagarId: { $in: ids } },
      { $set: { contaPagarId: canonical._id, statusIntegracao: "Pendente", ultimoErro: "" } },
    );
    await ContaPagarAgrupada.deleteMany({ _id: { $in: ids } });
  }
  if (historicasSincronizadas.length) {
    await ContaPagarAgrupada.updateMany(
      { _id: { $in: historicasSincronizadas.map((conta) => conta._id) } },
      { $unset: { chaveAtiva: 1 } },
    );
  }

  const baseKey = chaveBase({ instanceId, codigoFornecedorOmie, tipoDocumentoFiscal });
  await ContaPagarAgrupada.updateMany(
    { _id: { $ne: canonical._id }, chaveAtiva: baseKey },
    { $unset: { chaveAtiva: 1 } },
  );
  await ContaPagarAgrupada.findByIdAndUpdate(canonical._id, {
    $set: { chaveAtiva: baseKey },
  });
  if (duplicadasLocais.length) await recalcularConta(canonical._id);
  return ContaPagarAgrupada.findById(canonical._id);
}

async function obterOuCriarContaAtiva(compra, configuracao = {}) {
  const { ContaPagarAgrupada } = models();
  const baseKey = chaveBase(compra);
  const consolidada = await consolidarFornecedor(
    compra.instanceId,
    compra.codigoFornecedorOmie,
    compra.tipoDocumentoFiscal,
  );
  if (consolidada) {
    return ContaPagarAgrupada.findByIdAndUpdate(
      consolidada._id,
      { $set: { acaoSincronizacaoManualDisponivel: configuracao.enviarContaPagarOmieAutomatico !== true } },
      { new: true, runValidators: true },
    );
  }

  const latest = await ContaPagarAgrupada.findOne({
    instanceId: compra.instanceId,
    codigoFornecedorOmie: compra.codigoFornecedorOmie,
    tipoDocumentoFiscal: compra.tipoDocumentoFiscal,
  }).sort({ geracao: -1 }).lean();
  const generation = Number(latest?.geracao || 0) + 1;
  try {
    return await ContaPagarAgrupada.create({
      chaveAgrupamento: `${baseKey}|g${generation}`,
      chaveAtiva: baseKey,
      instanceId: compra.instanceId,
      codigoFornecedorOmie: compra.codigoFornecedorOmie,
      nomeFornecedor: compra.nomeFornecedor,
      tipoDocumentoFiscal: compra.tipoDocumentoFiscal,
      dataVencimento: compra.dataVencimento,
      geracao: generation,
      codigoLancamentoIntegracao: codigoIntegracao(baseKey, generation),
      status: "Pendente envio",
      statusEnvioOmie: "Não enviado",
      revisao: 0,
      quantidadeCompras: 0,
      valorTotal: 0,
      acaoSincronizacaoManualDisponivel: configuracao.enviarContaPagarOmieAutomatico !== true,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const conta = await ContaPagarAgrupada.findOne({ chaveAtiva: baseKey });
    if (!conta) throw error;
    return conta;
  }
}

async function recalcularConta(contaId) {
  const { Compra, ContaPagarAgrupada } = models();
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta || !STATUS_ATIVOS.includes(conta.status)) return { ignored: true, reason: "conta-inativa" };
  const compras = await Compra.find({
    contaPagarId: conta._id,
    etapa: ETAPA_FATURADO,
    statusAprovacao: "Aprovada",
  }).sort({ codigoPedidoOmie: 1 }).lean();
  if (!compras.length) return { ignored: true, reason: "sem-compras-aprovadas" };

  const valorTotal = Number(compras.reduce(
    (total, compra) => total + Number(compra.valorFaturado || 0),
    0,
  ).toFixed(2));
  const categorias = unique(compras.map((compra) => compra.codigoCategoriaFinanceiraOmie));
  const categoriaIds = unique(compras.map((compra) => id(compra.categoriaFinanceiraId)));
  const categoriaNomes = unique(compras.map((compra) => compra.nomeCategoriaFinanceira));
  const contas = unique(compras.map((compra) => Number(compra.codigoContaCorrenteFinanceiraOmie || 0)).filter(Boolean));
  const contaIds = unique(compras.map((compra) => id(compra.contaCorrenteFinanceiraId)));
  const contaNomes = unique(compras.map((compra) => compra.nomeContaCorrenteFinanceira));

  const vencimentos = compras.map((compra) => String(compra.dataVencimento || "")).filter(Boolean).sort();
  const set = {
    quantidadeCompras: compras.length,
    valorTotal,
    dataVencimento: vencimentos.at(-1) || conta.dataVencimento,
    status: "Pendente envio",
    statusEnvioOmie: contaFoiSincronizada(conta) ? "Pendente" : "Não enviado",
    ultimoErro: "",
  };
  if (!conta.codigoCategoriaOmie && categorias.length === 1) {
    set.codigoCategoriaOmie = categorias[0];
    set.nomeCategoriaOmie = categoriaNomes[0] || categorias[0];
    if (categoriaIds.length === 1) set.categoriaOmieId = categoriaIds[0];
  }
  if (!conta.codigoContaCorrenteOmie && contas.length === 1) {
    set.codigoContaCorrenteOmie = contas[0];
    set.nomeContaCorrenteOmie = contaNomes[0] || String(contas[0]);
    if (contaIds.length === 1) set.contaCorrenteOmieId = contaIds[0];
  }
  const updated = await ContaPagarAgrupada.findByIdAndUpdate(
    conta._id,
    { $set: set },
    { new: true, runValidators: true },
  );
  await Compra.updateMany(
    { _id: { $in: compras.map((compra) => compra._id) } },
    { $set: { statusIntegracao: "Pendente", ultimoErro: "" } },
  );
  return {
    contaId: String(updated._id),
    quantidadeCompras: updated.quantidadeCompras,
    valorTotal: updated.valorTotal,
    status: updated.status,
  };
}

function erroValidacaoEnvio(error) {
  if (error instanceof GenericError) return error;
  return new GenericError(String(error?.message || error), {
    statusCode: 422,
    details: { operation: "enviar-conta-pagar" },
  });
}

async function enviarContaParaOmie(contaOrId, options = {}) {
  const { Compra, ContaPagarAgrupada } = models();
  let conta = typeof contaOrId === "object" && contaOrId?._id
    ? await ContaPagarAgrupada.findById(contaOrId._id)
    : await ContaPagarAgrupada.findById(contaOrId);
  if (!conta) return { ignored: true, reason: "conta-nao-encontrada" };
  if (!STATUS_ATIVOS.includes(conta.status)) return { ignored: true, reason: "conta-inativa" };

  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const categoryId = options.categoriaId || conta.categoriaOmieId || configuracao.categoriaPadraoId;
  const currentAccountId = options.contaCorrenteId || conta.contaCorrenteOmieId || configuracao.contaCorrentePadraoId;
  const set = {};
  const unset = {};
  if (categoryId) {
    const categoria = await resolverCategoria(categoryId);
    set.categoriaOmieId = categoria.id;
    set.codigoCategoriaOmie = categoria.codigo;
    set.nomeCategoriaOmie = categoria.nome;
  } else {
    unset.categoriaOmieId = 1;
    unset.codigoCategoriaOmie = 1;
    unset.nomeCategoriaOmie = 1;
  }
  if (currentAccountId) {
    const contaCorrente = await resolverContaCorrente(currentAccountId);
    set.contaCorrenteOmieId = contaCorrente.id;
    set.codigoContaCorrenteOmie = contaCorrente.codigo;
    set.nomeContaCorrenteOmie = contaCorrente.nome;
  } else {
    unset.contaCorrenteOmieId = 1;
    unset.codigoContaCorrenteOmie = 1;
    unset.nomeContaCorrenteOmie = 1;
  }
  if (Object.keys(set).length || Object.keys(unset).length) {
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    conta = await ContaPagarAgrupada.findByIdAndUpdate(
      conta._id,
      update,
      { new: true, runValidators: true },
    );
  }

  const compras = await Compra.find({
    contaPagarId: conta._id,
    etapa: ETAPA_FATURADO,
    statusAprovacao: "Aprovada",
  }).sort({ codigoPedidoOmie: 1 }).lean();

  let payload;
  try {
    payload = montarPayloadContaPagar(conta.toObject(), compras);
  } catch (error) {
    throw erroValidacaoEnvio(error);
  }

  const operacaoOmie = selecionarOperacaoContaPagar(conta);
  try {
    const updated = await ContaPagarAgrupada.findByIdAndUpdate(
      conta._id,
      {
        $set: {
          quantidadeCompras: compras.length,
          valorTotal: payload.valor_documento,
          status: "Pendente sincronização",
          statusEnvioOmie: "Pendente",
          ultimoErro: "",
        },
        $inc: { revisao: 1 },
      },
      { new: true, runValidators: true },
    );
    const { enqueueIntegration } = core();
    const ticket = await enqueueIntegration({
      provider: "omie",
      handler: "TAZAY_ENVIAR_CONTA_PAGAR_OMIE",
      resource: "contas-pagar-agrupadas",
      operation: operacaoOmie.operation,
      aggregateType: "ContaPagarAgrupada",
      aggregateId: String(updated._id),
      idempotencyKey: `tazay:conta-pagar:${updated._id}:${operacaoOmie.operation}:r${updated.revisao}`,
      payload: {
        contaId: String(updated._id),
        call: operacaoOmie.call,
        metodoOmie: operacaoOmie.metodo,
        param: [payload],
      },
    });
    return {
      contaId: String(updated._id),
      revisao: updated.revisao,
      ticketId: String(ticket?._id || ""),
      metodoOmie: operacaoOmie.metodo,
      payload,
    };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, {
      $set: { status: "Erro", statusEnvioOmie: "Erro", ultimoErro: message },
    });
    await Compra.updateMany(
      { contaPagarId: conta._id, etapa: ETAPA_FATURADO },
      { $set: { statusIntegracao: "Erro", ultimoErro: message } },
    );
    throw error;
  }
}

async function reconciliarCompra(compraOrId, options = {}) {
  const { Compra } = models();
  let compra = typeof compraOrId === "object" && compraOrId?._id
    ? await Compra.findById(compraOrId._id)
    : await Compra.findById(compraOrId);
  if (!compra) return { ignored: true, reason: "compra-nao-encontrada" };
  if (compra.etapa !== ETAPA_FATURADO) return { ignored: true, reason: "etapa-nao-elegivel" };
  if (!(Number(compra.codigoFornecedorOmie) > 0)) throw new Error(`Compra ${compra.codigoPedidoOmie} sem fornecedor Omie.`);
  if (!(Number(compra.valorFaturado) > 0)) throw new Error(`Documento ${compra.numeroDocumentoFiscal} sem valor faturado válido.`);
  if (!["NF-e", "CT-e"].includes(compra.tipoDocumentoFiscal)) {
    return { ignored: true, reason: "tipo-documento-nao-suportado", compraId: String(compra._id) };
  }

  const configuracao = options.configuracao || await obterConfiguracao({ create: true });
  const automaticApproval = configuracao.aprovarCompraAutomatico === true;
  const alreadyApproved = compra.statusAprovacao === "Aprovada";
  if (!alreadyApproved) {
    if (!options.forceApproval && !automaticApproval) {
      return { ignored: true, reason: "aguardando-aprovacao", compraId: String(compra._id) };
    }
    compra = await aplicarAprovacao(compra, {
      ...options,
      automatico: !options.forceApproval,
    }, configuracao);
  } else if (!compra.codigoCategoriaFinanceiraOmie || !compra.codigoContaCorrenteFinanceiraOmie) {
    compra = await aplicarAprovacao(compra, options, configuracao);
  }

  const entrada = compra.entradaFaturadoEm || options.now || new Date();
  compra.entradaFaturadoEm = entrada;
  compra.dataVencimento = compra.dataVencimento || calcularProximaQuarta(entrada, options.timeZone);
  const conta = await obterOuCriarContaAtiva(compra, configuracao);
  const previousAccountId = compra.contaPagarId ? String(compra.contaPagarId) : "";
  const sameAccount = previousAccountId && previousAccountId === String(conta._id);
  await Compra.findByIdAndUpdate(compra._id, {
    $set: {
      entradaFaturadoEm: entrada,
      dataVencimento: compra.dataVencimento,
      contaPagarId: conta._id,
      statusIntegracao: "Pendente",
      ultimoErro: "",
    },
  }, { runValidators: true });

  if (options.deferRecalculate) {
    return {
      deferred: true,
      contaId: String(conta._id),
      previousAccountId: previousAccountId && !sameAccount ? previousAccountId : "",
      compraId: String(compra._id),
    };
  }

  const recalculated = await recalcularConta(conta._id);
  if (previousAccountId && !sameAccount) {
    await recalcularConta(previousAccountId).catch(() => undefined);
  }
  if (alreadyApproved && sameAccount && !options.forceSend) {
    return {
      ...recalculated,
      compraId: String(compra._id),
      approved: true,
      idempotent: true,
    };
  }

  const shouldSend = options.forceSend || configuracao.enviarContaPagarOmieAutomatico === true;
  if (!shouldSend) {
    return {
      ...recalculated,
      contaId: String(conta._id),
      status: "Pendente envio",
      compraId: String(compra._id),
      approved: true,
    };
  }

  try {
    const sent = await enviarContaParaOmie(conta._id, { configuracao });
    return { ...recalculated, ...sent, compraId: String(compra._id), approved: true };
  } catch (error) {
    if (!options.forceSend && Number(error?.statusCode || 0) === 422) {
      return {
        ...recalculated,
        contaId: String(conta._id),
        status: "Pendente envio",
        compraId: String(compra._id),
        approved: true,
        warning: error.message,
      };
    }
    throw error;
  }
}

async function resetarDocumentosConta(contaId) {
  const { Compra } = models();
  const now = new Date();
  const result = await Compra.updateMany(
    { contaPagarId: contaId },
    {
      $set: {
        etapa: ETAPA_FATURADO,
        statusAprovacao: "Pendente",
        statusConclusaoOmie: "Não enviado",
        statusIntegracao: "Sincronizado",
        ultimaSincronizacaoEm: now,
        ultimoErro: "",
      },
      $unset: {
        contaPagarId: 1,
        dataVencimento: 1,
        aprovadaEm: 1,
        aprovadaPor: 1,
        categoriaFinanceiraId: 1,
        codigoCategoriaFinanceiraOmie: 1,
        nomeCategoriaFinanceira: 1,
        contaCorrenteFinanceiraId: 1,
        codigoContaCorrenteFinanceiraOmie: 1,
        nomeContaCorrenteFinanceira: 1,
        concluidaNoOmieEm: 1,
      },
    },
  );
  return Number(result.modifiedCount || 0);
}

async function excluirContaLocal(contaId) {
  const { ContaPagarAgrupada } = models();
  const conta = await ContaPagarAgrupada.findById(contaId);
  if (!conta) {
    throw new GenericError("Conta a pagar não encontrada.", { statusCode: 404 });
  }
  if (conta.status !== "Excluída" && contaFoiSincronizada(conta)) {
    throw new GenericError(
      "Esta conta já foi sincronizada. Exclua primeiro o título no Omie e aguarde a confirmação na Central.",
      { statusCode: 409, details: { field: "statusEnvioOmie", message: "Exclusão bloqueada até a remoção no Omie." } },
    );
  }
  const documentosRestaurados = await resetarDocumentosConta(conta._id);
  await ContaPagarAgrupada.findByIdAndDelete(conta._id);
  return { contaId: String(conta._id), documentosRestaurados, deleted: true };
}

async function consolidarContasAtivasPorFornecedor(options = {}) {
  const { ContaPagarAgrupada } = models();
  const limit = Math.max(1, Number(options.limit || 100));
  const contas = await ContaPagarAgrupada.find({ status: { $in: STATUS_ATIVOS } })
    .select("instanceId codigoFornecedorOmie tipoDocumentoFiscal")
    .sort({ updatedAt: 1 })
    .limit(limit * 10)
    .lean();
  const grupos = unique(contas.map((conta) => (
    `${conta.instanceId}|${conta.codigoFornecedorOmie}|${conta.tipoDocumentoFiscal}`
  ))).slice(0, limit);
  const summary = { fornecedores: grupos.length, consolidados: 0, errors: [] };
  for (const grupo of grupos) {
    const [instanceId, fornecedor, tipoDocumentoFiscal] = grupo.split("|");
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
      });
      if (after < before) summary.consolidados += before - after;
    } catch (error) {
      summary.errors.push({ grupo, message: String(error?.message || error) });
    }
  }
  return summary;
}

async function aprovarCompra(compraId, options = {}) {
  return reconciliarCompra(compraId, { ...options, forceApproval: true });
}

async function reconciliarPendentes(options = {}) {
  const { Compra } = models();
  const configuracao = await obterConfiguracao({ create: true });
  const query = {
    etapa: ETAPA_FATURADO,
    statusDocumentoOmie: "Pendente",
    $or: [
      { statusAprovacao: { $ne: "Aprovada" } },
      { contaPagarId: { $exists: false } },
      { statusIntegracao: { $in: ["Não sincronizado", "Pendente", "Erro"] } },
    ],
  };
  if (options.instanceId) query.instanceId = String(options.instanceId);
  const compras = await Compra.find(query)
    .sort({ codigoFornecedorOmie: 1, tipoDocumentoFiscal: 1, codigoPedidoOmie: 1 })
    .lean();
  const summary = {
    total: compras.length,
    processed: 0,
    awaitingApproval: 0,
    ignored: 0,
    accountsGenerated: 0,
    accountsQueued: 0,
    errors: [],
  };
  const accounts = new Set();
  for (const compra of compras) {
    try {
      const result = await reconciliarCompra(compra._id, {
        ...options,
        configuracao,
        deferRecalculate: true,
      });
      if (result.reason === "aguardando-aprovacao") summary.awaitingApproval += 1;
      else if (result.ignored) summary.ignored += 1;
      else {
        summary.processed += 1;
        if (result.contaId) accounts.add(result.contaId);
        if (result.previousAccountId) accounts.add(result.previousAccountId);
      }
    } catch (error) {
      summary.errors.push({ compraId: String(compra._id), message: String(error?.message || error) });
    }
  }
  for (const contaId of accounts) {
    try {
      const recalculated = await recalcularConta(contaId);
      if (recalculated.ignored) continue;
      summary.accountsGenerated += 1;
      if (configuracao.enviarContaPagarOmieAutomatico === true) {
        try {
          const sent = await enviarContaParaOmie(contaId, { configuracao });
          if (!sent.ignored) summary.accountsQueued += 1;
        } catch (error) {
          if (Number(error?.statusCode || 0) !== 422) throw error;
        }
      } else {
        const { ContaPagarAgrupada } = models();
        await ContaPagarAgrupada.findByIdAndUpdate(contaId, {
          $set: { acaoSincronizacaoManualDisponivel: true },
        });
      }
    } catch (error) {
      summary.errors.push({ contaId, message: String(error?.message || error) });
    }
  }
  return summary;
}

module.exports = {
  aprovarCompra,
  aplicarAprovacao,
  consolidarContasAtivasPorFornecedor,
  consolidarFornecedor,
  contaFoiSincronizada,
  enviarContaParaOmie,
  excluirContaLocal,
  montarDadosAprovacao,
  obterOuCriarContaAtiva,
  recalcularConta,
  reconciliarCompra,
  reconciliarPendentes,
  selecionarOperacaoContaPagar,
  resetarDocumentosConta,
};
