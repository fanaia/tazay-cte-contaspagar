"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("envio remove códigos derivados quando referências foram limpas", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/reconciliation.js"), "utf8");
  const start = source.indexOf("const categoryId =");
  const end = source.indexOf("const compras = await Compra.find", start);
  const block = source.slice(start, end);
  assert.match(block, /unset\.categoriaOmieId = 1/);
  assert.match(block, /unset\.codigoCategoriaOmie = 1/);
  assert.match(block, /unset\.contaCorrenteOmieId = 1/);
  assert.match(block, /unset\.codigoContaCorrenteOmie = 1/);
  assert.match(block, /update\.\$unset = unset/);
});
