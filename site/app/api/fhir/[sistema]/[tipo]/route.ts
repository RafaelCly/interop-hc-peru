import { NextResponse, type NextRequest } from "next/server";
import { ErrorHttp, consultaFhir, esClave } from "@/lib/fhir-server";
import { TIPOS } from "@/lib/data";

export const dynamic = "force-dynamic";

const TIPOS_VALIDOS = new Set(["Patient", ...TIPOS]);

// GET /api/fhir/{minsa|essalud|clinica}/{Patient|Observation|...}?identifier=...&patient=...
// La cabecera x-simular-caida: 1 hace que el sistema responda 503 (caída simulada).
export async function GET(req: NextRequest, ctx: { params: Promise<{ sistema: string; tipo: string }> }) {
  const { sistema, tipo } = await ctx.params;
  if (!esClave(sistema) || !TIPOS_VALIDOS.has(tipo)) {
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found", diagnostics: "Sistema o recurso desconocido" }] },
      { status: 404 },
    );
  }
  const params = Object.fromEntries(req.nextUrl.searchParams);
  try {
    const bundle = await consultaFhir(sistema, tipo, params, req.headers.get("x-simular-caida") === "1");
    return NextResponse.json(bundle, { headers: { "Content-Type": "application/fhir+json", "Cache-Control": "no-store" } });
  } catch (e) {
    const estado = e instanceof ErrorHttp ? e.estado : 500;
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "transient", diagnostics: (e as Error).message }] },
      { status: estado },
    );
  }
}
