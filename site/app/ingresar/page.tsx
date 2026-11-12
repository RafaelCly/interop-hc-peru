import { redirect } from "next/navigation";

// Dirección anterior del ingreso; ahora el ingreso está en la raíz.
export default function Ingresar() {
  redirect("/");
}
