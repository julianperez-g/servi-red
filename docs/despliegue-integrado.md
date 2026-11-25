# Despliegue integrado

Este despliegue se mantiene en la rama **`deploy/vercel-integrado`**. No utiliza ni modifica el proyecto Vercel `estudio`.

## Servicios y acceso

| Componente | Proyecto / ubicación |
|---|---|
| Web Next.js | [servi-red-plataforma](https://vercel.com/kevinggaitans-projects/servi-red-plataforma) |
| Indicadores | [servi-red-indicadores](https://vercel.com/kevinggaitans-projects/servi-red-indicadores), https://servi-red-indicadores.vercel.app |
| RabbitMQ y worker | [servi-red-integrado en Railway](https://railway.com/project/0d093e6b-3cbf-4d03-ba4d-6fa0c20ad798) |

Los proyectos de Vercel pertenecen a la cuenta `kevinggaitan`; el proyecto Railway pertenece al workspace de Kevin Garay. Accede con las cuentas que autorizaron las CLI. Los contenedores de Railway tienen consumo facturable y pueden detenerse si se agotan los créditos del plan.

**La base de datos, las cuentas y Storage siguen siendo los del Supabase existente.** Este despliegue es independiente en alojamiento, pero no en datos: crear o modificar reportes afecta a la misma base. Para aislar los datos, crea otro proyecto Supabase, aplica sus migraciones y cambia las conexiones de la web, worker e indicadores.

## Conexiones

```text
Navegador → Next.js en Vercel → indicadores en Vercel → PostgreSQL (solo lectura)
                            → RabbitMQ en Railway (AMQPS/TLS)
                                        ↓ red privada cifrada de Railway
                                      worker → PostgreSQL
```

En RabbitMQ se monta `/var/lib/rabbitmq` en un volumen persistente y se conserva el nombre de nodo `rabbit@localhost`. Solo se publica el puerto TLS `5671` mediante TCP Proxy. El puerto AMQP `5672` es para el worker por la red privada; no se publica la interfaz de administración.

La CA privada se configura únicamente en el cliente AMQPS; se verifica el certificado y el hostname del broker. No se usa `rejectUnauthorized=false`. El certificado del servidor dura un año: debe renovarse antes de vencer, o sustituirse por un certificado de una CA pública para un dominio propio. La clave privada de la CA queda solo en el archivo local privado, no en Railway ni en Vercel.

## Variables

### Web: `servi-red-plataforma`

| Variable | Tipo / uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Configuración pública que necesita el navegador. |
| `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Secretos de servidor. |
| `INDICADORES_SERVICE_URL` | `https://servi-red-indicadores.vercel.app` |
| `INDICADORES_API_KEY` | Secreto compartido con el servicio de indicadores. |
| `RABBITMQ_URL` | Secreto `amqps://...` del TCP Proxy, nunca localhost. |
| `RABBITMQ_CA_CERT_BASE64` | Certificado CA codificado en base64 para verificar el broker. |
| `RABBITMQ_QUEUE` | `servi-red.reportes` |

Las conexiones privadas están configuradas en Production y Preview. Las variables `NEXT_PUBLIC_*` no pueden guardarse como Secret porque son públicas por diseño. No se publican las variables del operador demo ni se habilita su acceso de operador en producción.

### RabbitMQ en Railway

`RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`, `RABBITMQ_DEFAULT_VHOST`, `RABBITMQ_ERLANG_COOKIE`, `RABBITMQ_CA_CERT_BASE64`, `RABBITMQ_TLS_CERT_BASE64`, `RABBITMQ_TLS_KEY_BASE64` y `RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS`.

### Worker en Railway

Solo `DATABASE_URL`, `RABBITMQ_URL` (dirección privada del broker, con referencias a sus variables) y `RABBITMQ_QUEUE`. No necesita claves de Supabase Auth, Storage o indicadores. No necesita dominio público.

Los valores locales están en `.env.local`, `.env.indicadores.vercel.local` y `.env.rabbitmq.production.local`, excluidos de Git. `.vercelignore` excluye también los archivos privados del paquete de despliegue. No subas ni envíes estos archivos por canales públicos.

## Publicar cambios desde esta rama

```bash
git switch deploy/vercel-integrado
npm ci
npm run test:messaging
npm run test:indicadores
npm run build

# Comprobar primero que la CLI esté vinculada al proyecto correcto.
npx vercel project inspect servi-red-plataforma --scope kevinggaitans-projects
npx vercel deploy --prod --yes --scope kevinggaitans-projects
```

La raíz local ya está vinculada a `servi-red-plataforma`. En otro equipo, vincúlala explícitamente con `npx vercel link --project servi-red-plataforma --scope kevinggaitans-projects`. Configura los secretos en el panel del proyecto antes de desplegar.

Los contenedores se publican por separado desde la raíz del repositorio:

```bash
npx @railway/cli link --project 0d093e6b-3cbf-4d03-ba4d-6fa0c20ad798
npx @railway/cli up services/rabbitmq --path-as-root --service rabbitmq --environment production
npx @railway/cli up worker --path-as-root --service worker --environment production
```

El worker utiliza `npm ci` con su propio lockfile. Cambiar variables requiere un nuevo despliegue para que los procesos las carguen. Cambiar `RABBITMQ_DEFAULT_PASS` no cambia un usuario que ya existe en el volumen: rota la contraseña con las herramientas administrativas de RabbitMQ y actualiza los clientes de forma coordinada. No borres el volumen para rotar credenciales.

## GitHub y despliegues automáticos

La rama está publicada en [GitHub](https://github.com/julianperez-g/servi-red/tree/deploy/vercel-integrado). El intento de conectar el repositorio al nuevo proyecto Vercel fue rechazado por permisos de la integración. Esto no impide los despliegues manuales mediante CLI.

Para habilitar automatización, el propietario del repositorio debe permitir que la GitHub App de Vercel acceda a `julianperez-g/servi-red`. Después conecta **este proyecto nuevo** y selecciona `deploy/vercel-integrado` como Production Branch en Vercel. No cambies la configuración del proyecto original. Railway también requiere autorización de su propia GitHub App si se desean despliegues automáticos de los contenedores; sus directorios raíz serían `services/rabbitmq` y `worker`.

## Crear credenciales para otro broker

Crea primero el TCP Proxy hacia `5671`, y ejecuta una sola vez:

```bash
npm run setup:rabbitmq:production -- --hostname DOMINIO_TCP --port PUERTO_TCP
```

Requiere OpenSSL. Genera una CA, un certificado para ese hostname y contraseñas aleatorias en `.env.rabbitmq.production.local`. El script se niega a sobrescribir credenciales existentes; no es un mecanismo de renovación ni de rotación de usuarios de un broker ya iniciado.
