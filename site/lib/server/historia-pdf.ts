import "server-only";
// Historia clínica en PDF (A4). Reúne lo que el resumen ya trae de cada establecimiento, con la fuente de
// cada dato, para que el paciente la guarde o el médico la adjunte. Se arma en el servidor con pdf-lib.
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Resumen, Examen } from "@/lib/tipos";
import { SISTEMAS } from "@/lib/data";
import { interpretarResultado } from "@/lib/catalogo-clinico";

export interface Emisor {
  nombre: string;
  rol: "medico" | "paciente";
  cmp?: string;
  establecimiento?: string;
}

const A4 = { w: 595.28, h: 841.89 };
const M = { l: 46, r: 46, t: 40, b: 58 };
const ANCHO = A4.w - M.l - M.r;
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const C = {
  tinta: hex("#1b2233"),
  gris: hex("#5d6270"),
  linea: hex("#d6d1c6"),
  acento: hex("#2c4785"),
  acentoSuave: hex("#eef1f7"),
  fondo: hex("#f6f4ef"),
  peligro: hex("#a51d3a"),
  peligroSuave: hex("#fbe9ec"),
  aviso: hex("#8a5a00"),
  avisoSuave: hex("#fbf3e2"),
};

// Quita las marcas de datos de prueba que traen las fuentes.
const limpio = (t = "") =>
  t
    .replace(/\s*\([^)]*(sint[eé]tic|acad[eé]mic|simulad|ficticio)[^)]*\)/gi, "")
    .replace(/[;,]?\s*indicaci[oó]n cl[ií]nica simulada\.?/gi, ".")
    .replace(/\s*-\s*demostraci[oó]n\b/gi, "")
    .replace(/\s+(ficticio|ficticia|simulado|simulada)\b/gi, "")
    .replace(/\.\./g, ".")
    .trim();
const fecha = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const fechaHora = (iso: string | Date) =>
  new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const sexo = (s: string) => (s === "female" ? "Femenino" : s === "male" ? "Masculino" : "Sin dato");
const registrado = (t?: string) => !!t && !/^no registrad[oa]$/i.test(t.trim());
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const medActivo = (m: Resumen["medicamentos"][number]) =>
  m.fuentes.some((f) => f.estado === "active" && (!f.fin || f.fin.slice(0, 10) >= hoyISO()));
const fuera = (e: Examen) =>
  !!e.codigo && typeof e.valor === "number" && interpretarResultado(e.codigo, e.valor).estado === "revisar";
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
// La interpretación solo se muestra cuando una regla del catálogo dice algo concreto del valor.
const interpretacion = (e: Examen) =>
  !e.interpretacion || /^interpretaci[oó]n individual/i.test(e.interpretacion) ? "—" : e.interpretacion;
const nombreSistema = (k: string) => SISTEMAS[k as keyof typeof SISTEMAS]?.nombre ?? k;

type Columna = { t: string; w: number };
type Estilo = { size?: number; font?: PDFFont; color?: RGB; lh?: number };

class Documento {
  pdf!: PDFDocument;
  f!: PDFFont;
  fb!: PDFFont;
  fi!: PDFFont;
  mono!: PDFFont;
  page!: PDFPage;
  y = 0;
  private ok = new Map<string, boolean>();
  constructor(
    private r: Resumen,
    private emisor: Emisor,
    private emitido: Date,
    private numero: string,
  ) {}

  async iniciar() {
    this.pdf = await PDFDocument.create();
    this.f = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.fb = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.fi = await this.pdf.embedFont(StandardFonts.HelveticaOblique);
    this.mono = await this.pdf.embedFont(StandardFonts.Courier);
    this.pdf.setTitle(`Historia clínica · ${this.r.nombre}`);
    this.pdf.setAuthor("Kipu");
    this.pdf.setSubject(`Historia clínica del paciente con DNI ${this.r.dni}`);
    this.pdf.setCreator("Kipu · Historia clínica compartida");
    this.pdf.setProducer("Kipu");
    this.pdf.setLanguage("es-PE");
    this.pdf.setCreationDate(this.emitido);
    this.portada();
  }

  // Las fuentes estándar del PDF solo codifican Latin-1 (WinAnsi); lo demás se reemplaza.
  t(s: unknown): string {
    const base = limpio(String(s ?? ""))
      .replace(/≥/g, ">=")
      .replace(/≤/g, "<=")
      .replace(/→/g, "->")
      .replace(/[  ]/g, " ")
      .replace(/\t/g, " ");
    let out = "";
    for (const ch of base) {
      if (ch === "\n") {
        out += ch;
        continue;
      }
      let v = this.ok.get(ch);
      if (v === undefined) {
        try {
          this.f.widthOfTextAtSize(ch, 10);
          v = true;
        } catch {
          v = false;
        }
        this.ok.set(ch, v);
      }
      out += v ? ch : "?";
    }
    return out;
  }

  envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
    const lineas: string[] = [];
    for (const parrafo of this.t(texto).split("\n")) {
      let actual = "";
      for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (font.widthOfTextAtSize(prueba, size) <= ancho) {
          actual = prueba;
          continue;
        }
        if (actual) lineas.push(actual);
        // Palabra más ancha que la columna: se corta por caracteres.
        let resto = palabra;
        while (font.widthOfTextAtSize(resto, size) > ancho && resto.length > 1) {
          let i = resto.length - 1;
          while (i > 1 && font.widthOfTextAtSize(resto.slice(0, i), size) > ancho) i--;
          lineas.push(resto.slice(0, i));
          resto = resto.slice(i);
        }
        actual = resto;
      }
      lineas.push(actual);
    }
    return lineas;
  }

  marca(x: number, yTop: number, lado: number, color = C.acento) {
    // Quipu de la marca, dibujado sobre una cuadrícula de 32 × 32.
    const k = lado / 32;
    const P = (px: number, py: number) => ({ x: x + px * k, y: yTop - py * k });
    this.page.drawLine({ start: P(4, 7), end: P(28, 7), thickness: 2.6 * k, color, lineCap: 1 });
    for (const [cx, largo] of [
      [9, 24],
      [16, 28],
      [23, 20],
    ])
      this.page.drawLine({ start: P(cx, 7), end: P(cx, largo), thickness: 1.5 * k, color, lineCap: 1 });
    for (const [cx, cy] of [
      [9, 13.5],
      [9, 19.5],
      [16, 12],
      [16, 17.5],
      [16, 23],
      [23, 15.5],
    ])
      this.page.drawCircle({ ...P(cx, cy), size: 2.2 * k, color });
  }

  derecha(texto: string, yBase: number, size: number, font: PDFFont, color: RGB) {
    const s = this.t(texto);
    this.page.drawText(s, { x: A4.w - M.r - font.widthOfTextAtSize(s, size), y: yBase, size, font, color });
  }

  portada() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    const top = A4.h - M.t;
    this.marca(M.l, top, 34);
    this.page.drawText("Kipu", { x: M.l + 42, y: top - 19, size: 20, font: this.fb, color: C.tinta });
    this.page.drawText(this.t("Historia clínica compartida entre establecimientos"), {
      x: M.l + 42,
      y: top - 31,
      size: 7.8,
      font: this.f,
      color: C.gris,
    });
    this.derecha("HISTORIA CLÍNICA", top - 13, 13.5, this.fb, C.tinta);
    this.derecha(`N.º ${this.numero}`, top - 26, 8.5, this.mono, C.gris);
    this.derecha(`Emitida el ${fechaHora(this.emitido)} (hora de Lima)`, top - 37, 7.8, this.f, C.gris);
    this.page.drawRectangle({ x: M.l, y: top - 50, width: ANCHO, height: 1.6, color: C.acento });
    this.y = top - 66;
  }

  continuacion() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    const top = A4.h - M.t + 6;
    this.marca(M.l, top, 16);
    this.page.drawText("Kipu", { x: M.l + 20, y: top - 11, size: 10.5, font: this.fb, color: C.tinta });
    this.derecha(`Historia clínica · ${this.r.nombre} · DNI ${this.r.dni}`, top - 10, 7.8, this.f, C.gris);
    this.page.drawLine({
      start: { x: M.l, y: top - 20 },
      end: { x: A4.w - M.r, y: top - 20 },
      thickness: 0.6,
      color: C.linea,
    });
    this.y = top - 36;
  }

  espacio(h: number) {
    if (this.y - h < M.b) this.continuacion();
  }

  parrafo(texto: string, { size = 9, font = this.f, color = C.tinta, lh = 1.38 }: Estilo = {}, x = M.l, ancho = ANCHO) {
    for (const linea of this.envolver(texto, font, size, ancho)) {
      this.espacio(size * lh);
      this.page.drawText(linea, { x, y: this.y - size, size, font, color });
      this.y -= size * lh;
    }
  }

  seccion(n: number, titulo: string, nota?: string) {
    this.espacio(nota ? 64 : 52);
    this.y -= 10;
    const s = this.t(`${n}. ${titulo.toUpperCase()}`);
    this.page.drawText(s, { x: M.l, y: this.y - 10, size: 10, font: this.fb, color: C.acento });
    this.y -= 15;
    this.page.drawLine({ start: { x: M.l, y: this.y }, end: { x: A4.w - M.r, y: this.y }, thickness: 0.8, color: C.acento });
    this.y -= 8;
    if (nota) {
      this.parrafo(nota, { size: 8, color: C.gris, font: this.fi });
      this.y -= 3;
    }
  }

  vacio(texto: string) {
    this.parrafo(texto, { size: 8.8, color: C.gris, font: this.fi });
    this.y -= 2;
  }

  // Pares etiqueta/valor en columnas.
  campos(pares: [string, string][], columnas = 2) {
    const ancho = ANCHO / columnas;
    for (let i = 0; i < pares.length; i += columnas) {
      const fila = pares.slice(i, i + columnas);
      const alturas = fila.map(([, v]) => this.envolver(v || "—", this.f, 9.2, ancho - 10).length);
      const h = 11 + Math.max(...alturas) * 12.4 + 6;
      this.espacio(h);
      fila.forEach(([etq, v], j) => {
        const x = M.l + j * ancho;
        this.page.drawText(this.t(etq.toUpperCase()), { x, y: this.y - 7, size: 6.8, font: this.fb, color: C.gris });
        this.envolver(v || "—", this.f, 9.2, ancho - 10).forEach((l, k) =>
          this.page.drawText(l, { x, y: this.y - 19 - k * 12.4, size: 9.2, font: this.f, color: C.tinta }),
        );
      });
      this.y -= h;
    }
  }

  tabla(cols: Columna[], filas: string[][], color?: (i: number) => RGB | undefined) {
    const size = 8.2,
      lh = 10.6,
      pad = 4.5;
    const anchos = cols.map((c) => c.w * ANCHO);
    const encabezado = () => {
      const lineas = cols.map((c, j) => this.envolver(c.t.toUpperCase(), this.fb, 7.2, anchos[j] - 2 * pad));
      const h = Math.max(...lineas.map((l) => l.length)) * 9.4 + 2 * pad;
      this.page.drawRectangle({ x: M.l, y: this.y - h, width: ANCHO, height: h, color: C.acentoSuave });
      let x = M.l;
      lineas.forEach((ls, j) => {
        ls.forEach((l, k) =>
          this.page.drawText(l, { x: x + pad, y: this.y - pad - 7 - k * 9.4, size: 7.2, font: this.fb, color: C.acento }),
        );
        x += anchos[j];
      });
      this.y -= h;
    };
    this.espacio(46);
    encabezado();
    filas.forEach((fila, i) => {
      const lineas = fila.map((celda, j) => this.envolver(celda || "—", j === 0 ? this.fb : this.f, size, anchos[j] - 2 * pad));
      const h = Math.max(...lineas.map((l) => l.length)) * lh + 2 * pad;
      if (this.y - h < M.b) {
        this.continuacion();
        encabezado();
      }
      const tono = color?.(i);
      let x = M.l;
      lineas.forEach((ls, j) => {
        ls.forEach((l, k) =>
          this.page.drawText(l, {
            x: x + pad,
            y: this.y - pad - size + 0.5 - k * lh,
            size,
            font: j === 0 ? this.fb : this.f,
            color: tono ?? (j === 0 ? C.tinta : C.tinta),
          }),
        );
        x += anchos[j];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M.l, y: this.y }, end: { x: A4.w - M.r, y: this.y }, thickness: 0.5, color: C.linea });
    });
    this.y -= 6;
  }

  recuadro(texto: string, fondo: RGB, borde: RGB, tinta: RGB, titulo?: string) {
    const ls = this.envolver(texto, this.f, 8.8, ANCHO - 20);
    const h = (titulo ? 13 : 0) + ls.length * 11.6 + 14;
    this.espacio(h + 4);
    this.page.drawRectangle({ x: M.l, y: this.y - h, width: ANCHO, height: h, color: fondo, borderColor: borde, borderWidth: 0.7 });
    let yy = this.y - 7;
    if (titulo) {
      this.page.drawText(this.t(titulo), { x: M.l + 10, y: yy - 9, size: 9, font: this.fb, color: tinta });
      yy -= 13;
    }
    ls.forEach((l, k) => this.page.drawText(l, { x: M.l + 10, y: yy - 9 - k * 11.6, size: 8.8, font: this.f, color: C.tinta }));
    this.y -= h + 6;
  }

  pies(verificacion: string) {
    const paginas = this.pdf.getPages();
    paginas.forEach((p, i) => {
      p.drawLine({ start: { x: M.l, y: M.b - 16 }, end: { x: A4.w - M.r, y: M.b - 16 }, thickness: 0.6, color: C.linea });
      p.drawText(this.t("Documento confidencial: contiene datos de salud protegidos por la Ley N.º 29733. Uso exclusivo para la atención del paciente."), {
        x: M.l,
        y: M.b - 27,
        size: 6.8,
        font: this.f,
        color: C.gris,
      });
      p.drawText(this.t(`N.º ${this.numero} · Verificación ${verificacion}`), { x: M.l, y: M.b - 37, size: 6.8, font: this.mono, color: C.gris });
      const pag = this.t(`Página ${i + 1} de ${paginas.length}`);
      p.drawText(pag, { x: A4.w - M.r - this.fb.widthOfTextAtSize(pag, 7.4), y: M.b - 32, size: 7.4, font: this.fb, color: C.tinta });
    });
  }
}

export async function historiaPdf(r: Resumen, emisor: Emisor): Promise<{ bytes: Uint8Array; nombre: string }> {
  const emitido = new Date();
  const huella = createHash("sha256").update(JSON.stringify(r)).update(emitido.toISOString()).update(emisor.nombre).digest("hex");
  const numero = `HC-${hoyISO().replace(/-/g, "")}-${huella.slice(0, 6).toUpperCase()}`;
  const verificacion = huella.slice(6, 18).toUpperCase().match(/.{4}/g)!.join("-");
  const d = new Documento(r, emisor, emitido, numero);
  await d.iniciar();
  let n = 0;

  // 1. Identificación
  d.seccion(++n, "Datos del paciente");
  d.campos(
    [
      ["Apellidos y nombres", r.nombre],
      ["Documento de identidad", `DNI ${r.dni}`],
      ["Edad", `${r.edad} años`],
      ["Sexo", sexo(r.sexo)],
    ],
    4,
  );
  d.campos([
    [
      "Solicitado por",
      emisor.rol === "medico"
        ? `${emisor.nombre}${emisor.cmp ? ` · ${emisor.cmp}` : ""} (médico tratante)`
        : `${emisor.nombre} (el propio paciente)`,
    ],
    [
      "Sistemas con registro del paciente",
      r.establecimientos
        .filter((e) => e.estado === "ok")
        .map((e) => nombreSistema(e.clave))
        .join(" · ") || "Ninguno",
    ],
  ]);

  // 2. Alertas
  d.seccion(++n, "Alergias y alertas");
  const incompletos = r.traza.sistemas.filter((x) => x.estado === "no_disponible");
  if (incompletos.length)
    d.recuadro(
      `${incompletos.map((x) => nombreSistema(x.clave)).join(", ")} no respondió al generar este documento. La información de ese establecimiento puede faltar.`,
      C.avisoSuave,
      C.aviso,
      C.aviso,
      "Historia posiblemente incompleta",
    );
  for (const s of r.seguridad)
    d.recuadro(
      `${mayus(s.relacion)}. Alergia registrada en ${s.lugarAlergia}; medicamento registrado en ${s.lugarMedicamento}${s.entreSedes ? " (otro establecimiento)" : ""}.`,
      C.peligroSuave,
      C.peligro,
      C.peligro,
      `${s.medicamento}${s.vigente ? " (activo)" : ""} con alergia a ${s.alergia.toLowerCase()}`,
    );
  if (r.alergias.length)
    d.tabla(
      [
        { t: "Alergia", w: 0.3 },
        { t: "Reacción", w: 0.36 },
        { t: "Registrada en", w: 0.34 },
      ],
      r.alergias.map((a) => [a.sustancia, a.reaccion, [...new Set(a.fuentes.map((f) => f.lugar))].join(" · ")]),
      () => C.peligro,
    );
  else d.vacio("No se registran alergias en los establecimientos consultados.");

  // 3. Diagnósticos
  d.seccion(++n, "Diagnósticos y problemas de salud");
  if (r.condiciones.length)
    d.tabla(
      [
        { t: "Diagnóstico", w: 0.38 },
        { t: "Código", w: 0.14 },
        { t: "Registrado en", w: 0.32 },
        { t: "Fecha", w: 0.16 },
      ],
      r.condiciones.map((c) => [
        c.nombre,
        c.codigo,
        [...new Set(c.fuentes.map((f) => f.lugar))].join(" · "),
        c.fuentes.map((f) => fecha(f.fecha)).filter((x) => x !== "—").join(", ") || "—",
      ]),
    );
  else d.vacio("No se registran diagnósticos.");

  // 4. Medicamentos
  d.seccion(++n, "Medicamentos");
  if (r.medicamentos.length) {
    const meds = [...r.medicamentos].sort((a, b) => Number(medActivo(b)) - Number(medActivo(a)));
    d.tabla(
      [
        { t: "Medicamento", w: 0.33 },
        { t: "Estado", w: 0.12 },
        { t: "Desde", w: 0.12 },
        { t: "Hasta", w: 0.12 },
        { t: "Registrado en", w: 0.31 },
      ],
      meds.map((m) => {
        const inicios = m.fuentes.map((f) => f.fecha).filter(Boolean).sort() as string[];
        const fines = m.fuentes.map((f) => f.fin).filter(Boolean).sort() as string[];
        return [
          m.nombre,
          medActivo(m) ? "Activo" : "No activo",
          fecha(inicios[0]),
          medActivo(m) ? (fines.at(-1) ? fecha(fines.at(-1)) : "Continúa") : fecha(fines.at(-1)),
          [...new Set(m.fuentes.map((f) => f.lugar))].join(" · "),
        ];
      }),
    );
  } else d.vacio("No se registran medicamentos.");

  // 5. Exámenes
  d.seccion(
    ++n,
    "Resultados de exámenes",
    "Los resultados marcados en rojo están fuera del rango de referencia. La interpretación sigue las reglas del catálogo de Kipu y no reemplaza el criterio del médico.",
  );
  if (r.examenes.length) {
    const ex = r.examenes;
    d.tabla(
      [
        { t: "Fecha", w: 0.11 },
        { t: "Examen", w: 0.22 },
        { t: "Resultado", w: 0.13 },
        { t: "Referencia", w: 0.18 },
        { t: "Interpretación", w: 0.18 },
        { t: "Establecimiento", w: 0.18 },
      ],
      ex.map((e) => [
        fecha(e.fecha),
        e.nombre,
        e.resultado,
        e.referencia ?? "—",
        interpretacion(e),
        e.establecimiento,
      ]),
      (i) => (fuera(ex[i]) ? C.peligro : undefined),
    );
  } else d.vacio("No se registran exámenes.");
  if (r.repetidos.length) {
    d.parrafo("Exámenes repetidos en poco tiempo entre establecimientos", { size: 8.8, font: d.fb });
    d.y -= 3;
    d.tabla(
      [
        { t: "Examen", w: 0.26 },
        { t: "Primera vez", w: 0.3 },
        { t: "Repetido", w: 0.3 },
        { t: "Días entre ambos", w: 0.14 },
      ],
      r.repetidos.map((a) => [
        a.examen,
        `${fecha(a.fechaAnterior)} · ${a.lugarAnterior}`,
        `${fecha(a.fechaRepeticion)} · ${a.lugarRepeticion}`,
        `${a.dias} (vigencia ${a.ventana})`,
      ]),
    );
  }

  // 6. Aportados por el paciente
  if (r.aportados?.length) {
    d.seccion(
      ++n,
      "Resultados aportados por el paciente",
      "El paciente los agregó a partir de resultados en papel. Ningún establecimiento los verificó; confirmar con el documento original.",
    );
    d.tabla(
      [
        { t: "Fecha", w: 0.12 },
        { t: "Examen", w: 0.28 },
        { t: "Resultado", w: 0.2 },
        { t: "Laboratorio", w: 0.25 },
        { t: "Cómo se registró", w: 0.15 },
      ],
      r.aportados.map((a) => [
        fecha(a.fecha),
        a.nombre,
        a.resultado,
        a.laboratorio,
        a.metodo === "ia" ? "Foto leída y confirmada" : "Ingresado a mano",
      ]),
      () => C.aviso,
    );
  }

  // 7. Atenciones
  d.espacio(170);
  d.seccion(++n, "Atenciones", `${r.atenciones.length} atención(es), de la más reciente a la más antigua.`);
  if (!r.atenciones.length) d.vacio("No se registran atenciones.");
  for (const a of r.atenciones) {
    d.espacio(110);
    const h = 20;
    d.page.drawRectangle({ x: M.l, y: d.y - h, width: ANCHO, height: h, color: C.fondo });
    d.page.drawRectangle({ x: M.l, y: d.y - h, width: 2.4, height: h, color: C.acento });
    const izq = d.t(`${a.fechaHora ? fechaHora(a.fechaHora) : fecha(a.fecha)} · ${a.tipo}`);
    d.page.drawText(izq, { x: M.l + 9, y: d.y - 13.5, size: 9.2, font: d.fb, color: C.tinta });
    const sede = d.t(a.establecimiento);
    d.page.drawText(sede, { x: A4.w - M.r - 9 - d.f.widthOfTextAtSize(sede, 8.2), y: d.y - 13.5, size: 8.2, font: d.f, color: C.gris });
    d.y -= h + 6;
    d.campos(
      [
        ["Profesional", a.profesional],
        ["Motivo de consulta", a.motivo],
        ["Diagnóstico", a.diagnostico],
      ],
      3,
    );
    for (const [etq, v] of [
      ["Síntomas", a.sintomas],
      ["Signos y examen físico", a.signos],
      ["Evaluación", a.evaluacion],
      ["Plan", a.plan],
      ["Seguimiento", a.seguimiento],
    ] as const) {
      if (!registrado(v)) continue;
      d.espacio(24);
      d.page.drawText(d.t(etq.toUpperCase()), { x: M.l, y: d.y - 7, size: 6.8, font: d.fb, color: C.gris });
      d.y -= 11;
      d.parrafo(v, { size: 9 });
      d.y -= 4;
    }
    if (a.examenes.length) {
      d.espacio(24);
      d.page.drawText("EXÁMENES DE ESTA ATENCIÓN", { x: M.l, y: d.y - 7, size: 6.8, font: d.fb, color: C.gris });
      d.y -= 11;
      d.parrafo(a.examenes.map((e) => `${e.nombre}: ${e.resultado}`).join(" · "), { size: 9 });
      d.y -= 4;
    }
    if (a.medicamentos.length) {
      d.espacio(24);
      d.page.drawText("MEDICAMENTOS INDICADOS", { x: M.l, y: d.y - 7, size: 6.8, font: d.fb, color: C.gris });
      d.y -= 11;
      d.parrafo(a.medicamentos.join(" · "), { size: 9 });
      d.y -= 4;
    }
    d.y -= 8;
  }

  // 8. Fuentes
  d.seccion(++n, "Fuentes consultadas");
  d.tabla(
    [
      { t: "Sistema", w: 0.22 },
      { t: "Sede principal", w: 0.36 },
      { t: "N.º de historia local", w: 0.2 },
      { t: "Estado", w: 0.22 },
    ],
    r.traza.sistemas.map((x) => {
      const e = r.establecimientos.find((y) => y.clave === x.clave);
      return [
        nombreSistema(x.clave),
        SISTEMAS[x.clave].establecimiento,
        e?.idLocal ?? "—",
        x.estado === "ok" ? `Con registro · ${x.examenes ?? 0} examen(es)` : x.estado === "sin_registro" ? "Sin registro del paciente" : "No respondió",
      ];
    }),
  );
  d.y -= 4;
  d.parrafo(
    "Este documento reúne los registros que los establecimientos compartieron a través de Kipu en la fecha de emisión. No reemplaza la historia clínica de cada establecimiento, que sigue siendo el registro oficial. Cada dato indica el establecimiento que lo registró.",
    { size: 8, color: C.gris },
  );
  d.y -= 2;
  d.parrafo(
    `Emitido el ${fechaHora(emitido)} a solicitud de ${emisor.nombre}. La descarga queda registrada en el historial de accesos del paciente.`,
    { size: 8, color: C.gris },
  );

  d.pies(verificacion);
  const bytes = await d.pdf.save();
  const base = r.nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return { bytes, nombre: `historia-clinica-${base}-${hoyISO()}.pdf` };
}
