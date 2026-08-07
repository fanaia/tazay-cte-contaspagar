"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const { agendarProcessamentoDocumentoOperacional } = require("../services/contasPagar");

defineTrigger("Compra", {
  after: async (document) => {
    await agendarProcessamentoDocumentoOperacional(document);
  },
});
