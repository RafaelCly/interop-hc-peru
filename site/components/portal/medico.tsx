"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarCheck,
  ChatCircleText,
  ClockCounterClockwise,
  FirstAidKit,
  PaperPlaneTilt,
  QrCode,
  WifiSlash,
  Stethoscope,
  UsersThree,
} from "@phosphor-icons/react";
import type { SafeUser, EstadoCita } from "@/lib/server/auth";
import type { Resumen } from "@/lib/tipos";
import { btn, campo, panel } from "@/components/ui";
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

type View = "pacientes" | "historia" | "auditoria";
interface CitaView {
  id: string;
  hora: string;
  motivo: string;
  dni: string;
  paciente: string;
  estado: EstadoCita;
}

const vigente = (s: SolicitudView) => s.estado === "aprobada" && (!s.expira || Date.parse(s.expira) > Date.now());
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });
const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
const VIA: Record<string, string> = { qr: "con su llave QR", sms: "con código SMS", solicitud: "autorizado", atencion: "desde su cita" };

function Tarjeta({ icono: I, titulo, children, id }: { icono: typeof QrCode; titulo: string; children: React.ReactNode; id: string }) {
  return (
    <section className={panel} aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-2 text-[1.05rem] font-semibold">
        <I size={19} className="text-accent" aria-hidden /> {titulo}
      </h2>
      {children}
    </section>
  );
}

export function PortalMedico({ user }: { user: SafeUser }) {
  const [view, setView] = useState<View>("pacientes"),
    [solicitudes, setSolicitudes] = useState<SolicitudView[]>([]),
    [agenda, setAgenda] = useState<CitaView[]>([]),
    [eventos, setEventos] = useState<EventView[]>([]),
    [dni, setDni] = useState(""),
    [finalidad, setFinalidad] = useState("Consulta médica y continuidad de la atención"),
    [msg, setMsg] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [loading, setLoading] = useState(true),
    [historia, setHistoria] = useState<Resumen | null>(null),
    [seleccionado, setSeleccionado] = useState(""),
    [smsDni, setSmsDni] = useState(""),
    [smsAviso, setSmsAviso] = useState(""),
    [smsCodigo, setSmsCodigo] = useState(""),
    [emDni, setEmDni] = useState(""),
    [emMotivo, setEmMotivo] = useState(""),
    [emAbierto, setEmAbierto] = useState(false),
    [solAbierto, setSolAbierto] = useState(false);
  const recargar = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([fetchPortal("solicitudes"), fetchPortal("auditoria"), fetchPortal("agenda")]);
      setSolicitudes(a.solicitudes);
      setEventos(b.eventos);
      setAgenda(c.citas);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  // Si el paciente retira el permiso, la historia abierta se oculta en la siguiente comprobación.
  useEffect(() => {
    if (view !== "historia" || !seleccionado || !historia) return;
    let vivo = true;
    const comprobar = async () => {
      try {
        const r = await fetchPortal("solicitudes");
        if (!vivo) return;
        if (!r.solicitudes.some((s: SolicitudView) => s.dni === seleccionado && vigente(s))) {
          setHistoria(null);
          setError("El permiso para ver esta historia terminó. Se cerró la historia.");
        }
      } catch {
        if (vivo) setHistoria(null);
      }
    };
    const interval = setInterval(() => void comprobar(), 15000);
    window.addEventListener("focus", comprobar);
    return () => {
      vivo = false;
      clearInterval(interval);
      window.removeEventListener("focus", comprobar);
    };
  }, [view, seleccionado, historia]);
  const limpiarAvisos = () => {
    setError("");
    setMsg("");
  };
  const solicitar = async (e: FormEvent) => {
    e.preventDefault();
    limpiarAvisos();
    setSending(true);
    try {
      const r = await fetchPortal("solicitar", "POST", { dni, finalidad });
      setMsg(r.mensaje);
      setDni("");
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const ver = async (d: string) => {
    limpiarAvisos();
    setHistoria(null);
    setSeleccionado(d);
    setView("historia");
    setSending(true);
    try {
      const r = await fetchPortal(`historial?dni=${encodeURIComponent(d)}`);
      setHistoria(r.resumen);
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const abrirConAcceso = async (
    accion: "emergencia" | "abrir-atencion" | "verificar-sms",
    cuerpo: object,
  ) => {
    limpiarAvisos();
    setSending(true);
    try {
      const r = (await fetchPortal(accion, "POST", cuerpo)) as { dni: string };
      setEmMotivo("");
      setEmDni("");
      setEmAbierto(false);
      setSmsCodigo("");
      setSmsAviso("");
      setSmsDni("");
      await recargar();
      await ver(r.dni);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  };
  const enviarSms = async (e?: FormEvent) => {
    e?.preventDefault();
    limpiarAvisos();
    setSending(true);
    try {
      const r = await fetchPortal("enviar-sms", "POST", { dni: smsDni });
      setSmsAviso(r.mensaje);
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const ir = (k: string) => {
    setView(k as View);
    limpiarAvisos();
  };
  const pedirCodigo = (d: string) => {
    setSmsDni(d);
    setSmsAviso("");
    setSmsCodigo("");
    document.getElementById("sms-dni")?.focus();
  };

  const conAcceso = solicitudes.filter(vigente);
  // Pacientes con acceso que no están en la agenda de hoy, uno por paciente.
  const enAgenda = new Set(agenda.map((c) => c.dni));
  const otrosConAcceso = [...new Map(conAcceso.filter((s) => !enAgenda.has(s.dni)).map((s) => [s.dni, s])).values()];
  const otras = solicitudes.filter((s) => !vigente(s) && s.via !== "atencion");
  const paciente = historia?.nombre ?? conAcceso.find((s) => s.dni === seleccionado)?.paciente;
  // Para el selector de la historia: pacientes con acceso, sin repetir.
  const elegibles = [...new Map(conAcceso.map((s) => [s.dni, s])).values()];

  const items: ItemNav[] = [
    { k: "pacientes", t: "Mis pacientes", icono: UsersThree, insignia: agenda.length },
    { k: "historia", t: "Historia clínica", icono: Stethoscope },
    { k: "auditoria", t: "Mi actividad", icono: ClockCounterClockwise },
  ];

  return (
    <Shell user={user} items={items} activo={view} onCambiar={ir}>
      <div key={view} className="vista">
        {view === "pacientes" && (
          <>
            <Encabezado
              titulo={`Hola, ${user.nombre.split(" ").slice(0, 2).join(" ")}`}
              bajada="Al abrir la historia de un paciente quedas como su médico tratante, hasta que él te retire el acceso. Para alguien sin cita, pídele el código que le llega por SMS."
            />
            {msg && <AvisoOk>{msg}</AvisoOk>}
            {error && (
              <div className="mb-5">
                <ErrorBlock mensaje={error} />
              </div>
            )}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="grid min-w-0 gap-5">
                <section className={panel} aria-labelledby="h-agenda">
                  <h2 id="h-agenda" className="flex items-center gap-2 text-[1.05rem] font-semibold">
                    <CalendarCheck size={19} className="text-accent" aria-hidden /> Citas de hoy
                    <span className="font-normal text-muted tabular-nums">· {agenda.length}</span>
                  </h2>
                  {loading ? (
                    <div className="mt-4 grid gap-3">
                      <div className="sk h-14" />
                      <div className="sk h-14" />
                    </div>
                  ) : agenda.length ? (
                    <ul className="mt-2 divide-y divide-line">
                      {agenda.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5 last:pb-0">
                          <span className="w-12 shrink-0 font-mono text-[0.9rem] font-semibold tabular-nums">{c.hora}</span>
                          <div className="min-w-[10rem] flex-1">
                            <p className="truncate font-semibold">{c.paciente}</p>
                            <p className="text-[0.84rem] text-muted">{c.motivo}</p>
                          </div>
                          {c.estado === "libre" || c.estado === "abierta" ? (
                            <button
                              type="button"
                              disabled={sending}
                              onClick={() => void abrirConAcceso("abrir-atencion", { cita: c.id })}
                              className={`${c.estado === "abierta" ? btn.secondary : btn.primary} ${btn.sm} max-sm:w-full`}
                            >
                              Abrir historia <ArrowRight size={15} weight="bold" aria-hidden />
                            </button>
                          ) : (
                            <span className="flex flex-wrap items-center gap-2 max-sm:w-full">
                              <span className="text-[0.82rem] text-muted">
                                {c.estado === "retirado" ? "Retiró el permiso" : "Pide autorizar en cada consulta"}
                              </span>
                              <button type="button" onClick={() => pedirCodigo(c.dni)} className={`${btn.ghost} ${btn.sm}`}>
                                Pedir código
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-[0.92rem] text-muted">Hoy no tienes citas registradas por admisión.</p>
                  )}
                </section>

                {(otrosConAcceso.length > 0 || otras.length > 0) && (
                  <section className={panel} aria-labelledby="h-acceso">
                    <h2 id="h-acceso" className="text-[1.05rem] font-semibold">
                      Otros pacientes con acceso{" "}
                      <span className="font-normal text-muted tabular-nums">· {otrosConAcceso.length}</span>
                    </h2>
                    {otrosConAcceso.length > 0 ? (
                      <ul className="mt-2 divide-y divide-line">
                        {otrosConAcceso.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5 last:pb-0">
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.85rem] font-semibold">
                              {iniciales(s.paciente)}
                            </span>
                            <div className="min-w-[11rem] flex-1">
                              <p className="truncate font-semibold">{s.paciente}</p>
                              <p className="text-[0.84rem] text-muted">
                                {s.expira ? `Hasta las ${hora(s.expira)} · ` : "Médico tratante · "}
                                {s.via === "emergencia" ? (
                                  <span className="font-medium text-danger">emergencia</span>
                                ) : (
                                  VIA[s.via ?? "solicitud"]
                                )}
                              </p>
                            </div>
                            <button type="button" onClick={() => void ver(s.dni)} className={`${btn.primary} ${btn.sm} max-sm:w-full`}>
                              Abrir historia <ArrowRight size={15} weight="bold" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-[0.9rem] text-muted">Nadie más por ahora.</p>
                    )}
                    {otras.length > 0 && (
                      <details className="mt-5 border-t border-line pt-4">
                        <summary className="cursor-pointer text-[0.9rem] font-medium text-muted hover:text-ink">
                          Solicitudes pendientes y anteriores · {otras.length}
                        </summary>
                        <ul className="mt-2 divide-y divide-line">
                          {otras.map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[0.9rem]">
                              <span className="min-w-0">
                                <span className="font-medium">{s.paciente}</span>{" "}
                                <span className="font-mono text-[0.82rem] text-muted">DNI {s.dni}</span>
                                <span className="block text-[0.8rem] text-muted">{dateTime(s.creada)}</span>
                              </span>
                              <Pill status={s.estado === "aprobada" ? "Vencida" : s.estado} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                )}
              </div>

              <div className="grid gap-4">
                <Tarjeta icono={ChatCircleText} titulo="Código por SMS" id="h-sms">
                  <p className="mt-1 text-[0.86rem] text-muted">Le llega al celular del paciente y te lo dicta.</p>
                  {!smsAviso ? (
                    <form className="mt-3 flex gap-2" onSubmit={enviarSms}>
                      <label className="sr-only" htmlFor="sms-dni">
                        DNI del paciente
                      </label>
                      <input
                        id="sms-dni"
                        name="dni-paciente-sms"
                        data-1p-ignore
                        data-lpignore="true"
                        data-bwignore
                        data-form-type="other"
                        className={`${campo} font-mono tracking-wide`}
                        inputMode="numeric"
                        pattern="[0-9]{8}"
                        maxLength={8}
                        placeholder="DNI"
                        autoComplete="off"
                        value={smsDni}
                        onChange={(e) => setSmsDni(e.target.value.replace(/\D/g, ""))}
                      />
                      <button type="submit" disabled={sending || smsDni.length !== 8} className={`${btn.primary} shrink-0`}>
                        Enviar
                      </button>
                    </form>
                  ) : (
                    <form
                      className="mt-3 grid gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void abrirConAcceso("verificar-sms", { dni: smsDni, codigo: smsCodigo });
                      }}
                    >
                      <p role="status" className="text-[0.86rem]">
                        {smsAviso}
                      </p>
                      <div className="flex gap-2">
                        <label className="sr-only" htmlFor="sms-codigo">
                          Código de seis dígitos
                        </label>
                        <input
                          id="sms-codigo"
                          name="codigo-sms"
                          data-1p-ignore
                          data-lpignore="true"
                          data-bwignore
                          data-form-type="other"
                          autoFocus
                          className={`${campo} font-mono text-[1.1rem] tracking-[0.3em]`}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={6}
                          placeholder="000000"
                          value={smsCodigo}
                          onChange={(e) => setSmsCodigo(e.target.value.replace(/\D/g, ""))}
                        />
                        <button type="submit" disabled={sending || smsCodigo.length !== 6} className={`${btn.primary} shrink-0`}>
                          Abrir
                        </button>
                      </div>
                      <div className="flex gap-3 text-[0.84rem]">
                        <button type="button" className="font-medium text-accent-strong hover:underline" onClick={() => void enviarSms()}>
                          Reenviar
                        </button>
                        <button
                          type="button"
                          className="text-muted hover:text-ink"
                          onClick={() => {
                            setSmsAviso("");
                            setSmsCodigo("");
                          }}
                        >
                          Otro paciente
                        </button>
                      </div>
                    </form>
                  )}
                </Tarjeta>

                <section className="rounded-card border border-line p-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left text-[0.92rem] font-semibold"
                    aria-expanded={solAbierto}
                    onClick={() => setSolAbierto(!solAbierto)}
                  >
                    <PaperPlaneTilt size={19} className="text-accent" aria-hidden /> Pedir acceso a distancia
                  </button>
                  {solAbierto ? (
                    <form onSubmit={solicitar} className="mt-3 grid gap-3">
                      <label className="grid gap-1.5 text-[0.86rem] font-medium">
                        DNI del paciente
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          pattern="[0-9]{8}"
                          maxLength={8}
                          value={dni}
                          onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
                          className={`${campo} font-mono tracking-wide`}
                          placeholder="8 dígitos"
                        />
                      </label>
                      <label className="grid gap-1.5 text-[0.86rem] font-medium">
                        Motivo
                        <textarea
                          required
                          minLength={10}
                          maxLength={300}
                          rows={2}
                          value={finalidad}
                          onChange={(e) => setFinalidad(e.target.value)}
                          className={`${campo} py-2.5`}
                        />
                      </label>
                      <button type="submit" disabled={sending} className={btn.secondary}>
                        {sending ? "Enviando…" : "Enviar solicitud"}
                      </button>
                    </form>
                  ) : (
                    <p className="mt-1 text-[0.84rem] text-muted">Para revisar antes de una interconsulta.</p>
                  )}
                </section>

                <section className="rounded-card border border-danger-line p-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left text-[0.92rem] font-semibold text-danger"
                    aria-expanded={emAbierto}
                    onClick={() => setEmAbierto(!emAbierto)}
                  >
                    <FirstAidKit size={19} aria-hidden /> Acceso de emergencia
                  </button>
                  {emAbierto ? (
                    <form
                      className="mt-3 grid gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void abrirConAcceso("emergencia", { dni: emDni, motivo: emMotivo });
                      }}
                    >
                      <p className="text-[0.84rem] text-muted">
                        Solo si el paciente no puede autorizar. Dura una hora, queda registrado con tu nombre y el
                        paciente lo verá.
                      </p>
                      <label className="grid gap-1.5 text-[0.86rem] font-medium">
                        DNI del paciente
                        <input
                          className={`${campo} font-mono`}
                          inputMode="numeric"
                          pattern="[0-9]{8}"
                          maxLength={8}
                          required
                          value={emDni}
                          onChange={(e) => setEmDni(e.target.value.replace(/\D/g, ""))}
                        />
                      </label>
                      <label className="grid gap-1.5 text-[0.86rem] font-medium">
                        Motivo de la emergencia
                        <textarea
                          className={`${campo} py-2.5`}
                          rows={2}
                          required
                          minLength={15}
                          maxLength={300}
                          value={emMotivo}
                          placeholder="Ej.: paciente inconsciente, se necesitan sus alergias y antecedentes"
                          onChange={(e) => setEmMotivo(e.target.value)}
                        />
                      </label>
                      <button type="submit" disabled={sending} className={btn.peligro}>
                        Abrir por emergencia
                      </button>
                    </form>
                  ) : (
                    <p className="mt-1 text-[0.84rem] text-muted">Para un paciente que no puede autorizar.</p>
                  )}
                </section>

                <a
                  href="/leer"
                  className="flex items-center gap-2 rounded-ctl px-1 py-1.5 text-[0.86rem] text-muted no-underline hover:text-ink"
                >
                  <WifiSlash size={17} aria-hidden /> ¿Sin internet? Leer el carné QR del paciente
                </a>
              </div>
            </div>
          </>
        )}

        {view === "historia" && (
          <>
            <Encabezado
              titulo="Historia clínica"
              bajada={paciente ? undefined : "Elige un paciente de tus citas de hoy o uno que te haya dado acceso."}
              acciones={
                elegibles.length > 0 && (
                  <label className="flex items-center gap-2 text-[0.88rem] text-muted">
                    <span className="sr-only sm:not-sr-only">Paciente</span>
                    <select
                      className="min-h-10 rounded-ctl border border-line bg-surface px-3 text-[0.9rem] text-ink"
                      value={seleccionado}
                      onChange={(e) => e.target.value && void ver(e.target.value)}
                    >
                      <option value="">Elegir paciente</option>
                      {elegibles.map((s) => (
                        <option key={s.id} value={s.dni}>
                          {s.paciente} · {s.dni}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
            />
            {error && (
              <div className="mb-5">
                <ErrorBlock mensaje={error} />
              </div>
            )}
            {sending && <LoadingBlock />}
            {historia && <Historia key={historia.dni} r={historia} />}
            {!historia && !sending && (
              <div className={`${panel} grid place-items-center gap-3 py-12 text-center`}>
                <Stethoscope size={34} className="text-muted/60" aria-hidden />
                <p className="max-w-[44ch] text-muted">
                  {elegibles.length ? "Elige un paciente para abrir su historia." : "Abre la historia desde tus citas de hoy."}
                </p>
                <button type="button" className={`${btn.ghost} ${btn.sm}`} onClick={() => ir("pacientes")}>
                  Ir a mis pacientes
                </button>
              </div>
            )}
          </>
        )}

        {view === "auditoria" && (
          <>
            <Encabezado titulo="Mi actividad" bajada="Todo lo que hiciste en Kipu, con fecha y hora." />
            <Audits events={eventos} />
          </>
        )}
      </div>
    </Shell>
  );
}
