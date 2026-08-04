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
  name: "CategoriaOmie",
  singular: "categoriaOmie",
  basePath: "/categorias-omie",
  schema: {
    codigoCategoriaOmie: unique(fields.string({ required: true, label: "Código da categoria Omie" })),
    nome: indexed(fields.string({ required: true, label: "Categoria" })),
    descricao: fields.string({ label: "Descrição" }),
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
