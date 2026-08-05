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

async function obterOuCriarContaAtiva(compra) {
  const { ContaPagarAgrupada } = models();
  const baseKey = chaveBase(compra);
  if (compra.contaPagarId) {
    const vinculada = await ContaPagarAgrupada.findById(compra.contaPagarId);
    if (
      vinculada
      && STATUS_ATIVOS.includes(vinculada.status)
      && String(vinculada.chaveAtiva || "") === baseKey
    ) {
      return vinculada;
    }
  }
  let conta = await ContaPagarAgrupada.findOne({ chaveAtiva: baseKey });
  if (conta) return conta;
  const latest = await ContaPagarAgrupada.findOne({
    instanceId: compra.instanceId,
    codigoFornecedorOmie: compra.codigoFornecedorOmie,
    dataVencimento: compra.dataVencimento,
  }).sort({ geracao: -1 }).lean();
  const generation = Number(latest?.geracao || 0) + 1;
  try {
    return await ContaPagarAgrupada.create({
      chaveAgrupamento: `${baseKey}|g${generation}`,
      chaveAtiva: baseKey,
      instanceId: compra.instanceId,
      codigoFornecedorOmie: compra.codigoFornecedorOmie,
      nomeFornecedor: compra.nomeFornecedor,
      dataVencimento: compra.dataVencimento,
      geracao: generation,
      codigoLancamentoIntegracao: codigoIntegracao(baseKey, generation),
      status: "Pendente envio",
      revisao: 0,
      quantidadeCompras: 0,
      valorTotal: 0,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    conta = await ContaPagarAgrupada.findOne({ chaveAtiva: baseKey });
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

  const set = {
    quantidadeCompras: compras.length,
    valorTotal,
    status: "Pendente envio",
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
  if (categoryId) {
    const categoria = await resolverCategoria(categoryId);
    set.categoriaOmieId = categoria.id;
    set.codigoCategoriaOmie = categoria.codigo;
    set.nomeCategoriaOmie = categoria.nome;
  }
  if (currentAccountId) {
    const contaCorrente = await resolverContaCorrente(currentAccountId);
    set.contaCorrenteOmieId = contaCorrente.id;
    set.codigoContaCorrenteOmie = contaCorrente.codigo;
    set.nomeContaCorrenteOmie = contaCorrente.nome;
  }
  if (Object.keys(set).length) {
    conta = await ContaPagarAgrupada.findByIdAndUpdate(
      conta._id,
      { $set: set },
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
          ultimoErro: "",
        },
        $inc: { revisao: 1 },
      },
      { new: true, runValidators: true },
    );
    const { enqueueOmieCall } = core();
    const ticket = await enqueueOmieCall({
      call: operacaoOmie.call,
      instanceId: updated.instanceId,
      resource: "contas-pagar-agrupadas",
      operation: operacaoOmie.operation,
      aggregateType: "ContaPagarAgrupada",
      aggregateId: String(updated._id),
      idempotencyKey: `tazay:conta-pagar:${updated._id}:${operacaoOmie.operation}:r${updated.revisao}`,
      payload: { param: [payload] },
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
    await ContaPagarAgrupada.findByIdAndUpdate(conta._id, { $set: { status: "Erro", ultimoErro: message } });
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
  if (!(Number(compra.valorFaturado) > 0)) throw new Error(`Compra ${compra.codigoPedidoOmie} sem valor faturado válido.`);

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
  const conta = await obterOuCriarContaAtiva(compra);
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

async function aprovarCompra(compraId, options = {}) {
  return reconciliarCompra(compraId, { ...options, forceApproval: true });
}

async function reconciliarPendentes(options = {}) {
  const { Compra } = models();
  const configuracao = await obterConfiguracao({ create: true });
  const compras = await Compra.find({ etapa: ETAPA_FATURADO })
    .sort({ codigoFornecedorOmie: 1, codigoPedidoOmie: 1 })
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
  enviarContaParaOmie,
  montarDadosAprovacao,
  obterOuCriarContaAtiva,
  recalcularConta,
  reconciliarCompra,
  reconciliarPendentes,
  selecionarOperacaoContaPagar,
};
