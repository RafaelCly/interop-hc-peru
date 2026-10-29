// Trazo de electrocardiograma decorativo. El patrón se repite cada LATIDO unidades, así que desplazarlo
// exactamente un latido en bucle (ver .ecg-mov en globals.css) se ve como un monitor que avanza sin cortes.
const LATIDO = "h60 l6 -6 l8 6 h24 l6 8 l10 -44 l10 52 l6 -16 h30 q14 -14 28 0 h58";
export const PERIODO = 246;
const LATIDOS = 14;
const ANCHO = PERIODO * LATIDOS;
const TRAZO = "M0 80 " + LATIDO.repeat(LATIDOS);

export function Ecg({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${ANCHO} 160`} preserveAspectRatio="none" width={ANCHO} height="112" className={className} aria-hidden="true" focusable="false">
      <path d={TRAZO} fill="none" stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
