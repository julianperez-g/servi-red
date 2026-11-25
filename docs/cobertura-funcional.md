# Cobertura funcional de incidentes

Esta ampliación se aplica a **reportes ciudadanos**, no a las denuncias anónimas. No requiere otro microservicio: amplía formulario, API, contrato de RabbitMQ y worker existentes.

## Alcance

Se conserva el catálogo de cinco servicios. `Aseo y residuos` continúa siendo un solo servicio; no se crea un sexto servicio ni se cambian IDs existentes.

| Servicio | Categorías específicas | Tipo genérico compatible |
|---|---|---|
| Alcantarillado | Obstrucción/taponamiento, desbordamiento, daño de red | `FALLA` |
| Aseo y residuos | Recolección no realizada, acumulación de residuos | `FALLA` |
| Aseo y residuos | Barrido/limpieza deficiente | `BAJA_CALIDAD` |

Los estados y permisos existentes se conservan: `REPORTADO → EN_ATENCION → RESUELTO`, con acciones, fecha de solución y confirmación ciudadana/reapertura. Para saneamiento la interfaz habla de **solución de la afectación**, no necesariamente de «volvió el servicio». Fuera de alcance: planificación de rutas y frecuencias oficiales de recolección, facturación, modelos hidráulicos, inventario de redes y verificación técnica del prestador.

## Inicio estimado

`fecha_inicio_estimada` es opcional y corresponde a cuándo el ciudadano cree que **comenzó el incidente**. No es una previsión de atención del operador ni sustituye la fecha de registro. El formulario interpreta `datetime-local` explícitamente en Colombia (`UTC−5`), independientemente de la zona del navegador, y envía UTC con zona explícita.

Se rechazan calendarios inválidos, fechas futuras y fechas posteriores al registro. Si no se conoce, se guarda `NULL`; los datos históricos no se rellenan con `fecha_reporte`.

## Área afectada

El mapa permite marcar un punto, dibujar hasta 100 vértices, deshacer, terminar o borrar el contorno. El envío queda deshabilitado mientras se dibuja. Es opcional si se desconoce la extensión.

Se envía solo un GeoJSON `Polygon` WGS84, con un anillo cerrado sin agujeros. Navegador, API y worker comparten la validación en `shared/reportes/cobertura.mjs`: rango aproximado de Colombia, pares `[longitud, latitud]`, puntos finitos, vértices únicos, contorno no degenerado y sin cruces. El punto de referencia debe quedar dentro o sobre el área. Cambiar de municipio descarta el área anterior.

PostGIS valida otra vez la geometría **antes de publicar el mensaje**, y un trigger vuelve a calcular la superficie al persistir. Se usa `ST_Area(geometry::geography)` con WGS84 y se guarda `area_afectada_m2` (m²). No se acepta una superficie calculada/enviada por el navegador como fuente de verdad. La interfaz convierte solo la presentación a hectáreas o km² cuando conviene.

El contorno es una **estimación ciudadana de la afectación**, no la cobertura de la empresa, una delimitación oficial o prueba de afectación de cada inmueble. No se valida contra límites municipales oficiales porque no se incorporó esa cartografía. No se suman polígonos como superficie única: pueden solaparse.

## Lectura y exportación

- Operadores: categoría, inicio, superficie y polígono en el mapa privado, bajo los mismos permisos empresa/servicio.
- Ciudadano: los mismos datos de sus propios reportes y un mapa de área a petición.
- CSV público: conserva sus columnas anteriores; `fecha_inicio` se rellena solo cuando existe la estimación y `magnitud_area` con la superficie del servidor. Se agregan `unidad_area=m2`, `origen_fecha_inicio=ESTIMADA_CIUDADANO` y `categoria_incidente`.
- **No se exportan coordenadas del punto ni del polígono**, identidades o imágenes. Resultado de validación y fecha de primera respuesta siguen sin implementarse en ese CSV; no se inventan.

Las lecturas usan claves opcionales de `to_jsonb(r)`: pueden mostrar los registros existentes aunque la migración aún no esté aplicada. Intentar registrar los campos nuevos sin migración devuelve `503` con un mensaje explícito, en lugar de anunciar éxito y perder esos campos.

## Indicadores

Todos los servicios siguen contando en los totales de incidentes/estados/severidades. Frecuencia y duración de **cortes** se limitan a agua, energía y gas (IDs 1/2/3). Alcantarillado y aseo/residuos indican «continuidad: no aplica»; su resolución no se equipara a cortes de red.

La duración histórica se mantiene desde `fecha_reporte` hasta `fecha_restablecimiento`: la nueva fecha estimada no recalcula silenciosamente esa duración. Los antiguos registros `CORTE` de saneamiento permanecen almacenados, pero dejan de contribuir a los agregados de continuidad al actualizar el servicio de indicadores.

## Activación posterior (no ejecutada automáticamente)

**La migración está preparada, pero no se aplica a Supabase por ejecutar el build ni las pruebas.** La base compartida y los despliegues deben actualizarse de forma coordinada, cuando se autorice publicar:

1. Aplicar `supabase/migrations/20261126000000_cobertura_funcional.sql`, que añade columnas opcionales, validación, restricciones y cálculo de área. Los registros antiguos conservan `NULL`. La función de cálculo no se concede a `PUBLIC`, `anon` o `authenticated` como RPC público.
2. Construir y actualizar el worker **antes de publicar la nueva web**. Admite mensajes antiguos sin los campos nuevos; no consume con un esquema sin migrar. Los errores permanentes de contrato/validación no se reencolan indefinidamente. Si se usan usuarios dedicados de BD en lugar del propietario, concederles expresamente las operaciones necesarias y `EXECUTE` de la función de cálculo; no abrirla al público.
3. Actualizar indicadores y después la app. Mantener los permisos actuales de lectura y autorización de reportes. No subir archivos `.env`.

### Importante: nuevo contexto de build del worker

El contrato se comparte físicamente entre web y worker para no duplicar reglas. Por eso el Dockerfile del worker se construye ahora **desde la raíz**, no desde `worker/`:

```bash
docker build -f worker/Dockerfile -t servi-red-worker .
# Solo después de aplicar la migración correspondiente:
docker compose up -d --build worker
```

`compose.yaml` ya contiene el contexto correcto. `.dockerignore` es una lista cerrada: solo entran el código/package del worker y el contrato compartido; no secretos, frontend, otras imágenes o `node_modules`.

Para un futuro despliegue Railway del worker, usar raíz del repositorio y ruta de configuración `worker/railway.toml`, cuyo Dockerfile es `worker/Dockerfile`; **no** usar `up worker --path-as-root`. Tras configurar esos paths en el servicio, publicar desde la raíz con `npx @railway/cli up --service worker --environment production`. Estos cambios no se realizan contra Railway por editar los archivos locales.

## Pruebas aisladas

```bash
npm ci
npm --prefix worker ci
npm run test:cobertura
```

La integración SQL se activa con `COBERTURA_TEST_DATABASE_URL` y solo acepta una base **local** llamada `servired_cobertura_test`. Nunca debe apuntarse a Supabase. Debe estar vacía o ser el fixture desechable de estas pruebas y permitir crear PostGIS en el esquema `extensions`.

Se prueban todas las categorías, fecha de Colombia/calendario/futuro, punto y polígono, geometrías inválidas, migración repetible, mensajes antiguos, worker con su propia versión de `postgres`, duplicados y superficie recalculada aunque se intente sobrescribir. El fixture limpia únicamente sus reportes de prueba. Las pruebas de interfaz pueden simular autenticación/envío para no crear usuarios o incidentes reales en la base compartida.

### Verificación local de esta ampliación

- Cobertura: 6 pruebas aprobadas, incluida la integración con PostGIS y todas las categorías de los servicios 4/5.
- Mensajería: 4 aprobadas. Denuncias: 25 aprobadas y 1 omitida por falta de su fixture SQL. Indicadores: 36 aprobadas y 1 omitida por falta de su fixture SQL; la integración de saneamiento sí se comprobó en el fixture de cobertura.
- La imagen Docker del worker se construyó y se verificó sin iniciar el consumidor contra la base compartida; contiene el contrato, pero no archivos `.env` ni las pruebas del contrato.
- La prueba de navegador quedó pendiente: el servidor local existente en el puerto 3000 no respondió. No se reinició ese proceso ni se crearon usuarios/reportes reales para intentar completarla.
