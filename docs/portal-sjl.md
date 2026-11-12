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

Abrir <http://localhost:3000>: la raíz es el ingreso. La interfaz se presenta como **Kipu**, el nombre del producto.

## Usuarios de prueba

| Perfil | Identificador | Correo | Contraseña |
|---|---|---|---|
| Médica ficticia | CMP-DEMO-001 | `medico.demo@sjl.test` | `DemoMedico2026!` |
| Médico ficticio 2 | CMP-DEMO-002 | `medico2.demo@sjl.test` | `DemoMedico2026!` |
| Paciente 1 | DNI 90000001 | `paciente01@demo.sjl.test` | `DemoPaciente2026!` |
| Paciente 2 | DNI 90000002 | `paciente02@demo.sjl.test` | `DemoPaciente2026!` |

Hay 24 cuentas de pacientes: `paciente01` a `paciente24`, con DNI `90000001` a `90000024` y la misma contraseña de
demostración. El ingreso no muestra ni rellena credenciales: hay que escribirlas.
Estas credenciales son públicas y no protegen información real.

## Recorrido para la exposición

1. Entrar como médica (`CMP-DEMO-001`). **Mis pacientes** muestra sus **Citas de hoy** (la agenda que en producción
   registra admisión). Pulsar **Abrir historia** en la cita de las 08:00: se abre sin pedir nada al paciente, solo
   para la médica de esa cita y solo hasta el fin del día. Recorrer **Resumen**, **Atenciones**, **Exámenes**,
   **Medicamentos**, **Informes** y **Antes de pedir un examen**.
2. Paciente sin cita: en **Código por SMS**, escribir el DNI `90000009` y pulsar **Enviar**. En otra ventana, entrar
   como paciente `90000009`: en **Autorizaciones** aparece el SMS con el código de seis dígitos. Escribirlo en el
   portal de la médica y pulsar **Abrir** (acceso de una hora, un solo uso, cinco intentos como máximo).
3. Como paciente `90000001`, en **Autorizaciones**, la cita figura como acceso activo **En tu cita** y se puede
   **Retirar permiso**. El interruptor **Durante tus citas** desactiva este acceso: desde entonces la médica ve
   "Pide autorizar en cada consulta" y debe usar el código SMS.
4. **Quién vio mi historia** muestra cada apertura, con el canal usado.
5. Siguen disponibles **Pedir acceso a distancia** (el paciente lo aprueba desde su cuenta, útil antes de una
   interconsulta) y el **Acceso de emergencia**. Sin internet, el enlace **¿Sin internet? Leer el carné QR** abre el
   lector del carné firmado. La llave QR de consulta se retiró: la cita y el código SMS cubren ese caso.
6. Si se retira un permiso con la historia abierta, se oculta en la siguiente verificación (al volver a enfocar la
   pestaña o cada 15 s). Esto no puede borrar información ya vista.

## Qué está implementado

- Portales diferenciados para médico y paciente, con el rol verificado en el servidor.
- Ingreso con correo, contraseña y código CMP ficticio o DNI sintético. Las contraseñas se derivan con scrypt y sal
  individual.
- Sesiones aleatorias y revocables, guardadas como hash en el servidor, con cookie HttpOnly, SameSite=Lax y Secure en
  producción. Límite de 5 intentos fallidos por cuenta (bloqueo de 15 minutos) y validación de `Origin` en los POST.
- Acceso a un expediente solo por el propio paciente o por el médico destinatario de una autorización vigente,
  comprobado en cada consulta.
- Acceso durante la cita: el médico de una cita del día abre la historia sin pasos extra; vence al terminar el día.
  Se basa en un consentimiento que el paciente da una vez y puede desactivar, y cada acceso se puede retirar.
- Código por SMS de seis dígitos para pacientes sin cita o sin smartphone: vence en 10 minutos, sirve una vez, se
  invalida tras cinco intentos y queda en la bitácora. El envío real requiere un proveedor de SMS; en el prototipo el
  mensaje aparece en la cuenta del paciente.
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

## MVP2: carné sin conexión y resultados aportados por el paciente

- **Carné QR sin conexión** (portal del paciente, «Mi carné sin conexión»): el resumen (alergias, condiciones,
  medicamentos vigentes y últimos exámenes) va dentro del QR, firmado con ECDSA P-256 (`lib/carnet.ts`). Vence a
  los 30 días. No cifra: quien lo escanee puede leerlo.
- **Lector del médico** (`/leer`): escanea con la cámara, desde una foto o pegando el código; verifica la firma en
  el navegador y cruza alergias con medicamentos. Un trabajador de servicio (`public/sw.js`) guarda la página y la
  clave pública, así que funciona sin internet después de abrirla una vez con conexión. Esa lectura no queda en la
  bitácora, porque ocurre fuera de línea.
- **Digitalizar resultado** (portal del paciente): la foto de un resultado en papel se lee con IA
  (`lib/server/digitalizar.ts`, modelo `claude-opus-5-5`, salida JSON con esquema). El código LOINC solo puede ser
  uno del catálogo ya verificado. El paciente no escribe ni corrige valores: confirma que la lectura coincide con su papel (puede quitar un examen) o la descarta. Lo guardado sale siempre de la lectura, y cada descarte queda en el registro para medir la calidad de la IA.
  Cada imagen se lee una vez (se guarda el resultado por el hash, no la imagen) y hay un límite de 10 lecturas por
  día. Los resultados quedan marcados «aportados por el paciente» y separados de los de las redes. Hay dos
  resultados ficticios de ejemplo en `public/demo/`.

| Variable | Para qué | Si falta |
|---|---|---|
| `ANTHROPIC_API_KEY` | Lectura de fotos con IA | El botón «Leer con IA» avisa que no está configurada; no hay ingreso a mano |
| `QR_FIRMA_JWK` | Clave privada P-256 (JWK) con que se firman los carnés | Se genera una y se guarda en el almacén del portal |

## Dónde se guarda el estado

Cuentas, sesiones, solicitudes y bitácora se guardan como un único documento JSON (`site/lib/server/almacen.ts`):

| Modo | Cuándo se usa | Características |
|---|---|---|
| Archivo | Desarrollo local | `site/.demo-state/portal.json`, excluido de Git |
| Redis | Si existen `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` y `KV_REST_API_TOKEN`) | Base compartida; el estado sobrevive a reinicios |
| Sin almacén | En Vercel sin Redis | El portal no arranca: el ingreso muestra un aviso y la API responde 503 con la causa |

**En Vercel, Redis es obligatorio.** Cada ruta corre como una función distinta, sin memoria ni disco compartidos. Si el
estado viviera en memoria, la sesión creada por `/api/portal/login` no sería visible para la página `/medico`, que
corre en otra función, y el ingreso parecería no hacer nada. Por eso, sin Redis, el portal avisa en lugar de simular.

Para conectarlo: en el proyecto de Vercel, **Storage > Marketplace > Upstash Redis** (plan gratuito), conectarlo a los
entornos **Production y Preview** y volver a desplegar. Las variables se crean solas.
## Limitaciones respecto del plan maestro

| Tema | Situación actual | Para un piloto real |
|---|---|---|
| CMP y habilitación del médico | Campo CMP-DEMO y profesionales ficticios preaprovisionados; **no** se consulta el CMP | Validación oficial autorizada, vínculo laboral y recertificación |
| Identidad del paciente | Cuentas sintéticas preaprovisionadas con DNI, correo y contraseña | Acreditación oficial, verificación de contacto, recuperación de cuenta, MFA y representación legal |
| Agenda y SMS | Agenda de ejemplo generada cada día; el SMS se muestra en la cuenta del paciente | Integración con el sistema de admisión de cada sede y un proveedor de SMS con número verificado del paciente |
| Persistencia | Un documento JSON (archivo local o Redis) | PostgreSQL transaccional, concurrencia, copias de seguridad, registros inmutables y gestión de llaves |
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
site/lib/server/almacen.ts           dónde se guarda el estado (archivo local o Redis)
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
npm run test:v2    # servidor: login, aislamiento, permisos, revocación, auditoría, caída parcial y almacén
npm run build
```

## Documentación técnica y fuentes

- FHIR R4 `Encounter`: <https://hl7.org/fhir/R4/encounter.html>
- FHIR R4 `DiagnosticReport`: <https://hl7.org/fhir/R4/diagnosticreport.html>
- COREPE / IPS Perú (borrador): <https://dyaku.minsa.gob.pe/guides/index.html>
- Colegio Médico del Perú, buscador público: <https://conoceatumedico.cmp.org.pe/>
- MedlinePlus, interpretación de resultados: <https://medlineplus.gov/spanish/pruebas-de-laboratorio/como-entender-sus-resultados-de-pruebas-de-laboratorio/>
- ADA, Standards of Care 2026: <https://diabetesjournals.org/care/issue/49/Supplement_1>
