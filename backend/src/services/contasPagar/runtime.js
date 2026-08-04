"use strict";

function core() {
  return require("@oondemand/oon-core-back");
}

function models() {
  const { registry } = core();
  const Compra = registry.getModel("Compra")?.mongooseModel;
  const ContaPagarAgrupada = registry.getModel("ContaPagarAgrupada")?.mongooseModel;
  if (!Compra || !ContaPagarAgrupada) {
    throw new Error("Models Compra e ContaPagarAgrupada devem estar registradas antes da operação.");
  }
  return { Compra, ContaPagarAgrupada };
}

module.exports = { core, models };
