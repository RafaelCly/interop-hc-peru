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
  // Cómo se originó el permiso: solicitud del médico, llave QR del paciente o acceso de emergencia.
  via?: "solicitud" | "qr" | "emergencia";
}
// Código de un solo uso que el paciente muestra (como QR) para abrir su historial al médico que tiene delante.
export interface Llave {
  hash: string;
  patientId: string;
  expira: number;
  usada?: boolean;
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
  llaves?: Llave[];
}
const KEY = "sjl_session";
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
const senha = (pass: string, salt: string) => scryptSync(pass, salt, 64).toString("hex");
const iso = () => new Date().toISOString();
const limpiar = (s: State) => {
  s.sessions = s.sessions.filter((x) => x.expira > Date.now());
  s.llaves = (s.llaves ?? []).filter((x) => x.expira > Date.now() && !x.usada);
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
  return { users, sessions: [], solicitudes: [], eventos: [], llaves: [] };
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
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const MIN_LLAVE = 5;
const unaHora = () => new Date(Date.now() + 3600_000).toISOString();
export async function crearLlave(patient: DemoUser): Promise<{ codigo: string; expira: string }> {
  if (patient.role !== "paciente") throw Error("Sin permiso");
  const s = await readState();
  const bytes = randomBytes(8);
  const crudo = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
  s.llaves = (s.llaves ?? []).filter((x) => x.patientId !== patient.id);
  const expira = Date.now() + MIN_LLAVE * 60_000;
  s.llaves.push({ hash: hashToken(crudo), patientId: patient.id, expira });
  addEvent(s, patient.id, "llave_creada", `Llave de acceso creada, vence en ${MIN_LLAVE} minutos`, patient.id);
  await writeState(s);
  return { codigo: `${crudo.slice(0, 4)}-${crudo.slice(4)}`, expira: new Date(expira).toISOString() };
}
export async function canjearLlave(doctor: DemoUser, codigo: string): Promise<{ dni: string; mensaje: string }> {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const s = await readState();
  const fallos = s.eventos.filter(
    (e) => e.actorId === doctor.id && e.accion === "llave_invalida" && Date.now() - Date.parse(e.cuando) < 10 * 60_000,
  );
  if (fallos.length >= 5) throw Error("Demasiados intentos con códigos inválidos. Espere unos minutos.");
  const crudo = normalizarCodigo(codigo);
  const llave = crudo.length === 8 ? (s.llaves ?? []).find((x) => x.hash === hashToken(crudo)) : undefined;
  if (!llave) {
    addEvent(s, doctor.id, "llave_invalida", "Código de acceso inválido o vencido");
    await writeState(s);
    throw Error("El código no es válido o ya venció. Pida al paciente que genere uno nuevo.");
  }
  const paciente = s.users.find((u) => u.id === llave.patientId)!;
  llave.usada = true;
  const x: Solicitud = {
    id: randomBytes(12).toString("hex"),
    doctorId: doctor.id,
    patientId: paciente.id,
    dni: paciente.dni!,
    finalidad: "Acceso entregado por el paciente con su llave QR",
    estado: "aprobada",
    creada: iso(),
    decidida: iso(),
    expira: unaHora(),
    via: "qr",
  };
  s.solicitudes.unshift(x);
  addEvent(s, doctor.id, "acceso_por_llave", "Acceso por llave QR del paciente, vigente 1 hora", paciente.id, x.id);
  await writeState(s);
  return { dni: paciente.dni!, mensaje: "Acceso autorizado por el paciente durante 1 hora." };
}
export async function accesoEmergencia(
  doctor: DemoUser,
  dni: string,
  motivo: string,
): Promise<{ dni: string; mensaje: string }> {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  if (motivo.trim().length < 15) throw Error("Describa el motivo de la emergencia (mínimo 15 caracteres).");
  const s = await readState();
  const paciente = s.users.find((u) => u.role === "paciente" && u.dni === dni);
  if (!paciente) throw Error("No hay un paciente de demostración con ese documento.");
  const hoy = iso().slice(0, 10);
  if (s.solicitudes.filter((x) => x.doctorId === doctor.id && x.via === "emergencia" && x.creada.slice(0, 10) === hoy).length >= 3)
    throw Error("Límite diario de accesos de emergencia alcanzado.");
  const x: Solicitud = {
    id: randomBytes(12).toString("hex"),
    doctorId: doctor.id,
    patientId: paciente.id,
    dni,
    finalidad: `EMERGENCIA: ${motivo}`,
    estado: "aprobada",
    creada: iso(),
    decidida: iso(),
    expira: unaHora(),
    via: "emergencia",
  };
  s.solicitudes.unshift(x);
  addEvent(s, doctor.id, "acceso_emergencia", `Acceso de emergencia sin autorización previa · ${motivo}`, paciente.id, x.id);
  await writeState(s);
  return { dni, mensaje: "Acceso de emergencia por 1 hora. Quedó registrado y el paciente será informado." };
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
