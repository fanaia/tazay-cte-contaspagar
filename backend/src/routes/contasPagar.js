"use strict";

const { defineRoutes, registry } = require("@oondemand/oon-core-back");
const {
  aprovarCompra,
  consultarPagamentoContaPagar,
  enviarContaParaOmie,
  excluirContaLocal,
  obterConfiguracao,
  reconciliarPendentes,
} = require("../services/contasPagar");

const ROLES = ["admin", "desenvolvedor"];

defineRoutes("/api/tazay/contas-pagar", (router) => {
  router.private.post("/reconciliar", { roles: ROLES }, async (req, res) => {
    const result = await reconciliarPendentes({ timeZone: req.body?.timeZone });
    res.status(result.errors.length ? 207 : 200).json(result);
  });

  router.private.post("/compras/:id/aprovar", { roles: ROLES }, async (req, res) => {
    const result = await aprovarCompra(req.params.id, {
      categoriaId: req.body?.categoriaId,
      contaCorrenteId: req.body?.contaCorrenteId,
      usuario: req.usuario?.email || req.usuario?.nome || "Usuário",
      timeZone: req.body?.timeZone,
    });
    res.status(result.ignored ? 409 : 200).json(result);
  });

  router.private.post("/contas/:id/enviar", { roles: ROLES }, async (req, res) => {
    const result = await enviarContaParaOmie(req.params.id, {
      categoriaId: req.body?.categoriaId,
      contaCorrenteId: req.body?.contaCorrenteId,
    });
    res.status(result.ignored ? 409 : 200).json(result);
  });


  router.private.delete("/contas/:id", {
    roles: WRITE_ROLES,
    audit: { action: "DELETE", entity: "ContaPagarAgrupada" },
  }, async (req, res) => {
    const result = await excluirContaLocal(req.params.id);
    res.status(200).json({ success: true, result });
  });

  router.private.post("/contas/:id/consultar-pagamento", { roles: ROLES }, async (req, res) => {
    const result = await consultarPagamentoContaPagar(req.params.id);
    res.status(result.ignored ? 409 : 202).json(result);
  });

  router.private.post("/configuracao/inicializar", { roles: ROLES }, async (_req, res) => {
    res.json({ configuracao: await obterConfiguracao({ create: true }) });
  });

  router.private.get("/resumo", { roles: ROLES }, async (_req, res) => {
    const Compra = registry.getModel("Compra")?.mongooseModel;
    const Conta = registry.getModel("ContaPagarAgrupada")?.mongooseModel;
    const [comprasPendentes, comprasAprovadas, comprasPagas, contasPendentesEnvio, contasAbertas, contasComErro] = await Promise.all([
      Compra.countDocuments({ etapa: "Faturado pelo fornecedor", statusAprovacao: "Pendente" }),
      Compra.countDocuments({ etapa: "Faturado pelo fornecedor", statusAprovacao: "Aprovada" }),
      Compra.countDocuments({ etapa: "Pago" }),
      Conta.countDocuments({ status: "Pendente envio" }),
      Conta.countDocuments({ status: { $in: ["Pendente sincronização", "Aberta", "Pagamento cancelado"] } }),
      Conta.countDocuments({ status: "Erro" }),
    ]);
    res.json({
      comprasPendentes,
      comprasAprovadas,
      comprasPagas,
      contasPendentesEnvio,
      contasAbertas,
      contasComErro,
    });
  });
});
