# interop-hc-peru · sitio

Aplicación Next.js 16 (App Router) con TypeScript, Tailwind v4, Motion, Phosphor y Geist. Es lo que se despliega en
Vercel (Root Directory `site`).

## Comandos

```bash
npm ci            # instalar dependencias
npm run dev       # desarrollo en http://localhost:3000
npm run build     # compilación de producción
npm run start     # servir la compilación
npm run test:sjl  # pruebas del dataset sintético
npm run test:v2   # pruebas del servidor del portal
```

## Qué contiene

- `/` portada con una vista previa armada en el servidor.
- `/ingresar`, `/medico` y `/paciente`: portales con sesión y rol (ver [`../docs/portal-sjl.md`](../docs/portal-sjl.md)).
- `/api/portal/[accion]`: API del portal, con autorización en el servidor.
- `/api/terminologia`: nombres oficiales de LOINC, consultados a `tx.fhir.org`.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL`, `KV_REST_API_TOKEN`) | **Obligatorias en Vercel.** Guardan el estado del portal en Redis. Se crean solas al conectar Upstash al proyecto. En local son opcionales: sin ellas se usa un archivo. |
| `DEMO_STATE_DIR` | Carpeta del archivo de estado en local. Por defecto `.demo-state`. |

Todos los datos son ficticios. No ingresar información personal real.