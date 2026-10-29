"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle, Warning } from "@phosphor-icons/react";
import { api, SISTEMAS, type Resumen } from "@/lib/gateway";
import { Chip, btn, ms } from "./ui";
import { mensajeAlerta } from "./textos";

// Ejemplo vivo: consulta de verdad la pasarela y muestra cómo respondió cada sistema.
export function HeroCard() {
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    api.vistaPrevia("90000001").then((x) => vivo && setR(x), () => vivo && setError(true));
    return () => { vivo = false; };
  }, []);

  return (
    <aside
      aria-label="Ejemplo de resumen unificado"
      aria-busy={!r && !error}
      className="relative rounded-[1.25rem] border border-line bg-surface p-5 shadow-card sm:p-7"
    >
      {error && <p className="text-sm text-muted">No se pudo cargar el ejemplo.</p>}
      {!r && !error && (
        <div className="space-y-3" aria-hidden="true">
          <div className="sk h-7 w-3/5" /><div className="sk h-4 w-2/5" /><div className="sk h-14" /><div className="sk h-14" />
        </div>
      )}
      {r && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <p className="font-mono text-[0.8rem] text-muted">DNI {r.dni} · {r.edad} años</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{r.nombre}</h2>

          <ul className="mt-5 divide-y divide-line rounded-ctl border border-line text-[0.9rem]">
            {r.traza.sistemas.filter((s) => s.estado !== "sin_registro").map((s, i) => (
              <motion.li
                key={s.clave}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <span className="flex items-center gap-2.5">
                  <Chip clave={s.clave} />
                  <span className="hidden text-muted sm:inline">{SISTEMAS[s.clave].establecimiento}</span>
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[0.8rem] text-ok">
                  <CheckCircle size={16} weight="fill" aria-hidden /> {ms(s.ms)}
                </span>
              </motion.li>
            ))}
          </ul>

          {r.repetidos.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 space-y-2 rounded-ctl border border-warn-line bg-warn-bg p-3.5 text-[0.9rem] text-warn"
            >
              {r.repetidos.slice(0, 2).map((a) => (
                <li key={a.codigo + a.fechaRepeticion} className="flex gap-2.5">
                  <Warning size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                  <span>{mensajeAlerta(a)}</span>
                </li>
              ))}
            </motion.ul>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-[0.82rem] text-muted">Armado en {ms(r.traza.total)}</p>
            <Link href="/visor/90000001" className={`${btn.secondary} ${btn.sm}`}>
              Abrir en el visor <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </motion.div>
      )}
    </aside>
  );
}
