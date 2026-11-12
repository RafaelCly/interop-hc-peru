"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { SafeUser } from "@/lib/server/auth";
import type { Resumen } from "@/lib/tipos";
import { btn, panel } from "@/components/ui";
import {
  PortalLayout,
  fetchPortal,
  ErrorBlock,
  LoadingBlock,
  Pill,
  dateTime,
  Audits,
  type SolicitudView,
  type EventView,
} from "./shared";
import { Historia } from "./historia";
type View = "historia" | "permisos" | "llave" | "auditoria";
interface LlaveVista {
  codigo: string;
  expira: string;
  qr: string;
}
export function PortalPaciente({ user }: { user: SafeUser }) {
  const [view, setView] = useState<View>("historia"),
    [solicitudes, setSolicitudes] = useState<SolicitudView[]>([]),
    [eventos, setEventos] = useState<EventView[]>([]),
    [historia, setHistoria] = useState<Resumen | null>(null),
    [loading, setLoading] = useState(true),
    [msg, setMsg] = useState(""),
    [error, setError] = useState(""),
    [horas, setHoras] = useState(24),
    [llave, setLlave] = useState<LlaveVista | null>(null),
    [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!llave) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [llave]);
  const generarLlave = async () => {
    setError("");
    try {
      const r = (await fetchPortal("crear-llave", "POST", {})) as { codigo: string; expira: string };
      const qr = await QRCode.toDataURL(`${window.location.origin}/medico?llave=${r.codigo}`, {
        margin: 1,
        width: 320,
        color: { dark: "#14213d", light: "#ffffff" },
      });
      setLlave({ ...r, qr });
      setAhora(Date.parse(r.expira) - 5 * 60_000);
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const restante = llave ? Math.max(0, Math.round((Date.parse(llave.expira) - ahora) / 1000)) : 0;
  const emergencias = solicitudes.filter((s) => s.via === "emergencia" && s.estado === "aprobada");
  const recargar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetchPortal("solicitudes"), fetchPortal("auditoria")]);
      setSolicitudes(a.solicitudes);
      setEventos(b.eventos);
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
          ? "Acceso autorizado."
          : accion === "rechazar"
            ? "Solicitud rechazada."
            : "Autorización revocada.",
      );
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <PortalLayout
      user={user}
      title="Mi historia clínica"
      lead="Consulta tus atenciones y resultados sintéticos de SJL, controla quién puede verlos y revisa el registro de accesos."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className={panel}>
          <p className="text-xs font-semibold uppercase text-muted">Documento registrado</p>
          <p className="mt-2 font-mono text-lg font-bold">{user.dni}</p>
          <p className="mt-1 text-xs text-muted">Identidad simulada</p>
        </div>
        <div className={`${panel} sm:col-span-2`}>
          <p className="text-xs font-semibold uppercase text-muted">Cuenta del paciente</p>
          <p className="mt-2 font-semibold">{user.correo}</p>
          <p className="mt-1 text-xs text-muted">
            La cuenta fue provisionada para pruebas. No verifica una identidad civil real.
          </p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2" role="navigation" aria-label="Secciones del paciente">
        {[
          { k: "historia", t: "Mi expediente" },
          {
            k: "permisos",
            t: `Autorizaciones (${solicitudes.filter((s) => s.estado === "pendiente").length})`,
          },
          { k: "llave", t: "Mi llave QR" },
          { k: "auditoria", t: "Quién accedió" },
        ].map((x) => (
          <button
            type="button"
            key={x.k}
            aria-current={view === x.k ? "page" : undefined}
            onClick={() => setView(x.k as View)}
            className={`${view === x.k ? btn.primary : btn.secondary} !px-4`}
          >
            {x.t}
          </button>
        ))}
      </div>
      {msg && (
        <div role="status" className="mb-4 rounded-ctl border border-ok-line bg-ok-bg px-4 py-3 text-sm">
          {msg}
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ErrorBlock mensaje={error} />
        </div>
      )}
      {emergencias.length > 0 && (
        <div role="alert" className="mb-4 rounded-ctl border-2 border-danger bg-danger-bg px-4 py-3 text-sm text-ink">
          <strong className="text-danger">Acceso de emergencia a tu historial.</strong>{" "}
          {emergencias.map((s) => `${s.doctor} (${dateTime(s.creada)}): ${s.finalidad.replace("EMERGENCIA: ", "")}`).join(" · ")}
          . Si no lo reconoces, revócalo en Autorizaciones.
        </div>
      )}
      {view === "llave" && (
        <section className={panel}>
          <h2 className="text-xl font-bold">Mi llave QR</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Para una consulta presencial, muestra este código al médico. Al escanearlo, abre tu historial por 1
            hora sin que tengas que aprobar una solicitud. El código sirve una sola vez y vence en 5 minutos.
          </p>
          <button type="button" className={`${btn.primary} mt-4`} onClick={() => void generarLlave()}>
            {llave ? "Generar otro código" : "Generar mi llave QR"}
          </button>
          {llave && (
            <div className="mt-5 flex flex-wrap items-center gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={llave.qr}
                alt={`Código QR de acceso. Código manual ${llave.codigo}`}
                width={220}
                height={220}
                className="rounded-card border border-line bg-white p-2"
              />
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Código manual</p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{llave.codigo}</p>
                <p className="mt-3 text-sm" role="status">
                  {restante > 0
                    ? `Vence en ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`
                    : "El código venció. Genera uno nuevo."}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
      {view === "historia" &&
        (loading ? (
          <LoadingBlock />
        ) : historia ? (
          <Historia r={historia} paraPaciente />
        ) : (
          <p>No existe información disponible.</p>
        ))}
      {view === "permisos" && (
        <section className={panel}>
          <h2 className="text-xl font-bold">Solicitudes y autorizaciones</h2>
          <p className="mt-2 text-sm text-muted">
            Solo tú puedes aprobar, rechazar o revocar las solicitudes de tu cuenta ficticia. Cada
            autorización es para un médico, finalidad y plazo definidos.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <label className="text-sm font-semibold" htmlFor="duracion">
              Duración del permiso
            </label>
            <select
              id="duracion"
              className="min-h-11 rounded-ctl border border-line bg-bg px-3 text-sm"
              value={horas}
              onChange={(e) => setHoras(Number(e.target.value))}
            >
              <option value={1}>1 hora</option>
              <option value={24}>24 horas</option>
              <option value={168}>7 días</option>
            </select>
          </div>
          <div className="mt-4 grid gap-3">
            {solicitudes.length === 0 && (
              <p className="text-sm text-muted">
                No hay solicitudes. Inicia sesión como médico y crea una para comprobar el circuito.
              </p>
            )}
            {solicitudes.map((s) => (
              <article key={s.id} className="rounded-ctl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {s.doctor}
                      {s.via === "qr" && (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">
                          Con tu llave QR
                        </span>
                      )}
                      {s.via === "emergencia" && (
                        <span className="ml-2 rounded-full bg-danger-bg px-2 py-0.5 text-xs text-danger">
                          Acceso de emergencia
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted">Solicitada el {dateTime(s.creada)}</p>
                  </div>
                  <Pill
                    status={
                      s.estado === "aprobada" && s.expira && Date.parse(s.expira) <= Date.now()
                        ? "Vencida"
                        : s.estado
                    }
                  />
                </div>
                <p className="mt-2 text-sm">Finalidad: {s.finalidad}</p>
                {s.expira && <p className="mt-1 text-xs text-muted">Expiración: {dateTime(s.expira)}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.estado === "pendiente" && (
                    <>
                      <button
                        className={`${btn.primary} ${btn.sm}`}
                        type="button"
                        onClick={() => void cambiar(s.id, "aprobar")}
                      >
                        Autorizar
                      </button>
                      <button
                        className={`${btn.ghost} ${btn.sm}`}
                        type="button"
                        onClick={() => void cambiar(s.id, "rechazar")}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                  {s.estado === "aprobada" && s.expira && Date.parse(s.expira) > Date.now() && (
                    <button
                      className={`${btn.ghost} ${btn.sm}`}
                      type="button"
                      onClick={() => void cambiar(s.id, "revocar")}
                    >
                      Revocar permiso
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {view === "auditoria" && <Audits events={eventos} />}
    </PortalLayout>
  );
}
