"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const runtime = fs.readFileSync(
  path.join(__dirname, "../src/services/contasPagar/runtime.js"),
  "utf8",
);

test("tickets criados pela Central disparam processamento automático da fila", () => {
  assert.match(runtime, /async function enqueueIntegration\(input = \{\}\)/);
  assert.match(runtime, /await runtime\.enqueueIntegration\(input\)/);
  assert.match(runtime, /agendarProcessamentoIntegracoes\(input\.provider\)/);
  assert.match(runtime, /runtime\.integrations\?\.processIntegrationQueue/);
  assert.match(runtime, /setImmediate\(async \(\) =>/);
});

test("core expõe o enqueue automático sem alterar os consumidores existentes", () => {
  assert.match(runtime, /return \{\s*\.\.\.runtime,\s*enqueueIntegration,\s*\};/s);
  assert.match(runtime, /AUTO_PROCESS_BATCH_SIZE = 50/);
  assert.match(runtime, /result\.results\.length >= AUTO_PROCESS_BATCH_SIZE/);
});
