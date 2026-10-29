# interop-hc-peru

**Visor de historia clínica unificada, con portales de médico y paciente**
Curso TE111U Innovación y Gestión Tecnológica (UNI-FIIS) · Grupo C

Prototipo que simula la **interoperabilidad de la historia clínica en el Perú**. Un paciente atendido en el Minsa, en
EsSalud y en una clínica privada tiene tres historiales aislados. El prototipo los unifica a partir del DNI, avisa si
un examen ya se hizo en otro establecimiento y deja el control en manos del paciente: el médico **solicita** acceso, el
paciente **autoriza o revoca**, y cada consulta queda registrada.

> **Todos los datos son ficticios.** Los pacientes (DNI 90000001 a 90000024), los médicos, los sistemas y las sedes de
> San Juan de Lurigancho son simulados. Las historias clínicas reales son datos sensibles protegidos por la
> Ley N.° 29733 y no se usan. No ingresar información personal real.

## El problema y la solución

- **Problema:** al atenderse en más de un establecimiento, los antecedentes no viajan con el paciente: el médico los
  reconstruye de memoria o repite exámenes, y el paciente carga sus propios resultados.
- **Solución elegida:** visor de resumen del paciente sobre FHIR, con autorización del paciente, trazabilidad de
  accesos y alerta de exámenes similares entre establecimientos.

## Qué hace

| Función | Dónde |
|---|---|
| Portal del médico: solicita acceso por DNI y finalidad, y consulta solo lo autorizado | `site/components/portal/medico.tsx` |
| Portal del paciente: autoriza por 1 hora, 24 horas o 7 días, revoca y ve quién accedió | `site/components/portal/paciente.tsx` |
| Ingreso con rol, contraseñas con scrypt, sesiones revocables y límite de intentos | `site/lib/server/auth.ts` |
| Historial por atención con filtros, tratamientos, informes imprimibles y alergias destacadas | `site/components/portal/historia.tsx` |
| Tres sistemas simulados (Minsa, EsSalud, clínica) con recursos FHIR R4 y códigos locales normalizados a LOINC | `site/lib/data.ts`, `site/lib/server/clinical.ts` |
| Coincidencias de exámenes entre establecimientos, con aviso de que son orientativas | `site/lib/server/clinical.ts` |
| Tolerancia a fallos: si una fuente cae, el historial se marca como incompleto | `site/lib/server/clinical.ts` |
| Nombres oficiales de LOINC consultados en vivo a `tx.fhir.org` | `site/app/api/terminologia/route.ts` |

Manual completo, usuarios de prueba y recorrido: [`docs/portal-sjl.md`](docs/portal-sjl.md).

## Cómo ejecutarlo

Requiere Node.js 22 o superior.

```bash
cd site
npm ci
npm run dev
```

Abrir <http://localhost:3000/ingresar>. Para entrar:

| Perfil | Identificador | Correo | Contraseña |
|---|---|---|---|
| Médica | CMP-DEMO-001 | `medico.demo@sjl.test` | `DemoMedico2026!` |
| Paciente | DNI 90000001 | `paciente01@demo.sjl.test` | `DemoPaciente2026!` |

Pruebas automáticas:

```bash
npm run test:sjl   # dataset sintético
npm run test:v2    # permisos, sesiones, revocación y auditoría
npm run build
```

## Despliegue en Vercel

1. Importar el repositorio y elegir **Root Directory: `site`**. Framework: Next.js.
2. Opcional, pero recomendado para el flujo médico y paciente: conectar una base **Redis** (Upstash, desde el
   Marketplace de Vercel, plan gratuito). Con ella, cuentas, sesiones y autorizaciones se comparten entre instancias.
   Sin Redis, el estado vive en la memoria de la instancia y puede reiniciarse.

Detalle de los modos de almacenamiento en [`docs/portal-sjl.md`](docs/portal-sjl.md).

## Estructura

```
site/        aplicación Next.js: portada, portales, API y pruebas (lo que se despliega)
docs/        manual del portal, plan maestro y notas de la primera entrega de SJL
app/         primera versión del backend en FastAPI (PMV1), con sus pruebas en tests/
web/         primera versión estática del visor (PMV1), de respaldo
scripts/     validación del prototipo contra servicios públicos (HAPI y tx.fhir.org)
```

`app/` y `web/` son la primera versión del prototipo. Se conservan por historia: **no incluyen el acceso por roles**
y no se usan en la demostración.

## Versión anterior en FastAPI (PMV1)

Requiere Python 3.11 o superior.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    ·    Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
python -m pytest
```

Abrir <http://localhost:8000>. La documentación interactiva de la API está en <http://localhost:8000/docs>.

## Validación con servicios externos

Dos scripts (no son dependencias de la aplicación) contrastan el prototipo con servicios públicos:

```bash
python scripts/validar_fhir.py      # valida los recursos contra el servidor FHIR R4 público de HAPI
python scripts/verificar_loinc.py   # comprueba los códigos LOINC contra un servidor de terminología (tx.fhir.org)
```

- Solo se envían datos ficticios. Son servidores públicos de prueba y pueden cambiar o limitar el uso.
- El servidor HAPI público no incluye los CodeSystem de LOINC ni de CIE-10, así que esos códigos se verifican con el
  servidor de terminología.
- Los 21 códigos del catálogo clínico del portal se comprobaron contra `tx.fhir.org`; todos son válidos.

## Alcance y limitaciones

- Usa recursos FHIR R4 básicos. **Aún no se valida contra el perfil `HL7.FHIR.PE.COREPE` del Minsa.**
- El URI del DNI (`https://www.reniec.gob.pe/dni`) es de ejemplo.
- La verificación del CMP y la identidad del paciente son simuladas. No hay MFA ni recuperación de cuenta.
- Las coincidencias de exámenes son orientativas, no criterios clínicos de repetición.
- Los rangos de referencia son docentes y no reemplazan los del laboratorio que emite cada informe.
- El estado del portal se guarda en un archivo (local), en memoria (Vercel) o en Redis (opcional).

## Próximos pasos

1. Backend propio y base de datos transaccional para consentimientos y accesos.
2. Validar los recursos contra el perfil peruano de FHIR del Minsa.
3. Sumar un servidor FHIR público de pruebas como cuarto sistema.
4. Validar el flujo con un médico y con pacientes reales (entrevistas de usabilidad).
