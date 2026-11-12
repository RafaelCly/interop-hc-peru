"use client";
import { Fragment, useMemo, useState } from "react";
import type { Resumen, Atencion, Examen } from "@/lib/tipos";
import { CaretDown, DownloadSimple, MagnifyingGlass, Printer, Warning } from "@phosphor-icons/react";
import { resumenConsulta } from "@/lib/resumen-consulta";
import { btn, panel } from "@/components/ui";
import { dateOnly, dateTime } from "./shared";
import { EXAMENES, interpretarResultado } from "@/lib/catalogo-clinico";
import { AportadosPaciente } from "./aportes";

type Tab = "resumen" | "atenciones" | "examenes" | "medicamentos" | "informes" | "previos";

const control =
  "min-h-10 rounded-ctl border border-line bg-surface px-3 text-[0.9rem] text-ink focus:border-accent focus:outline-none";
const etiqueta = "text-[0.75rem] font-medium uppercase tracking-[0.06em] text-muted";
const dias = (iso: string) => Math.round((Date.now() - Date.parse(iso + "T12:00:00-05:00")) / 86_400_000);
const hace = (iso: string) => {
  const d = dias(iso);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : d < 60 ? `hace ${d} días` : `hace ${Math.round(d / 30)} meses`;
};
const vigente = (m: Resumen["medicamentos"][number]) =>
  m.fuentes.some((f) => f.estado === "active" && (!f.fin || f.fin >= new Date().toISOString().slice(0, 10)));
// Un resultado se marca para revisar con las mismas reglas del catálogo (umbrales ADA y afines).
const revisar = (e: Examen) =>
  !!e.codigo && typeof e.valor === "number" && interpretarResultado(e.codigo, e.valor).estado === "revisar";

// Quita las marcas de datos de prueba que traen las fuentes.
const limpio = (t = "") =>
  t
    .replace(/\s*\([^)]*(sint[eé]tic|acad[eé]mic|simulad)[^)]*\)/gi, "")
    .replace(/[;,]?\s*indicaci[oó]n cl[ií]nica simulada\.?/gi, ".")
    .replace(/\.\./g, ".")
    .trim();

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-[0.92rem] text-muted">{children}</p>;
}

function Seccion({ titulo, n, children }: { titulo: string; n?: number; children: React.ReactNode }) {
  return (
    <section className={panel}>
      <h3 className="text-[0.98rem] font-semibold">
        {titulo}
        {n !== undefined && <span className="font-normal text-muted tabular-nums"> · {n}</span>}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Barra de búsqueda y filtros en una sola línea.
function Filtros({
  buscar,
  setBuscar,
  sede,
  setSede,
  sedes,
}: {
  buscar: string;
  setBuscar: (v: string) => void;
  sede: string;
  setSede: (v: string) => void;
  sedes: string[];
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <label className="relative min-w-[14rem] flex-1">
        <span className="sr-only">Buscar</span>
        <MagnifyingGlass size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          className={`${control} w-full pl-9`}
          placeholder="Buscar"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Sede</span>
        <select className={control} value={sede} onChange={(e) => setSede(e.target.value)}>
          <option value="all">Todas las sedes</option>
          {sedes.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// Tabla de resultados: una fila por examen; el detalle se abre solo si se pide.
function TablaExamenes({ lista, conSede = true }: { lista: Examen[]; conSede?: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!lista.length) return <Vacio>No hay resultados.</Vacio>;
  return (
    <div className="tabla-ex">
      <table className="w-full text-left text-[0.92rem]">
        <thead>
          <tr className={`${etiqueta} border-b border-line`}>
            <th className="py-2 pr-3 font-medium">Examen</th>
            <th className="py-2 pr-3 font-medium">Resultado</th>
            <th className="py-2 pr-3 font-medium">Fecha</th>
            {conSede && <th className="py-2 pr-3 font-medium">Sede</th>}
            <th className="w-8 py-2" aria-label="Detalle" />
          </tr>
        </thead>
        <tbody>
          {lista.map((e) => {
            const id = `${e.sistema}-${e.idLocal}`;
            const abiertoEste = abierto === id;
            const marca = revisar(e);
            return (
              <Fragment key={id}>
                <tr
                  className="cursor-pointer border-b border-line/70 transition-colors hover:bg-surface-2/50"
                  onClick={() => setAbierto(abiertoEste ? null : id)}
                >
                  <td className="py-2.5 pr-3 font-medium">{e.nombre}</td>
                  <td data-label="Resultado" className="py-2.5 pr-3 tabular-nums">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      {e.resultado}
                      {marca && (
                        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[0.72rem] font-semibold text-warn">
                          Revisar
                        </span>
                      )}
                    </span>
                  </td>
                  <td data-label="Fecha" className="whitespace-nowrap py-2.5 pr-3 text-muted tabular-nums">
                    {dateOnly(e.fecha)}
                  </td>
                  {conSede && (
                    <td data-label="Sede" className="py-2.5 pr-3 text-muted">
                      {e.establecimiento}
                    </td>
                  )}
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      aria-expanded={abiertoEste}
                      aria-label={`Detalle de ${e.nombre}`}
                      className="inline-grid size-8 place-items-center rounded-ctl text-muted hover:bg-surface-2 hover:text-ink"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setAbierto(abiertoEste ? null : id);
                      }}
                    >
                      <CaretDown size={15} className={`transition-transform ${abiertoEste ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {abiertoEste && (
                  <tr className="border-b border-line/70 bg-surface-2/40">
                    <td colSpan={conSede ? 5 : 4} className="px-3 py-3">
                      <dl className="grid gap-x-8 gap-y-2 text-[0.86rem] sm:grid-cols-3">
                        <div>
                          <dt className="text-muted">Referencia</dt>
                          <dd>{e.referencia ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Muestra</dt>
                          <dd>{e.muestra ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Código LOINC</dt>
                          <dd className="font-mono">{e.codigo ?? "—"}</dd>
                        </div>
                        {e.interpretacion && (
                          <div className="sm:col-span-3">
                            <dt className="text-muted">Lectura</dt>
                            <dd>{e.interpretacion}</dd>
                          </div>
                        )}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Atenciones como un cordón: cada nudo es una visita; se despliega para ver el detalle.
function Atenciones({ lista }: { lista: Atencion[] }) {
  if (!lista.length) return <Vacio>No hay atenciones.</Vacio>;
  return (
    <ol>
      {lista.map((a, i) => (
        <li key={a.id} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4">
          {i < lista.length - 1 && (
            <span aria-hidden className="absolute bottom-0 left-[0.6rem] top-5 w-px bg-line" />
          )}
          <span aria-hidden className="relative mt-[1.15rem] size-3 justify-self-center rounded-full bg-accent ring-4 ring-surface" />
          <details className="group min-w-0 border-b border-line/70 py-3 last:border-0">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="font-semibold">{a.diagnostico || a.motivo}</span>
                <span className="block text-[0.86rem] text-muted">
                  {a.establecimiento} · {a.profesional}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 whitespace-nowrap text-[0.86rem] text-muted tabular-nums">
                {dateOnly(a.fecha)}
                <CaretDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <dl className="mt-3 grid gap-x-8 gap-y-3 text-[0.9rem] sm:grid-cols-2">
              {[
                ["Motivo", limpio(a.motivo)],
                ["Signos vitales", limpio(a.signos)],
                ["Indicaciones", a.medicamentos.join(" · ")],
                ["Plan", limpio([a.plan, a.seguimiento].filter(Boolean).join(" "))],
              ]
                .filter(([, v]) => v?.trim())
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[0.8rem] text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {a.examenes.length > 0 && (
              <div className="mt-3">
                <TablaExamenes lista={a.examenes} conSede={false} />
              </div>
            )}
          </details>
        </li>
      ))}
    </ol>
  );
}

export function Historia({ r, paraPaciente = false }: { r: Resumen; paraPaciente?: boolean }) {
  const [tab, setTab] = useState<Tab>("resumen"),
    [buscar, setBuscar] = useState(""),
    [sede, setSede] = useState("all"),
    [motivo, setMotivo] = useState(""),
    [codigoPedido, setCodigoPedido] = useState("2345-7");
  const puntos = useMemo(() => resumenConsulta(r, motivo), [r, motivo]);
  const sedes = useMemo(() => [...new Set(r.atenciones.map((a) => a.establecimiento))].sort(), [r.atenciones]);
  const q = buscar.trim().toLowerCase();
  const atenciones = useMemo(
    () =>
      r.atenciones.filter(
        (a) =>
          (sede === "all" || a.establecimiento === sede) &&
          [a.motivo, a.diagnostico, a.profesional, a.establecimiento, ...a.medicamentos, ...a.examenes.map((e) => e.nombre)]
            .join(" ")
            .toLowerCase()
            .includes(q),
      ),
    [r.atenciones, sede, q],
  );
  const examenes = useMemo(
    () =>
      r.examenes.filter(
        (e) =>
          (sede === "all" || e.establecimiento === sede) &&
          [e.nombre, e.establecimiento, e.resultado].join(" ").toLowerCase().includes(q),
      ),
    [r.examenes, sede, q],
  );
  const incompletos = r.traza.sistemas.filter((x) => x.estado === "no_disponible");
  const activos = r.medicamentos.filter(vigente);
  // Lo que pide atención primero; lo informativo solo si se relaciona con el motivo escrito.
  const importantes = puntos.filter(
    (p) => p.nivel !== "info" && !p.titulo.startsWith("Alergia a ") || (motivo.trim() && p.relevante && p.nivel === "info"),
  );
  const ultimos = r.examenes.slice(0, 6);
  const previos = r.examenes.filter((e) => e.codigo === codigoPedido).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ventana = EXAMENES[codigoPedido]?.dias ?? 30;

  const tabs: { id: Tab; t: string; n?: number }[] = [
    { id: "resumen", t: "Resumen" },
    { id: "atenciones", t: "Atenciones", n: r.atenciones.length },
    { id: "examenes", t: "Exámenes", n: r.examenes.length + (r.aportados?.length ?? 0) },
    { id: "medicamentos", t: "Medicamentos", n: r.medicamentos.length },
    { id: "informes", t: "Informes" },
    ...(paraPaciente ? [] : [{ id: "previos" as Tab, t: "Antes de pedir un examen" }]),
  ];

  return (
    <article className="grid min-w-0 gap-5">
      <header className={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[1.45rem] font-semibold tracking-[-0.015em]">{r.nombre}</h2>
          <p className="text-[0.9rem] text-muted">
            <span className="font-mono">DNI {r.dni}</span> · {r.edad} años ·{" "}
            {r.sexo === "female" ? "Mujer" : r.sexo === "male" ? "Hombre" : "Sin dato"}
          </p>
        </div>
        <div className="no-imprimir mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={`/api/portal/historia-pdf?dni=${encodeURIComponent(r.dni)}`}
            download
            className={`${btn.secondary} ${btn.sm} no-underline`}
          >
            <DownloadSimple size={16} weight="bold" aria-hidden /> Descargar historia (PDF)
          </a>
          <span className="text-[0.8rem] text-muted">
            {paraPaciente ? "La descarga queda en tu registro de accesos." : "La descarga queda registrada y el paciente la verá."}
          </span>
        </div>
        {(r.alergias.length > 0 || r.seguridad.length > 0 || incompletos.length > 0) && (
          <div className="mt-4 grid gap-2">
            {r.alergias.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 text-[0.92rem]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-1 text-[0.82rem] font-semibold text-danger">
                  <Warning size={15} weight="fill" aria-hidden /> Alergia
                </span>
                <span className="font-semibold">{r.alergias.map((a) => a.sustancia).join(", ")}</span>
                <span className="text-muted">
                  {r.alergias
                    .map((a) => a.reaccion)
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </p>
            )}
            {r.seguridad.map((s, i) => (
              <p
                key={i}
                role="alert"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-ctl border border-danger-line bg-danger-bg px-3.5 py-2.5 text-[0.92rem]"
              >
                <Warning size={17} weight="fill" className="text-danger" aria-hidden />
                <strong className="font-semibold text-danger">
                  {s.medicamento} {s.vigente ? "activo" : ""}
                </strong>
                <span>con alergia a {s.alergia.toLowerCase()}</span>
                <span className="text-muted">
                  · {s.entreSedes ? "registrado en otra sede" : s.lugarMedicamento}
                </span>
              </p>
            ))}
            {incompletos.length > 0 && (
              <p role="status" className="rounded-ctl border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[0.9rem]">
                {incompletos.map((s) => s.clave).join(", ")} no respondió: la historia puede estar incompleta.
              </p>
            )}
          </div>
        )}
      </header>

      <nav aria-label="Secciones de la historia" className="no-imprimir flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]">
        {tabs.map((x) => (
          <button
            type="button"
            key={x.id}
            onClick={() => setTab(x.id)}
            aria-current={tab === x.id ? "page" : undefined}
            className={`min-h-11 shrink-0 border-b-2 px-3.5 py-2 text-[0.92rem] font-medium transition-colors ${tab === x.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {x.t}
            {x.n !== undefined && <span className="ml-1.5 text-[0.8rem] text-muted tabular-nums">{x.n}</span>}
          </button>
        ))}
      </nav>

      {tab === "resumen" && (
        <div className="grid gap-4">
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[0.98rem] font-semibold">
                Para revisar <span className="font-normal text-muted tabular-nums">· {importantes.length}</span>
              </h3>
              {!paraPaciente && (
                <label className="w-full sm:w-72">
                  <span className="sr-only">Motivo de la consulta</span>
                  <input
                    className={`${control} w-full`}
                    placeholder="Motivo de la consulta (opcional)"
                    value={motivo}
                    maxLength={120}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>
              )}
            </div>
            {importantes.length ? (
              <ul className="mt-3 divide-y divide-line/70">
                {importantes.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 py-2.5">
                    <span
                      aria-hidden
                      className={`mt-[0.45rem] size-2 shrink-0 rounded-full ${p.nivel === "critico" ? "bg-danger" : p.nivel === "atencion" ? "bg-warn" : "bg-accent"}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.93rem] font-medium">{p.titulo}</span>
                      <span className="block text-[0.82rem] text-muted">{p.fuente}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[0.92rem] text-muted">Nada pendiente de revisar.</p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Seccion titulo="Condiciones" n={r.condiciones.length}>
              {r.condiciones.length ? (
                <ul className="flex flex-col gap-2">
                  {r.condiciones.map((c) => (
                    <li key={c.codigo} className="flex items-baseline justify-between gap-3 text-[0.92rem]">
                      {c.nombre}
                      <span className="font-mono text-[0.78rem] text-muted">{c.codigo}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.9rem] text-muted">Sin condiciones registradas.</p>
              )}
            </Seccion>
            <Seccion titulo="Medicamentos activos" n={activos.length}>
              {activos.length ? (
                <ul className="flex flex-col gap-2 text-[0.92rem]">
                  {activos.map((m) => (
                    <li key={m.nombre}>{m.nombre}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.9rem] text-muted">Ninguno registrado como activo.</p>
              )}
            </Seccion>
            <Seccion titulo="Últimos resultados">
              {ultimos.length ? (
                <ul className="flex flex-col gap-2 text-[0.92rem]">
                  {ultimos.map((e) => (
                    <li key={`${e.sistema}-${e.idLocal}`} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{e.nombre}</span>
                      <span className={`whitespace-nowrap font-semibold tabular-nums ${revisar(e) ? "text-warn" : ""}`}>
                        {e.resultado}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.9rem] text-muted">Sin resultados.</p>
              )}
              {r.examenes.length > ultimos.length && (
                <button
                  type="button"
                  onClick={() => setTab("examenes")}
                  className="mt-3 text-[0.86rem] font-medium text-accent-strong hover:underline"
                >
                  Ver los {r.examenes.length}
                </button>
              )}
            </Seccion>
          </div>
          {r.atenciones[0] && (
            <p className="text-[0.86rem] text-muted">
              Última atención {hace(r.atenciones[0].fecha)} en {r.atenciones[0].establecimiento}.
            </p>
          )}
        </div>
      )}

      {tab === "atenciones" && (
        <section className={panel}>
          <Filtros buscar={buscar} setBuscar={setBuscar} sede={sede} setSede={setSede} sedes={sedes} />
          <Atenciones lista={atenciones} />
        </section>
      )}

      {tab === "examenes" && (
        <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
          <AportadosPaciente aportados={r.aportados ?? []} />
          <section className={panel}>
            <Filtros buscar={buscar} setBuscar={setBuscar} sede={sede} setSede={setSede} sedes={sedes} />
            <TablaExamenes lista={examenes} />
          </section>
        </div>
      )}

      {tab === "medicamentos" && (
        <section className={panel}>
          {r.medicamentos.length ? (
            <div className="tabla-ex">
              <table className="w-full text-left text-[0.92rem]">
                <thead>
                  <tr className={`${etiqueta} border-b border-line`}>
                    <th className="py-2 pr-3 font-medium">Medicamento</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 font-medium">Desde</th>
                    <th className="py-2 font-medium">Sede</th>
                  </tr>
                </thead>
                <tbody>
                  {r.medicamentos.map((m) => {
                    const f = m.fuentes[0];
                    const activo = vigente(m);
                    return (
                      <tr key={m.nombre} className="border-b border-line/70 last:border-0">
                        <td className="py-2.5 pr-3 font-medium">{m.nombre}</td>
                        <td data-label="Estado" className="py-2.5 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.78rem] font-semibold ${activo ? "bg-ok-bg text-ok" : "bg-surface-2 text-muted"}`}
                          >
                            {activo ? "Activo" : "Finalizado"}
                          </span>
                        </td>
                        <td data-label="Desde" className="whitespace-nowrap py-2.5 pr-3 text-muted tabular-nums">
                          {f?.fecha ? dateOnly(f.fecha) : "—"}
                        </td>
                        <td data-label="Sede" className="py-2.5 text-muted">
                          {m.fuentes.map((x) => x.lugar).join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Vacio>No hay medicamentos registrados.</Vacio>
          )}
          {!paraPaciente && activos.length > 0 && (
            <p className="mt-3 text-[0.84rem] text-muted">Confirme con el paciente si los sigue tomando.</p>
          )}
        </section>
      )}

      {tab === "informes" && (
        <div className="grid gap-4">
          <div className="no-imprimir flex justify-end">
            <button type="button" className={`${btn.ghost} ${btn.sm}`} onClick={() => window.print()}>
              <Printer size={16} aria-hidden /> Imprimir
            </button>
          </div>
          {r.atenciones
            .filter((a) => a.examenes.length)
            .map((a) => (
              <section className={panel} key={a.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{a.establecimiento}</h3>
                  <p className="text-[0.86rem] text-muted tabular-nums">{dateTime(a.fechaHora)}</p>
                </div>
                <div className="mt-3">
                  <TablaExamenes lista={a.examenes} conSede={false} />
                </div>
              </section>
            ))}
          {!r.atenciones.some((a) => a.examenes.length) && <Vacio>No hay informes.</Vacio>}
        </div>
      )}

      {tab === "previos" && !paraPaciente && (
        <section className={panel}>
          <label className="flex flex-wrap items-center gap-3 text-[0.92rem] font-medium">
            ¿Qué examen piensa pedir?
            <select className={control} value={codigoPedido} onChange={(e) => setCodigoPedido(e.target.value)}>
              {Object.entries(EXAMENES).map(([codigo, info]) => (
                <option key={codigo} value={codigo}>
                  {info.nombre}
                </option>
              ))}
            </select>
          </label>
          {previos[0] ? (
            <p
              className={`mt-4 rounded-ctl border px-3.5 py-3 text-[0.95rem] ${dias(previos[0].fecha) <= ventana ? "border-warn-line bg-warn-bg" : "border-line bg-surface-2/50"}`}
            >
              Último: <strong className="font-semibold tabular-nums">{previos[0].resultado}</strong>,{" "}
              {hace(previos[0].fecha)} en {previos[0].establecimiento}.
              {dias(previos[0].fecha) <= ventana && " Revíselo antes de pedir otro."}
            </p>
          ) : (
            <p className="mt-4 rounded-ctl bg-surface-2/60 px-3.5 py-3 text-[0.95rem] text-muted">
              No hay resultados previos de este examen.
            </p>
          )}
          {previos.length > 0 && (
            <div className="mt-4">
              <TablaExamenes lista={previos} />
            </div>
          )}
        </section>
      )}
    </article>
  );
}
