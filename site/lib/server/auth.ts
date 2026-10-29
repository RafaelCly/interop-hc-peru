import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PACIENTES } from "@/lib/fhir-server";
import { ErrorAlmacen, guardarEstado, leerEstado } from "./almacen";

export type Role = "medico" | "paciente";
export interface DemoUser {
  id: string;
  role: Role;
  nombre: string;
  correo: string;
  dni?: string;
  cmp?: string;
  establecimiento?: string;
  habilitacion?: string;
  salt: string;
  hash: string;
  bloqueadoHasta?: number;
  intentos?: number;
}
export type Decision = "pendiente" | "aprobada" | "rechazada" | "revocada";
export interface Solicitud {
  id: string;
  doctorId: string;
  patientId: string;
  dni: string;
  finalidad: string;
  estado: Decision;
  creada: string;
  decidida?: string;
  expira?: string;
}
export interface Evento {
  id: string;
  cuando: string;
  actorId: string;
  patientId?: string;
  solicitudId?: string;
  accion: string;
  detalle: string;
}
interface Session {
  hash: string;
  userId: string;
  expira: number;
}
interface State {
  users: DemoUser[];
  sessions: Session[];
  solicitudes: Solicitud[];
  eventos: Evento[];
}
const KEY = "sjl_session";
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
const senha = (pass: string, salt: string) => scryptSync(pass, salt, 64).toString("hex");
const iso = () => new Date().toISOString();
const limpiar = (s: State) => {
  s.sessions = s.sessions.filter((x) => x.expira > Date.now());
};
function seed(): State {
  const make = (
    id: string,
    role: Role,
    nombre: string,
    correo: string,
    password: string,
    extras: Partial<DemoUser> = {},
  ): DemoUser => {
    const salt = randomBytes(16).toString("hex");
    return { id, role, nombre, correo: correo.toLowerCase(), salt, hash: senha(password, salt), ...extras };
  };
  const users: DemoUser[] = [
    make("medico-1", "medico", "Dra. Lucía Paredes Vega", "medico.demo@sjl.test", "DemoMedico2026!", {
      cmp: "CMP-DEMO-001",
      habilitacion: "SIMULADA · sin conexión al CMP",
      establecimiento: "Hospital San Juan de Lurigancho (sede referencial)",
    }),
    make("medico-2", "medico", "Dr. Carlos Medina Ríos", "medico2.demo@sjl.test", "DemoMedico2026!", {
      cmp: "CMP-DEMO-002",
      habilitacion: "SIMULADA · sin conexión al CMP",
      establecimiento: "Hospital EsSalud Aurelio Díaz Ufano (sede referencial)",
    }),
  ];
  PACIENTES.forEach((p, i) =>
    users.push(
      make(
        `paciente-${i + 1}`,
        "paciente",
        p.nombre,
        `paciente${String(i + 1).padStart(2, "0")}@demo.sjl.test`,
        "DemoPaciente2026!",
        { dni: p.dni },
      ),
    ),
  );
  return { users, sessions: [], solicitudes: [], eventos: [] };
}
export async function readState(): Promise<State> {
  const raw = await leerEstado();
  if (!raw) {
    const s = seed();
    await guardarEstado(JSON.stringify(s));
    return s;
  }
  const s = JSON.parse(raw) as State;
  limpiar(s);
  return s;
}
export async function writeState(s: State): Promise<void> {
  await guardarEstado(JSON.stringify(s));
}
export type SafeUser = Pick<
  DemoUser,
  "id" | "role" | "nombre" | "correo" | "dni" | "cmp" | "establecimiento" | "habilitacion"
>;
export function publicUser(u: DemoUser): SafeUser {
  return {
    id: u.id,
    role: u.role,
    nombre: u.nombre,
    correo: u.correo,
    dni: u.dni,
    cmp: u.cmp,
    establecimiento: u.establecimiento,
    habilitacion: u.habilitacion,
  };
}
export async function authenticate(
  correo: string,
  password: string,
  perfil?: Role,
  documento?: string,
): Promise<{ token?: string; user?: SafeUser; error?: string }> {
  const s = await readState();
  const u = s.users.find((u) => u.correo === correo.trim().toLowerCase());
  // Verificación de costo fijo aun cuando la cuenta no exista.
  const fauxSalt = "aabbccddeeff00112233445566778899";
  const hashed = senha(password, u?.salt ?? fauxSalt);
  const expected = Buffer.from(u?.hash ?? "0".repeat(128), "hex");
  const valid = timingSafeEqual(Buffer.from(hashed, "hex"), expected);
  if (
    !u ||
    !valid ||
    (perfil && u.role !== perfil) ||
    (perfil === "paciente" && u.dni !== documento) ||
    (perfil === "medico" && u.cmp !== documento) ||
    Number(u.bloqueadoHasta ?? 0) > Date.now()
  ) {
    if (u) {
      u.intentos = (u.intentos ?? 0) + 1;
      if (u.intentos >= 5) {
        u.bloqueadoHasta = Date.now() + 15 * 60_000;
        u.intentos = 0;
      }
      await writeState(s);
    }
    return { error: "Credenciales inválidas o cuenta temporalmente bloqueada." };
  }
  u.intentos = 0;
  u.bloqueadoHasta = undefined;
  const token = randomBytes(32).toString("hex");
  s.sessions.push({ hash: hashToken(token), userId: u.id, expira: Date.now() + 8 * 3600_000 });
  addEvent(s, u.id, "inicio_sesion", "Inicio de sesión autenticado");
  await writeState(s);
  return { token, user: publicUser(u) };
}
export function addEvent(
  s: State,
  actorId: string,
  accion: string,
  detalle: string,
  patientId?: string,
  solicitudId?: string,
) {
  s.eventos.unshift({
    id: randomBytes(12).toString("hex"),
    cuando: iso(),
    actorId,
    patientId,
    solicitudId,
    accion,
    detalle,
  });
  s.eventos = s.eventos.slice(0, 1000);
}
export async function session(): Promise<DemoUser | null> {
  const token = (await cookies()).get(KEY)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  try {
    const s = await readState();
    const x = s.sessions.find((x) => x.hash === hashToken(token) && x.expira > Date.now());
    return x ? (s.users.find((u) => u.id === x.userId) ?? null) : null;
  } catch (e) {
    if (e instanceof ErrorAlmacen) return null; // sin almacén no hay sesión; el ingreso explica el motivo
    throw e;
  }
}
export async function setSession(token: string) {
  (await cookies()).set(KEY, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
}
export async function endSession() {
  const c = await cookies();
  const token = c.get(KEY)?.value;
  if (token) {
    const s = await readState();
    s.sessions = s.sessions.filter((x) => x.hash !== hashToken(token));
    await writeState(s);
  }
  c.delete(KEY);
}
export function hasPermission(s: State, doctor: DemoUser, dni: string): boolean {
  if (doctor.role !== "medico") return false;
  return s.solicitudes.some(
    (x) =>
      x.doctorId === doctor.id &&
      x.dni === dni &&
      x.estado === "aprobada" &&
      Boolean(x.expira) &&
      Date.parse(x.expira!) > Date.now(),
  );
}
export async function requestAccess(doctor: DemoUser, dni: string, finalidad: string): Promise<string> {
  const s = await readState();
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const patient = s.users.find((x) => x.role === "paciente" && x.dni === dni);
  if (!patient) return "Si existe un paciente de demostración con ese documento, recibirá la solicitud.";
  const actuales = s.solicitudes.filter(
    (x) => x.doctorId === doctor.id && x.creada.slice(0, 10) === iso().slice(0, 10),
  );
  if (actuales.length >= 30) throw Error("Límite diario de solicitudes alcanzado.");
  if (
    s.solicitudes.some(
      (x) => x.doctorId === doctor.id && x.patientId === patient.id && x.estado === "pendiente",
    )
  )
    return "Ya existe una solicitud pendiente.";
  const x: Solicitud = {
    id: randomBytes(12).toString("hex"),
    doctorId: doctor.id,
    patientId: patient.id,
    dni,
    finalidad,
    estado: "pendiente",
    creada: iso(),
  };
  s.solicitudes.unshift(x);
  addEvent(s, doctor.id, "solicitud_creada", `Solicitud de acceso · ${finalidad}`, patient.id, x.id);
  await writeState(s);
  return "Solicitud enviada al portal del paciente ficticio.";
}
export async function decide(
  patient: DemoUser,
  id: string,
  accion: "aprobar" | "rechazar" | "revocar",
  horas = 24,
): Promise<void> {
  const s = await readState();
  const x = s.solicitudes.find((a) => a.id === id && a.patientId === patient.id);
  if (!x || patient.role !== "paciente") throw Error("Solicitud no encontrada.");
  if (accion === "aprobar" || accion === "rechazar") {
    if (x.estado !== "pendiente") throw Error("La solicitud ya fue decidida.");
    x.estado = accion === "aprobar" ? "aprobada" : "rechazada";
    if (accion === "aprobar") x.expira = new Date(Date.now() + horas * 3600_000).toISOString();
  } else {
    if (x.estado !== "aprobada") throw Error("La solicitud no está activa.");
    x.estado = "revocada";
    x.expira = iso();
  }
  x.decidida = iso();
  addEvent(s, patient.id, `autorizacion_${x.estado}`, `Decisión de paciente: ${x.estado}`, patient.id, x.id);
  await writeState(s);
}
export async function registerAccess(actor: DemoUser, patientId: string, ok: boolean) {
  const s = await readState();
  addEvent(
    s,
    actor.id,
    ok ? "historia_consultada" : "consulta_denegada",
    ok ? "Visualización de historial sintético" : "Consulta sin autorización",
    patientId,
  );
  await writeState(s);
}
export async function userRequests(u: DemoUser) {
  const s = await readState();
  return s.solicitudes
    .filter((x) => (u.role === "medico" ? x.doctorId === u.id : x.patientId === u.id))
    .map((x) => ({
      ...x,
      doctor: s.users.find((u) => u.id === x.doctorId)?.nombre ?? "Desconocido",
      paciente:
        u.role === "paciente" || (x.estado === "aprobada" && x.expira && Date.parse(x.expira) > Date.now())
          ? (s.users.find((v) => v.id === x.patientId)?.nombre ?? "Desconocido")
          : "Identidad reservada hasta autorizar",
    }));
}
export async function userEvents(u: DemoUser) {
  const s = await readState();
  return s.eventos
    .filter((x) => (u.role === "medico" ? x.actorId === u.id : x.patientId === u.id || x.actorId === u.id))
    .slice(0, 100)
    .map((x) => ({ ...x, actor: s.users.find((u) => u.id === x.actorId)?.nombre ?? "Desconocido" }));
}
export function checkOrigin(req: Request) {
  const orig = req.headers.get("origin");
  if (orig && new URL(orig).origin !== new URL(req.url).origin) return false;
  return true;
}
