// Trabajador de servicio del lector de carnés (/leer). Guarda la página, sus recursos y la clave pública
// del emisor para que el médico pueda leer el QR del paciente sin conexión. No toca el resto del sitio.
const CACHE = "kipu-lector-v2";
const PAGINA = "/leer";
const CLAVE = "/api/carnet/clave";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([PAGINA, CLAVE]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => /^(hcp|kipu)-lector-/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página avisa qué recursos ya cargó antes de que este trabajador estuviera activo, para guardarlos.
self.addEventListener("message", (e) => {
  const urls = Array.isArray(e.data?.guardar) ? e.data.guardar : [];
  const propios = urls.filter((u) => {
    try {
      return new URL(u).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(propios.map((u) => c.add(u).catch(() => undefined)))));
});

const esEstatico = (p) => p.startsWith("/_next/static/") || p === "/favicon.svg";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (esEstatico(url.pathname)) {
    // Archivos con hash en el nombre: primero la copia guardada.
    e.respondWith(
      caches.match(req).then(
        (r) =>
          r ??
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  if ((url.pathname === PAGINA && req.mode === "navigate") || url.pathname === CLAVE) {
    // Primero la red, para tener la versión vigente; sin red, la copia guardada.
    const clave = url.pathname === PAGINA ? PAGINA : CLAVE;
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(clave, res.clone()));
          return res;
        })
        .catch(() => caches.match(clave).then((r) => r ?? Response.error())),
    );
  }
});
