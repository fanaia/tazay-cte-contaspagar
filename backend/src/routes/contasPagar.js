"use strict";

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
