"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  Camera,
  ChatCircleText,
  ClockCounterClockwise,
  FileText,
  QrCode,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";
import type { SafeUser } from "@/lib/server/auth";
import type { Resumen } from "@/lib/tipos";
import { btn, panel } from "@/components/ui";
import {
  Shell,
  Encabezado,
  AvisoOk,
  fetchPortal,
  ErrorBlock,
  LoadingBlock,
  Pill,
  dateTime,
  Audits,
  type ItemNav,
  type SolicitudView,
  type EventView,
} from "./shared";
import { Historia } from "./historia";
import { CarnetQR, Digitalizar } from "./aportes";

type View = "historia" | "permisos" | "carnet" | "digitalizar" | "auditoria";
interface Consultas {
  accesoPorAtencion: boolean;
  citas: { id: string; hora: string; motivo: string; establecimiento: string; doctor: string }[];
  sms: { id: string; celular: string; cuando: string; texto: string; expira: string; usado: boolean }[];
}
const TITULOS: Record<View, { t: string; b: string }> = {
  historia: { t: "Mi historia", b: "Tus atenciones, resultados y tratamientos de todos los establecimientos donde te atendiste." },
  permisos: { t: "Autorizaciones", b: "Qué médicos pueden ver tu historia. Puedes retirarle el acceso a cualquiera cuando quieras." },
  carnet: { t: "Carné sin conexión", b: "Tu resumen en un código QR que el médico puede leer aunque no haya internet." },
  digitalizar: { t: "Agregar un resultado", b: "Pasa a tu historia un resultado que te entregaron en papel." },
  auditoria: { t: "Quién vio mi historia", b: "Cada acceso a tu historia queda registrado: quién, cuándo y para qué." },
};

const vigente = (s: SolicitudView) => s.estado === "aprobada" && (!s.expira || Date.parse(s.expira) > Date.now());

export function PortalPaciente({ user }: { user: SafeUser }) {
  const [view, setView] = useState<View>("historia"),
    [solicitudes, setSolicitudes] = useState<SolicitudView[]>([]),
    [eventos, setEventos] = useState<EventView[]>([]),
    [historia, setHistoria] = useState<Resumen | null>(null),
    [loading, setLoading] = useState(true),
    [msg, setMsg] = useState(""),
    [error, setError] = useState(""),
    [horas, setHoras] = useState(24),
    [consultas, setConsultas] = useState<Consultas | null>(null),
    [ahora, setAhora] = useState(() => Date.now());
  const recargar = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([fetchPortal("solicitudes"), fetchPortal("auditoria"), fetchPortal("consultas")]);
      setSolicitudes(a.solicitudes);
      setEventos(b.eventos);
      setConsultas(c);
      setAhora(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const cargar = useCallback(async () => {
    try {
      const result = await fetchPortal("historial");
      setHistoria(result.resumen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.all([cargar(), recargar()]);
  }, [cargar, recargar]);
  const cambiar = async (id: string, accion: "aprobar" | "rechazar" | "revocar") => {
    setError("");
    setMsg("");
    try {
      await fetchPortal("decidir", "POST", { id, accion, horas });
      setMsg(
        accion === "aprobar"
          ? "Listo, el médico ya puede ver tu historia."
          : accion === "rechazar"
            ? "Rechazaste la solicitud."
            : "Retiraste el permiso. El médico ya no puede ver tu historia.",
      );
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cambiarAtencion = async (activo: boolean) => {
    setError("");
    setMsg("");
    try {
      await fetchPortal("acceso-atencion", "POST", { activo });
      setMsg(
        activo
          ? "Listo. El médico que te atienda en tu cita podrá ver tu historia para tu seguimiento."
          : "Desactivado. En cada consulta tendrás que darle al médico un código.",
      );
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const ir = (k: string) => {
    setView(k as View);
    setMsg("");
    setError("");
  };

  const emergencias = solicitudes.filter((s) => s.via === "emergencia" && s.estado === "aprobada");
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const activas = solicitudes.filter(vigente);
  const anteriores = solicitudes.filter((s) => s.estado !== "pendiente" && !vigente(s));
  const smsActivos = (consultas?.sms ?? []).filter((m) => !m.usado && Date.parse(m.expira) > ahora);

  const items: ItemNav[] = [
    { k: "historia", t: "Mi historia", icono: FileText },
    { k: "permisos", t: "Autorizaciones", icono: ShieldCheck, insignia: pendientes.length + smsActivos.length },
    { k: "carnet", t: "Carné sin conexión", icono: QrCode },
    { k: "digitalizar", t: "Agregar resultado", icono: Camera },
    { k: "auditoria", t: "Quién vio mi historia", icono: ClockCounterClockwise },
  ];

  const tarjeta = (s: SolicitudView) => {
    const estado = s.estado === "aprobada" && !vigente(s) ? "Vencida" : s.estado;
    return (
      <article key={s.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{s.doctor}</p>
            {s.via === "qr" && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">Con llave QR</span>
            )}
            {(s.via === "atencion" || s.via === "sms") && !s.expira && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">Médico tratante</span>
            )}
            {s.via === "atencion" && s.expira && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">En tu cita</span>
            )}
            {s.via === "sms" && s.expira && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">Con código SMS</span>
            )}
            {s.via === "emergencia" && (
              <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">Emergencia</span>
            )}
          </div>
          <p className="mt-1 text-[0.92rem]">{s.finalidad.replace("EMERGENCIA: ", "")}</p>
          <p className="mt-1 text-[0.82rem] text-muted">
            {s.via && s.via !== "solicitud" ? "Desde el" : "Pedida el"} {dateTime(s.creada)}
            {vigente(s) ? (s.expira ? ` · Puede verla hasta el ${dateTime(s.expira)}` : " · Sin fecha de fin, hasta que se lo retires") : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.estado === "pendiente" ? (
            <>
              <button className={`${btn.ghost} ${btn.sm}`} type="button" onClick={() => void cambiar(s.id, "rechazar")}>
                Rechazar
              </button>
              <button className={`${btn.primary} ${btn.sm}`} type="button" onClick={() => void cambiar(s.id, "aprobar")}>
                Autorizar
              </button>
            </>
          ) : vigente(s) ? (
            <button className={`${btn.ghost} ${btn.sm}`} type="button" onClick={() => void cambiar(s.id, "revocar")}>
              Retirar permiso
            </button>
          ) : (
            <Pill status={estado} />
          )}
        </div>
      </article>
    );
  };

  return (
    <Shell user={user} items={items} activo={view} onCambiar={ir}>
      <div key={view} className="vista">
        <Encabezado titulo={TITULOS[view].t} bajada={TITULOS[view].b} />
        {emergencias.length > 0 && (
          <div role="alert" className="mb-5 flex gap-3 rounded-card border border-danger-line bg-danger-bg px-4 py-3.5 text-[0.92rem]">
            <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <p>
              <strong className="text-danger">Se abrió tu historia por una emergencia.</strong>{" "}
              {emergencias
                .map((s) => `${s.doctor}, ${dateTime(s.creada)}: ${s.finalidad.replace("EMERGENCIA: ", "")}`)
                .join(" · ")}
              . Si no lo reconoces, retira el permiso en{" "}
              <button type="button" className="font-semibold underline" onClick={() => ir("permisos")}>
                Autorizaciones
              </button>
              .
            </p>
          </div>
        )}
        {msg && <AvisoOk>{msg}</AvisoOk>}
        {error && (
          <div className="mb-5">
            <ErrorBlock mensaje={error} />
          </div>
        )}

        {view === "historia" &&
          (loading ? (
            <LoadingBlock />
          ) : historia ? (
            <Historia r={historia} paraPaciente />
          ) : (
            <p className={`${panel} text-muted`}>Todavía no hay atenciones en tu historia.</p>
          ))}

        {view === "permisos" && (
          <div className="grid gap-5">
            {smsActivos.map((m) => (
              <section
                key={m.id}
                role="status"
                className="flex gap-3 rounded-card border border-accent/30 bg-accent-soft px-5 py-4"
              >
                <ChatCircleText size={22} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.82rem] text-muted">
                    SMS a tu celular ••• ••• {m.celular.slice(-3)} · {dateTime(m.cuando)}
                  </p>
                  <p className="mt-1 text-[0.95rem]">{m.texto}</p>
                </div>
              </section>
            ))}
            <section className={panel}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[1.05rem] font-semibold">
                    <CalendarCheck size={19} className="text-accent" aria-hidden /> Durante tus citas
                  </h2>
                  <p className="mt-1 max-w-[52ch] text-[0.9rem] text-muted">
                    El médico que te atiende en una cita queda como tu médico tratante y puede ver tu historia para el
                    seguimiento. Cada vez que la abre queda registrado.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={consultas?.accesoPorAtencion ?? true}
                  aria-label="Permitir acceso durante tus citas"
                  disabled={!consultas}
                  onClick={() => void cambiarAtencion(!(consultas?.accesoPorAtencion ?? true))}
                  className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${consultas?.accesoPorAtencion !== false ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${consultas?.accesoPorAtencion !== false ? "left-6" : "left-1"}`}
                  />
                </button>
              </div>
              {consultas && consultas.citas.length > 0 && (
                <ul className="mt-4 grid gap-1 border-t border-line pt-3 text-[0.9rem]">
                  {consultas.citas.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold tabular-nums">Hoy {c.hora}</span> · {c.doctor}
                      <span className="text-muted"> · {c.establecimiento}</span>
                    </li>
                  ))}
                </ul>
              )}
              {consultas && !consultas.accesoPorAtencion && (
                <p className="mt-3 text-[0.86rem] text-muted">
                  Desactivado: en tu próxima consulta el médico te enviará un código por SMS. Los médicos que ya te
                  atienden siguen en la lista de abajo.
                </p>
              )}
            </section>
            <section className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[1.05rem] font-semibold">
                  Por responder <span className="font-normal text-muted tabular-nums">· {pendientes.length}</span>
                </h2>
                {pendientes.length > 0 && (
                  <label className="flex items-center gap-2 text-[0.88rem] text-muted">
                    Autorizar por
                    <select
                      className="min-h-9 rounded-ctl border border-line bg-bg px-2.5 text-[0.88rem] text-ink"
                      value={horas}
                      onChange={(e) => setHoras(Number(e.target.value))}
                    >
                      <option value={1}>1 hora</option>
                      <option value={24}>24 horas</option>
                      <option value={168}>7 días</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="mt-4 divide-y divide-line">
                {pendientes.length ? (
                  pendientes.map(tarjeta)
                ) : (
                  <p className="text-[0.92rem] text-muted">No tienes solicitudes pendientes.</p>
                )}
              </div>
            </section>
            <section className={panel}>
              <h2 className="text-[1.05rem] font-semibold">
                Pueden ver tu historia ahora <span className="font-normal text-muted tabular-nums">· {activas.length}</span>
              </h2>
              <div className="mt-4 divide-y divide-line">
                {activas.length ? (
                  activas.map(tarjeta)
                ) : (
                  <p className="text-[0.92rem] text-muted">Ningún médico tiene acceso en este momento.</p>
                )}
              </div>
            </section>
            {anteriores.length > 0 && (
              <details className={`${panel} group`}>
                <summary className="cursor-pointer list-none text-[1.05rem] font-semibold marker:hidden">
                  Anteriores <span className="font-normal text-muted tabular-nums">· {anteriores.length}</span>
                </summary>
                <div className="mt-4 divide-y divide-line">{anteriores.map(tarjeta)}</div>
              </details>
            )}
          </div>
        )}

        {view === "carnet" && <CarnetQR />}
        {view === "digitalizar" && (
          <Digitalizar
            aportados={historia?.aportados ?? []}
            alCambiar={async () => {
              await Promise.all([cargar(), recargar()]);
            }}
          />
        )}
        {view === "auditoria" && <Audits events={eventos} />}
      </div>
    </Shell>
  );
}
