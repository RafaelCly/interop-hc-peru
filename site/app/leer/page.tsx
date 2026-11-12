import type { Metadata } from "next";
import { LectorCarnet } from "@/components/lector-carnet";

export const metadata: Metadata = {
  title: "Leer carné del paciente",
  description: "Lee el resumen firmado que el paciente lleva en su QR, sin conexión a internet.",
};

// Página estática: una vez abierta con conexión, el trabajador de servicio la guarda para usarla sin red.
export default function Leer() {
  return <LectorCarnet />;
}
