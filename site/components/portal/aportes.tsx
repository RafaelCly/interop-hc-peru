"use client";
import { useState } from "react";
import { Camera, Check, DownloadSimple, Eye, QrCode, Sparkle } from "@phosphor-icons/react";
import QRCode from "qrcode";
import type { ResultadoAportado } from "@/lib/tipos";
import { btn, panel } from "@/components/ui";
import { fetchPortal, ErrorBlock, dateOnly, dateTime } from "./shared";

// ---------- Carné QR con el resumen firmado ----------

interface CarnetVista {
  codigo: string;
  vence: string;
  bytes: number;
  qr: string;
}

export function CarnetQR() {
  const [carnet, setCarnet] = useState<CarnetVista | null>(null),
    [error, setError] = useState(""),
    [cargando, setCargando] = useState(false),
    [copiado, setCopiado] = useState(false);
  const generar = async () => {
    setError("");
    setCargando(true);
    try {
      const r = (await fetchPortal("carnet", "POST", {})) as Omit<CarnetVista, "qr">;
      const qr = await QRCode.toDataURL(r.codigo, {
        errorCorrectionLevel: "L",
        margin: 2,
        width: 480,
        color: { dark: "#14213d", light: "#ffffff" },
      });
      setCarnet({ ...r, qr });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  };
  const copiar = async () => {
    if (!carnet) return;
    try {
      await navigator.clipboard.writeText(carnet.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No se pudo copiar el código.");
    }
  };
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className={`${panel} grid place-items-center gap-4 py-8 text-center`}>
        {carnet ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={carnet.qr}
              alt="Código QR con tu resumen clínico firmado"
              width={320}
              height={320}
              className="w-full max-w-[20rem] rounded-card bg-white p-2 shadow-card"
            />
            <p className="text-[0.9rem] text-muted">
              Vence el <strong className="font-semibold text-ink">{dateTime(carnet.vence)}</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a className={`${btn.primary} ${btn.sm}`} href={carnet.qr} download="carne-kipu.png">
                <DownloadSimple size={16} weight="bold" aria-hidden /> Guardar imagen
              </a>
              <button type="button" className={`${btn.ghost} ${btn.sm}`} onClick={() => void copiar()}>
                {copiado ? "Copiado" : "Copiar código"}
              </button>
              <button type="button" className={`${btn.ghost} ${btn.sm}`} onClick={() => void generar()} disabled={cargando}>
                {cargando ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-strong">
              <QrCode size={30} aria-hidden />
            </span>
            <div>
              <p className="text-[1.05rem] font-semibold">Aún no generas tu carné</p>
              <p className="mt-1 text-[0.9rem] text-muted">Toma unos segundos y no necesitas nada más.</p>
            </div>
            <button type="button" className={btn.primary} onClick={() => void generar()} disabled={cargando}>
              {cargando ? "Generando…" : "Generar mi carné"}
            </button>
          </>
        )}
        {error && <ErrorBlock mensaje={error} />}
      </section>
      <section className="grid gap-4">
        <div className={panel}>
          <h2 className="text-[1.05rem] font-semibold">Qué lleva tu carné</h2>
          <ul className="mt-3 grid gap-2.5 text-[0.93rem]">
            {[
              "Tus alergias y condiciones",
              "Los medicamentos que tomas",
              "Tus últimos resultados, incluidos los que agregaste",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-accent" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.9rem] text-muted">
            Todo va dentro del código, firmado por Kipu. El médico lo lee con su celular y comprueba que nadie lo
            alteró, aunque el establecimiento no tenga internet. Genéralo de nuevo cuando tengas resultados
            recientes.
          </p>
        </div>
        <p className="flex gap-2.5 rounded-ctl border border-warn-line bg-warn-bg px-4 py-3 text-[0.9rem]">
          <Eye size={19} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          Quien escanee el código puede leer tu resumen, como si le mostraras un papel. Muéstralo solo al personal
          de salud que te atiende.
        </p>
      </section>
    </div>
  );
}

// ---------- Digitalizar un resultado en papel con IA ----------

interface ExamenPropuesto {
  indice: number;
  nombre: string;
  resultado: string;
  confianza: "alta" | "media" | "baja";
  guardable: boolean;
  motivo?: string;
}
interface Lectura {
  id: string;
  laboratorio: string;
  fecha: string;
  examenes: ExamenPropuesto[];
  problema?: string;
  estado?: "confirmada" | "descartada";
}

// Reduce la foto en el navegador antes de enviarla: menos datos y menos costo de lectura.
async function prepararImagen(archivo: File): Promise<{ base64: string; vista: string }> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const vista = lienzo.toDataURL("image/jpeg", 0.85);
  return { base64: vista.split(",")[1], vista };
}

const CONFIANZA = {
  alta: ["bg-ok-bg text-ok", "Lectura clara"],
  media: ["bg-warn-bg text-warn", "Lectura dudosa"],
  baja: ["bg-danger-bg text-danger", "Lectura poco clara"],
} as const;

export function Digitalizar({
  aportados,
  alCambiar,
}: {
  aportados: ResultadoAportado[];
  alCambiar: () => Promise<void> | void;
}) {
  const [imagen, setImagen] = useState<{ base64: string; vista: string } | null>(null),
    [leyendo, setLeyendo] = useState(false),
    [enviando, setEnviando] = useState(false),
    [lectura, setLectura] = useState<Lectura | null>(null),
    [quitar, setQuitar] = useState<number[]>([]),
    [msg, setMsg] = useState(""),
    [error, setError] = useState("");

  const limpiar = () => {
    setLectura(null);
    setImagen(null);
    setQuitar([]);
  };
  const elegirFoto = async (archivo?: File) => {
    if (!archivo) return;
    setError("");
    setMsg("");
    setLectura(null);
    try {
      setImagen(await prepararImagen(archivo));
    } catch {
      setError("No se pudo abrir la imagen.");
    }
  };
  const leer = async () => {
    if (!imagen) return;
    setError("");
    setLeyendo(true);
    try {
      const r = (await fetchPortal("digitalizar", "POST", { imagen: imagen.base64, tipo: "image/jpeg" })) as {
        esResultado: boolean;
        motivo: string;
        lectura?: Lectura;
      };
      if (!r.esResultado || !r.lectura) {
        setError(r.motivo || "La imagen no parece un resultado de examen.");
        return;
      }
      setQuitar([]);
      setLectura(r.lectura);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };
  const decidir = async (accion: "confirmar-lectura" | "descartar-lectura") => {
    if (!lectura) return;
    setError("");
    setEnviando(true);
    try {
      const r = await fetchPortal(accion, "POST", { id: lectura.id, quitar });
      setMsg(r.mensaje);
      limpiar();
      if (accion === "confirmar-lectura") await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const borrar = async (id: string) => {
    setError("");
    try {
      await fetchPortal("borrar-aportado", "POST", { id });
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const guardables = lectura?.examenes.filter((e) => e.guardable && !quitar.includes(e.indice)).length ?? 0;
  const cerrada = lectura?.estado === "confirmada" ? "Esta foto ya está guardada en tu historia." : lectura?.estado === "descartada" ? "Ya descartaste esta foto. Toma otra." : "";

  return (
    <div className="grid gap-5">
      <section className={`${panel} grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center`}>
        <span className="grid size-14 place-items-center rounded-card bg-accent-soft text-accent-strong">
          <Camera size={28} aria-hidden />
        </span>
        <div>
          <p className="text-[1.05rem] font-semibold">{imagen ? "Foto lista para leer" : "Fotografía tu resultado"}</p>
          <p className="mt-1 text-[0.9rem] text-muted">
            Kipu lee el examen, el valor, la fecha y el laboratorio. Tú solo confirmas que coincide con tu papel. La
            foto no se guarda.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className={`${imagen ? btn.ghost : btn.primary} cursor-pointer`}>
              {imagen ? "Cambiar foto" : "Tomar o elegir foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void elegirFoto(e.target.files?.[0])}
              />
            </label>
            {imagen && !lectura && (
              <button type="button" className={btn.primary} disabled={leyendo} onClick={() => void leer()}>
                <Sparkle size={17} weight="fill" aria-hidden /> {leyendo ? "Leyendo…" : "Leer resultado"}
              </button>
            )}
          </div>
        </div>
        {(msg || error) && (
          <div className="sm:col-span-2">
            {msg && (
              <p role="status" className="rounded-ctl border border-ok-line bg-ok-bg px-4 py-3 text-sm">
                {msg}
              </p>
            )}
            {error && <ErrorBlock mensaje={error} />}
          </div>
        )}
      </section>

      {imagen && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className={panel}>
            <h3 className="font-semibold">Tu foto</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagen.vista} alt="Foto del resultado a digitalizar" className="mt-3 w-full rounded-ctl border border-line" />
          </section>
          {lectura && (
            <section className={panel}>
              <h3 className="font-semibold">¿Coincide con tu papel?</h3>
              <p className="mt-1 text-sm text-muted">
                Compara cada dato con la foto. No puedes cambiar valores: si algo no coincide, descarta la lectura.
              </p>
              <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-muted">Laboratorio o establecimiento</dt>
                  <dd>{lectura.laboratorio}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted">Fecha del resultado</dt>
                  <dd>{lectura.fecha ? dateOnly(lectura.fecha) : "No se ve en la foto"}</dd>
                </div>
              </dl>
              <ul className="mt-4 grid gap-2">
                {lectura.examenes.map((e) => {
                  const fuera = quitar.includes(e.indice);
                  return (
                    <li
                      key={e.indice}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-line px-3 py-2.5 text-sm ${!e.guardable || fuera ? "bg-surface-2 text-muted" : ""}`}
                    >
                      <span className="min-w-0">
                        <strong className={!e.guardable || fuera ? "font-semibold" : "font-semibold text-ink"}>{e.nombre}</strong>
                        {e.resultado && <span className={fuera ? "line-through" : ""}>: {e.resultado}</span>}
                        {e.guardable ? (
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIANZA[e.confianza][0]}`}>
                            {CONFIANZA[e.confianza][1]}
                          </span>
                        ) : (
                          <span className="block text-xs">No se guardará: {e.motivo}</span>
                        )}
                      </span>
                      {e.guardable && !cerrada && (
                        <button
                          type="button"
                          className={`${btn.ghost} ${btn.sm}`}
                          onClick={() => setQuitar((q) => (fuera ? q.filter((x) => x !== e.indice) : [...q, e.indice]))}
                        >
                          {fuera ? "Incluir" : "Quitar"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {cerrada ? (
                <p className="mt-4 rounded-ctl border border-line bg-surface-2 px-4 py-3 text-sm">{cerrada}</p>
              ) : lectura.problema ? (
                <>
                  <p className="mt-4 rounded-ctl border border-warn-line bg-warn-bg px-4 py-3 text-sm">{lectura.problema}</p>
                  <button type="button" className={`${btn.ghost} mt-3`} disabled={enviando} onClick={() => void decidir("descartar-lectura")}>
                    Descartar y tomar otra foto
                  </button>
                </>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btn.primary}
                    disabled={enviando || guardables === 0}
                    onClick={() => void decidir("confirmar-lectura")}
                  >
                    <Check size={17} weight="bold" aria-hidden /> Sí, coincide · guardar {guardables}
                  </button>
                  <button type="button" className={btn.ghost} disabled={enviando} onClick={() => void decidir("descartar-lectura")}>
                    No coincide
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <section className={panel}>
        <h3 className="font-semibold">Resultados que agregaste <span className="font-normal text-muted tabular-nums">· {aportados.length}</span></h3>
        {aportados.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Todavía no agregas resultados.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {aportados.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-line px-3 py-2 text-sm">
                <span>
                  <strong>{a.nombre}</strong>: {a.resultado} · {dateOnly(a.fecha)} · {a.laboratorio}
                  <span className="ml-2 text-xs text-muted">{a.metodo === "ia" ? "leído con IA y confirmado" : "ingresado a mano"}</span>
                </span>
                <button type="button" className={`${btn.ghost} ${btn.sm}`} onClick={() => void borrar(a.id)}>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Vista de los aportados dentro del expediente (médico y paciente) ----------

export function AportadosPaciente({ aportados }: { aportados: ResultadoAportado[] }) {
  if (!aportados.length) return null;
  return (
    <section className={panel}>
      <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        Agregados por el paciente
        <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn">Sin verificar por la fuente</span>
      </h3>
      <p className="mt-1 text-sm text-muted">
        Cargados por el paciente desde un papel. Compárelos con el original.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="py-2 pr-3">Examen</th>
              <th className="py-2 pr-3">Resultado</th>
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Emitido por</th>
              <th className="py-2">Cómo se cargó</th>
            </tr>
          </thead>
          <tbody>
            {aportados.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="py-2 pr-3">
                  {a.nombre} <span className="font-mono text-xs text-muted">LOINC {a.codigo}</span>
                </td>
                <td className="py-2 pr-3 font-semibold">{a.resultado}</td>
                <td className="py-2 pr-3">{dateOnly(a.fecha)}</td>
                <td className="py-2 pr-3">{a.laboratorio}</td>
                <td className="py-2 text-xs text-muted">{a.metodo === "ia" ? "Foto leída con IA, confirmada" : "Ingresado a mano"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
