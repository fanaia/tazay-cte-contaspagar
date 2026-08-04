"use strict";

const { defineOmieMapping } = require("@oondemand/oon-core-back");
const { normalizarCompraOmie, processarWebhookOmie } = require("../services/contasPagar");

function mapearCompraFaturada(record, scope = {}) {
  const mapped = normalizarCompraOmie(record, {
    instanceId: scope.instanceId || "default",
    forceFaturado: true,
  });
  if (!mapped) throw new Error("Pedido de compra Omie sem código interno.");
  return mapped;
}

function webhookAction(eventType) {
  return {
    eventType,
    resource: eventType.startsWith("Financas.ContaPagar.") ? "contas-pagar" : "compras",
    actions: [{
      handler: "TAZAY_PROCESSAR_WEBHOOK_OMIE",
      aggregateType: eventType.startsWith("Financas.ContaPagar.") ? "ContaPagarAgrupada" : "Compra",
      payload: {
        eventType: "$event.eventType",
        body: { $path: "$payload" },
      },
    }],
  };
}

defineOmieMapping("tazay-cte-contaspagar", {
  instances: [{ id: "default", label: "Omie Tazay" }],
  calls: {
    "testar-conexao": {
      label: "Testar conexão com o Omie",
      endpoint: "produtos/pedidocompra/",
      call: "PesquisarPedCompra",
      param: [{
        nPagina: 1,
        nRegsPorPagina: 1,
        lApenasImportadoApi: "F",
        lExibirPedidosPendentes: "F",
        lExibirPedidosFaturados: "T",
        lExibirPedidosRecebidos: "F",
        lExibirPedidosCancelados: "F",
        lExibirPedidosEncerrados: "F",
        lExibirPedidosRecParciais: "F",
        lExibirPedidosFatParciais: "F",
        lApenasAlterados: "F"
      }],
      connectionTest: true
    },
    "pesquisar-compras-faturadas": {
      label: "Pesquisar compras faturadas pelo fornecedor",
      endpoint: "produtos/pedidocompra/",
      call: "PesquisarPedCompra",
      param: [{
        nPagina: "$input.page",
        nRegsPorPagina: "$input.pageSize",
        lApenasImportadoApi: "F",
        lExibirPedidosPendentes: "F",
        lExibirPedidosFaturados: "T",
        lExibirPedidosRecebidos: "F",
        lExibirPedidosCancelados: "F",
        lExibirPedidosEncerrados: "F",
        lExibirPedidosRecParciais: "F",
        lExibirPedidosFatParciais: "F",
        lApenasAlterados: "F"
      }],
      pagination: {
        itemsPath: "pedidos_pesquisa",
        totalPagesPath: "nTotalPaginas",
        pageSize: 100
      }
    },
    "upsert-conta-pagar": {
      label: "Criar ou atualizar conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "UpsertContaPagar",
      param: { $path: "$input.param", default: [{}] }
    },
    "consultar-conta-pagar": {
      label: "Consultar conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "ConsultarContaPagar",
      param: { $path: "$input.param", default: [{}] }
    },
    "excluir-conta-pagar": {
      label: "Excluir conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "ExcluirContaPagar",
      param: { $path: "$input.param", default: [{}] }
    }
  },
  lists: [{
    key: "compras-faturadas",
    label: "Compras faturadas pelo fornecedor",
    description: "Importa pedidos de compra faturados para posterior reconciliação por fornecedor e vencimento.",
    call: "pesquisar-compras-faturadas",
    mode: "full",
    direction: "inbound",
    target: {
      model: "Compra",
      externalKey: "chaveExterna"
    },
    mapping: mapearCompraFaturada,
    policies: {
      create: true,
      update: true,
      inactivate: false,
      conflict: "remote-wins"
    },
    batchSize: 100,
    includeInFullSync: true,
    order: 10
  }],
  webhooks: [
    webhookAction("Financas.ContaPagar.Alterado"),
    webhookAction("Financas.ContaPagar.BaixaRealizada"),
    webhookAction("Financas.ContaPagar.BaixaCancelada"),
    webhookAction("Financas.ContaPagar.Excluido"),
    webhookAction("*")
  ],
  handlers: {
    TAZAY_PROCESSAR_WEBHOOK_OMIE: processarWebhookOmie
  }
});

module.exports = { mapearCompraFaturada, webhookAction };
