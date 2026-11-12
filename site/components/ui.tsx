import Link from "next/link";
import { SISTEMAS, type Clave } from "@/lib/data";

export const fecha = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const ms = (n: number) => `${Math.round(n)} ms`;

const COLOR: Record<Clave, string> = {
  minsa: "text-minsa border-minsa/30 bg-minsa/10",
  essalud: "text-essalud border-essalud/30 bg-essalud/10",
  clinica: "text-clinica border-clinica/30 bg-clinica/10",
};

export function Chip({ clave, children }: { clave: Clave; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.8rem] font-medium leading-[1.4] ${COLOR[clave]}`}>
      {children ?? SISTEMAS[clave].corto}
    </span>
  );
}

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-ctl border border-transparent px-4.5 py-2.5 text-[0.93rem] font-semibold transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
export const btn = {
  primary: `${BASE} bg-accent text-accent-ink hover:bg-accent-strong dark:hover:bg-[color-mix(in_srgb,var(--accent)_85%,white)]`,
  secondary: `${BASE} bg-surface-2 text-ink hover:bg-[color-mix(in_srgb,var(--surface-2)_85%,var(--ink))]`,
  ghost: `${BASE} border-line bg-surface text-ink hover:bg-surface-2`,
  peligro: `${BASE} bg-danger text-white hover:bg-[color-mix(in_srgb,var(--danger)_85%,black)] dark:text-[#2a0a12]`,
  sm: "!min-h-9 !px-3.5 !py-1.5 !text-[0.86rem]",
};

// Campo de texto: hundido respecto de la superficie, con foco en añil.
export const campo =
  "min-h-11 w-full rounded-ctl border border-line bg-bg px-3 text-[0.95rem] font-normal text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none";

export function BotonLink({ href, variante = "primary", pequeno, children }: {
  href: string; variante?: keyof typeof btn; pequeno?: boolean; children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${btn[variante]} ${pequeno ? btn.sm : ""}`}>
      {children}
    </Link>
  );
}

export const panel = "rounded-card bg-surface p-5 shadow-card sm:p-6";
export const contenedor = "mx-auto w-[min(100%-3rem,1360px)]";
