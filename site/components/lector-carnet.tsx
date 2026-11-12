"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import jsQR from "jsqr";
import { importarPublica, leerCarnet, PREFIJO, type Carnet, type Lectura } from "@/lib/carnet";
import { btn, panel, Chip } from "@/components/ui";
import { Camera, QrCode } from "@phosphor-icons/react";
import { Logo } from "@/components/marca";
import { BotonTema } from "@/components/tema";
import { dateOnly, dateTime } from "@/components/portal/shared";
import { cruzarAlergias } from "@/lib/seguridad";

const CLAVE_LOCAL = "hcp-clave-emisor";
interface ClaveGuardada {
  clave: JsonWebKey;
  guardada: string;
}

const EVENTO_CLAVE = "hcp-clave-cambio";
function textoGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_LOCAL);
  } catch {
    return null;
  }
}
function suscribirClave(aviso: () => void) {
  window.addEventListener(EVENTO_CLAVE, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO_CLAVE, aviso);
    window.removeEventListener("storage", aviso);
  };
}
function suscribirRed(aviso: () => void) {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
}

// Busca un QR en una imagen (cuadro de video o foto subida).
function buscarQR(fuente: CanvasImageSource, ancho: number, alto: number, lienzo: HTMLCanvasElement) {
  const escala = Math.min(1, 1000 / Math.max(ancho, alto));
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

export function LectorCarnet() {
  const guardado = useSyncExternalStore(suscribirClave, textoGuardado, () => null);
  const enLinea = useSyncExternalStore(suscribirRed, () => navigator.onLine, () => true);
  const clave = useMemo<ClaveGuardada | null>(() => {
    try {
      return guardado ? (JSON.parse(guardado) as ClaveGuardada) : null;
    } catch {
      return null;
    }
  }, [guardado]);
  const [camara, setCamara] = useState(false),
    [lectura, setLectura] = useState<Lectura | null>(null),
    [error, setError] = useState(""),
    [pegado, setPegado] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    lienzo = useRef<HTMLCanvasElement>(null),
    flujo = useRef<MediaStream | null>(null);

  // Clave del emisor: la guardada en este equipo y, con conexión, la vigente del servidor.
  useEffect(() => {
    fetch("/api/carnet/clave")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { clave?: JsonWebKey } | null) => {
        if (!j?.clave) return;
        try {
          localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ clave: j.clave, guardada: new Date().toISOString() }));
          window.dispatchEvent(new Event(EVENTO_CLAVE));
        } catch {
          /* sin almacenamiento local no se puede guardar la clave para leer sin conexión */
        }
      })
      .catch(() => undefined);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const recursos = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => u.includes("/_next/static/"));
          reg.active?.postMessage({ guardar: recursos });
        })
        .catch(() => undefined);
    }
  }, []);

  const detener = useCallback(() => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    setCamara(false);
  }, []);
  useEffect(() => detener, [detener]);

  const verificar = useCallback(
    async (codigo: string) => {
      setError("");
      if (!clave) {
        setError("Este equipo aún no tiene la clave del emisor. Abra esta página una vez con conexión.");
        return;
      }
      setLectura(await leerCarnet(codigo, await importarPublica(clave.clave)));
    },
    [clave],
  );

  const abrirCamara = async () => {
    setError("");
    setLectura(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      flujo.current = s;
      setCamara(true);
      requestAnimationFrame(() => {
        if (!video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        const ciclo = () => {
          const v = video.current;
          if (!flujo.current || !v || !lienzo.current) return;
          if (v.readyState >= 2) {
            const dato = buscarQR(v, v.videoWidth, v.videoHeight, lienzo.current);
            if (dato?.startsWith(`${PREFIJO}.`)) {
              detener();
              void verificar(dato);
              return;
            }
          }
          requestAnimationFrame(ciclo);
        };
        requestAnimationFrame(ciclo);
      });
    } catch {
      setError("No se pudo abrir la cámara. Permita el acceso o suba una foto del QR.");
    }
  };

  const subirFoto = async (archivo?: File) => {
    if (!archivo || !lienzo.current) return;
    setError("");
    setLectura(null);
    const bmp = await createImageBitmap(archivo);
    const dato = buscarQR(bmp, bmp.width, bmp.height, lienzo.current);
    if (dato) await verificar(dato);
    else setError("No se encontró un QR en la foto. Acerca el código y evita reflejos.");
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-16 w-[min(100%-2rem,64rem)] items-center justify-between gap-3">
          <a href="/" className="no-underline">
            <Logo subtitulo="Lector de carné" />
          </a>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-medium ${enLinea ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}
            >
              <span aria-hidden className={`size-1.5 rounded-full ${enLinea ? "bg-ok" : "bg-warn"}`} />
              {enLinea ? "En línea" : "Sin conexión"}
            </span>
            <BotonTema />
          </div>
        </div>
      </header>
      <main id="principal" tabIndex={-1} className="mx-auto w-[min(100%-2rem,64rem)] py-8 outline-none sm:py-12">
        <h1 className="font-display text-[clamp(1.8rem,1.3rem+1.6vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em]">
          Leer el carné del paciente
        </h1>
        <p className="mt-2 max-w-[60ch] text-muted">
          Funciona sin internet. La firma se comprueba en este equipo y nada de lo que lees sale de él.
        </p>

        {!clave && (
          <p role="alert" className="mt-6 rounded-ctl border border-warn-line bg-warn-bg px-4 py-3 text-[0.92rem]">
            Abre esta página una vez con internet para preparar el lector en este equipo.
          </p>
        )}

        <section className={`${panel} mt-6`}>
          <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <span className="grid size-14 place-items-center rounded-card bg-accent-soft text-accent-strong">
              <QrCode size={28} aria-hidden />
            </span>
            <div className="flex flex-wrap gap-2">
              {camara ? (
                <button type="button" className={btn.secondary} onClick={detener}>
                  Cerrar cámara
                </button>
              ) : (
                <button type="button" className={btn.primary} onClick={() => void abrirCamara()} disabled={!clave}>
                  <Camera size={18} aria-hidden /> Escanear con la cámara
                </button>
              )}
              <label className={`${btn.ghost} cursor-pointer ${clave ? "" : "pointer-events-none opacity-50"}`}>
                Subir foto del QR
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={!clave}
                  onChange={(e) => void subirFoto(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          {camara && (
            <video
              ref={video}
              muted
              playsInline
              className="mt-5 aspect-square w-full max-w-sm rounded-card bg-black object-cover"
            />
          )}
          <canvas ref={lienzo} className="hidden" />
          <details className="mt-5 border-t border-line pt-4 text-[0.9rem]">
            <summary className="cursor-pointer font-medium text-muted hover:text-ink">Pegar el código como texto</summary>
            <form
              className="mt-3 grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void verificar(pegado);
              }}
            >
              <textarea
                rows={3}
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                className="rounded-ctl border border-line bg-bg p-3 font-mono text-xs"
                placeholder="HCP1…"
              />
              <button type="submit" className={`${btn.secondary} ${btn.sm} justify-self-start`} disabled={!clave || !pegado.trim()}>
                Verificar
              </button>
            </form>
          </details>
          {error && (
            <p role="alert" className="mt-4 rounded-ctl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {clave && (
            <p className="mt-4 text-[0.8rem] text-muted">Lector preparado el {dateTime(clave.guardada)}.</p>
          )}
        </section>

      {lectura && !lectura.ok && (
        <p role="alert" className="mt-5 rounded-ctl border-2 border-danger bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {lectura.error}
        </p>
      )}
      {lectura?.ok && <VistaCarnet c={lectura.carnet} vencido={lectura.vencido} />}
      </main>
    </div>
  );
}

const ORIGEN = { minsa: "Minsa", essalud: "EsSalud", clinica: "Clínica" } as const;

function VistaCarnet({ c, vencido }: { c: Carnet; vencido: boolean }) {
  const aportados = c.r.filter((x) => x[4] === "paciente").length;
  // Las mismas reglas fijas del portal, aplicadas en este equipo: alergia contra medicamento vigente.
  const choques = [
    ...new Map(
      cruzarAlergias({
        alergias: c.a.map(([sustancia, reaccion]) => ({ sustancia, reaccion, fuentes: [] })),
        medicamentos: c.m.map((nombre) => ({ nombre, fuentes: [{ clave: "minsa", lugar: "carné", estado: "active" }] })),
      }).map((x) => [`${x.alergia}|${x.medicamento}`, x]),
    ).values(),
  ];
  return (
    <article className="mt-5 grid gap-4" aria-live="polite">
      <div
        role="status"
        className={`rounded-ctl border-2 px-4 py-3 text-sm ${vencido ? "border-warn bg-warn-bg" : "border-ok bg-ok-bg"}`}
      >
        <strong>{vencido ? "Firma válida, pero el carné venció" : "Firma válida"}</strong> · Emitido el {dateTime(c.g)} ·{" "}
        {vencido ? "venció" : "vence"} el {dateTime(c.x)}. Es una foto del historial en esa fecha.
        {vencido && " Pida al paciente que genere uno nuevo."}
      </div>
      <div className={panel}>
        <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.02em]">{c.n}</h2>
        <p className="mt-1 text-sm text-muted">
          DNI {c.d} · {c.e} años · {c.s === "female" ? "Femenino" : c.s === "male" ? "Masculino" : c.s}
        </p>
      </div>
      {choques.length > 0 && (
        <div role="alert" className="rounded-ctl border-2 border-danger bg-danger-bg px-4 py-3 text-sm text-ink">
          <strong className="text-danger">Alergia y medicamento vigente en conflicto.</strong>
          <ul className="mt-1 list-disc pl-5">
            {choques.map((x) => (
              <li key={`${x.alergia}-${x.medicamento}`}>
                Alergia a {x.alergia} ({x.reaccion}) y {x.medicamento} vigente · {x.relacion}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Regla fija sobre los datos del carné. Confírmelo con el paciente antes de indicar.</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${panel} border-danger-line`}>
          <h3 className="font-bold text-danger">Alergias</h3>
          {c.a.length ? (
            <ul className="mt-2 grid gap-1 text-sm">
              {c.a.map(([s, r]) => (
                <li key={s}>
                  <strong>{s}</strong> · {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Ninguna registrada (no significa que no tenga).</p>
          )}
        </section>
        <section className={panel}>
          <h3 className="font-bold">Condiciones</h3>
          {c.c.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {c.c.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No registradas.</p>
          )}
        </section>
        <section className={panel}>
          <h3 className="font-bold">Medicamentos vigentes</h3>
          {c.m.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {c.m.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No registrados.</p>
          )}
        </section>
      </div>
      <section className={panel}>
        <h3 className="font-bold">Últimos exámenes</h3>
        {aportados > 0 && (
          <p className="mt-1 text-xs text-muted">
            {aportados} resultado(s) los aportó el paciente desde una foto: confírmelos con el documento original.
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Examen</th>
                <th className="py-2 pr-3">Resultado</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2">Origen</th>
              </tr>
            </thead>
            <tbody>
              {c.r.map(([codigo, nombre, resultado, fecha, origen], i) => (
                <tr key={`${codigo}-${i}`} className="border-t border-line">
                  <td className="py-2 pr-3">
                    {nombre} <span className="font-mono text-xs text-muted">LOINC {codigo}</span>
                  </td>
                  <td className="py-2 pr-3 font-semibold">{resultado}</td>
                  <td className="py-2 pr-3">{dateOnly(fecha)}</td>
                  <td className="py-2">
                    {origen === "paciente" ? (
                      <span className="inline-flex rounded-full border border-warn-line bg-warn-bg px-2.5 py-0.5 text-[0.8rem] font-medium text-warn">
                        Aportado por el paciente
                      </span>
                    ) : (
                      <Chip clave={origen}>{ORIGEN[origen]}</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted">
        Esta lectura no queda en la bitácora del paciente porque ocurre en este equipo, sin conexión: el paciente
        eligió mostrar su QR, como mostraría un papel.
      </p>
    </article>
  );
}
