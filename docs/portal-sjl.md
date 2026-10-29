# Portal clínico conectado · San Juan de Lurigancho

Manual del portal con roles de médico y paciente (versión V2 del prototipo). Parte del trabajo de
[`mejoras-sjl-v1.md`](mejoras-sjl-v1.md) y de [`plan-maestro-v2.md`](plan-maestro-v2.md).

> **Simulador académico.** Los 24 pacientes, las 2 cuentas médicas, las atenciones, los exámenes y las
> autorizaciones son ficticios. Las denominaciones de instituciones de SJL son referenciales: no existe conexión
> real con ellas, RENHICE, RENIEC, el CMP ni servicios del Minsa. **No ingresar datos reales de salud.**

## Ejecutarlo

Requiere Node.js 22 o superior.

```bash
cd site
npm ci
npm run dev
```

Abrir <http://localhost:3000/ingresar>.

## Usuarios de prueba

| Perfil | Identificador | Correo | Contraseña |
|---|---|---|---|
| Médica ficticia | CMP-DEMO-001 | `medico.demo@sjl.test` | `DemoMedico2026!` |
| Médico ficticio 2 | CMP-DEMO-002 | `medico2.demo@sjl.test` | `DemoMedico2026!` |
| Paciente 1 | DNI 90000001 | `paciente01@demo.sjl.test` | `DemoPaciente2026!` |
| Paciente 2 | DNI 90000002 | `paciente02@demo.sjl.test` | `DemoPaciente2026!` |

Hay 24 cuentas de pacientes: `paciente01` a `paciente24`, con DNI `90000001` a `90000024` y la misma contraseña de
demostración. En el ingreso, los botones **Soy médico** y **Soy paciente** cargan el primer usuario de cada perfil.
Estas credenciales son públicas y no protegen información real.

## Recorrido para la exposición

1. Entrar como médica (`CMP-DEMO-001`).
2. En **Solicitudes de acceso**, dejar el DNI `90000001` y pulsar **Enviar solicitud al paciente**. Cerrar sesión.
3. Entrar como paciente `90000001`. En **Autorizaciones**, elegir la duración (1 hora, 24 horas o 7 días) y pulsar
   **Autorizar**. Cerrar sesión.
4. Entrar de nuevo como médica y pulsar **Actualizar**. Abrir **Visor clínico** y consultar el DNI autorizado.
   Recorrer **Resumen**, **Atenciones**, **Exámenes**, **Tratamientos**, **Informes** y **Examen previo**.
5. En **Simular fuente caída**, elegir un sistema y volver a consultar: el historial se marca como incompleto.
6. Volver como paciente: **Quién accedió** muestra la consulta, y **Revocar permiso** retira el acceso.
7. Como médica, una nueva consulta del mismo paciente es rechazada. Si había una vista abierta, se oculta en la
   siguiente verificación (al volver a enfocar la pestaña o cada 15 s). Esto no puede borrar información ya vista.

## Qué está implementado

- Portales diferenciados para médico y paciente, con el rol verificado en el servidor.
- Ingreso con correo, contraseña y código CMP ficticio o DNI sintético. Las contraseñas se derivan con scrypt y sal
  individual.
- Sesiones aleatorias y revocables, guardadas como hash en el servidor, con cookie HttpOnly, SameSite=Lax y Secure en
  producción. Límite de 5 intentos fallidos por cuenta (bloqueo de 15 minutos) y validación de `Origin` en los POST.
- Acceso a un expediente solo por el propio paciente o por el médico destinatario de una autorización vigente,
  comprobado en cada consulta.
- Solicitudes, aprobación, rechazo, vencimiento y revocación, con duración definida y bitácora de eventos.
- 24 pacientes sintéticos, 32 sedes referenciales de SJL, 113 atenciones, 144 resultados y un catálogo de 21 tipos
  de examen, cuyos códigos LOINC están verificados contra el servicio de terminología de HL7.
- Historial por atención (fecha y hora, sede, profesional ficticio, anamnesis, signos, diagnóstico, evaluación, plan,
  seguimiento, resultados y medicamentos), con filtros por texto, sede, tipo y período.
- Alergias destacadas al inicio del expediente y detalle de coincidencias de exámenes entre fuentes. Son orientativas:
  pueden ser necesarios estudios repetidos por motivos clínicos.
- Nombres oficiales de LOINC consultados en vivo a `tx.fhir.org` desde el servidor (único servicio externo que usa
  la aplicación), con respaldo silencioso si no responde.
- Informes agrupados por atención, imprimibles. No son PDF firmados ni documentos médicos originales.
- Recursos FHIR R4 sintéticos internos (`Encounter`, `Observation`, `DiagnosticReport`, `MedicationStatement`,
  `AllergyIntolerance`, `Condition`) y normalización de códigos locales a LOINC.
- No hay endpoints clínicos públicos: los sistemas simulados solo los lee el servidor.

## Dónde se guarda el estado

Cuentas, sesiones, solicitudes y bitácora se guardan como un único documento JSON (`site/lib/server/almacen.ts`):

| Modo | Cuándo se usa | Características |
|---|---|---|
| Archivo | Desarrollo local | `site/.demo-state/portal.json`, excluido de Git |
| Memoria | En Vercel, sin Redis | Vive mientras la instancia siga activa; puede reiniciarse y perder sesiones y autorizaciones |
| Redis | Si existen `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` y `KV_REST_API_TOKEN`) | Compartido entre instancias; el estado sobrevive a reinicios |

Para que el flujo entre médico y paciente sea estable en Vercel, conviene conectar una base Redis (por ejemplo,
Upstash desde el Marketplace de Vercel, plan gratuito). Las variables se crean solas al conectarla al proyecto.

## Limitaciones respecto del plan maestro

| Tema | Situación actual | Para un piloto real |
|---|---|---|
| CMP y habilitación del médico | Campo CMP-DEMO y profesionales ficticios preaprovisionados; **no** se consulta el CMP | Validación oficial autorizada, vínculo laboral y recertificación |
| Identidad del paciente | Cuentas sintéticas preaprovisionadas con DNI, correo y contraseña | Acreditación oficial, verificación de contacto, recuperación de cuenta, MFA y representación legal |
| Persistencia | Un documento JSON (archivo, memoria o Redis) | PostgreSQL transaccional, concurrencia, copias de seguridad, registros inmutables y gestión de llaves |
| Autenticación | Hash scrypt y sesiones HttpOnly; **sin** MFA ni recuperación de cuenta | MFA, rotación de secretos, política de riesgo y proveedor de identidad |
| Integraciones | Tres redes de datos ficticios generadas en la misma aplicación | APIs autorizadas, autenticación mutua, interoperabilidad con IPS y COREPE y pruebas de conformidad |
| Informes | Tablas sintetizadas con formato imprimible | Documentos originales firmados, estados, revisión y paneles multiparámetro reales |
| Seguridad avanzada | Básica, solo para demostración | Pentest, modelado de amenazas, OWASP ASVS, cifrado regulado, auditoría independiente y cumplimiento legal |
| Catálogo clínico | 21 exámenes con referencias docentes en `site/lib/catalogo-clinico.ts` | Laboratorios acreditados, referencias por método, sexo y edad y revisión médica |

**No desplegar esta versión con pacientes reales.** Las credenciales de demostración son públicas.

## Estructura

```
site/app/ingresar/                   ingreso (interfaz)
site/app/medico/, site/app/paciente/ portales, con sesión y rol verificados
site/app/api/portal/[accion]/        API del portal, con autorización en el servidor
site/app/api/terminologia/           nombres oficiales de LOINC (tx.fhir.org)
site/lib/server/auth.ts              cuentas, sesiones, autorizaciones y auditoría
site/lib/server/almacen.ts           dónde se guarda el estado (archivo, memoria o Redis)
site/lib/server/clinical.ts          resumen clínico a partir de las fuentes FHIR ficticias
site/lib/data.ts                     dataset sintético y recursos FHIR
site/lib/catalogo-clinico.ts         21 exámenes, unidades, muestras y referencias
site/lib/establecimientos-sjl.ts     32 sedes referenciales de SJL
site/components/portal/              interfaz del portal, historial e informes
site/tests-v2.cjs                    pruebas de permisos, sesiones y auditoría
site/tests-smoke-sjl.cjs             pruebas del dataset
```

## Pruebas

```bash
cd site
npm run test:sjl   # dataset: pacientes, sedes, exámenes, atenciones y resultados
npm run test:v2    # servidor: login, aislamiento, permisos, revocación, auditoría y caída parcial
npm run build
```

## Documentación técnica y fuentes

- FHIR R4 `Encounter`: <https://hl7.org/fhir/R4/encounter.html>
- FHIR R4 `DiagnosticReport`: <https://hl7.org/fhir/R4/diagnosticreport.html>
- COREPE / IPS Perú (borrador): <https://dyaku.minsa.gob.pe/guides/index.html>
- Colegio Médico del Perú, buscador público: <https://conoceatumedico.cmp.org.pe/>
- MedlinePlus, interpretación de resultados: <https://medlineplus.gov/spanish/pruebas-de-laboratorio/como-entender-sus-resultados-de-pruebas-de-laboratorio/>
- ADA, Standards of Care 2026: <https://diabetesjournals.org/care/issue/49/Supplement_1>
