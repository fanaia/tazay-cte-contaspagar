"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("central.app.json"));

function role(code) {
  return manifest.rbac.roles.find((item) => item.code === code);
}

test("OonCore backend e frontend estão fixados em 0.3.75", () => {
  const backend = JSON.parse(read("backend/package.json"));
  const frontend = JSON.parse(read("frontend/package.json"));
  const rootPackage = JSON.parse(read("package.json"));

  assert.equal(backend.dependencies["@oondemand/oon-core-back"], "0.3.75");
  assert.equal(frontend.dependencies["@oondemand/oon-core-front"], "0.3.75");
  assert.equal(rootPackage.devDependencies["@oondemand/create-central-oon"], "0.3.75");
  assert.deepEqual(manifest.compatibility.core, {
    minVersion: "0.3.75",
    maxVersionExclusive: "0.3.76",
  });
});

test("RBAC declara Administrador, Aprovador e Financeiro com menor privilégio", () => {
  assert.deepEqual(
    manifest.rbac.roles.map((item) => item.name),
    ["Administrador", "Aprovador", "Financeiro"],
  );
  assert.deepEqual(role("admin").permissions, ["*"]);
  assert.equal(role("admin").admin, true);
  assert.deepEqual(role("aprovador").permissions, [
    "tazay.operation.read",
    "tazay.approval.execute",
  ]);
  assert.deepEqual(role("financeiro").permissions, [
    "tazay.operation.read",
    "tazay.finance.read",
    "tazay.finance.execute",
  ]);
  assert.equal(role("aprovador").permissions.includes("tazay.finance.execute"), false);
  assert.equal(role("financeiro").permissions.includes("tazay.approval.execute"), false);
  assert.equal(role("aprovador").permissions.includes("tazay.configuration.manage"), false);
  assert.equal(role("financeiro").permissions.includes("tazay.configuration.manage"), false);
});

test("rotas operacionais usam permissões RBAC em vez de roles legadas", () => {
  const source = read("backend/src/routes/contasPagar.js");
  assert.match(source, /TAZAY_PERMISSIONS\.OPERATION_READ/);
  assert.match(source, /TAZAY_PERMISSIONS\.APPROVAL_EXECUTE/);
  assert.match(source, /TAZAY_PERMISSIONS\.FINANCE_READ/);
  assert.match(source, /TAZAY_PERMISSIONS\.FINANCE_EXECUTE/);
  assert.match(source, /TAZAY_PERMISSIONS\.CONFIGURATION_MANAGE/);
  assert.doesNotMatch(source, /roles\s*:/);
});

test("CRUDs de domínio não mantêm bypass por roles legadas", () => {
  for (const file of [
    "backend/src/models/Compra.js",
    "backend/src/models/ContaPagarAgrupada.js",
    "backend/src/models/ConfiguracaoContasPagar.js",
    "backend/src/models/CategoriaOmie.js",
    "backend/src/models/ContaCorrenteOmie.js",
  ]) {
    const source = read(file);
    assert.match(source, /permissions\s*:/);
    assert.doesNotMatch(source, /roles\s*:/);
  }
});

test("frontend filtra operação, financeiro e configuração pelas permissões do Core", () => {
  const source = read("frontend/src/main.tsx");
  assert.match(source, /tazay\.operation\.read/);
  assert.match(source, /tazay\.finance\.read/);
  assert.match(source, /tazay\.configuration\.manage/);
  assert.match(source, /permissions:\s*OPERATION_READ/);
  assert.match(source, /permissions:\s*FINANCE_READ/);
  assert.match(source, /permissions:\s*CONFIGURATION_MANAGE/);
});
