"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const { agendarProcessamentoPendentes } = require("../services/contasPagar");

defineTrigger("Compra", {
  after: async (document) => {
    await agendarProcessamentoPendentes(document);
  },
});
