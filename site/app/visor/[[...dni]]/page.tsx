import { redirect } from "next/navigation";
import { session } from "@/lib/server/auth";
export default async function LegacyVisor() {
  const u = await session();
  redirect(u ? (u.role === "medico" ? "/medico" : "/paciente") : "/ingresar");
}
