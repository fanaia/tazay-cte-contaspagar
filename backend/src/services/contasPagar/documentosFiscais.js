"use strict";

const {
  cabecalhoRecebimento,
  encontrarRecebimento,
} = require("./normalization");
const { primeiroValor } = require("./utils");

function sim(value) {
  return ["S", "SIM", "TRUE", "1"].includes(String(value || "").trim().toUpperCase());
}

function parametrosListagemDocumentosFiscais({ input = {} } = {}) {
  return [{
    nPagina: Math.max(1, Number(input.page || 1)),
    nRegistrosPorPagina: Math.max(1, Number(input.pageSize || 100)),
    cOrdenarPor: "CODIGO",
    cExibirDetalhes: "S",
  }];
}

function avaliarDocumentoFaturadoPendente(input = {}) {
  const record = encontrarRecebimento(input) || input;
  const cabec = cabecalhoRecebimento(record);
  const info = record.infoCadastro || record.info_cadastro || {};
  const modelo = String(primeiroValor(
    cabec.cModeloNFe,
    cabec.modelo,
    record.cModeloNFe,
    "",
  ) || "").trim();

  if (!["55", "57"].includes(modelo)) {
    return { include: false, reason: `modelo-fiscal-${modelo || "nao-informado"}` };
  }
  if (sim(primeiroValor(info.cCancelada, info.cancelada))) {
    return { include: false, reason: "documento-cancelado" };
  }
  if (sim(primeiroValor(info.cDevolvido, info.devolvido))) {
    return { include: false, reason: "documento-devolvido" };
  }
  if (sim(primeiroValor(info.cDenegado, info.denegado))) {
    return { include: false, reason: "documento-denegado" };
  }
  if (sim(primeiroValor(info.cRecebido, info.recebido))) {
    return { include: false, reason: "documento-ja-recebido" };
  }

  const etapaTexto = String(primeiroValor(
    cabec.cDescEtapa,
    cabec.descricao_etapa,
    record.cDescEtapa,
    record.descricao_etapa,
    "",
  ) || "").toLowerCase();
  const etapaCodigo = String(primeiroValor(cabec.cEtapa, record.cEtapa, "") || "").trim();
  const faturado = sim(primeiroValor(info.cFaturado, info.faturado))
    || etapaTexto.includes("faturado")
    || etapaCodigo === "50";

  if (!faturado) {
    return { include: false, reason: "documento-nao-faturado-pelo-fornecedor" };
  }
  return { include: true, reason: "" };
}

module.exports = {
  avaliarDocumentoFaturadoPendente,
  parametrosListagemDocumentosFiscais,
};
