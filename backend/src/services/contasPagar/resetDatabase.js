"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { models } = require("./runtime");

async function resetarBaseDados() {
  const { Compra, ContaPagarAgrupada, ConfiguracaoContasPagar } = models();
  const connection = Compra?.db || ContaPagarAgrupada?.db || ConfiguracaoContasPagar?.db;
  if (!connection?.dropDatabase) {
    throw new GenericError("Não foi possível acessar a conexão do banco de dados.", { statusCode: 500 });
  }
  await connection.dropDatabase();
  return { resetada: true, primeiroAcesso: true };
}

module.exports = { resetarBaseDados };
