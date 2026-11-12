// Cruce entre alergias y medicamentos de todas las fuentes. Son reglas fijas, no un modelo: el resultado
// debe ser el mismo ante los mismos datos y poder explicarse.
import type { AlertaSeguridad, Resumen } from "./tipos";

// Cada alergia con los principios activos que la activan y si es la misma sustancia o la misma clase.
const REGLAS: { alergia: string; sustancias: { nombre: string; clase?: string }[] }[] = [
  {
    alergia: "penicilina",
    sustancias: [
      { nombre: "penicilina" },
      { nombre: "amoxicilina", clase: "penicilinas" },
      { nombre: "ampicilina", clase: "penicilinas" },
      { nombre: "dicloxacilina", clase: "penicilinas" },
    ],
  },
  {
    alergia: "aspirina",
    sustancias: [{ nombre: "aspirina" }, { nombre: "acido acetilsalicilico" }],
  },
  {
    alergia: "sulfas",
    sustancias: [
      { nombre: "sulfametoxazol", clase: "sulfonamidas" },
      { nombre: "cotrimoxazol", clase: "sulfonamidas" },
      { nombre: "sulfadiazina", clase: "sulfonamidas" },
    ],
  },
  {
    alergia: "ibuprofeno",
    sustancias: [
      { nombre: "ibuprofeno" },
      { nombre: "naproxeno", clase: "antiinflamatorios (AINE)" },
      { nombre: "diclofenaco", clase: "antiinflamatorios (AINE)" },
      { nombre: "ketorolaco", clase: "antiinflamatorios (AINE)" },
    ],
  },
];
const limpio = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const hoy = () => new Date().toISOString().slice(0, 10);

export function cruzarAlergias(
  r: Pick<Resumen, "alergias" | "medicamentos">,
): AlertaSeguridad[] {
  const alertas: AlertaSeguridad[] = [];
  for (const a of r.alergias) {
    const regla = REGLAS.find((x) => limpio(a.sustancia).includes(x.alergia));
    if (!regla) continue;
    for (const m of r.medicamentos) {
      const texto = limpio(m.nombre);
      const sust = regla.sustancias.find((s) => new RegExp(String.raw`\b${s.nombre}`).test(texto));
      if (!sust) continue;
      for (const f of m.fuentes) {
        alertas.push({
          alergia: a.sustancia,
          reaccion: a.reaccion,
          medicamento: m.nombre,
          relacion: sust.clase ? `misma clase: ${sust.clase}` : "misma sustancia",
          lugarAlergia: a.fuentes.map((x) => x.lugar).join(" · "),
          lugarMedicamento: f.lugar,
          entreSedes: !a.fuentes.some((x) => x.clave === f.clave),
          vigente: f.estado === "active" && (!f.fin || f.fin >= hoy()),
        });
      }
    }
  }
  return alertas.sort((x, y) => Number(y.vigente) - Number(x.vigente));
}
