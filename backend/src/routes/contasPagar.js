"use strict";

const { defineRoutes, registry } = require("@oondemand/oon-core-back");
const {
  aprovarDocumentosLote,
  consultarPagamentoContaPagar,
  enviarContaParaOmie,
  exigirAprovacaoManual,
  exigirSincronizacaoManual,
  gerarPagamentoDocumentos,
  listarContasPagarOperacionais,
  listarDocumentosConta,
  listarDocumentosFiscaisOperacionais,
  obterConfiguracao,
  obterContextoGeracaoPagamento,
  reconciliarPendentes,
  recusarDocumentoFiscalOperacional,
  removerDocumentoDaConta,
  resetarBaseDados,
  solicitarExclusaoContaOmie,
} = require("../services/contasPagar");

const ROLES = ["admin", "desenvolvedor"];

function usuario(req) {
  return req.usuario?.email || req.usuario?.nome || "Usuário";
}

defineRoutes("/api/tazay/contas-pagar", (router) => {
  router.private.get("/documentos-fiscais", { roles: ROLES }, async (req, res) => {
    res.json(await listarDocumentosFiscaisOperacionais(req.query));
  });

  router.private.post("/reconciliar", { roles: ROLES }, async (req, res) => {
    const result = await reconciliarPendentes({ timeZone: req.body?.timeZone });
    res.status(result.errors?.length ? 207 : 200).json(result);
  });

  router.private.post("/compras/:id/aprovar", { roles: ROLES }, async (req, res) => {
    await exigirAprovacaoManual();
    const result = await aprovarDocumentosLote([req.params.id], { usuario: usuario(req) });
    res.status(200).json(result);
  });

  router.private.post("/compras/aprovar-lote", { roles: ROLES }, async (req, res) => {
    await exigirAprovacaoManual();
    const result = await aprovarDocumentosLote(req.body?.ids, { usuario: usuario(req) });
    res.status(200).json(result);
  });

  router.private.post("/compras/contexto-pagamento", { roles: ROLES }, async (req, res) => {
    const result = await obterContextoGeracaoPagamento(req.body?.ids, {
      timeZone: req.body?.timeZone,
    });
    res.status(200).json(result);
  });

  router.private.post("/compras/gerar-pagamento", { roles: ROLES }, async (req, res) => {
    const result = await gerarPagamentoDocumentos({
      ids: req.body?.ids,
      contaPagarId: req.body?.contaPagarId,
      categoriaId: req.body?.categoriaId,
      contaCorrenteId: req.body?.contaCorrenteId,
      dataVencimento: req.body?.dataVencimento,
    });
    res.status(result.envio?.ticketId ? 202 : 200).json(result);
  });

  router.private.post("/compras/:id/recusar", { roles: ROLES }, async (req, res) => {
    const result = await recusarDocumentoFiscalOperacional(req.params.id, {
      usuario: usuario(req),
    });
    res.status(result.ignored ? 409 : 202).json(result);
  });

  router.private.get("/contas", { roles: ROLES }, async (req, res) => {
    res.json(await listarContasPagarOperacionais(req.query));
  });

  router.private.get("/contas/:id/documentos", { roles: ROLES }, async (req, res) => {
    res.json(await listarDocumentosConta(req.params.id));
  });

  router.private.delete("/contas/:id/documentos/:documentoId", {
    roles: ROLES,
    audit: { action: "UPDATE", entity: "ContaPagarAgrupada" },
  }, async (req, res) => {
    const result = await removerDocumentoDaConta(req.params.id, req.params.documentoId);
    res.status(result.exclusao?.ticketId || result.envio?.ticketId ? 202 : 200).json(result);
  });

  router.private.post("/contas/:id/enviar", { roles: ROLES }, async (req, res) => {
    const configuracao = await exigirSincronizacaoManual();
    const result = await enviarContaParaOmie(req.params.id, {
      configuracao,
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

  // O reset não usa mutationAudit porque a própria auditoria recriaria uma
  // coleção imediatamente após a exclusão de todas as coleções da Central.
  router.private.post("/configuracao/resetar-base", { roles: ["admin"] }, async (_req, res) => {
    res.status(200).json(await resetarBaseDados());
  });

  router.private.get("/resumo", { roles: ROLES }, async (_req, res) => {
    const Compra = registry.getModel("Compra")?.mongooseModel;
    const Conta = registry.getModel("ContaPagarAgrupada")?.mongooseModel;
    const pagamentoConcluido = {
      $or: [
        { status: "Paga" },
        { statusPagamentoOmie: "Pago" },
      ],
    };

    const [
      totalDocumentos,
      documentosAprovados,
      documentosReprovados,
      pagamentosGerados,
      pagamentosConcluidos,
      totalPagoRows,
      documentosPendentes,
      documentosPagos,
      contasPendentes,
      contasAbertas,
      contasComErro,
    ] = await Promise.all([
      Compra.countDocuments({}),
      Compra.countDocuments({ statusAprovacao: "Aprovada" }),
      Compra.countDocuments({ statusAprovacao: "Recusada" }),
      Conta.countDocuments({ status: { $ne: "Excluída" } }),
      Conta.countDocuments(pagamentoConcluido),
      Conta.aggregate([
        { $match: pagamentoConcluido },
        { $group: { _id: null, total: { $sum: "$valorTotal" } } },
      ]),
      Compra.countDocuments({ etapa: "Faturado pelo fornecedor", statusDocumentoOmie: "Pendente" }),
      Compra.countDocuments({ etapa: "Pago" }),
      Conta.countDocuments({ status: { $in: ["Pendente envio", "Pendente sincronização", "Exclusão pendente"] } }),
      Conta.countDocuments({ status: { $in: ["Aberta", "Pagamento cancelado"] } }),
      Conta.countDocuments({ status: "Erro" }),
    ]);

    res.json({
      totalDocumentos,
      documentosAprovados,
      documentosReprovados,
      pagamentosGerados,
      pagamentosConcluidos,
      totalPago: Number(totalPagoRows?.[0]?.total || 0),
      // Mantidos para compatibilidade com consumidores anteriores do resumo.
      documentosPendentes,
      documentosProcessados: documentosAprovados,
      documentosPagos,
      contasPendentes,
      contasAbertas,
      contasComErro,
    });
  });
});
