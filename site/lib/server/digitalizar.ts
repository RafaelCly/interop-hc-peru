import "server-only";
import { createHash, randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { EXAMENES } from "@/lib/catalogo-clinico";
import type { ResultadoAportado } from "@/lib/tipos";
import { addEvent, readState, writeState, type DemoUser, type LecturaIA } from "./auth";

/**
 * Digitalización de resultados en papel: el paciente sube la foto de un resultado y la IA propone los datos
 * (examen, valor, unidad, fecha y laboratorio), con el código LOINC elegido de un catálogo ya verificado en
 * tx.fhir.org. El paciente no escribe ni corrige valores: confirma que la lectura coincide con su papel o la
 * descarta. Lo que se guarda sale siempre de la lectura. La IA no interpreta ni diagnostica.
 *
 * Costo: solo se llama a la IA cuando el paciente pulsa el botón, y cada imagen se lee una sola vez (el
 * resultado queda guardado por el hash de la imagen; la imagen no se guarda).
 */

const MODELO = "claude-opus-5-5";
const LIMITE_DIARIO = 10;
const MAX_BASE64 = 4_000_000;
const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
type TipoImagen = (typeof TIPOS)[number];
const CODIGOS = Object.keys(EXAMENES);

export interface ExamenLeido {
  nombreEnDocumento: string;
  codigo: string; // LOINC del catálogo, o "" si no corresponde a ninguno
  valor: string; // como aparece, con punto decimal; "" si es un informe sin valor numérico
  unidad: string;
  textoResultado: string;
  confianza: "alta" | "media" | "baja";
}
export interface LecturaResultado {
  esResultado: boolean;
  motivo: string;
  laboratorio: string;
  fecha: string;
  examenes: ExamenLeido[];
}

const ESQUEMA = {
  type: "object",
  properties: {
    esResultado: { type: "boolean" },
    motivo: { type: "string" },
    laboratorio: { type: "string" },
    fecha: { type: "string" },
    examenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombreEnDocumento: { type: "string" },
          codigo: { type: "string", enum: [...CODIGOS, ""] },
          valor: { type: "string" },
          unidad: { type: "string" },
          textoResultado: { type: "string" },
          confianza: { type: "string", enum: ["alta", "media", "baja"] },
        },
        required: ["nombreEnDocumento", "codigo", "valor", "unidad", "textoResultado", "confianza"],
        additionalProperties: false,
      },
    },
  },
  required: ["esResultado", "motivo", "laboratorio", "fecha", "examenes"],
  additionalProperties: false,
} as const;

const CATALOGO = CODIGOS.map((c) => `${c} · ${EXAMENES[c].nombre}${EXAMENES[c].unidad ? ` (${EXAMENES[c].unidad})` : ""}`).join(
  "\n",
);

const SISTEMA = `Transcribes resultados de exámenes médicos fotografiados por el propio paciente para que él los guarde en su historia. No interpretas ni opinas sobre la salud del paciente: solo copias lo que el documento dice.

Reglas:
- Copia solo lo que se lee en la imagen. Si un dato no se lee con claridad, déjalo vacío y baja la confianza. Nunca completes un valor por deducción.
- "codigo": elige el código LOINC del catálogo que corresponde al examen. Si el examen no está en el catálogo, deja "".
- "valor": el número tal como aparece, con punto decimal (por ejemplo "6.8"). Si el resultado es un informe en texto (ECG, radiografía, ecografía), deja "" y copia la conclusión en "textoResultado".
- "unidad": la del documento. "textoResultado": el resultado como se lee, con su unidad.
- "fecha": la de toma de muestra o del informe, en formato AAAA-MM-DD; "" si no aparece.
- "laboratorio": el nombre del laboratorio o establecimiento que emitió el documento; "" si no aparece.
- Si la imagen no es un resultado de examen, responde esResultado=false, explica por qué en "motivo" y deja "examenes" vacío.

Catálogo (código · examen):
${CATALOGO}`;

const hashImagen = (b64: string) => createHash("sha256").update(b64).digest("hex");

function validarLectura(x: unknown): LecturaResultado {
  const o = x as LecturaResultado;
  if (!o || typeof o.esResultado !== "boolean" || !Array.isArray(o.examenes))
    throw Error("La IA devolvió una respuesta incompleta. Intente con otra foto.");
  return {
    esResultado: o.esResultado,
    motivo: String(o.motivo ?? ""),
    laboratorio: String(o.laboratorio ?? "").slice(0, 120),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(o.fecha ?? "") ? o.fecha : "",
    examenes: o.examenes.slice(0, 15).map((e) => ({
      nombreEnDocumento: String(e.nombreEnDocumento ?? "").slice(0, 120),
      codigo: CODIGOS.includes(e.codigo) ? e.codigo : "",
      valor: String(e.valor ?? "").slice(0, 20),
      unidad: String(e.unidad ?? "").slice(0, 30),
      textoResultado: String(e.textoResultado ?? "").slice(0, 300),
      confianza: (["alta", "media", "baja"] as const).includes(e.confianza) ? e.confianza : "baja",
    })),
  };
}

async function pedirALaIA(imagen: string, tipo: TipoImagen): Promise<LecturaResultado> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    throw Error("La lectura con IA no está configurada en este servidor (falta ANTHROPIC_API_KEY).");
  const client = new Anthropic();
  let respuesta: Anthropic.Beta.BetaMessage;
  try {
    respuesta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: SISTEMA,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipo, data: imagen } },
            { type: "text", text: "Transcribe este resultado según las reglas." },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw Error("La clave de la IA no es válida en este servidor.");
    if (e instanceof Anthropic.RateLimitError) throw Error("La IA está ocupada. Intente en unos minutos.");
    if (e instanceof Anthropic.BadRequestError) throw Error("La IA no pudo procesar esta imagen. Pruebe con otra foto.");
    if (e instanceof Anthropic.APIError) throw Error("La IA no respondió. Intente más tarde.");
    throw Error("No se pudo conectar con la IA. Revise la conexión e intente otra vez.");
  }
  if (respuesta.stop_reason === "refusal") throw Error("La IA no procesó esta imagen. Pruebe con otra foto.");
  const bloque = respuesta.content.find((b) => b.type === "text");
  if (!bloque || bloque.type !== "text") throw Error("La IA no devolvió datos. Intente con otra foto.");
  try {
    return validarLectura(JSON.parse(bloque.text));
  } catch {
    throw Error("La IA devolvió una respuesta incompleta. Intente con otra foto.");
  }
}

/** Un examen de la lectura tal como lo verá el paciente: solo lectura, sin editar. */
export interface ExamenPropuesto {
  indice: number;
  nombre: string;
  resultado: string;
  confianza: ExamenLeido["confianza"];
  guardable: boolean;
  motivo?: string; // por qué no se guardará
}
export interface LecturaParaRevisar {
  id: string;
  laboratorio: string;
  fecha: string;
  examenes: ExamenPropuesto[];
  problema?: string; // si hay, no se puede guardar: hay que tomar otra foto
  estado?: "confirmada" | "descartada";
}

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Convierte la lectura de la IA en lo que se guardaría. El paciente no escribe ni corrige valores: solo confirma
 * que coincide con su papel, quita un examen o descarta la lectura. Lo guardado sale siempre de esta función.
 */
function prepararLectura(id: string, l: LecturaResultado): LecturaParaRevisar & { aportes: Omit<ResultadoAportado, "id" | "creado">[] } {
  const aportes: Omit<ResultadoAportado, "id" | "creado">[] = [];
  const laboratorio = l.laboratorio.trim() || "No figura en el documento";
  const examenes = l.examenes.map((e, indice): ExamenPropuesto => {
    const def = EXAMENES[e.codigo];
    const base = { indice, confianza: e.confianza, nombre: def?.nombre ?? (e.nombreEnDocumento || "Examen sin nombre") };
    if (!def) return { ...base, resultado: e.textoResultado, guardable: false, motivo: "No está en el catálogo de Kipu." };
    if (def.tipo === "laboratorio") {
      const valor = Number(e.valor.replace(",", "."));
      if (e.valor.trim() === "" || !Number.isFinite(valor) || valor < 0 || valor > 100000)
        return { ...base, resultado: e.textoResultado, guardable: false, motivo: "El valor no se leyó con claridad." };
      if (e.unidad && def.unidad && e.unidad.toLowerCase() !== def.unidad.toLowerCase())
        return { ...base, resultado: e.textoResultado, guardable: false, motivo: `Viene en ${e.unidad} y Kipu usa ${def.unidad}.` };
      const resultado = `${valor} ${def.unidad ?? ""}`.trim();
      aportes.push({ codigo: e.codigo, nombre: def.nombre, valor, unidad: def.unidad, resultado, fecha: l.fecha, laboratorio, metodo: "ia" });
      return { ...base, resultado, guardable: true };
    }
    const texto = e.textoResultado.trim().slice(0, 300);
    if (texto.length < 3) return { ...base, resultado: texto, guardable: false, motivo: "La conclusión no se leyó con claridad." };
    aportes.push({ codigo: e.codigo, nombre: def.nombre, resultado: texto, fecha: l.fecha, laboratorio, metodo: "ia" });
    return { ...base, resultado: texto, guardable: true };
  });
  let problema: string | undefined;
  if (!l.fecha) problema = "En la foto no se ve la fecha del resultado. Toma otra foto donde se lea.";
  else if (l.fecha > hoy()) problema = "La fecha leída es futura. Toma otra foto donde se lea bien.";
  else if (!aportes.length) problema = "No hay ningún examen que se pueda guardar. Prueba con una foto más nítida.";
  return { id, laboratorio, fecha: l.fecha, examenes, problema, aportes };
}

function sinAportes(p: ReturnType<typeof prepararLectura>): LecturaParaRevisar {
  const resto: Partial<typeof p> = { ...p };
  delete resto.aportes;
  return resto as LecturaParaRevisar;
}

export async function digitalizarResultado(
  paciente: DemoUser,
  imagen: string,
  tipo: string,
): Promise<{ esResultado: boolean; motivo: string; lectura?: LecturaParaRevisar; enCache: boolean }> {
  if (paciente.role !== "paciente") throw Error("Sin permiso");
  if (!TIPOS.includes(tipo as TipoImagen)) throw Error("Formato de imagen no admitido (use JPG, PNG o WebP).");
  if (!imagen || imagen.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(imagen))
    throw Error("La imagen es demasiado grande o no es válida.");
  const hash = hashImagen(imagen);
  const vista = (l: LecturaResultado, enCache: boolean, estado?: LecturaIA["estado"]) =>
    l.esResultado
      ? { esResultado: true, motivo: "", lectura: { ...sinAportes(prepararLectura(hash, l)), estado }, enCache }
      : { esResultado: false, motivo: l.motivo || "La imagen no parece un resultado de examen.", enCache };
  const s = await readState();
  const previa = (s.lecturasIA ?? []).find((x) => x.hash === hash && x.patientId === paciente.id);
  if (previa) return vista(previa.resultado as LecturaResultado, true, previa.estado);
  const dia = hoy();
  const usadas = s.eventos.filter(
    (e) => e.actorId === paciente.id && e.accion === "lectura_ia" && e.cuando.slice(0, 10) === dia,
  ).length;
  if (usadas >= LIMITE_DIARIO) throw Error(`Límite diario de ${LIMITE_DIARIO} lecturas con IA alcanzado.`);

  const lectura = await pedirALaIA(imagen, tipo as TipoImagen);

  const t = await readState(); // la lectura tarda; se vuelve a leer el estado para no pisar cambios
  t.lecturasIA = [{ hash, patientId: paciente.id, cuando: new Date().toISOString(), resultado: lectura }, ...(t.lecturasIA ?? [])].slice(0, 100);
  addEvent(t, paciente.id, "lectura_ia", `Foto de resultado leída con IA · ${lectura.examenes.length} exámenes propuestos`, paciente.id);
  await writeState(t);
  return vista(lectura, false);
}

function lecturaPendiente(s: Awaited<ReturnType<typeof readState>>, paciente: DemoUser, id: string): LecturaIA {
  if (paciente.role !== "paciente") throw Error("Sin permiso");
  const l = (s.lecturasIA ?? []).find((x) => x.hash === id && x.patientId === paciente.id);
  if (!l) throw Error("Lectura no encontrada. Vuelve a tomar la foto.");
  if (l.estado === "confirmada") throw Error("Esta lectura ya está guardada en tu historia.");
  if (l.estado === "descartada") throw Error("Descartaste esta lectura. Toma otra foto.");
  return l;
}

/** El paciente confirma que la lectura coincide con su papel. Puede quitar exámenes, pero no cambiar valores. */
export async function confirmarLectura(paciente: DemoUser, id: string, quitar: number[] = []): Promise<number> {
  const s = await readState();
  const l = lecturaPendiente(s, paciente, id);
  const p = prepararLectura(id, l.resultado as LecturaResultado);
  if (p.problema) throw Error(p.problema);
  const fuera = new Set(quitar);
  const guardables = p.examenes.filter((e) => e.guardable);
  const elegidos = p.aportes.filter((_, i) => !fuera.has(guardables[i].indice));
  if (!elegidos.length) throw Error("Deja al menos un examen para guardar, o descarta la lectura.");
  const creado = new Date().toISOString();
  const nuevos = elegidos.map((a) => ({ ...a, id: randomBytes(10).toString("hex"), patientId: paciente.id, creado }));
  s.aportados = [...nuevos, ...(s.aportados ?? [])].slice(0, 2000);
  l.estado = "confirmada";
  const quitados = guardables.length - elegidos.length;
  addEvent(
    s,
    paciente.id,
    "resultado_aportado",
    `${nuevos.length} resultado(s) leídos con IA y confirmados por el paciente${quitados ? ` · ${quitados} quitado(s)` : ""} · ${p.laboratorio}`,
    paciente.id,
  );
  await writeState(s);
  return nuevos.length;
}

/** El paciente indica que la lectura no coincide con su papel. Queda registrado para medir la calidad de la IA. */
export async function descartarLectura(paciente: DemoUser, id: string): Promise<void> {
  const s = await readState();
  const l = lecturaPendiente(s, paciente, id);
  l.estado = "descartada";
  addEvent(s, paciente.id, "lectura_descartada", "El paciente indicó que la lectura no coincide con su papel", paciente.id);
  await writeState(s);
}

export async function borrarAportado(paciente: DemoUser, id: string): Promise<void> {
  const s = await readState();
  const antes = (s.aportados ?? []).length;
  s.aportados = (s.aportados ?? []).filter((a) => !(a.id === id && a.patientId === paciente.id));
  if (s.aportados.length === antes) throw Error("Resultado no encontrado.");
  addEvent(s, paciente.id, "aporte_eliminado", "El paciente eliminó un resultado que había aportado", paciente.id);
  await writeState(s);
}

export async function aportadosDe(patientId: string): Promise<ResultadoAportado[]> {
  const s = await readState();
  return (s.aportados ?? [])
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((a) => {
      const copia: ResultadoAportado & { patientId?: string } = { ...a };
      delete copia.patientId;
      return copia;
    });
}
