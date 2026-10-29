/* Sin Redis en Vercel el portal no debe fingir que funciona. Uso: parte de npm run test:v2 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const assert = require("node:assert/strict");
const root = __dirname;
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "server-only" || request === "next/headers")
    return path.resolve(root, "tests-server-only.cjs");
  if (request.startsWith("@/")) request = path.resolve(root, request.substring(2));
  return originalResolve.call(this, request, parent, ...rest);
};
require.extensions[".ts"] = function (mod, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  mod._compile(js, filename);
};

async function probar() {
  process.env.VERCEL = "1";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const {
    tipoAlmacen,
    almacenListo,
    leerEstado,
    guardarEstado,
    ErrorAlmacen,
  } = require("./lib/server/almacen.ts");
  assert.equal(tipoAlmacen, "sin_almacen");
  assert.equal(almacenListo, false);
  await assert.rejects(leerEstado(), (e) => e instanceof ErrorAlmacen && /Redis/.test(e.message));
  await assert.rejects(guardarEstado("{}"), (e) => e instanceof ErrorAlmacen);
  const a = require("./lib/server/auth.ts");
  await assert.rejects(
    a.authenticate("medico.demo@sjl.test", "DemoMedico2026!", "medico", "CMP-DEMO-001"),
    ErrorAlmacen,
  );
  console.log("OK almacén: en Vercel sin Redis el portal falla con un mensaje claro, sin simular sesiones.");
}
probar().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
