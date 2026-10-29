import Link from "next/link";
import { ArrowRight, Copy, GitMerge, PlugsConnected, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { CASOS, SISTEMAS, type Clave } from "@/lib/data";
import { HeroCard } from "@/components/hero-card";
import { Flujo } from "@/components/flujo";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { Chip, btn, contenedor } from "@/components/ui";

const LINKS = {
  dyer: "https://www.infobae.com/peru/2026/08/06/ministro-de-salud-luis-dyer-revela-que-archivos-del-minsa-aun-se-guardan-en-cd-estamos-en-el-ano-95/",
  sihce: "https://www.estudiorodrigo.com/publicaciones/life-sciences-producto-legal-implementacion-de-las-historias-clinicas-electronicas-en-el-peru",
  renipress: "https://www.datosabiertos.gob.pe/dataset/registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress",
};

const cifras = [
  { valor: 54, dec: 0, sufijo: " %", texto: "de los 7 400 establecimientos del Minsa no tiene acceso a internet", fuente: "Ministro Dyer, ago. 2026", href: LINKS.dyer },
  { valor: 5.5, dec: 1, sufijo: " %", texto: "de las IPRESS de primer nivel tiene el SIHCE completo", fuente: "Minsa, jun. 2025", href: LINKS.sihce },
  { valor: 26972, dec: 0, sufijo: "", texto: "establecimientos activos en el registro nacional, cada uno con su propio historial", fuente: "RENIPRESS, sep. 2026", href: LINKS.renipress },
  { valor: 4, dec: 0, sufijo: " de 4", texto: "pacientes entrevistados repitieron exámenes y cargaron sus resultados", fuente: "Entrevistas del equipo", href: undefined },
];

const funciones = [
  { icono: GitMerge, titulo: "Un historial por DNI", texto: "Consulta los tres sistemas en paralelo y une medicamentos, alergias y exámenes, indicando de dónde viene cada dato." },
  { icono: Copy, titulo: "Alerta de exámenes repetidos", texto: "Detecta repeticiones entre establecimientos y avisa antes de pedir un examen que ya existe." },
  { icono: ShieldCheck, titulo: "Consentimiento y trazabilidad", texto: "El paciente autoriza el acceso y queda registrado quién consultó su historial." },
  { icono: PlugsConnected, titulo: "Sigue funcionando si un sistema cae", texto: "El visor muestra lo disponible y marca el historial como incompleto en lugar de fallar." },
];

const casos = CASOS.filter((c) => c.titulo);

export default function Inicio() {
  return (
    <>
      <section className={`${contenedor} grid items-center gap-10 py-12 sm:py-16 lg:min-h-[min(82dvh,46rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-20`} aria-labelledby="h-hero">
        <div>
          <h1 id="h-hero" className="text-[clamp(2.4rem,1.1rem+4.6vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.04em]">
            El historial del paciente, en una sola vista
          </h1>
          <p className="mt-6 max-w-[34ch] text-[clamp(1.05rem,0.95rem+0.5vw,1.3rem)] leading-normal text-muted">
            Conecta Minsa, EsSalud y clínicas por DNI y avisa antes de repetir un examen que ya existe.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/visor" className={btn.primary}>Abrir el visor <ArrowRight size={18} aria-hidden /></Link>
            <a href="#como-funciona" className={btn.ghost}>Cómo funciona</a>
          </div>
        </div>
        <HeroCard />
      </section>

      <Reveal as="section" className={`${contenedor} py-14 sm:py-20`}>
        <h2 className="max-w-[24ch] text-[clamp(1.6rem,1.1rem+1.8vw,2.4rem)] font-semibold">Hoy el historial no viaja con el paciente</h2>
        <dl className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {cifras.map((c) => (
            <div key={c.fuente} className="flex flex-col border-t-2 border-accent pt-4">
              <dd className="order-1 text-[clamp(2.4rem,2rem+1.6vw,3.4rem)] font-bold leading-none tracking-tight">
                <CountUp valor={c.valor} decimales={c.dec} />
                <small className="ml-0.5 text-[0.5em] font-semibold text-muted">{c.sufijo}</small>
              </dd>
              <dt className="order-2 mt-3 text-[0.95rem] text-muted">{c.texto}</dt>
              {c.href ? (
                <a href={c.href} rel="noopener" className="order-3 mt-3 text-[0.8rem] text-accent-strong underline underline-offset-[3px]">{c.fuente}</a>
              ) : (
                <span className="order-3 mt-3 text-[0.8rem] text-muted">{c.fuente}</span>
              )}
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal as="section" className={`${contenedor} grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="text-[clamp(1.6rem,1.1rem+1.8vw,2.4rem)] font-semibold">Qué resuelve el prototipo</h2>
          <p className="mt-3 max-w-[34ch] text-muted">Cuatro capacidades pensadas para el momento de la consulta.</p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {funciones.map(({ icono: Icono, titulo, texto }) => (
            <li key={titulo} className="flex gap-4 py-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-ctl bg-accent-soft text-accent-strong"><Icono size={22} aria-hidden /></span>
              <div>
                <h3 className="text-[1.05rem] font-semibold">{titulo}</h3>
                <p className="mt-1 max-w-[52ch] text-muted">{texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal as="section" className="py-14 sm:py-20">
        <div className={contenedor}>
          <h2 className="text-[clamp(1.6rem,1.1rem+1.8vw,2.4rem)] font-semibold">Seis casos para probar</h2>
        </div>
        <div
          tabIndex={0}
          role="region"
          aria-label="Casos de demostración, desplazable"
          className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[max(1.25rem,calc((100vw-1200px)/2))] scroll-pl-[max(1.25rem,calc((100vw-1200px)/2))] pb-4 [scrollbar-width:thin]"
        >
          {casos.map((c) => (
            <article key={c.dni} className="flex w-[min(20rem,82vw)] shrink-0 snap-start flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
              <span className="font-mono text-[0.8rem] text-muted">DNI {c.dni}</span>
              <div>
                <h3 className="text-[1.05rem] font-semibold leading-snug">{c.titulo}</h3>
                <p className="mt-0.5 text-[0.9rem] text-muted">{c.nombres} {c.apellidos}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">{(c.sistemas as Clave[]).map((k) => <Chip key={k} clave={k} />)}</div>
              <p className="flex-1 text-[0.92rem] text-muted">{c.muestra}</p>
              <Link href={`/visor/${c.dni}`} className={`${btn.secondary} ${btn.sm} self-start`}>
                Abrir caso <ArrowRight size={16} aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className={`${contenedor} py-14 sm:py-20`}>
        <h2 id="como-funciona" className="mb-10 text-[clamp(1.6rem,1.1rem+1.8vw,2.4rem)] font-semibold">Cómo se conectan los sistemas</h2>
        <Flujo />
        <p className="mt-8 max-w-[70ch] text-[0.92rem] text-muted">
          Cada consulta del visor pasa por {Object.keys(SISTEMAS).length} endpoints FHIR del propio sitio
          (<code className="font-mono text-[0.85em]">/api/fhir/&#123;sistema&#125;/&#123;recurso&#125;</code>) con datos ficticios. El siguiente paso es
          sustituirlos por los sistemas reales y guardar consentimientos y accesos en una base de datos.
        </p>
      </Reveal>
    </>
  );
}
