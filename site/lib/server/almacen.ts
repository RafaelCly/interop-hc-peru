import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Almacén del estado del portal (cuentas, sesiones, solicitudes y bitácora), guardado como un único JSON.
 *
 * - redis: base compartida entre instancias (Upstash o Vercel KV, por REST). Se usa si hay variables de entorno.
 * - memoria: en Vercel sin Redis. El estado vive mientras la instancia siga activa y puede reiniciarse.
 * - archivo: desarrollo local, en `.demo-state/portal.json` (excluido de Git). La carpeta puede cambiarse con
 *   DEMO_STATE_DIR; las pruebas usan una temporal.
 */
export type TipoAlmacen = "redis" | "memoria" | "archivo";

const CLAVE = "interop-hc-peru:portal";
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const tipoAlmacen: TipoAlmacen =
  redisUrl && redisToken ? "redis" : process.env.VERCEL ? "memoria" : "archivo";

const RAIZ = process.env.DEMO_STATE_DIR ?? join(process.cwd(), ".demo-state");
const ARCHIVO = join(RAIZ, "portal.json");
const memoria = globalThis as unknown as { __estadoPortal?: string };

async function redis(...comando: (string | number)[]): Promise<unknown> {
  const res = await fetch(redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(comando),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`El almacén respondió HTTP ${res.status}`);
  const cuerpo = (await res.json()) as { result?: unknown; error?: string };
  if (cuerpo.error) throw new Error(cuerpo.error);
  return cuerpo.result;
}

export async function leerEstado(): Promise<string | null> {
  if (tipoAlmacen === "redis") return ((await redis("GET", CLAVE)) as string | null) ?? null;
  if (tipoAlmacen === "memoria") return memoria.__estadoPortal ?? null;
  return existsSync(ARCHIVO) ? readFileSync(ARCHIVO, "utf8") : null;
}

export async function guardarEstado(json: string): Promise<void> {
  if (tipoAlmacen === "redis") {
    await redis("SET", CLAVE, json);
  } else if (tipoAlmacen === "memoria") {
    memoria.__estadoPortal = json;
  } else {
    mkdirSync(RAIZ, { recursive: true, mode: 0o700 });
    const tmp = `${ARCHIVO}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
    writeFileSync(tmp, json, { mode: 0o600 });
    renameSync(tmp, ARCHIVO);
  }
}
