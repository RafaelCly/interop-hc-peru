// Trazo de electrocardiograma decorativo (no es una señal clínica). Cada latido mide 246 unidades de ancho
// y varía en altura de la onda P, del complejo QRS y de la onda T. Un ciclo de cuatro latidos distintos se
// repite, así que desplazarlo exactamente un ciclo en bucle (ver .ecg-mov en globals.css) no se corta.
const LATIDO_ANCHO = 246;
const P = [6, 7, 5, 7];
const R = [44, 56, 40, 64];
const T = [14, 18, 12, 20];

const latido = (i: number) => {
  const r = R[i];
  // línea base, onda P, PR, Q, R, S, regreso, ST, onda T, línea base (siempre vuelve a y = base)
  return `h60 l6 -${P[i]} l8 ${P[i]} h24 l6 8 l10 -${r} l10 ${r + 8} l6 -16 h30 q14 -${T[i]} 28 0 h58`;
};

export const PERIODO = LATIDO_ANCHO * R.length;
const CICLOS = 5;
const ANCHO = PERIODO * CICLOS;
const TRAZO = "M0 80 " + Array.from({ length: R.length * CICLOS }, (_, k) => latido(k % R.length)).join(" ");

export function Ecg({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${ANCHO} 160`} preserveAspectRatio="none" width={ANCHO} height="112" className={className} aria-hidden="true" focusable="false">
      <path d={TRAZO} fill="none" stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
