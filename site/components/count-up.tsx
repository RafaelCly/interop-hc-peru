"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Cuenta de 0 al valor al entrar en pantalla. Con movimiento reducido muestra el valor final.
export function CountUp({ valor, decimales = 0 }: { valor: number; decimales?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visto = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reducido = useReducedMotion();
  const [n, setN] = useState(reducido ? valor : 0);
  useEffect(() => {
    if (!visto) return;
    if (reducido) { setN(valor); return; }
    const c = animate(0, valor, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => c.stop();
  }, [visto, valor, reducido]);
  // Coma decimal y espacio fino para los miles (convención usada en el resto del texto).
  const fmt = (x: number) => x.toFixed(decimales).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (
    <span ref={ref} className="tabular-nums" aria-label={fmt(valor)}>
      <span aria-hidden="true">{fmt(n)}</span>
    </span>
  );
}
