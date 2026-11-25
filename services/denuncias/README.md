# Microservicio de denuncias anónimas

Servicio HTTP independiente de Next.js y de RabbitMQ. Recibe sospechas de conexiones fraudulentas, limpia texto/fotos **antes de persistir** y ofrece moderación privada. Se ejecuta como contenedor Node.js 22 y usa una cuenta PostgreSQL dedicada, no la clave administradora de Supabase.

## Acceso desde la app

- En https://servi-red-plataforma.vercel.app/simulador pulsa **Denuncia anónima**. No requiere cuenta ni sesión.
- Los operadores entran en `/login` y abren **Moderar denuncias** (`/mapa/denuncias`). La API verifica la sesión en el servidor y solo permite casos de servicios asignados a la empresa del operador.
- Servicio de producción: https://denuncias-production-2c3a7d3a.up.railway.app. Solo `/health` es accesible sin clave; no es un formulario público.

```text
Formulario sin sesión → POST /api/denuncias (Next.js)
                        → HTTPS + clave de servicio → contenedor denuncias
                          → validar → limpiar texto y foto → PostgreSQL privado

Operador autenticado → API privada Next.js → contenedor + ID de operador verificado
                       → filtro por empresa/servicio → revisión y auditoría
```

## Qué significa «anónima»

No se piden ni guardan datos de quién envía: nombre, correo, documento, teléfono, cuenta ciudadana, sesión, IP, hash de IP, navegador o nombre original del archivo. El formulario usa `credentials: "omit"`; Next.js no reenvía cookies, tokens de usuario, IP, User-Agent ni cabeceras arbitrarias al microservicio. Este no registra cuerpos, fotos ni cabeceras en sus logs.

La lista de campos de entrada es cerrada: un campo adicional como `ciudadanoId`, `ip`, `correo` o `nombreArchivo` se rechaza. La ubicación opcional es la del **hecho denunciado**, no la del remitente; no se llama a la API de geolocalización del navegador. Las denuncias no se mezclan con `public.reportes`, «Mis reportes», el mapa público, indicadores o CSV.

### Texto

Antes de insertar se normaliza el texto y se sustituyen patrones de correo, teléfonos colombianos, contactos/documentos rotulados, IP, enlaces y algunas fórmulas explícitas de identificación por marcadores como `[correo omitido]`. No se guarda una copia del texto original. Los motivos de moderación pasan por la misma limpieza.

**Es una reducción de datos personales, no reconocimiento infalible de identidades.** Nombres arbitrarios, direcciones, documentos sin rotular, detalles contextuales u otros formatos pueden escapar al filtro. El usuario debe revisar lo que escribe; no se promete anonimato absoluto ni que todo texto libre quede desidentificado.

### Fotos opcionales

- Entrada: JPG, PNG o WebP estático, hasta 2 MiB y 16 megapíxeles. Se valida el formato decodificado, no solo el MIME declarado.
- Sharp decodifica, orienta y recodifica a WebP (hasta 1400 × 1400 y 450 KiB), **sin conservar EXIF/GPS, ICC, XMP o IPTC**.
- Solo los bytes recodificados se guardan en una columna `bytea` del esquema privado. No se almacena el original, su nombre, una URL pública ni un objeto sin limpiar en Storage.
- **No se ocultan rostros, placas, reflejos, documentos ni texto visible.** La interfaz avisa que pueden revelar identidades. No hay detector de rostros, OCR ni IA externa.

### Límites de infraestructura

Vercel, Railway, el proveedor de base de datos y otros intermediarios pueden mantener registros técnicos, incluso IP. La aplicación no controla ni garantiza eliminar todos esos logs. El mapa opcional carga teselas de OpenStreetMap y muestra un aviso antes de usarse. No cargues el mapa si no deseas contactar a ese tercero.

## Persistencia y permisos

La migración `supabase/migrations/20261125010000_denuncias_anonimas.sql` crea:

- `denuncias_privadas.denuncias`: ID/folio aleatorio, municipio, servicio, descripción limpia, punto opcional del hecho, imagen limpia opcional, estado y fechas del servidor.
- `denuncias_privadas.moderaciones`: transición, motivo limpio, fecha e ID del **moderador**, no del denunciante.

El esquema no se expone mediante las tablas públicas de Supabase; `PUBLIC`, `anon` y `authenticated` no tienen acceso. RLS se activa en ambas tablas. El grupo sin login `servired_denuncias_service` solo puede leer/insertar casos e historial, actualizar el estado/fecha y consultar columnas de catálogos y asignaciones empresa-servicio. No puede leer correos de operadores, escribir reportes ciudadanos, eliminar denuncias ni modificar evidencias/descripciones almacenadas.

Los scripts provisionan logins separados para desarrollo y producción. Ningún usuario ni contraseña existente se rota. La base sigue siendo el Supabase compartido del proyecto, pero los datos nuevos están en un esquema independiente. No se implementó purga automática; para una operación real debe acordarse la política de conservación y eliminación con el responsable del canal.

## Moderación

```text
PENDIENTE → EN_REVISION → ADMITIDA
     └───────────────→ DESCARTADA
                EN_REVISION → DESCARTADA
```

`ADMITIDA` significa admitida para investigación, **no fraude demostrado**. Todo cambio exige motivo, se registra en la misma transacción y verifica el estado esperado para evitar que dos operadores se sobrescriban. Los estados terminales no se reabren por esta API. Ningún estado publica automáticamente el caso o su foto.

## Desarrollo local

Desde la raíz:

```bash
npm ci
npm --prefix services/denuncias ci
npm run setup:denuncias
docker compose up -d --build denuncias
npm run dev
```

El setup aplica la migración de forma idempotente, crea/verifica un login de mínimo privilegio y guarda `.env.denuncias.local`. Añade `DENUNCIAS_SERVICE_URL=http://127.0.0.1:4002` y `DENUNCIAS_API_KEY` al entorno de Next.js. Reinicia el servidor de desarrollo si no recarga las variables.

Docker expone el servicio **solo en `127.0.0.1:4002`**. `/health` comprueba el esquema de la base y es el healthcheck del contenedor. No necesita RabbitMQ, el worker ni Supabase Storage.

## Contrato HTTP

Todas las rutas salvo `/health` requieren `Authorization: Bearer <DENUNCIAS_API_KEY>`. Las rutas de moderación requieren además `X-Operador-Id`, generado por Next.js **después de autenticar al operador**, nunca copiado de cabeceras del navegador. El microservicio comprueba la asignación empresa-servicio en SQL.

| Ruta | Uso |
|---|---|
| `GET /health` | `200` si el esquema responde, `503` en caso contrario. |
| `POST /v1/denuncias` | Recibe el hecho y devuelve `201 { folio, estado: "PENDIENTE" }` después del commit. |
| `GET /v1/moderacion?estado=PENDIENTE&pagina=0` | Hasta 20 casos de servicios autorizados; devuelve `hayMas`. |
| `PATCH /v1/moderacion/:id` | `{ estado, estadoEsperado, motivo }`, con auditoría y control de concurrencia. |
| `GET /v1/moderacion/:id/evidencia` | WebP privado, con autorización por empresa-servicio. |

Cuerpo de creación:

```json
{
  "municipioId": 1,
  "servicioId": 2,
  "descripcion": "Posible conexión directa a la red junto al poste de la esquina.",
  "latitud": 4.711,
  "longitud": -74.0721,
  "foto": { "tipo": "image/jpeg", "base64": "<bytes de la imagen en base64>" }
}
```

`latitud`/`longitud` y `foto` son opcionales; si se indica un punto deben enviarse ambas coordenadas. No existe API pública para listar o consultar el contenido usando el folio. Las respuestas e imágenes usan `Cache-Control: private, no-store`.

### Protección frente a abuso

Cuerpo limitado a 3 MiB en proxy y servicio, tiempo de petición limitado, máximo dos recepciones/procesamientos concurrentes por instancia y presupuesto de 20 intentos por minuto por instancia antes de procesar fotos. Una comprobación transaccional limita además a 20 inserciones por minuto para todo el esquema. **No se usa IP ni huella de usuario para estos límites.** Un atacante puede consumir ese presupuesto compartido; para mayor escala se requiere una protección antibot compatible con la política de privacidad. No se promete resistencia completa a spam o ataques distribuidos.

## Producción

```bash
npm run setup:denuncias -- --production
npx @railway/cli up services/denuncias --path-as-root --service denuncias --environment production
```

El primer comando genera `.env.denuncias.production.local` con un login y clave independientes de desarrollo. Configura **solo** `DATABASE_URL`, `DENUNCIAS_API_KEY` y `PORT=4002` en el servicio Railway. No subas archivos `.env` a la imagen, Git o canales públicos.

En el proyecto Vercel `servi-red-plataforma`, configura `DENUNCIAS_SERVICE_URL` con el origen HTTPS de Railway y `DENUNCIAS_API_KEY` con la clave de producción, ambas exclusivamente de servidor. La clave se guarda como Secret. Redepliega Next.js. `.vercelignore` excluye todos los `.env*` y los servicios Docker del paquete web. La GitHub App sigue pendiente de autorización; este servicio puede desplegarse con CLI sin tocar `estudio`.

## Pruebas

`npm run test:denuncias` ejecuta pruebas de validación/anonimización, fotos con EXIF real, autenticación entre servicios, privacidad de cabeceras, límites, moderación y proxy. La prueba de repositorio se omite si no se configura `DENUNCIAS_TEST_DATABASE_URL`.

Para incluirla, usa un contenedor PostgreSQL **desechable**, accesible solo en localhost, con base `servired_denuncias_test`, y establece esa variable. El fixture se niega a ejecutar contra otro nombre de base o host externo. **No apuntes esa variable al Supabase del proyecto.** Verifica también permisos reales con un login de prueba restringido, aislamiento entre empresas y conflictos de estado.

La verificación en navegador usa cuentas/casos temporales, comprueba que el envío no incluya cookies/tokens/nombre del archivo, inspecciona la fila y foto limpia, inicia sesión como operador y prueba evidencia/moderación; después elimina los fixtures.

### Verificación del despliegue — 25 de noviembre de 2026

- **26 pruebas aprobadas, sin omisiones**, incluyendo fixture PostgreSQL aislado, permisos reales, límites de 2 MiB/16 megapíxeles y foto con EXIF.
- Compilación local y en Vercel, TypeScript y ESLint de los archivos modificados: correctos. Auditoría del microservicio: sin vulnerabilidades reportadas.
- Contenedor local `servi-red-denuncias`: saludable en `127.0.0.1:4002`. Servicio Docker en Railway: `/health` responde `200`, rutas protegidas sin clave: `401`.
- Navegador Chrome real, tanto en desarrollo como en https://servi-red-plataforma.vercel.app: abrir el canal desde el simulador, adjuntar una imagen con EXIF, enviar sin sesión, recibir folio, verificar red sin cookie/token/nombre original y comprobar en SQL la descripción reducida y WebP sin EXIF/ICC/XMP.
- En ambos entornos: iniciar sesión con un operador creado temporalmente, abrir la bandeja privada, visualizar la evidencia y pasar el caso a revisión, con auditoría del operador. Se eliminaron después los casos, imágenes, auditorías, operadores y usuarios temporales.
- Vista móvil de 390 px sin desborde horizontal. En producción, texto con campo adicional de identidad rechazado (`400`); moderación e imágenes sin sesión, incluso con cabecera de operador falsificada, rechazadas (`401`); archivos `.env` no accesibles (`404`).
- `/api/health` y el dashboard existente siguen respondiendo `200`. Las pruebas existentes de mensajería pasaron (4); indicadores: 36 aprobadas y 1 fixture SQL omitido, independiente del fixture de denuncias que sí se ejecutó.
