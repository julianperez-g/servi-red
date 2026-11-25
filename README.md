# SERVI-RED

Plataforma académica para registrar y consultar novedades de servicios públicos domiciliarios. Incluye un portal ciudadano, un panel de operación, indicadores públicos y exportaciones CSV.

El despliegue independiente de la rama `deploy/vercel-integrado` (Vercel + Railway), sus conexiones y los pasos para publicar cambios están documentados en [la guía de despliegue integrado](docs/despliegue-integrado.md).

## Denuncias anónimas de conexiones sospechosas

En `/simulador`, pulsa **Denuncia anónima** para enviar sin cuenta un hecho y una foto opcional. El microservicio Docker limpia datos de contacto/IP del texto y recodifica fotos sin EXIF antes de guardarlas en un esquema privado, sin vincular al remitente. La limpieza no puede garantizar ocultar toda identidad escrita o visible: revisa los avisos del formulario. No se publican denuncias en el mapa, dashboard o exportaciones.

Los operadores autenticados abren **Moderar denuncias** en `/mapa/denuncias`, con permisos por empresa/servicio. Desarrollo: `npm run setup:denuncias` y `docker compose up -d --build denuncias`. Consulta [la guía del microservicio](services/denuncias/README.md) para privacidad, pruebas, configuración y despliegue.

## Requisitos

- Node.js y npm.
- PostgreSQL configurado mediante `DATABASE_URL`.
- Para las funciones de registro, RabbitMQ y las variables de Supabase configuradas en `.env.local`.

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Configura las variables requeridas en `.env.local`. Para preparar el microservicio de indicadores y su cuenta de base de datos de solo lectura:

```bash
npm run setup:indicadores
docker compose up -d --build rabbitmq worker indicadores
```

El setup agrega `INDICADORES_SERVICE_URL` y `INDICADORES_API_KEY` a `.env.local` y genera `.env.indicadores.local` con una conexión de lectura dedicada; ambos archivos son privados y están excluidos de Git. No cambia las contraseñas existentes. Si Next.js ya estaba abierto, reinícialo para cargar las nuevas variables.

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

La API admite `desde` y `hasta` en formato `YYYY-MM-DD`, `agrupacion=day|month|year` y el filtro opcional `municipio` (ID positivo). Los límites de fecha se interpretan en la zona horaria `America/Bogota`. El selector permite cambiar la agrupación temporal.

La frecuencia cuenta reportes de tipo `CORTE`, incluidos los que siguen abiertos. La duración solo considera cortes con fecha de restablecimiento válida y se calcula desde `fecha_reporte` hasta `fecha_restablecimiento`. El esquema aún no almacena una fecha real de inicio de la interrupción, por lo que esta duración es una **estimación desde el registro del reporte**, no el tiempo real desde que comenzó el corte.

### Microservicio independiente

Los cálculos residen en `services/indicadores/`. Next.js conserva `GET /api/dashboard` como proxy público: ya no calcula estadísticas ni consulta PostgreSQL en esa ruta. El navegador no recibe la clave del microservicio.

```text
Dashboard → /api/dashboard (Next.js) → /v1/continuidad (indicadores) → PostgreSQL
```

- Docker ejecuta `indicadores` en el puerto local `4001`, además de `rabbitmq` y `worker`.
- `GET /health` comprueba la conexión con PostgreSQL y es el healthcheck del contenedor.
- `GET /v1/continuidad` requiere `Authorization: Bearer <INDICADORES_API_KEY>`.
- Conserva `resumen`, `estados`, `severidades`, `servicios`, `municipios`, `departamentos` y `periodos`; añade `continuidad`, que cruza municipio y periodo. Los municipios se agrupan por ID para no mezclar localidades homónimas.
- Cada petición usa una consulta SQL parametrizada dentro de una transacción de solo lectura. El rol solo puede leer las columnas necesarias de reportes y catálogos.
- Los cortes se asignan al periodo del reporte; su duración completa se cuenta allí, aunque terminen después del rango. No se deduplican reportes que puedan describir el mismo corte ni se calculan índices regulatorios como SAIDI/SAIFI.
- Si el servicio no responde, el proxy devuelve `502` o `504`, nunca estadísticas vacías como si todo funcionara. Una configuración ausente devuelve `503` y filtros inválidos `400`.

La migración `supabase/migrations/20261125000000_indicadores_lectura.sql` crea el rol de grupo `servired_indicadores_reader` y políticas RLS exclusivas de ese rol. `npm run setup:indicadores` la aplica de forma idempotente y provisiona `servired_indicadores_local` sin modificar usuarios existentes. En otro entorno, crea una conexión dedicada miembro del rol de lectura; no uses la conexión administradora en el contenedor.

Consulta [la guía del servicio](services/indicadores/README.md) para su despliegue y las pruebas de integración.

### Conectar Vercel

El servicio puede publicarse como un **segundo proyecto de Vercel** con raíz `services/indicadores` (Vercel Functions), o como contenedor en un host accesible por **HTTPS**. Ambos usan el mismo runtime y cálculos. El proyecto del servicio necesita solo `DATABASE_URL` (usuario de lectura) e `INDICADORES_API_KEY`; el contenedor admite además `PORT`. Configura dos variables **de servidor** en el proyecto Next.js principal:

| Variable | Valor |
|---|---|
| `INDICADORES_SERVICE_URL` | Origen HTTPS del microservicio, sin ruta, por ejemplo `https://indicadores.tu-dominio.com`. |
| `INDICADORES_API_KEY` | La misma clave privada que tiene el microservicio. |

Configúralas para los entornos donde se vaya a usar el servicio y vuelve a desplegar Next.js. `localhost`, `127.0.0.1` y el nombre Docker `indicadores` **no son accesibles desde Vercel**. El proxy rechaza URLs locales/HTTP en producción. La URL de ejemplo no es un despliegue real.

Si usas la CLI, inicia sesión con `npx vercel login`, vincula el proyecto Next.js con `npx vercel link`, configura las variables con `npx vercel env add INDICADORES_SERVICE_URL production` y `npx vercel env add INDICADORES_API_KEY production`, y redepliega. Introduce los valores mediante la entrada interactiva; no pongas claves en comandos ni en el repositorio. No publiques ni envíes `.env.local` al contenedor: usa únicamente su configuración dedicada.

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
npm run test:indicadores # validación, HTTP y cliente proxy
```
