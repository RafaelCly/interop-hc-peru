import { contenedor } from "./ui";

const integrantes = ["Chu-Lau Yllescas, Rafael Andrés", "Condori Mamani, Ruben Alcides", "Diaz Vergaray, Edward José"];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line py-10 text-[0.92rem] text-muted">
      <div className={`${contenedor} grid gap-8 sm:grid-cols-2`}>
        <div className="space-y-1.5">
          <p className="font-semibold text-ink">interop-hc-peru</p>
          <p>Prototipo del curso TE111U Innovación y Gestión Tecnológica, UNI-FIIS. Grupo C.</p>
          <ul className="pt-1">
            {integrantes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold text-ink">Datos</p>
          <p>
            Los establecimientos provienen de{" "}
            <a className="text-accent-strong underline underline-offset-[3px]" href="https://www.datosabiertos.gob.pe/dataset/registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress" rel="noopener">
              RENIPRESS (SUSALUD, sep. 2026)
            </a>
            . Los pacientes y sus registros son ficticios.
          </p>
          <p>
            <a className="text-accent-strong underline underline-offset-[3px]" href="https://github.com/RafaelCly/interop-hc-peru" rel="noopener">
              Código en GitHub
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
