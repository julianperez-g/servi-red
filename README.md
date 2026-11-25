# SERVI-RED

Plataforma académica para registrar y consultar novedades de servicios públicos domiciliarios. Incluye un portal ciudadano, un panel de operación, indicadores públicos y exportaciones CSV.

## Requisitos

- Node.js y npm.
- PostgreSQL configurado mediante `DATABASE_URL`.
- Para las funciones de registro, RabbitMQ y las variables de Supabase configuradas en `.env.local`.

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Para iniciar RabbitMQ y el worker de procesamiento, revisa `compose.yaml` y configura las variables requeridas en `.env.local`.

## Datos abiertos y exportación CSV

El portal público está en `/dashboard` y ofrece dos descargas distintas:

- **Descargar indicadores CSV**: exporta estadísticas agregadas del dashboard.
- **Descargar reportes CSV**: descarga registros individuales a través de `GET /api/reportes/exportar`.

La exportación de reportes acepta estos filtros opcionales:

| Parámetro | Formato / valores |
|---|---|
| `desde`, `hasta` | Fecha `YYYY-MM-DD`; el rango incluye ambos días. |
| `servicio`, `municipio` | Identificador numérico. |
| `severidad` | `BAJA`, `MEDIA` o `ALTA`. |
| `estado` | `REPORTADO`, `EN_ATENCION` o `RESUELTO`. |
| `novedad` | `CORTE`, `FALLA` o `BAJA_CALIDAD`. |

Ejemplo: `/api/reportes/exportar?desde=2026-01-01&hasta=2026-01-31&severidad=ALTA`.

El CSV utiliza UTF-8 con BOM y separador punto y coma. Protege las celdas frente a fórmulas de hojas de cálculo y limita cada descarga a 50.000 reportes. La descripción se incluye para permitir búsquedas textuales. No se exportan coordenadas, identificadores personales ni evidencias.

### Campos solicitados y disponibilidad

El CSV incluye fecha del reporte, municipio, departamento, código DANE del departamento, tipo de novedad, servicio, severidad, estado y descripción. **Fecha de inicio, magnitud del área, resultado de validación y fecha de respuesta se exportan vacíos**: esos datos aún no están implementados en el esquema. No se infieren esos valores a partir de otros datos.

Para habilitar esos campos se deben definir primero sus tablas, columnas, unidades y relaciones en el esquema de datos, e incorporarlas al proceso de registro y gestión. La magnitud requiere una unidad explícita y la fecha de respuesta requiere acordar qué evento cuenta como primera respuesta.

La exportación está pensada para consulta pública y análisis. **No se afirma que el CSV cumpla formatos oficiales o regulatorios**; cualquier interoperabilidad requiere verificar previamente la especificación vigente de la entidad reguladora correspondiente.

## Indicadores de continuidad

El dashboard (`/dashboard`) y `GET /api/dashboard` muestran frecuencia de cortes y duración total/promedio estimada por servicio, municipio, departamento y periodo. La jerarquía territorial utiliza `municipios.departamento_id`; para departamentos se muestra también `codigo_dane`.

La API admite `desde` y `hasta` en formato `YYYY-MM-DD` y `agrupacion=day|month|year`. Los límites de fecha se interpretan en la zona horaria `America/Bogota`. El selector permite cambiar la agrupación temporal.

La frecuencia cuenta reportes de tipo `CORTE`, incluidos los que siguen abiertos. La duración solo considera cortes con fecha de restablecimiento válida y se calcula desde `fecha_reporte` hasta `fecha_restablecimiento`. El esquema aún no almacena una fecha real de inicio de la interrupción, por lo que esta duración es una **estimación desde el registro del reporte**, no el tiempo real desde que comenzó el corte.

## Restablecimiento y validación ciudadana

El ciudadano debe crear/iniciar sesión desde `/ciudadano` para que los nuevos reportes queden vinculados a su cuenta y aparezcan en **Mis reportes**. En un reporte activo puede indicar «Ya tengo servicio» y registrar fecha y hora. El operador revisa ese aviso y, desde el panel de gestión, registra la fecha/hora efectiva del restablecimiento y las acciones realizadas.

Al registrar el restablecimiento se crea una notificación dentro de **Mis reportes**. Una confirmación «Sí, volvió» valida el cierre; «Sigo sin servicio» lo marca como observado para que el operador pueda reabrir el caso. Las notificaciones son dentro de la aplicación web adaptable; no son notificaciones push del sistema operativo.

La migración `supabase/migrations/20261123212349_restablecimiento_comunitario.sql` agrega el vínculo ciudadano opcional para conservar reportes históricos/anónimos y las tablas de avisos, intentos de restablecimiento y notificaciones. Para despliegues nuevos, ejecuta las migraciones de Supabase antes de iniciar la aplicación.

## Cuenta de prueba para operador (desarrollo local)

El operador demo se provisiona mediante la API Admin de Supabase con el email confirmado en el servidor. No uses `signUp` repetidamente para iniciar sesión: provisiona la cuenta una vez y luego entra con email y contraseña. El script es idempotente; si se vuelve a ejecutar actualiza la misma cuenta demo y no manda correos. Supabase mantiene sus límites de seguridad para los intentos de inicio de sesión.

Después de rotar `SUPABASE_SERVICE_ROLE_KEY` (la clave anterior fue expuesta), agrega estos valores a `.env.local`. Elige una contraseña única de al menos 12 caracteres y no la compartas ni la subas al repositorio:

```dotenv
ALLOW_TEST_OPERATOR_PROVISIONING=true
TEST_OPERATOR_EMAIL=operador.demo@servi-red.test
TEST_OPERATOR_PASSWORD="elige-una-contraseña-larga-y-única"
```

Ejecuta `npm run seed:test-operator` una vez y entra en `/login` con el correo anterior y la contraseña configurada. La cuenta queda marcada como demo y el servidor rechaza su acceso de operador en producción; no habilites credenciales compartidas en un despliegue público.

## Comandos

```bash
npm run dev    # servidor de desarrollo
npm run lint   # análisis estático
npm run build  # compilación de producción
```
