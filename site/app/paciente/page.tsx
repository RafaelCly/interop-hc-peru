import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { session, publicUser } from "@/lib/server/auth";
import { PortalPaciente } from "@/components/portal/paciente";
export const metadata: Metadata = { title: "Mi salud" };
export default async function Paciente() {
  const u = await session();
  if (!u) redirect("/");
  if (u.role !== "paciente") redirect("/medico");
  return <PortalPaciente user={publicUser(u)} />;
}
