// Marca de Kipu: un cordón principal con cordones colgantes y nudos, como un quipu andino,
// el registro que se llevaba consigo de un lugar a otro.

export function KipuMarca({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <path d="M4 7h24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 7v17M16 7v21M23 7v13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <g fill="currentColor">
        <circle cx="9" cy="13.5" r="2.2" />
        <circle cx="9" cy="19.5" r="2.2" />
        <circle cx="16" cy="12" r="2.2" />
        <circle cx="16" cy="17.5" r="2.2" />
        <circle cx="16" cy="23" r="2.2" />
        <circle cx="23" cy="15.5" r="2.2" />
      </g>
    </svg>
  );
}

export function Logo({ subtitulo, className = "" }: { subtitulo?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <KipuMarca className="size-8 text-accent" />
      <span className="leading-none">
        <span className="block font-display text-[1.45rem] font-semibold tracking-[-0.02em] text-ink">Kipu</span>
        {subtitulo && <span className="mt-1 block text-[0.72rem] font-medium text-muted">{subtitulo}</span>}
      </span>
    </span>
  );
}

// Quipu grande para el panel de ingreso. Cada cordón es un registro; los nudos, sus datos.
const CORDONES: { largo: number; nudos: number[]; tono?: "ocre" | "cochinilla" }[] = [
  { largo: 0.62, nudos: [0.22, 0.3, 0.52] },
  { largo: 0.8, nudos: [0.18, 0.44, 0.5, 0.56, 0.72] },
  { largo: 0.54, nudos: [0.26, 0.46], tono: "ocre" },
  { largo: 0.9, nudos: [0.16, 0.22, 0.4, 0.66, 0.84] },
  { largo: 0.7, nudos: [0.3, 0.36, 0.6] },
  { largo: 0.46, nudos: [0.2, 0.4], tono: "cochinilla" },
  { largo: 0.84, nudos: [0.24, 0.5, 0.56, 0.62, 0.78] },
  { largo: 0.66, nudos: [0.14, 0.42, 0.58] },
  { largo: 0.76, nudos: [0.28, 0.34, 0.68], tono: "ocre" },
  { largo: 0.5, nudos: [0.22, 0.44] },
  { largo: 0.88, nudos: [0.18, 0.38, 0.44, 0.7, 0.82] },
  { largo: 0.6, nudos: [0.32, 0.52] },
];

export function QuipuArte({ className = "" }: { className?: string }) {
  const W = 480,
    H = 340,
    x0 = 28,
    paso = (W - 2 * x0) / (CORDONES.length - 1),
    y0 = 24;
  const color = (t?: string) => (t === "ocre" ? "#e0a54b" : t === "cochinilla" ? "#e2687f" : "currentColor");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" fill="none">
      <path d={`M8 ${y0}C120 ${y0 - 10} 360 ${y0 + 10} ${W - 8} ${y0}`} stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      {CORDONES.map((c, i) => {
        const x = x0 + i * paso,
          y1 = y0 + (H - y0 - 8) * c.largo,
          curva = (i % 2 ? 1 : -1) * 5;
        return (
          <g key={i} opacity={c.tono ? 1 : 0.9}>
            <path
              d={`M${x} ${y0}Q${x + curva} ${(y0 + y1) / 2} ${x + curva / 2} ${y1}`}
              stroke={color(c.tono)}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            {c.nudos.map((n) => {
              const y = y0 + (H - y0 - 8) * n;
              return <ellipse key={n} cx={x + curva * 0.45} cy={y} rx="5.4" ry="4.4" fill={color(c.tono)} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}
