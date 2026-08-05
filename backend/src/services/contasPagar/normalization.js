"use strict";

const { CODIGO_ETAPA_FATURADO_FORNECEDOR } = require("./configuration");
const { ETAPA_CONCLUIDO, ETAPA_FATURADO } = require("./constants");
const { arredondarMoeda, array, primeiroValor } = require("./utils");

function somarProdutos(record = {}) {
  const produtos = array(record.produtos_consulta || record.produtos_pesquisa || record.produtos || record.itens);
  return arredondarMoeda(produtos.reduce((total, item = {}) => {
    const direct = Number(primeiroValor(item.nValTot, item.nValorTotal, item.valor_total));
    if (Number.isFinite(direct)) return total + direct;
    const quantidade = Number(primeiroValor(item.nQtde, item.quantidade, 0));
    const unitario = Number(primeiroValor(item.nValUnit, item.valor_unitario, 0));
    const desconto = Number(primeiroValor(item.nDesconto, item.desconto, 0));
    return total + (quantidade * unitario) - desconto;
  }, 0));
}

function rateioCategoriasDaCompra(record = {}, valorTotal = 0) {
  const header = record.cabecalho_consulta || record.cabecalho || record;
  const produtos = array(record.produtos_consulta || record.produtos_pesquisa || record.produtos || record.itens);
  const sums = new Map();
  for (const item of produtos) {
    const codigo = String(primeiroValor(item?.cCodCateg, item?.codigo_categoria, "") || "").trim();
    if (!codigo) continue;
    const valor = arredondarMoeda(primeiroValor(
      item?.nValTot,
      item?.nValorTotal,
      Number(item?.nQtde || 0) * Number(item?.nValUnit || 0) - Number(item?.nDesconto || 0),
    ));
    sums.set(codigo, arredondarMoeda((sums.get(codigo) || 0) + valor));
  }
  if (!sums.size) {
    const codigo = String(primeiroValor(header.cCodCateg, header.codigo_categoria, "") || "").trim();
    if (codigo) sums.set(codigo, arredondarMoeda(valorTotal));
  }
  return [...sums.entries()].map(([codigo_categoria, valor]) => ({ codigo_categoria, valor }));
}

function encontrarPedido(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (value.cabecalho_consulta || value.nCodPed || value.codigo_pedido_omie || value.codigo_pedido) return value;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = encontrarPedido(child, seen);
    if (found) return found;
  }
  return null;
}

function encontrarRecebimento(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const cabec = value.cabec || value.cabecalho || value.ide;
  if (
    value.nIdReceb
    || value.cChaveNfe
    || cabec?.nIdReceb
    || cabec?.cChaveNfe
  ) return value;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = encontrarRecebimento(child, seen);
    if (found) return found;
  }
  return null;
}

function encontrarFinanceiro(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (value.codigo_lancamento_integracao || value.codigo_lancamento_omie || value.codigo_lancamento) return value;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = encontrarFinanceiro(child, seen);
    if (found) return found;
  }
  return null;
}

function normalizarEtapa(value, eventType = "") {
  const text = `${value || ""} ${eventType || ""}`.toLowerCase();
  if (text.includes("faturad")) return ETAPA_FATURADO;
  if (text.includes("recebid")) return "Recebido";
  if (text.includes("aprova")) return "Aprovação";
  if (text.includes("conclu") || text.includes("encerrad")) return ETAPA_CONCLUIDO;
  return "Pedido de Compra";
}

function normalizarCompraOmie(input = {}, options = {}) {
  const record = encontrarPedido(input) || input;
  const header = record.cabecalho_consulta || record.cabecalho_pesquisa || record.cabecalho || record;
  const instanceId = String(options.instanceId || input.instanceId || "default");
  const codigoPedidoOmie = Number(primeiroValor(
    header.nCodPed,
    record.nCodPed,
    header.codigo_pedido_omie,
    record.codigo_pedido_omie,
    header.codigo_pedido,
  ));
  if (!Number.isFinite(codigoPedidoOmie) || codigoPedidoOmie <= 0) return null;
  const codigoFornecedorOmie = Number(primeiroValor(
    header.nCodFor,
    record.nCodFor,
    header.codigo_cliente_fornecedor,
    header.codigo_fornecedor_omie,
  ));
  const valorFaturado = arredondarMoeda(primeiroValor(
    header.nValTot,
    header.nValorTotal,
    header.valor_total,
    record.nValTot,
    record.valor_total,
    somarProdutos(record),
  ));
  const rateio = rateioCategoriasDaCompra(record, valorFaturado);
  const eventType = String(options.eventType || input.eventType || input.topic || "");
  const etapa = options.forceFaturado
    ? ETAPA_FATURADO
    : normalizarEtapa(primeiroValor(header.cDescEtapa, header.etapa, header.cEtapa), eventType);
  return {
    chaveExterna: `${instanceId}:${codigoPedidoOmie}`,
    instanceId,
    codigoPedidoOmie,
    codigoPedidoIntegracao: String(primeiroValor(header.cCodIntPed, record.cCodIntPed, "") || ""),
    numeroPedido: String(primeiroValor(header.cNumero, header.cNumPedido, record.cNumero, "") || ""),
    codigoFornecedorOmie: Number.isFinite(codigoFornecedorOmie) ? codigoFornecedorOmie : 0,
    codigoFornecedorIntegracao: String(primeiroValor(header.cCodIntFor, record.cCodIntFor, "") || ""),
    nomeFornecedor: String(primeiroValor(
      header.cNomeFor,
      header.cNomeFornecedor,
      header.nome_fornecedor,
      record.nome_fornecedor,
      `Fornecedor ${Number.isFinite(codigoFornecedorOmie) ? codigoFornecedorOmie : "não identificado"}`,
    )),
    codigoCategoriaOmie: String(primeiroValor(
      header.cCodCateg,
      rateio.length === 1 ? rateio[0].codigo_categoria : "",
      "",
    )),
    rateioCategoriasJson: JSON.stringify(rateio),
    codigoContaCorrenteOmie: Number(primeiroValor(header.nCodCC, record.nCodCC, 0)) || undefined,
    valorFaturado,
    etapa,
    origem: "Omie",
    statusIntegracao: "Sincronizado",
    ultimaSincronizacaoEm: new Date(),
    ultimoErro: "",
  };
}

function sim(value) {
  return ["S", "SIM", "TRUE", "1"].includes(String(value || "").trim().toUpperCase());
}

function dataOmieParaDate(data, hora) {
  const match = String(data || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const time = String(hora || "12:00:00").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const hours = Number(time?.[1] || 12);
  const minutes = Number(time?.[2] || 0);
  const seconds = Number(time?.[3] || 0);
  return new Date(Date.UTC(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    hours,
    minutes,
    seconds,
  ));
}

function cabecalhoRecebimento(record = {}) {
  return record.cabec || record.cabecalho || record.ide || record;
}

function itensDoRecebimento(record = {}) {
  return array(record.itensRecebimento || record.itens_recebimento || record.itens || record.produtos);
}

function cabecalhoItemRecebimento(item = {}) {
  return item.itensCabec || item.cabec || item.cabecalho || item;
}

function pedidoVinculadoAoRecebimento(record = {}) {
  for (const item of itensDoRecebimento(record)) {
    const cabec = cabecalhoItemRecebimento(item);
    const info = item.itensInfoAdic || item.infoAdicionais || {};
    const codigo = Number(primeiroValor(cabec.nIdPedido, cabec.nCodPed, item.nIdPedido, item.nCodPed, 0));
    const numero = String(primeiroValor(
      info.nNumPedCompra,
      cabec.nNumPedCompra,
      item.nNumPedCompra,
      codigo > 0 ? codigo : "",
    ) || "").trim();
    if (codigo > 0 || numero) return { codigo: codigo > 0 ? codigo : undefined, numero };
  }
  return { codigo: undefined, numero: "" };
}

function rateioCategoriasRecebimento(record = {}, valorTotal = 0) {
  const sums = new Map();
  for (const item of array(record.categorias || record.rateioCategorias)) {
    const codigo = String(primeiroValor(item.cCategoria, item.codigo_categoria, item.cCodCateg, "") || "").trim();
    if (!codigo) continue;
    const valor = arredondarMoeda(primeiroValor(item.vCategoria, item.valor, item.nValor, 0));
    if (valor > 0) sums.set(codigo, arredondarMoeda((sums.get(codigo) || 0) + valor));
  }
  if (!sums.size) {
    const codigo = String(primeiroValor(
      record.infoAdicionais?.cCategCompra,
      record.info_adicionais?.cCategCompra,
      "",
    ) || "").trim();
    if (codigo) sums.set(codigo, arredondarMoeda(valorTotal));
  }
  return [...sums.entries()].map(([codigo_categoria, valor]) => ({ codigo_categoria, valor }));
}

function statusDocumentoRecebimento(record = {}) {
  const info = record.infoCadastro || record.info_cadastro || {};
  if (sim(primeiroValor(info.cCancelada, info.cancelada))) return "Cancelado";
  if (sim(primeiroValor(info.cDenegado, info.denegado))) return "Denegado";
  if (sim(primeiroValor(info.cDevolvido, info.devolvido))) return "Devolvido";
  if (sim(primeiroValor(info.cRecebido, info.recebido))) return "Recebido";
  return "Pendente";
}

function tipoDocumentoRecebimento(modelo) {
  const value = String(modelo || "").trim();
  if (value === "55") return "NF-e";
  if (value === "57") return "CT-e";
  return "Outro";
}

function normalizarRecebimentoOmie(input = {}, options = {}) {
  const record = encontrarRecebimento(input) || input;
  const cabec = cabecalhoRecebimento(record);
  const instanceId = String(options.instanceId || input.instanceId || "default");
  const codigoRecebimentoOmie = Number(primeiroValor(cabec.nIdReceb, record.nIdReceb, 0));
  if (!(codigoRecebimentoOmie > 0)) return null;

  const codigoEtapaRecebimentoOmie = String(primeiroValor(
    cabec.cEtapa,
    record.cEtapa,
    "",
  ) || "").trim();
  const statusDocumentoOmie = statusDocumentoRecebimento(record);
  if (
    options.onlyPendingFaturado === true
    && (
      codigoEtapaRecebimentoOmie !== CODIGO_ETAPA_FATURADO_FORNECEDOR
      || statusDocumentoOmie !== "Pendente"
    )
  ) return null;

  const modeloDocumentoFiscal = String(primeiroValor(cabec.cModeloNFe, cabec.modelo, "") || "").trim();
  const tipoDocumentoFiscal = tipoDocumentoRecebimento(modeloDocumentoFiscal);
  const codigoFornecedorOmie = Number(primeiroValor(
    cabec.nIdFornecedor,
    cabec.nCodFor,
    record.nIdFornecedor,
    0,
  ));
  const numeroDocumentoFiscal = String(primeiroValor(
    cabec.cNumeroNFe,
    cabec.cNumero,
    record.cNumeroNFe,
    codigoRecebimentoOmie,
  ) || "").trim();
  const valorFaturado = arredondarMoeda(primeiroValor(
    cabec.nValorNFe,
    cabec.vTotal,
    record.nValorNFe,
    record.totais?.vTotalNFe,
    0,
  ));
  const rateio = rateioCategoriasRecebimento(record, valorFaturado);
  const pedido = pedidoVinculadoAoRecebimento(record);
  const infoCadastro = record.infoCadastro || record.info_cadastro || {};
  const entradaFaturadoEm = dataOmieParaDate(
    primeiroValor(infoCadastro.dFat, infoCadastro.dAlt, infoCadastro.dInc),
    primeiroValor(infoCadastro.hFat, infoCadastro.hAlt, infoCadastro.hInc),
  ) || new Date();
  const etapa = statusDocumentoOmie === "Pendente"
    ? ETAPA_FATURADO
    : statusDocumentoOmie === "Recebido"
      ? "Recebido"
      : ETAPA_CONCLUIDO;
  const situacaoCompatibilidade = statusDocumentoOmie === "Recebido"
    ? "Recebido"
    : statusDocumentoOmie === "Pendente"
      ? "Pendente"
      : "Cancelado";

  return {
    chaveExterna: `${instanceId}:recebimento:${codigoRecebimentoOmie}`,
    instanceId,
    codigoRecebimentoOmie,
    chaveDocumentoFiscal: String(primeiroValor(cabec.cChaveNfe, record.cChaveNfe, "") || "").trim(),
    tipoDocumentoFiscal,
    modeloDocumentoFiscal,
    numeroDocumentoFiscal,
    serieDocumentoFiscal: String(primeiroValor(cabec.cSerieNFe, cabec.cSerie, "") || "").trim(),
    dataEmissaoDocumentoFiscal: String(primeiroValor(cabec.dEmissaoNFe, cabec.dEmissao, "") || "").trim(),
    codigoEtapaRecebimentoOmie,
    statusDocumentoOmie,
    codigoPedidoOmie: pedido.codigo,
    numeroPedido: pedido.numero,
    codigoFornecedorOmie: Number.isFinite(codigoFornecedorOmie) ? codigoFornecedorOmie : 0,
    nomeFornecedor: String(primeiroValor(
      cabec.cNome,
      cabec.cRazaoSocial,
      cabec.cNomeFor,
      `Fornecedor ${Number.isFinite(codigoFornecedorOmie) ? codigoFornecedorOmie : "não identificado"}`,
    ) || "").trim(),
    codigoCategoriaOmie: String(primeiroValor(
      record.infoAdicionais?.cCategCompra,
      rateio.length === 1 ? rateio[0].codigo_categoria : "",
      "",
    ) || "").trim(),
    rateioCategoriasJson: JSON.stringify(rateio),
    codigoContaCorrenteOmie: Number(primeiroValor(record.infoAdicionais?.nIdConta, 0)) || undefined,
    valorFaturado,
    situacaoPedidoOmieOrigem: situacaoCompatibilidade,
    etapa,
    entradaFaturadoEm,
    origem: "Omie",
    statusConclusaoOmie: statusDocumentoOmie === "Recebido" ? "Concluído" : "Não enviado",
    concluidaNoOmieEm: statusDocumentoOmie === "Recebido" ? entradaFaturadoEm : undefined,
    statusIntegracao: "Sincronizado",
    ultimaSincronizacaoEm: new Date(),
    ultimoErro: "",
  };
}

module.exports = {
  cabecalhoItemRecebimento,
  cabecalhoRecebimento,
  encontrarFinanceiro,
  encontrarPedido,
  encontrarRecebimento,
  itensDoRecebimento,
  normalizarCompraOmie,
  normalizarRecebimentoOmie,
  pedidoVinculadoAoRecebimento,
  rateioCategoriasRecebimento,
  statusDocumentoRecebimento,
  tipoDocumentoRecebimento,
};
