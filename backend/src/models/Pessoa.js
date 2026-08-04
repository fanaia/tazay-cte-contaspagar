const { defineModel, fields } = require("@oondemand/oon-core-back");

/**
 * Pessoa — domínio puro: só schema + CRUD. Auth, RBAC, paginação, auditoria e
 * metadata vêm do Core. A tela é renderizada pelo front a partir da metadata.
 */
defineModel({
  name: "Pessoa",
  singular: "pessoa",
  basePath: "/pessoas",
  schema: {
    nome: fields.string({ required: true, label: "Nome" }),
    email: fields.string({ label: "E-mail" }),
    documento: fields.string({ label: "Documento" }),
    tipo: fields.enum(["pf", "pj"], { label: "Tipo", default: "pf" }),
    status: fields.enum(["ativo", "inativo"], { label: "Status", default: "ativo" }),
  },
  // A ativação de desenvolvimento concede o perfil "desenvolvedor".
  // O papel "admin" permanece autorizado globalmente pelo RBAC do Core.
  crud: { enabled: true, roles: { write: ["desenvolvedor"] } },
});
