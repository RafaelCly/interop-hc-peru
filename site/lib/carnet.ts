// Carné digital: resumen clínico firmado que viaja dentro de un código QR.
//
// El médico lo lee sin conexión: el contenido va en el propio QR (no es un enlace) y la firma ECDSA P-256
// se comprueba en el navegador con la clave pública del emisor. Funciona igual en el servidor (Node 18+) y
// en el navegador, porque solo usa Web Crypto y CompressionStream.
//
// Formato: "HCP1.<datos>.<firma>", con datos = base64url(deflate-raw(JSON)) y firma = base64url(ECDSA).
// La firma no cifra: quien escanee el QR puede leerlo. El paciente decide a quién se lo muestra.

export const PREFIJO = "HCP1";

// Origen de un dato: la red que lo registró o el propio paciente (resultado digitalizado, sin verificar).
export type OrigenCarnet = "minsa" | "essalud" | "clinica" | "paciente";

export interface Carnet {
  v: 1;
  n: string; // nombre
  d: string; // DNI sintético
  s: string; // sexo
  e: number; // edad
  g: string; // generado (ISO)
  x: string; // vence (ISO)
  a: [string, string][]; // alergias: sustancia, reacción
  c: string[]; // condiciones
  m: string[]; // medicamentos vigentes
  r: [string, string, string, string, OrigenCarnet][]; // exámenes: código LOINC, nombre, resultado, fecha, origen
}

const texto = new TextEncoder();
const lector = new TextDecoder();

function aBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deBase64url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw Error("Código con caracteres no válidos.");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function transformar(bytes: Uint8Array<ArrayBuffer>, flujo: CompressionStream | DecompressionStream) {
  const salida = new Blob([bytes]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

const ALGORITMO = { name: "ECDSA", namedCurve: "P-256" } as const;
const FIRMA = { name: "ECDSA", hash: "SHA-256" } as const;

export async function importarPrivada(jwk: JsonWebKey) {
  return crypto.subtle.importKey("jwk", jwk, ALGORITMO, false, ["sign"]);
}
export async function importarPublica(jwk: JsonWebKey) {
  return crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, ALGORITMO, false, [
    "verify",
  ]);
}
export async function generarClaves(): Promise<{ privada: JsonWebKey; publica: JsonWebKey }> {
  const par = await crypto.subtle.generateKey(ALGORITMO, true, ["sign", "verify"]);
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  const publica = await crypto.subtle.exportKey("jwk", par.publicKey);
  return { privada, publica: { kty: publica.kty, crv: publica.crv, x: publica.x, y: publica.y } };
}

export async function codificarCarnet(carnet: Carnet, privada: CryptoKey): Promise<string> {
  const datos = aBase64url(
    await transformar(texto.encode(JSON.stringify(carnet)), new CompressionStream("deflate-raw")),
  );
  const firmado = `${PREFIJO}.${datos}`;
  const firma = new Uint8Array(await crypto.subtle.sign(FIRMA, privada, texto.encode(firmado)));
  return `${firmado}.${aBase64url(firma)}`;
}

export type Lectura =
  | { ok: true; carnet: Carnet; vencido: boolean }
  | { ok: false; error: string };

export async function leerCarnet(codigo: string, publica: CryptoKey): Promise<Lectura> {
  const partes = codigo.trim().split(".");
  if (partes.length !== 3 || partes[0] !== PREFIJO)
    return { ok: false, error: "Este QR no es un carné de historia clínica." };
  try {
    const firmaValida = await crypto.subtle.verify(
      FIRMA,
      publica,
      deBase64url(partes[2]),
      texto.encode(`${partes[0]}.${partes[1]}`),
    );
    if (!firmaValida)
      return { ok: false, error: "La firma no coincide: el contenido fue alterado o no lo emitió este sistema." };
    const json = lector.decode(await transformar(deBase64url(partes[1]), new DecompressionStream("deflate-raw")));
    const carnet = JSON.parse(json) as Carnet;
    if (carnet.v !== 1) return { ok: false, error: "Versión de carné no compatible." };
    return { ok: true, carnet, vencido: Date.parse(carnet.x) < Date.now() };
  } catch {
    return { ok: false, error: "No se pudo leer el código. Vuelva a escanearlo." };
  }
}
