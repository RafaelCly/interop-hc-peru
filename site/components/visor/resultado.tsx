"use client";

import { useState, type RefObject } from "react";
import {
  ArrowsClockwise, CheckCircle, CloudSlash, Copy, LockKey, LockKeyOpen, ShieldCheck, Warning,
} from "@phosphor-icons/react";
import { api, SISTEMAS, type Fuente, type Pedido, type Resumen, type Terminologia } from "@/lib/gateway";
import { Chip, btn, fecha, fechaHora, ms, panel } from "../ui";
import { mensajeAlerta, sexo } from "../textos";

const aviso = {
  warn: "border-warn-line bg-warn-bg text-warn",
  err: "border-danger-line bg-danger-bg text-danger",
  ok: "border-ok-line bg-ok-bg text-ok",
};

function Aviso({ tipo, icono, titulo, children }: { tipo: keyof typeof aviso; icono: React.ReactNode; titulo: string; children?: React.ReactNode }) {
  return (
    <div className={`flex gap-3.5 rounded-card border p-4 sm:p-5 ${aviso[tipo]}`} role={tipo === "err" ? "alert" : undefined}>
      <span className="mt-0.5 shrink-0">{icono}</span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold">{titulo}</h3>
        <div className="mt-1 text-[0.95rem] text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      </div>
    </div>
  );
}

export function Cargando() {
  return (
    <>
      <div className={panel} aria-busy="true"><div className="sk h-8 w-[45%]" /><div className="sk mb-5 mt-3 h-4 w-[30%]" /><div className="sk h-16" /></div>
      <div className={panel}><div className="sk mb-4 h-5 w-1/4" /><div className="sk mb-2 h-10" /><div className="sk mb-2 h-10" /><div className="sk h-10" /></div>
    </>
  );
}

export function ResultadoError({ e, onAutorizar }: { e: { codigo: string; message: string }; onAutorizar: () => void }) {
  if (e.codigo === "sin_consentimiento") {
    return (
      <Aviso tipo="err" icono={<LockKey size={28} aria-hidden />} titulo="Acceso bloqueado">
        <p>{e.message} Esta consulta quedó registrada como denegada.</p>
        <button type="button" onClick={onAutorizar} className={`${btn.primary} ${btn.sm} mt-4`}>
          <LockKeyOpen size={18} aria-hidden /> Simular autorización del paciente
        </button>
      </Aviso>
    );
  }
  return <Aviso tipo="err" icono={<Warning size={28} aria-hidden />} titulo="No se pudo consultar"><p>{e.message}</p></Aviso>;
}

function Lista<T>({ items, vacio = "Sin registros.", fila }: { items: T[]; vacio?: string; fila: (x: T) => React.ReactNode }) {
  return items.length
    ? <ul className="mt-3 divide-y divide-line">{items.map((x, i) => <li key={i} className="py-2.5 first:pt-0 last:pb-0">{fila(x)}</li>)}</ul>
    : <p className="mt-3 text-sm text-muted">{vacio}</p>;
}
function Origenes({ fuentes, conFecha }: { fuentes: Fuente[]; conFecha?: boolean }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
      {fuentes.map((f) => (
        <span key={f.clave} className="inline-flex items-center gap-2 text-[0.82rem] text-muted" title={f.lugar}>
          <Chip clave={f.clave} />
          {conFecha && f.fecha ? <>desde {fecha(f.fecha)}</> : <span className="hidden sm:inline">{f.lugar}</span>}
        </span>
      ))}
    </span>
  );
}
const Sub = ({ children }: { children: React.ReactNode }) => <small className="block text-[0.82rem] text-muted">{children}</small>;

function PedirExamen({ dni, catalogo }: { dni: string; catalogo: { codigo: string; nombre: string }[] }) {
  const [codigo, setCodigo] = useState(catalogo[0].codigo);
  const [estado, setEstado] = useState<"idle" | "cargando" | { p: Pedido } | { error: string }>("idle");
  const evaluar = async () => {
    setEstado("cargando");
    try { setEstado({ p: await api.pedirExamen(dni, codigo) }); }
    catch (e) { setEstado({ error: (e as Error).message }); }
  };
  return (
    <section className={panel} aria-labelledby="pedido-t">
      <h2 id="pedido-t" className="text-lg font-semibold">Pedir un examen</h2>
      <p className="mt-1 text-sm text-muted">Antes de ordenar, el visor revisa si ya existe uno reciente en cualquier establecimiento.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="examen" className="text-sm font-medium">Examen</label>
          <select id="examen" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-ctl border border-line bg-bg px-3">
            {catalogo.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
          </select>
        </div>
        <button type="button" onClick={evaluar} disabled={estado === "cargando"} className={btn.primary}>Evaluar pedido</button>
      </div>
      <div className="mt-4" role="status" aria-live="polite">
        {estado === "cargando" && <div className="sk h-14" />}
        {typeof estado === "object" && "error" in estado && <Aviso tipo="err" icono={<Warning size={24} aria-hidden />} titulo="No se pudo evaluar"><p>{estado.error}</p></Aviso>}
        {typeof estado === "object" && "p" in estado && (estado.p.duplicado ? (
          <Aviso tipo="warn" icono={<Warning size={24} aria-hidden />} titulo="Posible duplicado">
            <p>{estado.p.examen} se hizo hace {estado.p.dias} días en {estado.p.previo?.establecimiento} (resultado: {estado.p.previo?.resultado}). Ventana de {estado.p.ventana} días.</p>
          </Aviso>
        ) : (
          <Aviso tipo="ok" icono={<CheckCircle size={24} aria-hidden />} titulo="Se puede pedir">
            <p>{estado.p.examen}. {estado.p.previo ? `El último fue hace ${estado.p.dias} días en ${estado.p.previo.establecimiento}, fuera de la ventana de ${estado.p.ventana} días.` : "No hay registros previos."}</p>
          </Aviso>
        ))}
      </div>
    </section>
  );
}

export function ResultadoResumen({
  r, catalogo, accesosKey, terminologia, onRevocar, encabezadoRef,
}: { r: Resumen; catalogo: { codigo: string; nombre: string }[]; accesosKey: number; terminologia: Terminologia; onRevocar: () => void; encabezadoRef: RefObject<HTMLHeadingElement | null> }) {
  const dup = new Set(r.repetidos.flatMap((a) => [`${a.codigo}|${a.fechaAnterior}`, `${a.codigo}|${a.fechaRepeticion}`]));
  const caidos = r.establecimientos.filter((e) => e.estado === "no_disponible");
  const accesos = api.accesos(r.dni).slice(0, 6);
  void accesosKey;
  return (
    <article className="grid gap-4" aria-labelledby="pac-nombre">
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="pac-nombre" ref={encabezadoRef} tabIndex={-1} className="text-[clamp(1.6rem,1.2rem+1.4vw,2.2rem)] font-bold leading-tight tracking-tight">{r.nombre}</h2>
            <p className="mt-1 text-sm text-muted"><span className="font-mono">DNI {r.dni}</span>, {r.edad} años, {sexo(r.sexo)}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-ok-bg py-1 pl-3.5 pr-1 text-sm font-medium text-ok">
            <ShieldCheck size={18} aria-hidden /> Acceso autorizado
            <button type="button" onClick={onRevocar} className="rounded-full bg-surface-2 px-3 py-1.5 text-[0.82rem] font-semibold text-ink hover:bg-line">Revocar</button>
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.85rem]">
          {r.establecimientos.map((e) => e.estado === "no_disponible"
            ? <span key={e.clave} className="inline-flex items-center gap-2 font-medium text-danger"><Chip clave={e.clave} /> <CloudSlash size={16} aria-hidden /> No disponible</span>
            : <span key={e.clave} className="inline-flex items-center gap-2"><Chip clave={e.clave} /> <code className="font-mono text-[0.8rem] text-muted">{e.idLocal}</code></span>)}
        </div>
      </section>

      {caidos.length > 0 && (
        <Aviso tipo="err" icono={<CloudSlash size={28} aria-hidden />} titulo="Historial incompleto">
          <p>No se pudo consultar {caidos.map((c) => SISTEMAS[c.clave].nombre).join(" ni ")}. Sus datos no aparecen en este resumen.</p>
        </Aviso>
      )}

      {r.repetidos.length > 0 ? (
        <Aviso tipo="warn" icono={<Warning size={28} aria-hidden />} titulo={`${r.repetidos.length} ${r.repetidos.length === 1 ? "examen repetido" : "exámenes repetidos"} entre establecimientos`}>
          <ul>{r.repetidos.map((a) => <li key={a.codigo + a.fechaRepeticion}>{mensajeAlerta(a)}</li>)}</ul>
        </Aviso>
      ) : (
        <Aviso tipo="ok" icono={<CheckCircle size={28} aria-hidden />} titulo="Sin exámenes repetidos recientes">
          <p>No se detectaron duplicados entre establecimientos.</p>
        </Aviso>
      )}

      <PedirExamen dni={r.dni} catalogo={catalogo} />

      <section className={`${panel} tabla-ex`}>
        <div role="region" tabIndex={0} aria-labelledby="tabla-cap" className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.93rem]">
            <caption id="tabla-cap" className="pb-3 text-left text-lg font-semibold">Exámenes ({r.examenes.length})</caption>
            <thead>
              <tr className="text-left text-[0.8rem] text-muted">
                {["Fecha", "Examen", "Resultado", "Origen"].map((h) => <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.examenes.map((e) => {
                const rep = dup.has(`${e.codigo}|${e.fecha}`);
                return (
                  <tr key={e.idLocal} className={rep ? "bg-warn-bg" : ""}>
                    <th scope="row" className="whitespace-nowrap border-b border-line px-3 py-3 text-left font-normal text-muted">{fecha(e.fecha)}</th>
                    <td data-label="Examen" className="border-b border-line px-3 py-3">
                      {e.nombre}
                      {e.codigo && <span className="block font-mono text-[0.75rem] text-muted">LOINC {e.codigo}{e.codigoOriginal ? ` (código local ${e.codigoOriginal} traducido)` : ""}</span>}
                      {e.codigo && terminologia.items[e.codigo] && <span className="block text-[0.75rem] text-muted">{terminologia.items[e.codigo]}</span>}
                      {rep && <span className="mt-1 inline-flex items-center gap-1 text-[0.78rem] font-semibold text-warn"><Copy size={14} aria-hidden /> Repetido</span>}
                    </td>
                    <td data-label="Resultado" className="border-b border-line px-3 py-3 tabular-nums">{e.resultado}</td>
                    <td data-label="Origen" className="border-b border-line px-3 py-3"><Chip clave={e.sistema} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={panel}><h2 className="text-lg font-semibold">Medicamentos</h2>
          <p className="mt-1 text-[0.82rem] text-muted">Tratamiento registrado en cada sistema y desde cuándo.</p>
          <Lista items={r.medicamentos} fila={(m) => <><span className="font-medium">{m.nombre}</span><Origenes fuentes={m.fuentes} conFecha /></>} /></section>
        <section className={panel}><h2 className="text-lg font-semibold">Alergias</h2>
          <Lista items={r.alergias} fila={(a) => <><span className="block font-semibold text-danger">{a.sustancia}</span>{a.reaccion}<Origenes fuentes={a.fuentes} /></>} /></section>
      </div>
      <section className={panel}><h2 className="text-lg font-semibold">Condiciones</h2>
        <Lista items={r.condiciones} fila={(c) => <>{c.nombre}<Sub>CIE-10 {c.codigo}</Sub><Origenes fuentes={c.fuentes} /></>} /></section>

      <section className={panel}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.95rem] font-semibold [&::-webkit-details-marker]:hidden">
            <ArrowsClockwise size={18} aria-hidden className="transition-transform group-open:rotate-180" /> Cómo se armó este resumen
          </summary>
          <table className="mt-4 w-full border-collapse text-[0.9rem]">
            <thead><tr className="text-left text-[0.8rem] text-muted">{["Sistema", "Peticiones", "Exámenes", "Tiempo", "Estado"].map((h) => <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {r.traza.sistemas.map((s) => (
                <tr key={s.clave}>
                  <td className="border-b border-line px-3 py-2.5"><Chip clave={s.clave} /></td>
                  <td className="border-b border-line px-3 py-2.5 tabular-nums">{s.peticiones}</td>
                  <td className="border-b border-line px-3 py-2.5 tabular-nums">{s.estado === "ok" ? s.examenes : "-"}</td>
                  <td className="border-b border-line px-3 py-2.5 font-mono text-[0.85rem] tabular-nums">{ms(s.ms)}</td>
                  <td className={`border-b border-line px-3 py-2.5 font-medium ${s.estado === "ok" ? "text-ok" : s.estado === "no_disponible" ? "text-danger" : "text-muted"}`}>
                    {s.estado === "ok" ? "Respondió" : s.estado === "no_disponible" ? "No disponible" : "Sin registro"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            Se unificaron {r.traza.examenes} exámenes, los de la tabla de exámenes: {r.traza.sistemas.filter((s) => s.examenes).map((s) => `${s.examenes} de ${SISTEMAS[s.clave].corto}`).join(" y ")}.{r.traza.traducidos ? ` ${r.traza.traducidos} llegaron con código local y se tradujeron a LOINC.` : ""} Las consultas corren en paralelo, por eso el tiempo total fue {ms(r.traza.total)} y no la suma de cada sistema.
            {terminologia.version && ` Nombres de los exámenes verificados en el servicio de terminología de HL7 (tx.fhir.org), LOINC ${terminologia.version}.`}
          </p>
        </details>
      </section>

      <section className={panel}>
        <h2 className="text-lg font-semibold">Quién consultó este historial</h2>
        <Lista items={accesos} vacio="Sin accesos registrados todavía." fila={(a) => (
          <div className="flex items-start justify-between gap-4">
            <span>{a.quien}<Sub>{[a.lugar, a.motivo].filter(Boolean).join(" · ")}</Sub></span>
            <span className={`text-right ${a.resultado === "denegado" ? "font-semibold text-danger" : ""}`}>{a.resultado}<Sub>{fechaHora(a.cuando)}</Sub></span>
          </div>
        )} />
      </section>
    </article>
  );
}
