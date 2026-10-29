/* Pruebas del servidor del portal, sin levantar el frontend. Uso: npm run test:v2 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const os = require("os");
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
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  mod._compile(js, filename);
};

// Las pruebas usan una carpeta de estado temporal, sin tocar la de desarrollo.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "interop-hc-peru-test-"));
process.env.DEMO_STATE_DIR = home;
function limpiar() {
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    /* la carpeta es temporal; si no se puede borrar ahora, el sistema la recogerá */
  }
}

async function probar() {
  const a = require("./lib/server/auth.ts");
  const c = require("./lib/server/clinical.ts");
  const { tipoAlmacen } = require("./lib/server/almacen.ts");

  const s = await a.readState();
  assert.equal(s.users.filter((u) => u.role === "paciente").length, 24);
  assert.equal(s.users.filter((u) => u.role === "medico").length, 2);
  const doc = s.users.find((u) => u.id === "medico-1");
  const doc2 = s.users.find((u) => u.id === "medico-2");
  const p = s.users.find((u) => u.dni === "90000001");

  // Autenticación
  assert.ok(!a.hasPermission(s, doc, "90000001"));
  assert.ok(!(await a.authenticate("medico.demo@sjl.test", "wrong")).token);
  assert.ok(
    (await a.authenticate("medico.demo@sjl.test", "DemoMedico2026!", "medico", "CMP-DEMO-001")).token,
  );
  assert.ok(
    (await a.authenticate("paciente01@demo.sjl.test", "DemoPaciente2026!", "paciente", "90000001")).token,
  );
  assert.ok(
    !(await a.authenticate("paciente01@demo.sjl.test", "DemoPaciente2026!", "paciente", "90000002")).token,
  );

  // Datos clínicos
  const resumen = c.clinicalSummary("90000001");
  assert.ok(resumen.atenciones.length >= 5);
  assert.ok(resumen.examenes.length >= 10);
  assert.ok(resumen.atenciones.every((x) => x.fechaHora && x.establecimiento && x.profesional));
  assert.ok(resumen.examenes.some((x) => x.unidad && x.referencia));

  // Solicitud, autorización, revocación y auditoría
  assert.ok(!a.hasPermission(await a.readState(), doc, "90000001"));
  await a.requestAccess(doc, "90000001", "Consulta de continuidad clínica de demostración");
  const x = (await a.userRequests(p))[0];
  assert.equal(x.estado, "pendiente");
  await a.decide(p, x.id, "aprobar", 1);
  assert.ok(a.hasPermission(await a.readState(), doc, "90000001"));
  assert.ok(!a.hasPermission(await a.readState(), doc2, "90000001"));
  await a.registerAccess(doc, p.id, true);
  assert.ok((await a.userEvents(p)).some((e) => e.accion === "historia_consultada"));
  await a.decide(p, x.id, "revocar");
  assert.ok(!a.hasPermission(await a.readState(), doc, "90000001"));

  // Caída parcial de una fuente y protección de origen
  const parcial = c.clinicalSummary("90000001", "minsa");
  assert.ok(parcial.traza.sistemas.some((y) => y.clave === "minsa" && y.estado === "no_disponible"));
  assert.equal(
    a.checkOrigin({
      headers: { get: () => "http://evil.example" },
      url: "http://localhost:3000/api/portal/login",
    }),
    false,
  );

  console.log(
    `OK V2 (almacén ${tipoAlmacen}): 2 médicos, 24 pacientes; login, aislamiento, permisos, revocación, ` +
      `auditoría, ${resumen.atenciones.length} atenciones, ${resumen.examenes.length} resultados y caída parcial.`,
  );
}

probar()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(limpiar);
