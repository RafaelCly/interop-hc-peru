"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SafeUser } from "@/lib/server/auth";
import { CheckCircle, SignOut, type Icon } from "@phosphor-icons/react";
import { panel } from "@/components/ui";
import { Logo } from "@/components/marca";
import { BotonTema } from "@/components/tema";
export type SolicitudView = {
  id: string;
  doctorId: string;
  patientId: string;
  dni: string;
  finalidad: string;
  estado: "pendiente" | "aprobada" | "rechazada" | "revocada";
  creada: string;
  decidida?: string;
  expira?: string;
  via?: "solicitud" | "qr" | "emergencia" | "atencion" | "sms";
  doctor: string;
  paciente: string;
};
export type EventView = {
  id: string;
  cuando: string;
  accion: string;
  detalle: string;
  actor: string;
  patientId?: string;
};
export const dateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Lima",
      })
    : "Sin registro";
export const dateOnly = (iso?: string) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00-05:00`).toLocaleDateString("es-PE", {
        dateStyle: "medium",
        timeZone: "America/Lima",
      })
    : "No registrada";
// Nombres oficiales de los códigos LOINC, consultados una sola vez al servicio de terminología de HL7.
export interface Terminologia {
  version: string | null;
  items: Record<string, string>;
}
const SIN_TERMINOLOGIA: Terminologia = { version: null, items: {} };
let terminologia: Promise<Terminologia> | null = null;
function cargarTerminologia() {
  terminologia ??= fetch("/api/terminologia")
    .then(async (r) => {
      const t = r.ok ? ((await r.json()) as Terminologia) : SIN_TERMINOLOGIA;
      if (!Object.keys(t.items).length) terminologia = null; // reintentar en la próxima vista
      return t;
    })
    .catch(() => {
      terminologia = null;
      return SIN_TERMINOLOGIA;
    });
  return terminologia;
}
export function useTerminologia() {
  const [t, setT] = useState<Terminologia>(SIN_TERMINOLOGIA);
  useEffect(() => {
    let vivo = true;
    void cargarTerminologia().then((x) => vivo && setT(x));
    return () => {
      vivo = false;
    };
  }, []);
  return t;
}
export async function fetchPortal(action: string, method: "GET" | "POST" = "GET", data?: unknown) {
  const r = await fetch(`/api/portal/${action}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({ error: "Respuesta inválida del servidor." }));
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j;
}
export interface ItemNav {
  k: string;
  t: string;
  icono: Icon;
  insignia?: number;
  href?: string;
}

const iniciales = (n: string) =>
  n
    .replace(/^Dra?\.\s+/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();

// Marco de la aplicación: barra lateral con la navegación y la cuenta; en el celular, barra superior.
export function Shell({
  user,
  items,
  activo,
  onCambiar,
  children,
}: {
  user: SafeUser;
  items: ItemNav[];
  activo: string;
  onCambiar: (k: string) => void;
  children: React.ReactNode;
}) {
  const router = useRouter(),
    [saliendo, setSaliendo] = useState(false);
  const salir = async () => {
    setSaliendo(true);
    try {
      await fetchPortal("logout", "POST", {});
      router.replace("/");
      router.refresh();
    } catch {
      setSaliendo(false);
    }
  };
  const medico = user.role === "medico";
  const sede = (user.establecimiento ?? "").replace(/\s*\([^)]*\)$/, "");
  const detalle = medico ? `${user.cmp}${sede ? ` · ${sede}` : ""}` : `DNI ${user.dni}`;
  const boton = (x: ItemNav, compacto = false) => {
    const sel = x.k === activo;
    const clase = compacto
      ? `inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[0.86rem] font-medium no-underline transition-colors ${sel ? "bg-ink text-bg" : "bg-surface text-muted shadow-card hover:text-ink"}`
      : `flex min-h-10 w-full items-center gap-3 rounded-ctl px-3 text-left text-[0.92rem] font-medium no-underline transition-[background-color,color] duration-150 ${sel ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-surface-2/70 hover:text-ink"}`;
    const contenido = (
      <>
        <x.icono
          size={compacto ? 17 : 19}
          weight={sel ? "fill" : "regular"}
          className={sel && !compacto ? "text-accent" : ""}
          aria-hidden
        />
        <span className="truncate">{x.t}</span>
        {!!x.insignia && (
          <span
            className={`${compacto ? "" : "ml-auto"} min-w-5 rounded-full bg-accent px-1.5 text-center text-[0.72rem] font-semibold leading-5 text-accent-ink tabular-nums`}
          >
            {x.insignia}
          </span>
        )}
      </>
    );
    return x.href ? (
      <a key={x.k} href={x.href} className={clase}>
        {contenido}
      </a>
    ) : (
      <button
        key={x.k}
        type="button"
        onClick={() => onCambiar(x.k)}
        aria-current={sel ? "page" : undefined}
        className={clase}
      >
        {contenido}
      </button>
    );
  };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="no-imprimir sticky top-0 hidden h-dvh flex-col border-r border-line px-4 pb-4 pt-6 lg:flex">
        <div className="px-2">
          <Logo subtitulo={medico ? "Portal del médico" : "Mi salud"} />
        </div>
        <nav aria-label="Secciones" className="mt-9 grid gap-0.5">
          {items.map((x) => boton(x))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="flex items-center gap-3 px-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.85rem] font-semibold text-accent-strong">
              {iniciales(user.nombre)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9rem] font-semibold">{user.nombre}</p>
              <p className="truncate text-[0.78rem] text-muted" title={detalle}>
                {detalle}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1">
            <button
              type="button"
              onClick={salir}
              disabled={saliendo}
              className="inline-flex min-h-10 flex-1 items-center gap-2 rounded-ctl px-3 text-[0.88rem] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              <SignOut size={18} aria-hidden /> {saliendo ? "Saliendo…" : "Cerrar sesión"}
            </button>
            <BotonTema />
          </div>
        </div>
      </aside>

      <header className="no-imprimir sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur lg:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
          <Logo />
          <div className="flex items-center">
            <BotonTema />
            <button
              type="button"
              onClick={salir}
              disabled={saliendo}
              aria-label="Cerrar sesión"
              className="inline-grid size-10 place-items-center rounded-ctl text-muted hover:bg-surface-2 hover:text-ink"
            >
              <SignOut size={19} />
            </button>
          </div>
        </div>
        <nav aria-label="Secciones" className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {items.map((x) => boton(x, true))}
        </nav>
      </header>

      <main id="principal" tabIndex={-1} className="min-w-0 px-4 py-6 outline-none sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[72rem]">{children}</div>
      </main>
    </div>
  );
}

// Encabezado de cada vista: título con la tipografía de la marca, una línea de contexto y acciones.
export function Encabezado({
  titulo,
  bajada,
  acciones,
}: {
  titulo: string;
  bajada?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(1.7rem,1.3rem+1.2vw,2.25rem)] font-semibold leading-[1.1] tracking-[-0.025em]">
          {titulo}
        </h1>
        {bajada && <p className="mt-2 max-w-[62ch] text-[0.97rem] text-muted">{bajada}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function AvisoOk({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-ctl border border-ok-line bg-ok-bg px-4 py-3 text-[0.92rem] text-ink"
    >
      <CheckCircle size={19} weight="fill" className="mt-px shrink-0 text-ok" aria-hidden /> {children}
    </div>
  );
}
export function LoadingBlock() {
  return (
    <div className={`${panel} grid gap-3`} aria-busy="true" aria-label="Cargando">
      <div className="sk h-5 w-1/3" />
      <div className="sk h-4 w-2/3" />
      <div className="sk h-24 w-full" />
    </div>
  );
}
export function ErrorBlock({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="rounded-ctl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger"
    >
      {mensaje}
    </div>
  );
}
export function Pill({ status }: { status: string }) {
  const label =
    status === "pendiente"
      ? "Pendiente"
      : status === "aprobada"
        ? "Autorizada"
        : status === "rechazada"
          ? "Rechazada"
          : status === "revocada"
            ? "Revocada"
            : status;
  const classes =
    status === "aprobada"
      ? "bg-ok-bg text-ok"
      : status === "pendiente"
        ? "bg-warn-bg text-warn"
        : status === "rechazada" || status === "revocada"
          ? "bg-danger-bg text-danger"
          : "bg-surface-2 text-muted";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>{label}</span>
  );
}
const ACCIONES: Record<string, string> = {
  inicio_sesion: "Ingreso a la cuenta",
  solicitud_creada: "Solicitud de acceso",
  solicitud_aprobada: "Acceso autorizado",
  solicitud_rechazada: "Solicitud rechazada",
  solicitud_revocada: "Acceso revocado",
  historia_consultada: "Historia consultada",
  consulta_denegada: "Consulta denegada",
  llave_creada: "Llave de consulta generada",
  llave_invalida: "Código de llave no válido",
  acceso_por_llave: "Ingreso con llave de consulta",
  acceso_emergencia: "Acceso de emergencia",
  carne_emitido: "Carné generado",
  lectura_ia: "Resultado leído con IA",
  resultado_aportado: "Resultado agregado",
  lectura_descartada: "Lectura descartada",
  aporte_eliminado: "Resultado eliminado",
  acceso_por_atencion: "Quedó como médico tratante",
  historia_descargada: "Historia descargada en PDF",
  autorizacion_aprobada: "Acceso autorizado",
  autorizacion_rechazada: "Solicitud rechazada",
  autorizacion_revocada: "Acceso retirado por el paciente",
  sms_enviado: "Código enviado por SMS",
  sms_invalido: "Código SMS incorrecto",
  acceso_por_sms: "Ingreso con código SMS",
  atencion_activada: "Acceso en citas activado",
  atencion_desactivada: "Acceso en citas desactivado",
};
const nombreAccion = (a: string) => {
  const t = ACCIONES[a] ?? a.replaceAll("_", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Registro de actividad como un cordón: cada evento es un nudo, del más reciente al más antiguo.
export function Audits({ events }: { events: EventView[] }) {
  if (!events.length)
    return <div className={`${panel} text-center text-muted`}>Todavía no hay actividad registrada.</div>;
  return (
    <ol className={panel}>
      {events.map((e, i) => (
        <li key={e.id} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 pb-5 last:pb-0">
          {i < events.length - 1 && (
            <span aria-hidden className="absolute bottom-0 left-[0.6rem] top-4 w-px bg-line" />
          )}
          <span
            aria-hidden
            className={`relative mt-1.5 size-3 justify-self-center rounded-full ring-4 ring-surface ${e.accion === "acceso_emergencia" ? "bg-danger" : i === 0 ? "bg-accent" : "bg-[color-mix(in_srgb,var(--muted)_55%,var(--surface))]"}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <p className="text-[0.93rem] font-semibold">{nombreAccion(e.accion)}</p>
              <time className="text-[0.8rem] text-muted tabular-nums" dateTime={e.cuando}>
                {dateTime(e.cuando)}
              </time>
            </div>
            <p className="mt-0.5 text-[0.87rem] text-muted">
              {e.actor} · {e.detalle.replace("Visualización de historial sintético", "Consulta de la historia clínica")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
