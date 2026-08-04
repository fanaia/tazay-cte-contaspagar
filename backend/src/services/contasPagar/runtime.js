"use strict";

function core() {
  return require("@oondemand/oon-core-back");
}

function models() {
  const { registry } = core();
  const names = [
    "Compra",
    "ContaPagarAgrupada",
    "ConfiguracaoContasPagar",
    "CategoriaOmie",
    "ContaCorrenteOmie",
  ];
  const result = Object.fromEntries(
    names.map((name) => [name, registry.getModel(name)?.mongooseModel]),
  );
  if (!result.Compra || !result.ContaPagarAgrupada) {
    throw new Error("Models Compra e ContaPagarAgrupada devem estar registradas antes da operação.");
  }
  return result;
}

module.exports = { core, models };
