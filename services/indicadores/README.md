# Servicio de indicadores

Servicio HTTP Node.js independiente de Next.js. Se puede ejecutar en Docker o como proyecto independiente de Vercel Functions; ambas entradas reutilizan `src/runtime.mjs` y los mismos cálculos SQL. No necesita RabbitMQ ni Supabase Auth.

## Configuración

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión TLS con un usuario dedicado de solo lectura, miembro de `servired_indicadores_reader`. |
| `INDICADORES_API_KEY` | Sí | Clave aleatoria privada de al menos 32 caracteres, compartida únicamente con el servidor Next.js. |
| `PORT` | No | Puerto de escucha; por defecto `4001`. El servicio escucha en `0.0.0.0`. |

El rol/políticas está en `supabase/migrations/20261125000000_indicadores_lectura.sql`. En desarrollo se aplica desde la raíz con `npm run setup:indicadores`, que genera un login independiente, comprueba que no pueda escribir ni leer descripciones, y guarda sus secretos en archivos excluidos de Git.

El grupo `servired_indicadores_reader` no puede iniciar sesión. En un despliegue externo, un administrador debe crear un login `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` miembro del grupo, con `default_transaction_read_only=on`. Usa una contraseña aleatoria almacenada en los secretos del proveedor, no una política para `anon`/`authenticated`. Si utilizas el pooler de Supabase, el usuario de conexión tiene el formato `<login>.<project-ref>`.

## Contrato HTTP

- `GET /health`: `200` si PostgreSQL responde; `503` en caso contrario. No devuelve datos ni credenciales de la base.
- `GET /v1/continuidad`: encabezado `Authorization: Bearer <clave>` y filtros opcionales:
  - `desde`, `hasta`: `YYYY-MM-DD`, ambos inclusive en `America/Bogota`.
  - `agrupacion`: `day`, `month` o `year`; por defecto `day`.
  - `municipio`: ID numérico entero positivo.
- `401`: falta clave o no coincide; `400`: filtros inválidos/repetidos; `405`: método no permitido; `503`: no se puede consultar la base.

La respuesta conserva la estructura del dashboard y agrega `continuidad`, por ejemplo:

```json
{
  "municipio_id": 1,
  "nombre": "Bogotá D.C.",
  "periodo": "2026-01-01",
  "reportes": 5,
  "cortes": 3,
  "cortes_resueltos": 2,
  "duracion_total_horas": 4.0,
  "duracion_promedio_horas": 2.0
}
```

Ese objeto es un elemento del arreglo `continuidad`, no la respuesta completa. Un municipio sin datos no genera filas; el resumen es cero y el promedio `null` si no hay cortes con duración válida. Se cuentan reportes, no incidentes únicos. La duración comienza en `fecha_reporte` y se atribuye al periodo de ese registro, sin dividirla entre días o meses. La validación ciudadana no cambia estos criterios existentes.

## Despliegue

### Proyecto independiente en Vercel

El directorio raíz del proyecto de indicadores debe ser **`services/indicadores`**, no la raíz de la app Next.js. `vercel.json` publica una función Node.js en `api/index.mjs` y reescribe `/health` y `/v1/continuidad` hacia esa entrada. La función usa la misma autenticación de servicio y las mismas consultas que Docker. Al terminar las peticiones concurrentes, `sql.close()` libera las conexiones y `waitUntil` de `@vercel/functions` permite completar el cierre antes de suspender la función; el pool puede reconectar en peticiones posteriores.

1. Inicia sesión en la CLI con `npx vercel login` y vincula **este directorio** a un proyecto separado, por ejemplo `servi-red-indicadores`.
2. Configura `DATABASE_URL` con la conexión dedicada de lectura y `INDICADORES_API_KEY` en los secretos de ese proyecto. Nunca uses `SUPABASE_SERVICE_ROLE_KEY` ni copies todas las variables de la app.
3. Publica el servicio y comprueba su dominio HTTPS de producción en `/health` y `/v1/continuidad`. Si la protección de despliegues de Vercel exige login incluso en el dominio de producción, permite llamadas servidor-servidor con un bypass de protección o ajusta la protección de ese proyecto; la API mantiene su propia clave obligatoria.
4. Configura `INDICADORES_SERVICE_URL` con el dominio estable del servicio e `INDICADORES_API_KEY` con la misma clave **en el proyecto Next.js principal**, y redepliega la app.

El despliegue en Vercel es serverless: no ejecuta la imagen Docker ni el proceso que escucha `PORT`. El contenedor local sigue siendo independiente y funcional. No uses una URL efímera de Preview como origen de producción.

El servicio está publicado en **https://servi-red-indicadores.vercel.app**, proyecto `servi-red-indicadores`. La configuración privada que debe copiarse al proyecto Next.js está en `.env.indicadores.vercel.local` en el equipo que realizó el despliegue; ese archivo está excluido de Git y no debe enviarse por canales públicos. La clave de producción es independiente de la usada en Docker local.

El acceso como colaborador de GitHub no otorga permisos sobre los proyectos de Vercel de otra cuenta. Si el proyecto principal no aparece en la cuenta autorizada, su propietario debe conceder acceso en Vercel o configurar `INDICADORES_SERVICE_URL` e `INDICADORES_API_KEY`, y desplegar el código actualizado de Next.js. Publicar este servicio no cambia automáticamente las variables ni el código de la app principal.

### Alternativa: proveedor de contenedores

1. Publica el contenedor usando `services/indicadores/Dockerfile` y el directorio `services/indicadores` como contexto de build.
2. Configura los secretos anteriores en el host de contenedores, sin copiar archivos `.env` al repositorio o a la imagen. Para una instancia pequeña se usan como máximo tres conexiones PostgreSQL; considera el total si replicas el servicio.
3. Usa `/health` para las comprobaciones del proveedor y un endpoint HTTPS con certificado válido. El TLS HTTP lo termina el proveedor/reverse proxy; el proceso Node escucha HTTP internamente.
4. En Vercel configura `INDICADORES_SERVICE_URL` con ese origen HTTPS y `INDICADORES_API_KEY` con la misma clave. No uses variables `NEXT_PUBLIC_` para estos valores.
5. Redepliega Next.js y comprueba `/api/dashboard`. No hay fallback que vuelva a ejecutar SQL en Next.js.

Vercel no ejecuta Docker Compose; la red local de Docker no publica el microservicio en Internet. El Dockerfile no despliega nada por sí mismo ni crea una URL pública.

## Pruebas

Desde la raíz, `npm run test:indicadores` ejecuta pruebas HTTP, validación y proxy sin usar datos reales. Las pruebas SQL se activan solo si existe `INDICADORES_TEST_DATABASE_URL`; esperan una base de pruebas aislada inicializada con `test/fixtures.sql`. **Nunca uses la base de Supabase del proyecto para esa variable**.

El fixture usa localidades homónimas, cortes abiertos, duraciones cero/inválidas y las fronteras de día/mes de Colombia. Las pruebas SQL verifican el conteo, promedios, filtro territorial, rango inclusivo y agrupación conjunta municipio/periodo.
