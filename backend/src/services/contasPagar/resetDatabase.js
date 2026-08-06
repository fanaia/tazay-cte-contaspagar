"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { models } = require("./runtime");

function colecaoPodeSerExcluida(nome) {
  return Boolean(nome) && !String(nome).startsWith("system.");
}

function namespaceNaoEncontrado(error) {
  return error?.code === 26 || error?.codeName === "NamespaceNotFound";
}

async function resetarBaseDados() {
  const { Compra, ContaPagarAgrupada, ConfiguracaoContasPagar } = models();
  const connection = Compra?.db || ContaPagarAgrupada?.db || ConfiguracaoContasPagar?.db;
  const database = connection?.db;

  if (!database?.listCollections || !database?.dropCollection) {
    throw new GenericError("Não foi possível acessar a conexão do banco de dados.", { statusCode: 500 });
  }

  const colecoes = await database.listCollections({}, { nameOnly: true }).toArray();
  const nomes = colecoes
    .map((colecao) => colecao?.name)
    .filter(colecaoPodeSerExcluida);

  let colecoesExcluidas = 0;
  for (const nome of nomes) {
    try {
      await database.dropCollection(nome);
      colecoesExcluidas += 1;
    } catch (error) {
      // A coleção pode desaparecer entre a listagem e a exclusão. Nesse caso,
      // o objetivo do reset já foi atingido para ela.
      if (!namespaceNaoEncontrado(error)) throw error;
    }
  }

  return {
    resetada: true,
    primeiroAcesso: true,
    colecoesExcluidas,
  };
}

module.exports = { resetarBaseDados };
