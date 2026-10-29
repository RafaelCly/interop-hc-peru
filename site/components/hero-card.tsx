"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle, Warning } from "@phosphor-icons/react";
import { SISTEMAS, type Clave } from "@/lib/data";
import type { Alerta, EstadoSistema } from "@/lib/tipos";
import { Chip, btn } from "./ui";
import { mensajeAlerta } from "./textos";
import { EnPantalla } from "./en-pantalla";

const CLAVES = Object.keys(SISTEMAS) as Clave[];
const XS = [50, 150, 250];

// Datos del ejemplo de la portada. Los arma el servidor con el paciente ficticio de demostración.
export interface VistaPrevia {
  dni: string;
  nombre: string;
  edad: number;
  sistemas: { clave: Clave; estado: EstadoSistema }[];
  repetidos: Alerta[];
}

// Los tres sistemas consultados y las líneas que convergen en el paciente.
function Fuentes({ sistemas }: { sistemas: VistaPrevia["sistemas"] }) {
  const conDatos = (k: Clave) => sistemas.find((s) => s.clave === k)?.estado === "ok";
  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {CLAVES.map((k, i) => (
          <motion.li
            key={k}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: conDatos(k) ? 1 : 0.6, y: 0 }}
            transition={{ delay: 0.1 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`rounded-ctl border bg-surface px-2.5 py-2 text-center ${conDatos(k) ? "border-accent/40" : "border-line"}`}
          >
            <Chip clave={k} />
            <span className={`mt-1 block font-mono text-[0.72rem] ${conDatos(k) ? "text-ok" : "text-muted"}`}>
              {conDatos(k) ? "con datos" : "sin registro"}
            </span>
          </motion.li>
        ))}
      </ul>
      <svg
        viewBox="0 0 300 56"
        preserveAspectRatio="none"
        className="h-14 w-full text-line"
        aria-hidden="true"
        focusable="false"
      >
        {XS.map((x, i) => {
          const d = `M${x} 0 C ${x} 30, 150 26, 150 56`;
          return (
            <g key={x}>
              <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              {conDatos(CLAVES[i]) && (
                <path d={d} className="linea-flujo" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HeroCard({ datos }: { datos: VistaPrevia }) {
  const consultados = datos.sistemas.length;
  const respondieron = datos.sistemas.filter((s) => s.estado === "ok").length;
  return (
    <EnPantalla>
      <Fuentes sistemas={datos.sistemas} />
      <aside
        aria-label="Ejemplo de resumen unificado"
        className="relative -mt-px rounded-[1.25rem] border border-line bg-surface p-5 shadow-card sm:p-7"
      >
        <p className="font-mono text-[0.8rem] text-muted">
          DNI {datos.dni} · {datos.edad} años
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{datos.nombre}</h2>

        {datos.repetidos.length > 0 && (
          <ul className="mt-5 space-y-2 rounded-ctl border border-warn-line bg-warn-bg p-3.5 text-[0.9rem] text-warn">
            {datos.repetidos.map((a) => (
              <li key={a.codigo + a.fechaRepeticion} className="flex gap-2.5">
                <Warning size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                <span>{mensajeAlerta(a)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[0.82rem] text-muted">
            <CheckCircle size={16} weight="fill" className="text-ok" aria-hidden />
            {respondieron} de {consultados} sistemas con datos
          </p>
          <Link href="/ingresar" className={`${btn.secondary} ${btn.sm}`}>
            Probar el portal <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </aside>
    </EnPantalla>
  );
}
