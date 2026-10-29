import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Almacén del estado del portal (cuentas, sesiones, solicitudes y bitácora), guardado como un único JSON.
 *
 * - redis: base compartida (Upstash o Vercel KV, por REST). Se usa si existen las variables de entorno.
 * - archivo: desarrollo local, en `.demo-state/portal.json` (excluido de Git). La carpeta puede cambiarse con
 *   DEMO_STATE_DIR; las pruebas usan una temporal.
 * - sin_almacen: en Vercel sin Redis. En Vercel cada ruta corre como una función distinta, sin memoria ni disco
 *   compartidos; sin una base común, la sesión creada al ingresar no la vería la página siguiente. Por eso el
 *   portal no arranca en ese caso y avisa cómo configurarlo, en vez de fallar sin explicación.
 */
export type TipoAlmacen = "redis" | "archivo" | "sin_almacen";

export class ErrorAlmacen extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorAlmacen";
  }
}

const CLAVE = "interop-hc-peru:portal";
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const tipoAlmacen: TipoAlmacen =
  redisUrl && redisToken ? "redis" : process.env.VERCEL ? "sin_almacen" : "archivo";
export const almacenListo = tipoAlmacen !== "sin_almacen";

const MENSAJE_SIN_ALMACEN =
  "El portal necesita una base Redis en Vercel. Conecta Upstash Redis al proyecto (Storage > Marketplace > " +
  "Upstash) y vuelve a desplegar.";

const RAIZ = process.env.DEMO_STATE_DIR ?? join(process.cwd(), ".demo-state");
const ARCHIVO = join(RAIZ, "portal.json");

async function redis(...comando: (string | number)[]): Promise<unknown> {
  const res = await fetch(redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(comando),
    cache: "no-store",
  });
  if (!res.ok) throw new ErrorAlmacen(`El almacén Redis respondió HTTP ${res.status}.`);
  const cuerpo = (await res.json()) as { result?: unknown; error?: string };
  if (cuerpo.error) throw new ErrorAlmacen(`El almacén Redis devolvió un error: ${cuerpo.error}`);
  return cuerpo.result;
}

export async function leerEstado(): Promise<string | null> {
  if (tipoAlmacen === "sin_almacen") throw new ErrorAlmacen(MENSAJE_SIN_ALMACEN);
  if (tipoAlmacen === "redis") return ((await redis("GET", CLAVE)) as string | null) ?? null;
  return existsSync(ARCHIVO) ? readFileSync(ARCHIVO, "utf8") : null;
}

export async function guardarEstado(json: string): Promise<void> {
  if (tipoAlmacen === "sin_almacen") throw new ErrorAlmacen(MENSAJE_SIN_ALMACEN);
  if (tipoAlmacen === "redis") {
    await redis("SET", CLAVE, json);
    return;
  }
  mkdirSync(RAIZ, { recursive: true, mode: 0o700 });
  const tmp = `${ARCHIVO}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
  writeFileSync(tmp, json, { mode: 0o600 });
  renameSync(tmp, ARCHIVO);
}
