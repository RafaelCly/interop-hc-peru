// Trazo de electrocardiograma decorativo. Se dibuja una vez al cargar y queda como fondo del titular.
// Cada latido avanza 246 unidades y vuelve a la línea base.
const LATIDO = "h60 l6 -6 l8 6 h24 l6 8 l10 -44 l10 52 l6 -16 h30 q14 -14 28 0 h58";
const ANCHO = 246 * 12;
const TRAZO = "M0 80 " + LATIDO.repeat(12);

export function Ecg({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${ANCHO} 160`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ecg-g" gradientUnits="userSpaceOnUse" x1="0" x2={ANCHO} y1="0" y2="0">
          <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
          <stop offset="0.3" style={{ stopColor: "var(--accent)", stopOpacity: 0.55 }} />
          <stop offset="0.7" style={{ stopColor: "var(--accent)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={TRAZO} pathLength={1} className="ecg-trazo" fill="none" stroke="url(#ecg-g)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
