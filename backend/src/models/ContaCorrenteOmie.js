"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function indexed(descriptor) {
  descriptor.index = true;
  return descriptor;
}

function unique(descriptor) {
  descriptor.unique = true;
  descriptor.index = true;
  return descriptor;
}

defineModel({
  name: "ContaCorrenteOmie",
  singular: "contaCorrenteOmie",
  basePath: "/contas-correntes-omie",
  schema: {
    codigoContaCorrenteOmie: unique(fields.number({ required: true, label: "Código da conta corrente Omie" })),
    nome: indexed(fields.string({ required: true, label: "Conta corrente" })),
    tipo: fields.string({ label: "Tipo" }),
    codigoIntegracao: fields.string({ label: "Código de integração" }),
    status: indexed(fields.enum(["Ativo", "Inativo"], {
      required: true,
      label: "Status",
      default: "Ativo",
    })),
    ultimaSincronizacaoEm: fields.date({ label: "Última sincronização" }),
  },
  crud: {
    enabled: true,
    roles: { write: ["admin", "desenvolvedor"] },
  },
});
