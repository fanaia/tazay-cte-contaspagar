"use strict";

const { defineRoutes, registry } = require("@oondemand/oon-core-back");
const {
  aprovarCompra,
  consultarPagamentoContaPagar,
  enviarContaParaOmie,
  exigirAprovacaoManual,
  exigirSincronizacaoManual,
  listarDocumentosFiscaisOperacionais,
  obterConfiguracao,
  reconciliarPendentes,
  recusarDocumentoFiscalOperacional,
  resetarBaseDados,
  solicitarExclusaoContaOmie,
} = require("../services/contasPagar");

const ROLES = ["admin", "desenvolvedor"];

defineRoutes("/api/tazay/contas-pagar", (router) => {
  router.private.get("/documentos-fiscais", { roles: ROLES }, async (req, res) => {
    res.json(await listarDocumentosFiscaisOperacionais(req.query));
  });

  router.private.post("/reconciliar", { roles: ROLES }, async (req, res) => {
    const result = await reconciliarPendentes({ timeZone: req.body?.timeZone });
    res.status(result.errors.length ? 207 : 200).json(result);
  });

  router.private.post("/compras/:id/aprovar", { roles: ROLES }, async (req, res) => {
    await exigirAprovacaoManual();
    const result = await aprovarCompra(req.params.id, {
      categoriaId: req.body?.categoriaId,
      contaCorrenteId: req.body?.contaCorrenteId,
      usuario: req.usuario?.email || req.usuario?.nome || "Usuário",
      timeZone: req.body?.timeZone,
    });
    res.status(result.ignored ? 409 : 200).json(result);
  });

  router.private.post("/compras/:id/recusar", { roles: ROLES }, async (req, res) => {
    const result = await recusarDocumentoFiscalOperacional(req.params.id, {
      usuario: req.usuario?.email || req.usuario?.nome || "Usuário",
    });
    res.status(result.ignored ? 409 : 202).json(result);
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
