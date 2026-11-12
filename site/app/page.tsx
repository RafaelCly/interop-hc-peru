import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { session } from "@/lib/server/auth";
import { almacenListo } from "@/lib/server/almacen";
import { LoginForm } from "@/components/portal/login";

export const metadata: Metadata = { title: { absolute: "Ingresar · Kipu" } };

// La raíz es el ingreso. Con sesión abierta, lleva directo al portal de cada perfil.
export default async function Inicio() {
  const u = await session();
  if (u) redirect(u.role === "medico" ? "/medico" : "/paciente");
  return <LoginForm almacenListo={almacenListo} />;
}
