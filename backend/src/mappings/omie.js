"use strict";

const { defineOmieMapping } = require("@oondemand/oon-core-back");
const {
  executarConclusaoRecebimentoOmie,
  executarConsultaPagamentoOmie,
  executarEnvioContaPagarOmie,
  filtrosPesquisaPedidoCompra,
  normalizarCompraOmie,
  obterConfiguracao,
  processarWebhookOmie,
} = require("../services/contasPagar");

function primeiro(record, fields, fallback = "") {
  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function inativoOmie(value) {
  return ["S", "SIM", "TRUE", "1", "INATIVO"].includes(String(value || "").trim().toUpperCase());
}

async function parametrosPesquisaCompras({ input = {} } = {}) {
  const configuracao = await obterConfiguracao({ create: true });
  const filtros = filtrosPesquisaPedidoCompra(
    input.etapaPedidoOmie || configuracao.etapaPedidoOmieCarregar,
  );
  input.etapaPedidoOmie = filtros.etapaPedidoOmie;
  return [{
    nPagina: Number(input.page || 1),
    nRegsPorPagina: Number(input.pageSize || 100),
    lApenasImportadoApi: filtros.lApenasImportadoApi,
    lExibirPedidosPendentes: filtros.lExibirPedidosPendentes,
    lExibirPedidosFaturados: filtros.lExibirPedidosFaturados,
    lExibirPedidosRecebidos: filtros.lExibirPedidosRecebidos,
    lExibirPedidosCancelados: filtros.lExibirPedidosCancelados,
    lExibirPedidosEncerrados: filtros.lExibirPedidosEncerrados,
    lExibirPedidosRecParciais: filtros.lExibirPedidosRecParciais,
    lExibirPedidosFatParciais: filtros.lExibirPedidosFatParciais,
    lApenasAlterados: filtros.lApenasAlterados,
  }];
}

function mapearCompraFaturada(record, scope = {}) {
  const filtros = filtrosPesquisaPedidoCompra(scope.input?.etapaPedidoOmie);
  const mapped = normalizarCompraOmie(record, {
    instanceId: scope.instanceId || "default",
    forceFaturado: true,
  });
  if (!mapped) throw new Error("Pedido de compra Omie sem código interno.");
  mapped.situacaoPedidoOmieOrigem = filtros.etapaPedidoOmie;
  return mapped;
}

function mapearCategoriaOmie(record = {}) {
  const codigo = String(primeiro(record, ["codigo", "codigo_categoria", "cCodCateg"])).trim();
  if (!codigo) throw new Error("Categoria Omie sem código.");
  const nome = String(primeiro(record, ["descricao", "descricao_padrao", "nome"], codigo)).trim();
  return {
    codigoCategoriaOmie: codigo,
    nome,
    descricao: String(primeiro(record, ["descricao_padrao", "descricao"], nome)).trim(),
    status: inativoOmie(primeiro(record, ["conta_inativa", "inativo"])) ? "Inativo" : "Ativo",
    ultimaSincronizacaoEm: new Date(),
  };
}

function mapearContaCorrenteOmie(record = {}) {
  const codigo = Number(primeiro(record, [
    "nCodCC",
    "codigo_conta_corrente",
    "codigo_conta_corrente_omie",
    "codigo",
    "id",
  ], 0));
  if (!(codigo > 0)) throw new Error("Conta corrente Omie sem código.");
  const nome = String(primeiro(record, [
    "cDescricao",
    "descricao",
    "nome",
    "cNome",
  ], `Conta ${codigo}`)).trim();
  return {
    codigoContaCorrenteOmie: codigo,
    nome,
    tipo: String(primeiro(record, ["cTipo", "tipo", "tipo_conta_corrente"])).trim(),
    codigoIntegracao: String(primeiro(record, ["cCodCCInt", "codigo_integracao"])).trim(),
    status: inativoOmie(primeiro(record, ["inativo", "cInativo"])) ? "Inativo" : "Ativo",
    ultimaSincronizacaoEm: new Date(),
  };
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
      // Mantém o teste separado da pesquisa operacional de compras. O Omie
      // bloqueia consumos repetidos do mesmo serviço com o erro REDUNDANT.
      endpoint: "geral/clientes/",
      call: "ListarClientes",
      param: [{
        pagina: 1,
        registros_por_pagina: 1,
        apenas_importado_api: "N"
      }],
      connectionTest: true
    },
    "pesquisar-compras-faturadas": {
      label: "Pesquisar pedidos de compra",
      endpoint: "produtos/pedidocompra/",
      call: "PesquisarPedCompra",
      param: parametrosPesquisaCompras,
      maxAttempts: 1,
      emptyResultFaultCodes: ["SOAP-ENV:Client-5113"],
      pagination: {
        itemsPath: "pedidos_pesquisa",
        totalPagesPath: "nTotalPaginas",
        pageSize: 100
      }
    },
    "listar-categorias": {
      label: "Listar categorias financeiras",
      endpoint: "geral/categorias/",
      call: "ListarCategorias",
      param: [{
        pagina: "$input.page",
        registros_por_pagina: "$input.pageSize"
      }],
      pagination: {
        itemsPath: "categoria_cadastro",
        totalPagesPath: "total_de_paginas",
        pageSize: 100
      }
    },
    "listar-contas-correntes": {
      label: "Listar contas correntes",
      endpoint: "geral/contacorrente/",
      call: "ListarContasCorrentes",
      param: [{
        pagina: "$input.page",
        registros_por_pagina: "$input.pageSize",
        apenas_importado_api: "N"
      }],
      pagination: {
        itemsPath: "ListarContasCorrentes",
        totalPagesPath: "total_de_paginas",
        pageSize: 100
      }
    },
    "incluir-conta-pagar": {
      label: "Incluir conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "IncluirContaPagar",
      param: { $path: "$input.param", default: [{}] }
    },
    "alterar-conta-pagar": {
      label: "Alterar conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "AlterarContaPagar",
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
    },
    "listar-recebimentos": {
      label: "Listar recebimentos de documentos fiscais",
      endpoint: "produtos/recebimentonfe/",
      call: "ListarRecebimentos",
      param: { $path: "$input.param", default: [{}] },
      maxAttempts: 2
    },
    "concluir-recebimento": {
      label: "Concluir recebimento de documento fiscal",
      endpoint: "produtos/recebimentonfe/",
      call: "ConcluirRecebimento",
      param: { $path: "$input.param", default: [{}] }
    }
  },
  lists: [
    {
      key: "compras-faturadas",
      label: "Pedidos de compra",
      description: "Sincroniza somente os pedidos da situação configurada. A ação deste botão não executa as demais listas Omie.",
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
    },
    {
      key: "categorias-financeiras",
      label: "Categorias financeiras",
      description: "Carrega as categorias do Omie usadas na configuração e nas aprovações manuais.",
      call: "listar-categorias",
      mode: "full",
      direction: "inbound",
      target: {
        model: "CategoriaOmie",
        externalKey: "codigoCategoriaOmie",
        activeField: "status",
        inactiveValue: "Inativo"
      },
      mapping: mapearCategoriaOmie,
      policies: {
        create: true,
        update: true,
        inactivate: true,
        conflict: "remote-wins"
      },
      batchSize: 100,
      includeInFullSync: true,
      order: 20
    },
    {
      key: "contas-correntes",
      label: "Contas correntes",
      description: "Carrega as contas correntes do Omie usadas na configuração e nos envios manuais.",
      call: "listar-contas-correntes",
      mode: "full",
      direction: "inbound",
      target: {
        model: "ContaCorrenteOmie",
        externalKey: "codigoContaCorrenteOmie",
        activeField: "status",
        inactiveValue: "Inativo"
      },
      mapping: mapearContaCorrenteOmie,
      policies: {
        create: true,
        update: true,
        inactivate: true,
        conflict: "remote-wins"
      },
      batchSize: 100,
      includeInFullSync: true,
      order: 30
    }
  ],
  webhooks: [
    webhookAction("Financas.ContaPagar.Alterado"),
    webhookAction("Financas.ContaPagar.BaixaRealizada"),
    webhookAction("Financas.ContaPagar.BaixaCancelada"),
    webhookAction("Financas.ContaPagar.Excluido"),
    webhookAction("*")
  ],
  handlers: {
    TAZAY_ENVIAR_CONTA_PAGAR_OMIE: executarEnvioContaPagarOmie,
    TAZAY_CONSULTAR_PAGAMENTO_OMIE: executarConsultaPagamentoOmie,
    TAZAY_CONCLUIR_RECEBIMENTO_OMIE: executarConclusaoRecebimentoOmie,
    TAZAY_PROCESSAR_WEBHOOK_OMIE: processarWebhookOmie
  }
});

module.exports = {
  mapearCategoriaOmie,
  mapearCompraFaturada,
  mapearContaCorrenteOmie,
  parametrosPesquisaCompras,
  webhookAction,
};
