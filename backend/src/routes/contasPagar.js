"use strict";

const { defineRoutes, registry } = require("@oondemand/oon-core-back");
const { reconciliarPendentes } = require("../services/contasPagar");

defineRoutes("/api/tazay/contas-pagar", (router) => {
  router.private.post("/reconciliar", { roles: ["admin", "desenvolvedor"] }, async (req, res) => {
    const result = await reconciliarPendentes({ timeZone: req.body?.timeZone });
    res.status(result.errors.length ? 207 : 200).json(result);
  });

  router.private.get("/resumo", { roles: ["admin", "desenvolvedor"] }, async (_req, res) => {
    const Compra = registry.getModel("Compra")?.mongooseModel;
    const Conta = registry.getModel("ContaPagarAgrupada")?.mongooseModel;
    const [comprasFaturadas, comprasConcluidas, contasAbertas, contasComErro] = await Promise.all([
      Compra.countDocuments({ etapa: "Faturado pelo fornecedor" }),
      Compra.countDocuments({ etapa: "Concluído" }),
      Conta.countDocuments({ status: { $in: ["Pendente sincronização", "Aberta", "Pagamento cancelado"] } }),
      Conta.countDocuments({ status: "Erro" }),
    ]);
    res.json({ comprasFaturadas, comprasConcluidas, contasAbertas, contasComErro });
  });
});
