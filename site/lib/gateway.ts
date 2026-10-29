// Capa de interoperabilidad del navegador. Consulta los tres sistemas por HTTP (/api/fhir/...),
// los normaliza, los une por DNI y aplica consentimiento y alertas. Si no hay red usa el mismo
// dataset en memoria como respaldo. Para pasar a un backend propio basta cambiar `transporte`.
import {
  CATALOGO, CLINICA_LOCAL, DNI_SYSTEM, LOCAL_A_LOINC, LOINC, SISTEMAS, TIPOS, hoyISO, type Clave,
} from "./data";
import { ErrorHttp, PACIENTES, consultaFhir, type Bundle } from "./fhir-server";

export { SISTEMAS };
export type { Clave };

export interface Examen {
  codigo: string | null; codigoOriginal: string | null; nombre: string; fecha: string;
  resultado: string; sistema: Clave; establecimiento: string; idLocal: string;
}
export interface Alerta {
  codigo: string; examen: string; fechaAnterior: string; lugarAnterior: string; sistemaAnterior: Clave;
  fechaRepeticion: string; lugarRepeticion: string; sistemaRepeticion: Clave; dias: number; ventana: number;
}
export interface TrazaSistema { clave: Clave; peticiones: number; ms: number; estado: "ok" | "sin_registro" | "no_disponible"; error: string | null; examenes?: number }
// Origen de un dato: el sistema que lo tiene, su establecimiento y, si existe, la fecha del registro.
export interface Fuente { clave: Clave; lugar: string; fecha?: string }
export interface Resumen {
  dni: string; nombre: string; sexo: string; edad: number;
  establecimientos: { clave: Clave; idLocal: string | null; estado: TrazaSistema["estado"] }[];
  condiciones: { codigo: string; nombre: string; fuentes: Fuente[] }[];
  alergias: { sustancia: string; reaccion: string; fuentes: Fuente[] }[];
  medicamentos: { nombre: string; fuentes: Fuente[] }[];
  examenes: Examen[]; repetidos: Alerta[];
  traza: { total: number; sistemas: TrazaSistema[]; examenes: number; traducidos: number };
}
export interface Pedido {
  duplicado: boolean; examen: string; ventana: number; previo: Examen | null; dias: number | null;
}
export interface Acceso { cuando: string; quien: string; lugar?: string; resultado: "permitido" | "denegado" | "consentimiento"; motivo: string }
export interface Caso {
  dni: string; nombre: string; sistemas: Clave[]; consentimiento: boolean; titulo?: string; muestra?: string;
}
export interface EstadoSistema { clave: Clave; nombre: string; establecimiento: string; cod: string; categoria: string; distrito: string; enLinea: boolean }

export class ErrorApi extends Error {
  constructor(public codigo: "dni_invalido" | "no_encontrado" | "sin_consentimiento", mensaje: string) {
    super(mensaje);
  }
}

export interface Terminologia { version: string | null; items: Record<string, string> }
let terminologia: Terminologia | null = null;

const ahora = () => performance.now();
const caidos = new Set<Clave>();

// ---------- transporte ----------
async function fhir(clave: Clave, tipo: string, params: Record<string, string>): Promise<Bundle> {
  const caido = caidos.has(clave);
  try {
    const res = await fetch(`/api/fhir/${clave}/${tipo}?${new URLSearchParams(params)}`, {
      cache: "no-store",
      headers: caido ? { "x-simular-caida": "1" } : undefined,
    });
    if (res.status === 503) throw new ErrorHttp(503, `${SISTEMAS[clave].nombre} no está disponible`);
    if (!res.ok) throw new TypeError(`HTTP ${res.status}`);
    return (await res.json()) as Bundle;
  } catch (e) {
    if (e instanceof ErrorHttp) throw e;
    return consultaFhir(clave, tipo, params, caido); // sin red: respaldo en memoria
  }
}

// ---------- normalización ----------
export function codigoLoinc(code: { coding?: { system: string; code: string }[] }): string | null {
  for (const c of code.coding ?? []) {
    if (c.system === LOINC) return c.code;
    if (c.system === CLINICA_LOCAL && LOCAL_A_LOINC[c.code]) return LOCAL_A_LOINC[c.code];
  }
  return null;
}
const edad = (nac: string) => {
  const n = new Date(nac), h = new Date(hoyISO());
  return h.getFullYear() - n.getFullYear() - (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate()) ? 1 : 0);
};
const dias = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

function aExamen(r: any, clave: Clave): Examen {
  const original = r.code.coding?.[0]?.system === CLINICA_LOCAL ? r.code.coding[0].code : null;
  const codigo = codigoLoinc(r.code);
  return {
    codigo, codigoOriginal: original, nombre: codigo && CATALOGO[codigo] ? CATALOGO[codigo][0] : r.code.text ?? "Examen",
    fecha: r.effectiveDateTime.slice(0, 10),
    resultado: r.resourceType === "Observation" ? `${r.valueQuantity.value} ${r.valueQuantity.unit}` : r.conclusion ?? "",
    sistema: clave, establecimiento: SISTEMAS[clave].establecimiento, idLocal: r.id,
  };
}

// ---------- alertas ----------
export function examenesRepetidos(examenes: Examen[]): Alerta[] {
  const porCodigo = new Map<string, Examen[]>();
  for (const e of examenes) {
    if (e.codigo && CATALOGO[e.codigo]) {
      const l = porCodigo.get(e.codigo) ?? [];
      l.push(e);
      porCodigo.set(e.codigo, l);
    }
  }
  const alertas: Alerta[] = [];
  for (const [codigo, lista] of porCodigo) {
    const [nombre, ventana] = CATALOGO[codigo];
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (let i = 1; i < lista.length; i++) {
      const ant = lista[i - 1], pos = lista[i];
      if (ant.sistema === pos.sistema) continue;
      const d = dias(ant.fecha, pos.fecha);
      if (d <= ventana) {
        alertas.push({
          codigo, examen: nombre, fechaAnterior: ant.fecha, lugarAnterior: ant.establecimiento, sistemaAnterior: ant.sistema,
          fechaRepeticion: pos.fecha, lugarRepeticion: pos.establecimiento, sistemaRepeticion: pos.sistema, dias: d, ventana,
        });
      }
    }
  }
  return alertas.sort((a, b) => b.fechaRepeticion.localeCompare(a.fechaRepeticion));
}

export function evaluarPedido(examenes: Examen[], codigo: string): Pedido {
  const [nombre, ventana] = CATALOGO[codigo];
  const previos = examenes.filter((e) => e.codigo === codigo).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!previos.length) return { duplicado: false, examen: nombre, ventana, previo: null, dias: null };
  const d = dias(previos[0].fecha, hoyISO());
  return { duplicado: d <= ventana, examen: nombre, ventana, previo: previos[0], dias: d };
}

// ---------- consentimiento y accesos (persisten en el navegador) ----------
const CLAVE = "interop-hc-peru:v2";
interface Estado { consentimiento: Record<string, boolean>; accesos: Record<string, Acceso[]> }
const estadoInicial = (): Estado => ({ consentimiento: Object.fromEntries(PACIENTES.map((p) => [p.dni, p.consentimiento])), accesos: {} });
let estado: Estado | null = null;

function leer(): Estado {
  if (estado) return estado;
  let e = estadoInicial();
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (g?.consentimiento) e = { ...e, ...g, consentimiento: { ...e.consentimiento, ...g.consentimiento } };
  } catch { /* sin almacenamiento */ }
  estado = e;
  return e;
}
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* ignorar */ } };
function registrar(dni: string, quien: string, resultado: Acceso["resultado"], motivo: string, lugar?: string) {
  const s = leer();
  s.accesos[dni] = [{ cuando: new Date().toISOString(), quien, lugar, resultado, motivo }, ...(s.accesos[dni] ?? [])].slice(0, 30);
  guardar();
}

// Profesionales ficticios. El primero es quien usa el visor en esta demostración.
const PROFESIONALES = [
  { nombre: "Dra. Lucía Paredes Vega", lugar: SISTEMAS.essalud.establecimiento },
  { nombre: "Dr. Carlos Medina Ríos", lugar: SISTEMAS.minsa.establecimiento },
  { nombre: "Dr. Andrés Salazar Cruz", lugar: SISTEMAS.clinica.establecimiento },
  { nombre: "Dra. Patricia Núñez Rojas", lugar: SISTEMAS.minsa.establecimiento },
];
const MEDICO = PROFESIONALES[0];

// Consultas anteriores de otros establecimientos, deterministas por DNI, para que el registro no empiece vacío.
function accesosPrevios(dni: string): Acceso[] {
  const n = Number(dni.slice(-3));
  const motivos = ["consulta de historial", "control de seguimiento", "revisión de resultados"];
  return [3, 11].map((dias, i) => {
    const p = PROFESIONALES[1 + ((n + i) % 3)];
    const cuando = new Date(Date.now() - (dias + (n % 4)) * 86400000 - 3600000 * (9 + i * 3)).toISOString();
    return { cuando, quien: p.nombre, lugar: p.lugar, resultado: "permitido", motivo: motivos[(n + i) % 3] };
  });
}
// ---------- gateway ----------
async function consultarSistema(clave: Clave, dni: string) {
  const t0 = ahora();
  const traza: TrazaSistema = { clave, peticiones: 0, ms: 0, estado: "ok", error: null };
  try {
    const patient = await fhir(clave, "Patient", { identifier: `${DNI_SYSTEM}|${dni}` });
    traza.peticiones = 1;
    if (!patient.entry.length) return { clave, datos: null, traza: { ...traza, ms: ahora() - t0, estado: "sin_registro" as const } };
    const paciente = patient.entry[0].resource;
    const bundles = await Promise.all(TIPOS.map((t) => fhir(clave, t, { patient: paciente.id })));
    traza.peticiones += TIPOS.length;
    const recursos = Object.fromEntries(TIPOS.map((t, i) => [t, bundles[i].entry.map((e) => e.resource)])) as Record<string, any[]>;
    return { clave, datos: { paciente, recursos }, traza: { ...traza, ms: ahora() - t0 } };
  } catch (e) {
    return { clave, datos: null, traza: { ...traza, ms: ahora() - t0, estado: "no_disponible" as const, error: (e as Error).message } };
  }
}

function validar(dni: string) {
  if (!/^\d{8}$/.test(dni)) throw new ErrorApi("dni_invalido", "El DNI debe tener 8 dígitos.");
  if (!(dni in leer().consentimiento)) throw new ErrorApi("no_encontrado", "No se encontró un paciente con ese DNI en los sistemas conectados.");
}

async function consultarHistorial(dni: string, medico = MEDICO.nombre, motivo = "consulta de historial", dejarRegistro = true): Promise<Resumen> {
  validar(dni);
  if (!leer().consentimiento[dni]) {
    if (dejarRegistro) registrar(dni, medico, "denegado", motivo, MEDICO.lugar);
    throw new ErrorApi("sin_consentimiento", "El paciente no ha autorizado el acceso a su historial.");
  }
  const t0 = ahora();
  const resultados = await Promise.all((Object.keys(SISTEMAS) as Clave[]).map((c) => consultarSistema(c, dni)));
  const encontrados = resultados.filter((r) => r.datos);
  if (!encontrados.length) {
    const nd = resultados.filter((r) => r.traza.estado === "no_disponible").map((r) => SISTEMAS[r.clave].nombre);
    throw new ErrorApi("no_encontrado", "No se encontró un paciente con ese DNI." + (nd.length ? ` Sistemas no disponibles: ${nd.join(", ")}.` : ""));
  }
  const base = encontrados[0].datos!.paciente;
  const examenes: Examen[] = [];
  const meds = new Map<string, Resumen["medicamentos"][number]>();
  const alergias = new Map<string, Resumen["alergias"][number]>();
  const condiciones = new Map<string, Resumen["condiciones"][number]>();
  let traducidos = 0;
  for (const { clave, datos } of encontrados) {
    const est = SISTEMAS[clave].establecimiento;
    const r = datos!.recursos;
    for (const x of [...r.Observation, ...r.DiagnosticReport]) {
      const e = aExamen(x, clave);
      if (e.codigoOriginal) traducidos++;
      examenes.push(e);
    }
    for (const m of r.MedicationStatement) {
      const t: string = m.medicationCodeableConcept.text, k = t.toLowerCase();
      if (!meds.has(k)) meds.set(k, { nombre: t, fuentes: [] });
      meds.get(k)!.fuentes.push({ clave, lugar: est, fecha: m.effectiveDateTime?.slice(0, 10) });
    }
    for (const a of r.AllergyIntolerance) {
      const k = (a.code.text as string).toLowerCase();
      if (!alergias.has(k)) alergias.set(k, { sustancia: a.code.text, reaccion: a.reaction[0].description, fuentes: [] });
      alergias.get(k)!.fuentes.push({ clave, lugar: est });
    }
    for (const c of r.Condition) {
      const k: string = c.code.coding[0].code;
      if (!condiciones.has(k)) condiciones.set(k, { codigo: k, nombre: c.code.text, fuentes: [] });
      condiciones.get(k)!.fuentes.push({ clave, lugar: est });
    }
  }
  examenes.sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (dejarRegistro) registrar(dni, medico, "permitido", motivo, MEDICO.lugar);
  return {
    dni, nombre: `${base.name[0].given.join(" ")} ${base.name[0].family}`, sexo: base.gender, edad: edad(base.birthDate),
    establecimientos: resultados
      .filter((r) => r.datos || r.traza.estado === "no_disponible")
      .map((r) => ({ clave: r.clave, idLocal: r.datos?.paciente.id ?? null, estado: r.traza.estado })),
    condiciones: [...condiciones.values()], alergias: [...alergias.values()], medicamentos: [...meds.values()],
    examenes, repetidos: examenesRepetidos(examenes),
    traza: { total: ahora() - t0, sistemas: resultados.map((r) => ({ ...r.traza, examenes: examenes.filter((e) => e.sistema === r.clave).length })), examenes: examenes.length, traducidos },
  };
}

// ---------- API pública del frontend ----------
export const api = {
  sistemas: (): EstadoSistema[] =>
    (Object.keys(SISTEMAS) as Clave[]).map((clave) => {
      const { nombre, establecimiento, cod, categoria, distrito } = SISTEMAS[clave];
      return { clave, nombre, establecimiento, cod, categoria, distrito, enLinea: !caidos.has(clave) };
    }),
  fijarEnLinea(clave: Clave, enLinea: boolean) {
    if (enLinea) caidos.delete(clave);
    else caidos.add(clave);
  },
  casos: (): Caso[] => PACIENTES.map((p) => ({ ...p, consentimiento: leer().consentimiento[p.dni] })),
  catalogo: () => Object.entries(CATALOGO).map(([codigo, [nombre, ventana, tipo]]) => ({ codigo, nombre, ventana, tipo })),
  resumen: (dni: string) => consultarHistorial(dni),
  vistaPrevia: (dni: string) => consultarHistorial(dni, "Vista previa", "vista previa", false),
  consentimiento(dni: string, otorgado: boolean) {
    validar(dni);
    leer().consentimiento[dni] = otorgado;
    registrar(dni, PACIENTES.find((p) => p.dni === dni)?.nombre ?? "Paciente", "consentimiento", otorgado ? "otorgado" : "revocado", "Paciente");
  },
  accesos: (dni: string): Acceso[] => [...(leer().accesos[dni] ?? []), ...accesosPrevios(dni)],
  // Nombres oficiales LOINC desde el servicio de terminología de HL7. Si falla, devuelve vacío y el visor sigue igual.
  async terminologia(): Promise<Terminologia> {
    if (terminologia) return terminologia;
    try {
      const res = await fetch(`/api/terminologia?codigos=${Object.keys(CATALOGO).join(",")}`);
      if (!res.ok) return { version: null, items: {} };
      const t = (await res.json()) as Terminologia;
      if (Object.keys(t.items).length) terminologia = t;
      return t;
    } catch {
      return { version: null, items: {} };
    }
  },
  async pedirExamen(dni: string, codigo: string) {
    const r = await consultarHistorial(dni, MEDICO.nombre, `pedido de ${CATALOGO[codigo][0]}`);
    return evaluarPedido(r.examenes, codigo);
  },
};
