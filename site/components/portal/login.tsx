"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, QrCode } from "@phosphor-icons/react";
import { fetchPortal, ErrorBlock } from "./shared";
import { btn, campo } from "@/components/ui";
import { KipuMarca, Logo, QuipuArte } from "@/components/marca";
import { BotonTema } from "@/components/tema";

type Role = "medico" | "paciente";

export function LoginForm({ almacenListo = true }: { almacenListo?: boolean }) {
  const router = useRouter(),
    [role, setRole] = useState<Role>("paciente"),
    [correo, setCorreo] = useState(""),
    [password, setPassword] = useState(""),
    [documento, setDocumento] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const elegir = (r: Role) => {
    if (r === role) return;
    setRole(r);
    setDocumento("");
    setError("");
  };
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const j = await fetchPortal("login", "POST", { correo, password, perfil: role, documento });
      router.replace(j.user.role === "medico" ? "/medico" : "/paciente");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };
  const medico = role === "medico";
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#1d2f5c] text-[#f4f1ea] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <span className="inline-flex items-center gap-2.5">
          <KipuMarca className="size-8" />
          <span className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">Kipu</span>
        </span>
        <QuipuArte className="pointer-events-none absolute -right-10 top-[14%] w-[min(92%,560px)] text-[#f4f1ea]/85" />
        <div className="relative max-w-[30rem]">
          <h1 className="font-display text-[clamp(2.6rem,1.4rem+2.6vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
            Tu historia clínica, contigo.
          </h1>
          <p className="mt-5 max-w-[38ch] text-[1.08rem] leading-relaxed text-[#f4f1ea]/75">
            Tus atenciones del Minsa, EsSalud y clínicas en un solo lugar. Tú decides qué médico la ve y por
            cuánto tiempo.
          </p>
        </div>
      </aside>

      <main id="principal" tabIndex={-1} className="flex flex-col px-5 py-6 outline-none sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <BotonTema />
        </div>

        <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center py-10">
          <h2 className="font-display text-[2rem] font-semibold tracking-[-0.025em]">Ingresar</h2>
          <p className="mt-1.5 text-muted">
            {medico ? "Accede a las historias que tus pacientes te autorizaron." : "Revisa tu historia y decide quién la ve."}
          </p>

          <div
            role="radiogroup"
            aria-label="Tipo de cuenta"
            className="mt-7 grid grid-cols-2 rounded-ctl bg-surface-2 p-1"
          >
            {(
              [
                ["paciente", "Soy paciente"],
                ["medico", "Soy médico"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={role === k}
                onClick={() => elegir(k)}
                className={`min-h-10 rounded-[6px] text-[0.92rem] font-semibold transition-[background-color,color,box-shadow] duration-150 ${role === k ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <form onSubmit={enviar} className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-[0.88rem] font-medium">
              {medico ? "Número de colegiatura (CMP)" : "DNI"}
              <input
                required
                type="text"
                autoComplete="off"
                inputMode={medico ? "text" : "numeric"}
                maxLength={medico ? 20 : 8}
                value={documento}
                onChange={(e) => setDocumento(medico ? e.target.value : e.target.value.replace(/\D/g, ""))}
                className={`${campo} font-mono tracking-wide`}
                placeholder={medico ? "CMP-000000" : "8 dígitos"}
              />
            </label>
            <label className="grid gap-1.5 text-[0.88rem] font-medium">
              Correo electrónico
              <input
                required
                autoComplete="username"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className={campo}
                placeholder="nombre@correo.com"
              />
            </label>
            <label className="grid gap-1.5 text-[0.88rem] font-medium">
              Contraseña
              <input
                required
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={campo}
              />
            </label>
            {!almacenListo && (
              <ErrorBlock mensaje="El servicio no está disponible en este momento. Inténtalo de nuevo más tarde." />
            )}
            {error && <ErrorBlock mensaje={error} />}
            <button className={`${btn.primary} mt-2 w-full`} type="submit" disabled={loading || !almacenListo}>
              {loading ? "Verificando…" : "Ingresar"}
              {!loading && <ArrowRight size={17} weight="bold" aria-hidden />}
            </button>
          </form>

          {medico && (
            <a
              href="/leer"
              className="group mt-8 flex items-center gap-3.5 rounded-card border border-line p-4 no-underline transition-colors hover:bg-surface"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-ctl bg-accent-soft text-accent-strong">
                <QrCode size={21} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.92rem] font-semibold text-ink">¿Atiendes sin internet?</span>
                <span className="block text-[0.84rem] text-muted">Lee el carné QR del paciente sin ingresar.</span>
              </span>
              <ArrowRight
                size={17}
                className="text-muted transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden
              />
            </a>
          )}
        </div>

        <p className="text-center text-[0.8rem] text-muted lg:text-left">© 2026 Kipu</p>
      </main>
    </div>
  );
}
