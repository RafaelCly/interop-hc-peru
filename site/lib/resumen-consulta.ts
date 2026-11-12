// Resumen de una pantalla para el inicio de la consulta. Se arma con reglas sobre los datos que el
// paciente autorizó; cada punto indica su fuente para que el médico pueda comprobarlo. No diagnostica.
import type { Resumen } from "./tipos";

export interface PuntoResumen {
  id: string;
  nivel: "critico" | "atencion" | "info";
  titulo: string;
  detalle: string;
  fuente: string;
  relevante: boolean;
}

const limpio = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
// Palabras del motivo de consulta que remiten a otros términos presentes en la historia.
const SINONIMOS: Record<string, string[]> = {
  pecho: ["ecg", "electrocardiograma", "colesterol", "hipertension", "enalapril", "losartan"],
  corazon: ["ecg", "electrocardiograma", "colesterol", "hipertension"],
  presion: ["hipertension", "creatinina", "losartan", "enalapril"],
  azucar: ["glucosa", "hemoglobina glicosilada", "diabetes", "metformina"],
  diabetes: ["glucosa", "hemoglobina glicosilada", "metformina"],
  cansancio: ["hemoglobina", "anemia", "glucosa", "hierro"],
  anemia: ["hemoglobina", "hierro"],
  estomago: ["gastritis", "omeprazol", "ecografia"],
  respirar: ["asma", "radiografia", "salbutamol"],
  tos: ["asma", "radiografia", "salbutamol"],
  rinon: ["creatinina"],
  higado: ["ecografia", "transaminasa"],
};
const dias = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(`${iso.slice(0, 10)}T12:00:00-05:00`)) / 86400000));
const hace = (iso: string) => {
  const d = dias(iso);
  return d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
};

export function resumenConsulta(r: Resumen, motivo: string): PuntoResumen[] {
  const palabras = limpio(motivo)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 3);
  const claves = new Set<string>(palabras);
  for (const p of palabras) for (const [k, v] of Object.entries(SINONIMOS)) if (p.startsWith(k)) v.forEach((x) => claves.add(x));
  const toca = (...textos: string[]) => {
    const t = limpio(textos.join(" "));
    return [...claves].some((c) => t.includes(c));
  };
  const puntos: PuntoResumen[] = [];

  for (const [i, s] of r.seguridad.entries())
    puntos.push({
      id: `seg-${i}`,
      nivel: "critico",
      titulo: `Alergia a ${s.alergia} y ${s.medicamento} registrado`,
      detalle: `${s.relacion}. Alergia: ${s.lugarAlergia}. Medicamento: ${s.lugarMedicamento}${s.entreSedes ? " (otra sede)" : ""}.`,
      fuente: `${s.lugarAlergia} · ${s.lugarMedicamento}`,
      relevante: true,
    });
  const conChoque = new Set(r.seguridad.map((s) => s.alergia));
  for (const a of r.alergias.filter((x) => !conChoque.has(x.sustancia)))
    puntos.push({
      id: `ale-${a.sustancia}`,
      nivel: "critico",
      titulo: `Alergia a ${a.sustancia}`,
      detalle: `Reacción: ${a.reaccion}.`,
      fuente: a.fuentes.map((f) => f.lugar).join(" · "),
      relevante: true,
    });
  for (const a of r.repetidos)
    puntos.push({
      id: `rep-${a.codigo}-${a.fechaRepeticion}`,
      nivel: "atencion",
      titulo: `${a.examen}: ya hay un resultado de hace ${a.dias} días en otra sede`,
      detalle: `Antes en ${a.lugarAnterior} y después en ${a.lugarRepeticion}. Revisar el previo antes de pedirlo otra vez.`,
      fuente: `${a.lugarAnterior} · ${a.lugarRepeticion}`,
      relevante: toca(a.examen),
    });
  for (const c of r.condiciones)
    puntos.push({
      id: `con-${c.codigo}`,
      nivel: "info",
      titulo: c.nombre,
      detalle: `Diagnóstico registrado (CIE-10 ${c.codigo}).`,
      fuente: c.fuentes.map((f) => f.lugar).join(" · "),
      relevante: toca(c.nombre),
    });
  const ultimos = new Map<string, Resumen["examenes"][number]>();
  for (const e of r.examenes) if (e.codigo && !ultimos.has(e.codigo)) ultimos.set(e.codigo, e);
  for (const e of ultimos.values()) {
    const relevante = toca(e.nombre);
    // Solo los resultados ligados al motivo de consulta; el resto está en la pestaña Exámenes.
    if (!relevante) continue;
    puntos.push({
      id: `exa-${e.codigo}`,
      nivel: "info",
      titulo: `${e.nombre}: ${e.resultado}`,
      detalle: `Último resultado, ${hace(e.fecha)}.${e.interpretacion ? ` ${e.interpretacion.replace(/\.$/, "")}.` : ""}`,
      fuente: `${e.establecimiento} · ${e.fecha}`,
      relevante,
    });
  }
  const vigentes = r.medicamentos.filter((m) =>
    m.fuentes.some((f) => f.estado === "active" && (!f.fin || f.fin >= new Date().toISOString().slice(0, 10))),
  );
  for (const m of vigentes)
    puntos.push({
      id: `med-${m.nombre}`,
      nivel: "info",
      titulo: m.nombre,
      detalle: "Registrado como activo. Confirmar el uso con el paciente.",
      fuente: m.fuentes.map((f) => f.lugar).join(" · "),
      relevante: toca(m.nombre),
    });
  const ultima = r.atenciones[0];
  if (ultima)
    puntos.push({
      id: "ultima",
      nivel: "info",
      titulo: `Última atención ${hace(ultima.fecha)}`,
      detalle: `${ultima.motivo.replace(/\.$/, "")}. Diagnóstico: ${ultima.diagnostico.replace(/\.$/, "")}.`,
      fuente: `${ultima.establecimiento} · ${ultima.fecha}`,
      relevante: toca(ultima.motivo, ultima.diagnostico),
    });
  const orden = { critico: 0, atencion: 1, info: 2 };
  puntos.sort((a, b) => orden[a.nivel] - orden[b.nivel] || Number(b.relevante) - Number(a.relevante));
  // Lo urgente siempre se muestra; de lo demás, lo más ligado al motivo y un máximo para no abrumar.
  const MAX_INFO = 5;
  let info = 0;
  return puntos.filter((x) => x.nivel !== "info" || info++ < MAX_INFO);
}
