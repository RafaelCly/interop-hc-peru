import "server-only";
import { generarClaves, importarPrivada, codificarCarnet, type Carnet, type OrigenCarnet } from "@/lib/carnet";
import { clinicalSummary } from "./clinical";
import { addEvent, readState, writeState, type DemoUser, type State } from "./auth";

// Vigencia del carné: el resumen es una foto del historial en ese momento y debe renovarse.
export const DIAS_CARNET = 30;
const MAX_EXAMENES = 8;
const MAX_APORTADOS = 4;

/**
 * Clave de firma. En un despliegue se define QR_FIRMA_JWK (JWK privada P-256). Sin ella, la demostración
 * genera un par una sola vez y lo guarda en el almacén del portal, para que los carnés emitidos sigan
 * siendo válidos entre reinicios.
 */
async function claves(s: State): Promise<{ privada: JsonWebKey; publica: JsonWebKey; nueva: boolean }> {
  const env = process.env.QR_FIRMA_JWK;
  if (env) {
    const privada = JSON.parse(env) as JsonWebKey;
    return { privada, publica: { kty: privada.kty, crv: privada.crv, x: privada.x, y: privada.y }, nueva: false };
  }
  if (s.firma) return { ...s.firma, nueva: false };
  s.firma = await generarClaves();
  return { ...s.firma, nueva: true };
}

export async function clavePublica(): Promise<JsonWebKey> {
  const s = await readState();
  const c = await claves(s);
  if (c.nueva) await writeState(s);
  return c.publica;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export async function emitirCarnet(paciente: DemoUser): Promise<{ codigo: string; vence: string; bytes: number }> {
  if (paciente.role !== "paciente" || !paciente.dni) throw Error("Sin permiso");
  const r = clinicalSummary(paciente.dni);
  if (!r) throw Error("No se encontró la historia del paciente.");
  const s = await readState();

  // Último resultado de cada examen, primero los registrados por las redes y luego los aportados.
  const vistos = new Set<string>();
  const examenes: Carnet["r"] = [];
  for (const e of r.examenes) {
    if (!e.codigo || vistos.has(e.codigo) || examenes.length >= MAX_EXAMENES) continue;
    vistos.add(e.codigo);
    examenes.push([e.codigo, e.nombre, e.resultado, e.fecha, e.sistema as OrigenCarnet]);
  }
  const aportados = (s.aportados ?? [])
    .filter((a) => a.patientId === paciente.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, MAX_APORTADOS);
  for (const a of aportados) examenes.push([a.codigo, a.nombre, a.resultado, a.fecha, "paciente"]);

  const vigentes = r.medicamentos
    .filter((m) => m.fuentes.some((f) => f.estado === "active" && (!f.fin || f.fin >= hoy())))
    .map((m) => m.nombre);
  const vence = new Date(Date.now() + DIAS_CARNET * 86400_000).toISOString();
  const carnet: Carnet = {
    v: 1,
    n: r.nombre,
    d: r.dni,
    s: r.sexo,
    e: r.edad,
    g: new Date().toISOString(),
    x: vence,
    a: r.alergias.map((a) => [a.sustancia, a.reaccion]),
    c: r.condiciones.map((c) => c.nombre),
    m: vigentes,
    r: examenes,
  };
  const c = await claves(s);
  const codigo = await codificarCarnet(carnet, await importarPrivada(c.privada));
  addEvent(
    s,
    paciente.id,
    "carne_emitido",
    `Carné QR con resumen firmado, vigente ${DIAS_CARNET} días. Quien lo escanee puede leerlo sin conexión.`,
    paciente.id,
  );
  await writeState(s);
  return { codigo, vence, bytes: codigo.length };
}
