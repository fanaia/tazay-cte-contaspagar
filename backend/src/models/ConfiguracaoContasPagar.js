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
    versaoConfiguracao: fields.number({ label: "Versão da configuração", default: 3 }),
    aprovarCompraAutomatico: fields.boolean({ label: "Aprovar documento automático", default: true }),
    enviarContaPagarOmieAutomatico: fields.boolean({
      label: "Enviar conta a pagar para o Omie automático",
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
