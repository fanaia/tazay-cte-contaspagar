"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function unique(descriptor) {
  descriptor.unique = true;
  descriptor.index = true;
  return descriptor;
}

defineModel({
  name: "ConfiguracaoContasPagar",
  singular: "configuracaoContasPagar",
  basePath: "/configuracoes-contas-pagar",
  schema: {
    chave: unique(fields.string({ required: true, label: "Configuração", default: "default" })),
    aprovarCompraAutomatico: fields.boolean({
      label: "Aprovar automático documento fiscal e gerar contas a pagar agrupado",
      default: true,
    }),
    enviarContaPagarOmieAutomatico: fields.boolean({
      label: "Sincronizar automático o Contas a Pagar com o Omie",
      default: true,
    }),
    categoriaPadraoId: fields.ref("CategoriaOmie", { label: "Categoria padrão" }),
    contaCorrentePadraoId: fields.ref("ContaCorrenteOmie", { label: "Conta corrente padrão" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["admin", "desenvolvedor"] },
    populateRefs: true,
  },
});

module.exports = {};
