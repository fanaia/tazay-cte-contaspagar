"use strict";

const fs = require("node:fs");

function replaceOnce(path, oldValue, newValue) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(oldValue)) throw new Error(`Trecho não encontrado em ${path}`);
  fs.writeFileSync(path, source.replace(oldValue, newValue));
}

replaceOnce(
  "backend/src/services/contasPagar/reconciliation.js",
  `  const set = {};
  if (categoryId) {
    const categoria = await resolverCategoria(categoryId);
    set.categoriaOmieId = categoria.id;
    set.codigoCategoriaOmie = categoria.codigo;
    set.nomeCategoriaOmie = categoria.nome;
  }
  if (currentAccountId) {
    const contaCorrente = await resolverContaCorrente(currentAccountId);
    set.contaCorrenteOmieId = contaCorrente.id;
    set.codigoContaCorrenteOmie = contaCorrente.codigo;
    set.nomeContaCorrenteOmie = contaCorrente.nome;
  }
  if (Object.keys(set).length) {
    conta = await ContaPagarAgrupada.findByIdAndUpdate(
      conta._id,
      { $set: set },
      { new: true, runValidators: true },
    );
  }
`,
  `  const set = {};
  const unset = {};
  if (categoryId) {
    const categoria = await resolverCategoria(categoryId);
    set.categoriaOmieId = categoria.id;
    set.codigoCategoriaOmie = categoria.codigo;
    set.nomeCategoriaOmie = categoria.nome;
  } else {
    unset.categoriaOmieId = 1;
    unset.codigoCategoriaOmie = 1;
    unset.nomeCategoriaOmie = 1;
  }
  if (currentAccountId) {
    const contaCorrente = await resolverContaCorrente(currentAccountId);
    set.contaCorrenteOmieId = contaCorrente.id;
    set.codigoContaCorrenteOmie = contaCorrente.codigo;
    set.nomeContaCorrenteOmie = contaCorrente.nome;
  } else {
    unset.contaCorrenteOmieId = 1;
    unset.codigoContaCorrenteOmie = 1;
    unset.nomeContaCorrenteOmie = 1;
  }
  if (Object.keys(set).length || Object.keys(unset).length) {
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    conta = await ContaPagarAgrupada.findByIdAndUpdate(
      conta._id,
      update,
      { new: true, runValidators: true },
    );
  }
`,
);

const versions = [
  ["package.json", "devDependencies", "@oondemand/create-central-oon"],
  ["backend/package.json", "dependencies", "@oondemand/oon-core-back"],
  ["frontend/package.json", "dependencies", "@oondemand/oon-core-front"],
];
for (const [path, section, packageName] of versions) {
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  data[section][packageName] = "0.3.69";
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

const manifest = JSON.parse(fs.readFileSync("central.app.json", "utf8"));
manifest.compatibility.core.minVersion = "0.3.69";
fs.writeFileSync("central.app.json", `${JSON.stringify(manifest, null, 2)}\n`);

fs.writeFileSync(
  "backend/test/parametrosFinanceiros.test.js",
  `"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("envio remove códigos derivados quando referências foram limpas", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/contasPagar/reconciliation.js"), "utf8");
  const start = source.indexOf("const categoryId =");
  const end = source.indexOf("const compras = await Compra.find", start);
  const block = source.slice(start, end);
  assert.match(block, /unset\\.categoriaOmieId = 1/);
  assert.match(block, /unset\\.codigoCategoriaOmie = 1/);
  assert.match(block, /unset\\.contaCorrenteOmieId = 1/);
  assert.match(block, /unset\\.codigoContaCorrenteOmie = 1/);
  assert.match(block, /update\\.\\$unset = unset/);
});
`,
);
