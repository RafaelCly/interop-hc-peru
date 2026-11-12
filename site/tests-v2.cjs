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

  // Alerta de seguridad entre sedes: alergia en una sede, medicamento de la misma clase en otra
  assert.ok(
    resumen.seguridad.some(
      (y) => /penicilina/i.test(y.alergia) && /amoxicilina/i.test(y.medicamento) && y.entreSedes,
    ),
  );
  assert.equal(c.clinicalSummary("90000004").seguridad.length, 0);
  const sulfas = require("./lib/seguridad.ts").cruzarAlergias({
    alergias: [{ sustancia: "Sulfas", reaccion: "Prurito", fuentes: [{ clave: "essalud", lugar: "E" }] }],
    medicamentos: [{ nombre: "Sulfato ferroso 300 mg", fuentes: [{ clave: "essalud", lugar: "E", estado: "active" }] }],
  });
  assert.equal(sulfas.length, 0, "sulfato ferroso no es una sulfonamida");
  // Resumen para la consulta: lo crítico va primero y el motivo resalta lo relacionado
  const r1 = require("./lib/resumen-consulta.ts").resumenConsulta(resumen, "cansancio y azúcar alta");
  assert.equal(r1[0].nivel, "critico");
  assert.ok(r1.some((y) => y.relevante && /glucosa|hemoglobina/i.test(y.titulo)));
  assert.ok(r1.every((y) => y.fuente));

  const s0 = await a.readState();
  const pac = s0.users.find((u) => u.dni === "90000002");

  // Acceso de emergencia: sin permiso previo, queda registrado y el paciente lo ve
  const pac3 = s0.users.find((u) => u.dni === "90000003");
  assert.ok(!a.hasPermission(await a.readState(), doc2, "90000003"));
  await assert.rejects(() => a.accesoEmergencia(doc2, "90000003", "corto"), undefined);
  await a.accesoEmergencia(doc2, "90000003", "Paciente inconsciente, se requieren alergias");
  assert.ok(a.hasPermission(await a.readState(), doc2, "90000003"));
  assert.ok((await a.userEvents(pac3)).some((e) => e.accion === "acceso_emergencia"));
  assert.equal((await a.userRequests(pac3))[0].via, "emergencia");
  await a.decide(pac3, (await a.userRequests(pac3))[0].id, "revocar");
  assert.ok(!a.hasPermission(await a.readState(), doc2, "90000003"));

  // Acceso durante la cita: solo el médico de la cita, solo hoy, y el paciente puede retirarlo o desactivarlo
  const agenda1 = await a.agendaMedico(doc);
  assert.equal(agenda1.length, 4);
  const cita4 = agenda1.find((x) => x.dni === "90000004");
  assert.equal(cita4.estado, "libre");
  await assert.rejects(() => a.abrirAtencion(doc2, cita4.id), /agenda de hoy/);
  assert.equal((await a.abrirAtencion(doc, cita4.id)).dni, "90000004");
  assert.ok(a.hasPermission(await a.readState(), doc, "90000004"));
  assert.ok(!a.hasPermission(await a.readState(), doc2, "90000004"));
  const pac4 = s0.users.find((u) => u.dni === "90000004");
  const solCita = (await a.userRequests(pac4)).find((x) => x.via === "atencion");
  await a.decide(pac4, solCita.id, "revocar");
  await assert.rejects(() => a.abrirAtencion(doc, cita4.id), /retiró el permiso/);
  const pac3cita = s0.users.find((u) => u.dni === "90000003");
  await a.cambiarAccesoPorAtencion(pac3cita, false);
  const cita3 = (await a.agendaMedico(doc)).find((x) => x.dni === "90000003");
  assert.equal(cita3.estado, "desactivado");
  await assert.rejects(() => a.abrirAtencion(doc, cita3.id), /desactivó/);
  assert.equal((await a.consultasPaciente(pac3cita)).accesoPorAtencion, false);

  // Código por SMS: llega al paciente, sirve una vez, se bloquea tras intentos fallidos
  await a.enviarSms(doc2, "90000005");
  await assert.rejects(() => a.enviarSms(doc2, "90000005"), /Espera un minuto/);
  const pac5 = s0.users.find((u) => u.dni === "90000005");
  const sms = (await a.consultasPaciente(pac5)).sms[0];
  const cod = sms.texto.match(/\b(\d{6})\b/)[1];
  await assert.rejects(() => a.verificarSms(doc, "90000005", cod), /venció o no se envió/);
  await assert.rejects(() => a.verificarSms(doc2, "90000005", cod === "000000" ? "111111" : "000000"), /incorrecto/);
  assert.equal((await a.verificarSms(doc2, "90000005", cod)).dni, "90000005");
  assert.ok(a.hasPermission(await a.readState(), doc2, "90000005"));
  assert.ok((await a.consultasPaciente(pac5)).sms[0].usado);
  await assert.rejects(() => a.verificarSms(doc2, "90000005", cod), /venció o no se envió/);
  await a.enviarSms(doc, "90000006");
  for (let i = 0; i < 5; i++) await assert.rejects(() => a.verificarSms(doc, "90000006", "12345x"));
  await assert.rejects(() => a.verificarSms(doc, "90000006", "123456"), /venció o no se envió/);

  // Resultados aportados por el paciente: validación, aislamiento y borrado
  const dg = require("./lib/server/digitalizar.ts");
  // El paciente no escribe valores: confirma o descarta lo que leyó la IA. Se simula una lectura ya hecha.
  const lect = (hash, patientId, resultado) => ({ hash, patientId, cuando: new Date().toISOString(), resultado });
  const sl = await a.readState();
  sl.lecturasIA = [
    lect("lec-ok", p.id, {
      esResultado: true, motivo: "", laboratorio: "Laboratorio Clínico Demo SJL", fecha: "2026-10-28",
      examenes: [
        { nombreEnDocumento: "HbA1c", codigo: "4548-4", valor: "6.9", unidad: "%", textoResultado: "6.9 %", confianza: "alta" },
        { nombreEnDocumento: "Rx tórax", codigo: "24558-9", valor: "", unidad: "", textoResultado: "Sin hallazgos", confianza: "alta" },
        { nombreEnDocumento: "Glucosa", codigo: "2345-7", valor: "", unidad: "mg/dL", textoResultado: "", confianza: "baja" },
        { nombreEnDocumento: "Vitamina X", codigo: "", valor: "3", unidad: "", textoResultado: "3", confianza: "alta" },
      ],
    }),
    lect("lec-futura", p.id, { esResultado: true, motivo: "", laboratorio: "Lab", fecha: "2099-01-01", examenes: [{ nombreEnDocumento: "Glucosa", codigo: "2345-7", valor: "100", unidad: "mg/dL", textoResultado: "100", confianza: "alta" }] }),
    lect("lec-mala", p.id, { esResultado: true, motivo: "", laboratorio: "Lab", fecha: "2026-10-28", examenes: [] }),
    ...(sl.lecturasIA ?? []),
  ];
  await a.writeState(sl);
  await assert.rejects(() => dg.confirmarLectura(p, "lec-futura"), /futura/);
  await assert.rejects(() => dg.confirmarLectura(pac, "lec-ok"), /no encontrada/);
  await assert.rejects(() => dg.confirmarLectura(doc, "lec-ok"), /Sin permiso/);
  await assert.rejects(() => dg.confirmarLectura(p, "lec-ok", [0, 1]), /al menos un examen/);
  await dg.descartarLectura(p, "lec-mala");
  await assert.rejects(() => dg.confirmarLectura(p, "lec-mala"), /Descartaste/);
  assert.ok((await a.userEvents(p)).some((e) => e.accion === "lectura_descartada"));
  // Glucosa sin valor y el examen fuera del catálogo no se guardan; los otros dos sí, tal como se leyeron.
  assert.equal(await dg.confirmarLectura(p, "lec-ok"), 2);
  await assert.rejects(() => dg.confirmarLectura(p, "lec-ok"), /ya está guardada/);
  const aps = await dg.aportadosDe(p.id);
  assert.equal(aps.length, 2);
  assert.ok(aps.every((x) => !("patientId" in x)));
  assert.equal(aps.find((x) => x.codigo === "4548-4").resultado, "6.9 %");
  assert.equal((await dg.aportadosDe(pac.id)).length, 0);
  await assert.rejects(() => dg.borrarAportado(pac, aps[0].id), /no encontrado/);
  // Sin clave de IA configurada, la lectura avisa en vez de fallar sin explicación.
  const claveIA = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(() => dg.digitalizarResultado(p, "aGVsbG8=", "image/jpeg"), /no está configurada/);
  await assert.rejects(() => dg.digitalizarResultado(p, "aGVsbG8=", "image/gif"), /Formato/);
  if (claveIA) process.env.ANTHROPIC_API_KEY = claveIA;

  // Carné QR: firmado, legible con la clave pública y rechazado si se altera
  const cs = require("./lib/server/carnet-servidor.ts");
  const carnetLib = require("./lib/carnet.ts");
  const emitido = await cs.emitirCarnet(p);
  assert.match(emitido.codigo, /^HCP1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(emitido.bytes < 2900, `el carné debe caber en un QR (${emitido.bytes})`);
  const pub = await carnetLib.importarPublica(await cs.clavePublica());
  const leido = await carnetLib.leerCarnet(emitido.codigo, pub);
  assert.ok(leido.ok && !leido.vencido);
  assert.equal(leido.carnet.d, "90000001");
  assert.ok(leido.carnet.a.some(([s]) => /penicilina/i.test(s)));
  assert.ok(leido.carnet.r.some((x) => x[4] === "paciente" && x[0] === "4548-4"));
  assert.ok(leido.carnet.r.some((x) => x[4] !== "paciente"));
  const [pre, datos, firma] = emitido.codigo.split(".");
  const alterado = `${pre}.${datos.slice(0, -2)}${datos.slice(-2) === "AA" ? "BB" : "AA"}.${firma}`;
  assert.equal((await carnetLib.leerCarnet(alterado, pub)).ok, false);
  const otra = await carnetLib.generarClaves();
  assert.equal((await carnetLib.leerCarnet(emitido.codigo, await carnetLib.importarPublica(otra.publica))).ok, false);
  assert.equal((await carnetLib.leerCarnet("hola", pub)).ok, false);
  await assert.rejects(() => cs.emitirCarnet(doc), /Sin permiso/);
  assert.ok((await a.userEvents(p)).some((e) => e.accion === "carne_emitido"));
  await dg.borrarAportado(p, aps[0].id);
  assert.equal((await dg.aportadosDe(p.id)).length, 1);

  console.log(
    `OK V2 (almacén ${tipoAlmacen}): 2 médicos, 24 pacientes; login, aislamiento, permisos, revocación, ` +
      `auditoría, alertas de seguridad, emergencia, acceso en la cita, código SMS, ${resumen.atenciones.length} atenciones, ${resumen.examenes.length} resultados y caída parcial.`,
  );
  console.log(`OK MVP2: carné QR firmado (${emitido.bytes} caracteres), verificación y rechazo si se altera; resultados aportados y validación.`);
}

probar()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(limpiar);
