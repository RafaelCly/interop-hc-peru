import { NextResponse } from "next/server";
import { clavePublica } from "@/lib/server/carnet-servidor";
import { ErrorAlmacen } from "@/lib/server/almacen";

// GET /api/carnet/clave: clave pública con que el lector comprueba la firma de los carnés QR.
// Es pública a propósito; el lector la guarda para verificar sin conexión.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { emisor: "Kipu", clave: await clavePublica() },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (e) {
    if (e instanceof ErrorAlmacen) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
