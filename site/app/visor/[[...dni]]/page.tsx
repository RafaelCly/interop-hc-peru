import type { Metadata } from "next";
import { Visor } from "@/components/visor/visor";

export const metadata: Metadata = { title: "Visor" };

export default async function PaginaVisor({ params }: { params: Promise<{ dni?: string[] }> }) {
  const { dni } = await params;
  return <Visor dni={dni?.[0]} />;
}
