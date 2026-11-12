"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";

const EVENTO = "kipu-tema";
const suscribir = (cb: () => void) => {
  const m = matchMedia("(prefers-color-scheme: dark)");
  m.addEventListener("change", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    m.removeEventListener("change", cb);
    window.removeEventListener(EVENTO, cb);
  };
};
const leer = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

export function BotonTema({ className = "" }: { className?: string }) {
  const oscuro = useSyncExternalStore(suscribir, leer, () => false);
  const alternar = () => {
    const siguiente = oscuro ? "light" : "dark";
    document.documentElement.dataset.theme = siguiente;
    try {
      localStorage.setItem("tema", siguiente);
    } catch {
      /* sin almacenamiento: el cambio dura hasta recargar */
    }
    window.dispatchEvent(new Event(EVENTO));
  };
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={oscuro ? "Usar tema claro" : "Usar tema oscuro"}
      className={`inline-grid size-10 place-items-center rounded-ctl text-muted transition-colors hover:bg-surface-2 hover:text-ink ${className}`}
    >
      {oscuro ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
