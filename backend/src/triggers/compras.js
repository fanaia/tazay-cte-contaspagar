"use strict";

const { defineTrigger } = require("@oondemand/oon-core-back");
const { ETAPA_FATURADO, reconciliarCompra } = require("../services/contasPagar");

defineTrigger("Compra", {
  after: async (document) => {
    if (document.etapa !== ETAPA_FATURADO) return;
    await reconciliarCompra(document._id);
  },
});
