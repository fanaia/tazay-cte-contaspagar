"use strict";

const { defineOmieMapping } = require("@oondemand/oon-core-back");
const {
  executarConclusaoRecebimentoOmie,
  executarConsultaPagamentoOmie,
  executarEnvioContaPagarOmie,
  normalizarRecebimentoOmie,
  processarWebhookOmie,
} = require("../services/contasPagar");
const {
  avaliarDocumentoFaturadoPendente,
  parametrosListagemDocumentosFiscais: parametrosRecebimentosFaturados,
} = require("../services/contasPagar/documentosFiscais");

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

function mapearDocumentoFaturado(record, scope = {}) {
  const mapped = normalizarRecebimentoOmie(record, {
    instanceId: scope.instanceId || "default",
  });
  if (!mapped) {
    throw new Error("Recebimento Omie sem identificador válido.");
  }
  if (!["NF-e", "CT-e"].includes(mapped.tipoDocumentoFiscal)) {
    throw new Error(`Documento ${mapped.numeroDocumentoFiscal} não é NF-e nem CT-e.`);
  }
  if (!(mapped.codigoFornecedorOmie > 0)) {
    throw new Error(`Documento ${mapped.numeroDocumentoFiscal} sem fornecedor Omie.`);
  }
  if (!(mapped.valorFaturado > 0)) {
    throw new Error(`Documento ${mapped.numeroDocumentoFiscal} sem valor válido.`);
  }
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
      // Mantém o teste separado da consulta operacional de documentos fiscais.
      // O Omie bloqueia consumos repetidos do mesmo serviço com o erro REDUNDANT.
      endpoint: "geral/clientes/",
      call: "ListarClientes",
      param: [{
        pagina: 1,
        registros_por_pagina: 1,
        apenas_importado_api: "N"
      }],
      maxAttempts: 1,
      connectionTest: true
    },
    "listar-documentos-faturados-pendentes": {
      label: "Listar NF-es e CT-es pendentes",
      endpoint: "produtos/recebimentonfe/",
      call: "ListarRecebimentos",
      // Não envia cEtapa: o código usado pela interface não é confiável em todas as bases Omie.
      // A seleção Faturado pelo Fornecedor + Pendente é feita localmente pela lista.
      param: parametrosRecebimentosFaturados,
      maxAttempts: 1,
      pagination: {
        itemsPath: "recebimentos",
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
      maxAttempts: 1,
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
      maxAttempts: 1,
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
      param: { $path: "$input.param" },
      maxAttempts: 1
    },
    "alterar-conta-pagar": {
      label: "Alterar conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "AlterarContaPagar",
      param: { $path: "$input.param" },
      maxAttempts: 1
    },
    "consultar-conta-pagar": {
      label: "Consultar conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "ConsultarContaPagar",
      param: { $path: "$input.param" },
      maxAttempts: 1
    },
    "excluir-conta-pagar": {
      label: "Excluir conta a pagar agrupada",
      endpoint: "financas/contapagar/",
      call: "ExcluirContaPagar",
      param: { $path: "$input.param" },
      maxAttempts: 1
    },
    "concluir-recebimento": {
      label: "Concluir recebimento de documento fiscal",
      endpoint: "produtos/recebimentonfe/",
      call: "ConcluirRecebimento",
      param: { $path: "$input.param" },
      maxAttempts: 1
    }
  },
  lists: [
    {
      key: "documentos-faturados-pendentes",
      label: "NF-es e CT-es pendentes",
      description: "Lista os recebimentos fiscais e mantém somente NF-es e CT-es faturados pelo fornecedor que ainda estejam pendentes.",
      call: "listar-documentos-faturados-pendentes",
      mode: "import",
      direction: "inbound",
      target: {
        model: "Compra",
        externalKey: "chaveExterna"
      },
      filter: avaliarDocumentoFaturadoPendente,
      mapping: mapearDocumentoFaturado,
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
    webhookAction("Financas.ContaPagar.Excluido")
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
  mapearContaCorrenteOmie,
  mapearDocumentoFaturado,
  webhookAction,
};
