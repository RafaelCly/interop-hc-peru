import "server-only";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PACIENTES } from "@/lib/fhir-server";
import { ErrorAlmacen, guardarEstado, leerEstado } from "./almacen";
import type { ResultadoAportado } from "@/lib/tipos";

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
  // Consentimiento dado al registrarse: el médico que lo atiende en una cita queda con acceso para el seguimiento.
  accesoPorAtencion?: boolean;
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
  // Sin fecha de fin: acceso del médico tratante, vigente hasta que el paciente lo retire.
  expira?: string;
  // Cómo se originó el permiso. "qr" queda solo para registros antiguos de la llave, ya retirada.
  via?: "solicitud" | "qr" | "emergencia" | "atencion" | "sms";
  citaId?: string;
}
// Cita registrada por admisión del establecimiento. Abre la historia al médico que atiende, que queda como tratante.
export interface Cita {
  id: string;
  doctorId: string;
  patientId: string;
  dni: string;
  fecha: string; // AAAA-MM-DD en hora de Lima
  hora: string;
  motivo: string;
  establecimiento: string;
}
// Código de 6 dígitos enviado por SMS al celular del paciente; él se lo dicta al médico.
export interface CodigoSms {
  hash: string;
  doctorId: string;
  patientId: string;
  creado: number;
  expira: number;
  intentos: number;
  smsId: string;
}
export interface Sms {
  id: string;
  patientId: string;
  celular: string;
  cuando: string;
  texto: string;
  expira: string;
  usado?: boolean;
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
// Lectura con IA ya hecha, guardada por el hash de la imagen para no volver a pagarla. No guarda la imagen.
export interface LecturaIA {
  hash: string;
  patientId: string;
  cuando: string;
  resultado: unknown;
  estado?: "confirmada" | "descartada";
}
export interface State {
  users: DemoUser[];
  sessions: Session[];
  solicitudes: Solicitud[];
  eventos: Evento[];
  // Claves con que se firman los carnés QR, si no se definió QR_FIRMA_JWK.
  firma?: { privada: JsonWebKey; publica: JsonWebKey };
  aportados?: (ResultadoAportado & { patientId: string })[];
  lecturasIA?: LecturaIA[];
  citas?: Cita[];
  codigosSms?: CodigoSms[];
  sms?: Sms[];
}
const KEY = "sjl_session";
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
const senha = (pass: string, salt: string) => scryptSync(pass, salt, 64).toString("hex");
const iso = () => new Date().toISOString();
const limpiar = (s: State) => {
  s.sessions = s.sessions.filter((x) => x.expira > Date.now());
  delete (s as { llaves?: unknown }).llaves;
  s.codigosSms = (s.codigosSms ?? []).filter((x) => x.expira > Date.now() && x.intentos < 5);
  s.sms = (s.sms ?? []).filter((x) => Date.now() - Date.parse(x.cuando) < 2 * 86_400_000);
};
// Fecha de hoy y fin del día en hora de Lima.
export const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
// Agenda de ejemplo que en producción llega del sistema de admisión de cada establecimiento.
const AGENDA: Record<string, [number, string, string][]> = {
  "medico-1": [
    [1, "08:00", "Control de diabetes"],
    [2, "08:30", "Revisión de resultados"],
    [3, "09:15", "Control de presión arterial"],
    [4, "10:00", "Consulta externa"],
  ],
  "medico-2": [
    [5, "08:00", "Control prenatal"],
    [6, "09:00", "Revisión de resultados"],
    [7, "10:30", "Consulta externa"],
  ],
};
function asegurarAgenda(s: State): boolean {
  const hoy = hoyLima();
  if ((s.citas ?? []).some((c) => c.fecha === hoy)) return false;
  const nuevas: Cita[] = [];
  for (const [doctorId, filas] of Object.entries(AGENDA)) {
    const doctor = s.users.find((u) => u.id === doctorId);
    for (const [n, hora, motivo] of filas) {
      const p = s.users.find((u) => u.id === `paciente-${n}`);
      if (!doctor || !p?.dni) continue;
      nuevas.push({
        id: `cita-${hoy}-${doctorId}-${n}`,
        doctorId,
        patientId: p.id,
        dni: p.dni,
        fecha: hoy,
        hora,
        motivo,
        establecimiento: (doctor.establecimiento ?? "").replace(/\s*\(.*\)$/, ""),
      });
    }
  }
  s.citas = [...(s.citas ?? []).filter((c) => c.fecha >= hoy), ...nuevas];
  return true;
}
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
    asegurarAgenda(s);
    await guardarEstado(JSON.stringify(s));
    return s;
  }
  const s = JSON.parse(raw) as State;
  limpiar(s);
  if (asegurarAgenda(s)) await guardarEstado(JSON.stringify(s));
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
// Un permiso aprobado sigue vigente si no tiene fecha de fin (médico tratante) o si esa fecha no llegó.
export const vigenteSol = (x: Solicitud) =>
  x.estado === "aprobada" && (!x.expira || Date.parse(x.expira) > Date.now());
const esTratante = (x: Solicitud) => (x.via === "atencion" || x.via === "sms") && !x.expira;
export function hasPermission(s: State, doctor: DemoUser, dni: string): boolean {
  if (doctor.role !== "medico") return false;
  return s.solicitudes.some((x) => x.doctorId === doctor.id && x.dni === dni && vigenteSol(x));
}
export async function requestAccess(doctor: DemoUser, dni: string, finalidad: string): Promise<string> {
  const s = await readState();
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const patient = s.users.find((x) => x.role === "paciente" && x.dni === dni);
  if (!patient) return "Si el DNI pertenece a un paciente de Kipu, recibirá la solicitud.";
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
  return "Solicitud enviada. El paciente la verá en su cuenta.";
}
const unaHora = () => new Date(Date.now() + 3600_000).toISOString();
export async function accesoEmergencia(
  doctor: DemoUser,
  dni: string,
  motivo: string,
): Promise<{ dni: string; mensaje: string }> {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  if (motivo.trim().length < 15) throw Error("Describa el motivo de la emergencia (mínimo 15 caracteres).");
  const s = await readState();
  const paciente = s.users.find((u) => u.role === "paciente" && u.dni === dni);
  if (!paciente) throw Error("No hay un paciente de Kipu con ese DNI.");
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
    // Retirar el acceso a un médico cierra todos sus permisos vigentes sobre este paciente.
    for (const y of s.solicitudes)
      if (y !== x && y.doctorId === x.doctorId && y.patientId === patient.id && vigenteSol(y)) {
        y.estado = "revocada";
        y.expira = iso();
        y.decidida = iso();
      }
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
    ok ? "Consulta de la historia clínica" : "Consulta sin autorización",
    patientId,
  );
  await writeState(s);
}
export async function registrarDescarga(actor: DemoUser, patientId: string) {
  const s = await readState();
  addEvent(s, actor.id, "historia_descargada", "Descargó la historia clínica en PDF", patientId);
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
        u.role === "paciente" || vigenteSol(x)
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
  if (!orig) return true;
  let origen: URL;
  try {
    origen = new URL(orig);
  } catch {
    return false;
  }
  if (origen.origin === new URL(req.url).origin) return true;
  // Detrás de un proxy (ngrok, Vercel) req.url es la dirección interna; se compara con el host que vio el navegador.
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  return !!host && origen.host === host && (!proto || origen.protocol === `${proto}:`);
}

// ---------- Acceso durante la atención ----------
export type EstadoCita = "libre" | "abierta" | "retirado" | "desactivado";
export async function agendaMedico(doctor: DemoUser) {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const s = await readState();
  const hoy = hoyLima();
  return (s.citas ?? [])
    .filter((c) => c.doctorId === doctor.id && c.fecha === hoy)
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .map((c) => {
      const p = s.users.find((u) => u.id === c.patientId);
      const sol = s.solicitudes.find((x) => x.citaId === c.id);
      const tratante = s.solicitudes.some((x) => x.doctorId === doctor.id && x.patientId === c.patientId && esTratante(x) && vigenteSol(x));
      const estado: EstadoCita =
        tratante
          ? "abierta"
          : sol?.estado === "revocada"
            ? "retirado"
            : p?.accesoPorAtencion === false
              ? "desactivado"
              : "libre";
      return { id: c.id, hora: c.hora, motivo: c.motivo, dni: c.dni, paciente: p?.nombre ?? "Paciente", estado };
    });
}
export async function abrirAtencion(doctor: DemoUser, citaId: string): Promise<{ dni: string }> {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const s = await readState();
  const c = (s.citas ?? []).find((x) => x.id === citaId && x.doctorId === doctor.id && x.fecha === hoyLima());
  if (!c) throw Error("Esa cita no está en tu agenda de hoy.");
  const p = s.users.find((u) => u.id === c.patientId)!;
  // Si ya es su médico tratante, la historia sigue abierta: no se crea otro permiso.
  if (s.solicitudes.some((x) => x.doctorId === doctor.id && x.patientId === p.id && esTratante(x) && vigenteSol(x)))
    return { dni: c.dni };
  const previa = s.solicitudes.find((x) => x.citaId === c.id);
  if (previa?.estado === "revocada") throw Error("El paciente te retiró el acceso a su historia.");
  if (p.accesoPorAtencion === false)
    throw Error("El paciente desactivó el acceso durante sus consultas. Pídele el código que le llega por SMS.");
  const x: Solicitud = {
    id: randomBytes(12).toString("hex"),
    doctorId: doctor.id,
    patientId: p.id,
    dni: c.dni,
    finalidad: `Médico tratante desde la cita de las ${c.hora} · ${c.motivo}`,
    estado: "aprobada",
    creada: iso(),
    decidida: iso(),
    via: "atencion",
    citaId: c.id,
  };
  s.solicitudes.unshift(x);
  addEvent(s, doctor.id, "acceso_por_atencion", `Médico tratante desde la cita de las ${c.hora} en ${c.establecimiento}, hasta que el paciente lo retire`, p.id, x.id);
  await writeState(s);
  return { dni: c.dni };
}

// ---------- Código por SMS ----------
const MIN_SMS = 10;
const celularDe = (p: DemoUser) => `9${p.dni!.slice(0, 8)}`;
const hashSms = (doctorId: string, patientId: string, codigo: string) => hashToken(`${doctorId}:${patientId}:${codigo}`);
export async function enviarSms(doctor: DemoUser, dni: string): Promise<{ mensaje: string }> {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const s = await readState();
  const p = s.users.find((u) => u.role === "paciente" && u.dni === dni);
  if (!p) throw Error("No hay un paciente de Kipu con ese DNI.");
  const desde = Date.now() - 86_400_000;
  const enviados = s.eventos.filter(
    (e) => e.actorId === doctor.id && e.accion === "sms_enviado" && Date.parse(e.cuando) > desde,
  ).length;
  if (enviados >= 20) throw Error("Llegaste al límite de códigos por SMS de hoy.");
  const previo = (s.codigosSms ?? []).find((x) => x.doctorId === doctor.id && x.patientId === p.id);
  if (previo && Date.now() - previo.creado < 60_000) throw Error("Ya enviamos un código. Espera un minuto para pedir otro.");
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const celular = celularDe(p);
  const smsId = randomBytes(8).toString("hex");
  const expira = Date.now() + MIN_SMS * 60_000;
  s.codigosSms = (s.codigosSms ?? []).filter((x) => !(x.doctorId === doctor.id && x.patientId === p.id));
  s.codigosSms.push({
    hash: hashSms(doctor.id, p.id, codigo),
    doctorId: doctor.id,
    patientId: p.id,
    creado: Date.now(),
    expira,
    intentos: 0,
    smsId,
  });
  // En producción el texto va a un proveedor de SMS; aquí queda en la bandeja del paciente dentro de Kipu.
  (s.sms ??= []).unshift({
    id: smsId,
    patientId: p.id,
    celular,
    cuando: iso(),
    expira: new Date(expira).toISOString(),
    texto: `Kipu: ${doctor.nombre} pide ver tu historia clínica. Si estás en consulta, dale este código: ${codigo}. Vence en ${MIN_SMS} min. Si no estás en consulta, ignora este mensaje.`,
  });
  addEvent(s, doctor.id, "sms_enviado", `Código enviado al celular terminado en ${celular.slice(-3)}`, p.id);
  await writeState(s);
  return { mensaje: `Enviamos un código al celular terminado en ${celular.slice(-3)}. Pídeselo al paciente.` };
}
export async function verificarSms(doctor: DemoUser, dni: string, codigo: string): Promise<{ dni: string }> {
  if (doctor.role !== "medico") throw Error("Sin permiso");
  const s = await readState();
  const p = s.users.find((u) => u.role === "paciente" && u.dni === dni);
  const rec = p && (s.codigosSms ?? []).find((x) => x.doctorId === doctor.id && x.patientId === p.id);
  if (!p || !rec) throw Error("El código venció o no se envió. Envía uno nuevo.");
  const digitos = codigo.replace(/\D/g, "");
  const ok =
    digitos.length === 6 && timingSafeEqual(Buffer.from(hashSms(doctor.id, p.id, digitos)), Buffer.from(rec.hash));
  if (!ok) {
    rec.intentos += 1;
    addEvent(s, doctor.id, "sms_invalido", "Código por SMS incorrecto", p.id);
    await writeState(s);
    throw Error(rec.intentos >= 5 ? "Demasiados intentos. Envía un código nuevo." : "Código incorrecto. Revísalo con el paciente.");
  }
  s.codigosSms = (s.codigosSms ?? []).filter((x) => x !== rec);
  const msj = (s.sms ?? []).find((m) => m.id === rec.smsId);
  if (msj) msj.usado = true;
  if (s.solicitudes.some((x) => x.doctorId === doctor.id && x.patientId === p.id && esTratante(x) && vigenteSol(x))) {
    await writeState(s);
    return { dni };
  }
  const x: Solicitud = {
    id: randomBytes(12).toString("hex"),
    doctorId: doctor.id,
    patientId: p.id,
    dni,
    finalidad: "Médico tratante, con el código que recibiste por SMS",
    estado: "aprobada",
    creada: iso(),
    decidida: iso(),
    via: "sms",
  };
  s.solicitudes.unshift(x);
  addEvent(s, doctor.id, "acceso_por_sms", "Acceso con el código SMS del paciente, como médico tratante hasta que lo retire", p.id, x.id);
  await writeState(s);
  return { dni };
}

// ---------- Lo que ve el paciente ----------
export async function consultasPaciente(p: DemoUser) {
  if (p.role !== "paciente") throw Error("Sin permiso");
  const s = await readState();
  const yo = s.users.find((u) => u.id === p.id)!;
  return {
    accesoPorAtencion: yo.accesoPorAtencion !== false,
    citas: (s.citas ?? [])
      .filter((c) => c.patientId === p.id && c.fecha === hoyLima())
      .map((c) => ({
        id: c.id,
        hora: c.hora,
        motivo: c.motivo,
        establecimiento: c.establecimiento,
        doctor: s.users.find((u) => u.id === c.doctorId)?.nombre ?? "",
      })),
    sms: (s.sms ?? [])
      .filter((m) => m.patientId === p.id)
      .slice(0, 10)
      .map(({ id, celular, cuando, texto, expira, usado }) => ({ id, celular, cuando, texto, expira, usado: !!usado })),
  };
}
export async function cambiarAccesoPorAtencion(p: DemoUser, valor: boolean) {
  if (p.role !== "paciente") throw Error("Sin permiso");
  const s = await readState();
  const yo = s.users.find((u) => u.id === p.id)!;
  yo.accesoPorAtencion = valor;
  addEvent(
    s,
    p.id,
    valor ? "atencion_activada" : "atencion_desactivada",
    valor ? "Activó el acceso del médico que lo atiende en sus citas" : "Desactivó el acceso automático en sus citas",
    p.id,
  );
  await writeState(s);
}
