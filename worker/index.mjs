
import amqp from "amqplib";
import postgres from "postgres";

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE = process.env.RABBITMQ_QUEUE || "servi-red.reportes";
const BUCKET = "evidencias-reportes";

if (!RABBITMQ_URL || !DATABASE_URL) {
  throw new Error("Faltan RABBITMQ_URL o DATABASE_URL");
}

const sql = postgres(DATABASE_URL, {
  max: 5,
  ssl: "require",
  prepare: false,
  connect_timeout: 15,
});

const tipos = ["CORTE", "FALLA", "BAJA_CALIDAD"];
const severidades = ["BAJA", "MEDIA", "ALTA"];

function validarEvidencia(evidencia) {
  if (evidencia == null) return null;

  if (
    typeof evidencia !== "object" ||
    Array.isArray(evidencia)
  ) {
    throw new Error("Evidencia invalida");
  }

  const {
    bucket,
    ruta,
    tipo,
    tamano,
  } = evidencia;

  if (
    bucket !== BUCKET ||
    typeof ruta !== "string" ||
    !/^temporales\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(ruta) ||
    !["image/jpeg", "image/png", "image/webp"].includes(tipo) ||
    !Number.isSafeInteger(tamano) ||
    tamano <= 0 ||
    tamano > 450 * 1024
  ) {
    throw new Error("Datos de evidencia invalidos");
  }

  return {
    bucket,
    ruta,
    nombreArchivo: ruta.split("/").pop(),
    tipoMime: tipo,
    tamanoBytes: tamano,
  };
}

function validarEvento(evento) {
  if (
    !evento ||
    evento.tipo !== "REPORTE_CREADO" ||
    typeof evento.eventoId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      evento.eventoId
    )
  ) {
    throw new Error("Evento invalido");
  }

  const d = evento.datos;

  if (!d || typeof d !== "object") {
    throw new Error("Datos del reporte invalidos");
  }

  if (
    !Number.isSafeInteger(d.municipioId) ||
    d.municipioId <= 0 ||
    !Number.isSafeInteger(d.servicioId) ||
    d.servicioId <= 0 ||
    !tipos.includes(d.tipoNovedad) ||
    !severidades.includes(d.severidad) ||
    typeof d.descripcion !== "string" ||
    d.descripcion.trim().length < 10 ||
    d.descripcion.length > 2000 ||
    !Number.isFinite(d.latitud) ||
    !Number.isFinite(d.longitud) ||
    d.latitud < -4.3 ||
    d.latitud > 13.5 ||
    d.longitud < -82 ||
    d.longitud > -66
  ) {
    throw new Error("Reporte no cumple validaciones");
  }

  return {
    ...d,
    evidencia: validarEvidencia(d.evidencia),
  };
}

async function guardarReporte(evento, d) {
  return sql.begin(async (tx) => {
    const insertados = await tx`
      INSERT INTO public.reportes (
        id,
        municipio_id,
        servicio_id,
        tipo_novedad,
        descripcion,
        severidad,
        estado,
        estado_ingesta,
        ubicacion,
        fecha_reporte
      )
      VALUES (
        ${evento.eventoId}::uuid,
        ${d.municipioId},
        ${d.servicioId},
        ${d.tipoNovedad},
        ${d.descripcion.trim()},
        ${d.severidad},
        'REPORTADO',
        'PROCESADO',
        extensions.ST_SetSRID(
          extensions.ST_MakePoint(
            ${d.longitud},
            ${d.latitud}
          ),
          4326
        )::extensions.geography,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;

    if (d.evidencia) {
      const e = d.evidencia;

      await tx`
        INSERT INTO public.evidencias (
          reporte_id,
          storage_key,
          nombre_archivo,
          tipo_mime,
          tamano_bytes
        )
        SELECT
          ${evento.eventoId}::uuid,
          ${e.ruta},
          ${e.nombreArchivo},
          ${e.tipoMime},
          ${e.tamanoBytes}
        WHERE EXISTS (
          SELECT 1
          FROM public.reportes
          WHERE id = ${evento.eventoId}::uuid
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.evidencias
          WHERE reporte_id = ${evento.eventoId}::uuid
            AND storage_key = ${e.ruta}
        )
      `;
    }

    return insertados.length > 0;
  });
}

let conexion;
let canal;
let cerrando = false;

async function iniciar() {
  console.log("[WORKER] Iniciando SERVI-RED...");

  await sql`SELECT 1`;
  console.log("[WORKER] PostgreSQL conectado");

  conexion = await amqp.connect(RABBITMQ_URL);
  canal = await conexion.createChannel();

  await canal.assertQueue(QUEUE, {
    durable: true,
  });

  await canal.prefetch(1);

  console.log(`[WORKER] Escuchando cola: ${QUEUE}`);

  await canal.consume(
    QUEUE,
    async (mensaje) => {
      if (!mensaje) return;

      let evento;
      let datos;

      try {
        evento = JSON.parse(
          mensaje.content.toString("utf8")
        );

        datos = validarEvento(evento);
      } catch (error) {
        console.error(
          "[WORKER] Mensaje invalido:",
          error instanceof Error
            ? error.message
            : "Error desconocido"
        );

        canal.ack(mensaje);
        return;
      }

      try {
        const insertado = await guardarReporte(
          evento,
          datos
        );

        console.log(
          insertado
            ? `[WORKER] Reporte guardado: ${evento.eventoId}`
            : `[WORKER] Reporte ya existente: ${evento.eventoId}`
        );

        if (datos.evidencia) {
          console.log(
            `[WORKER] Evidencia asociada: ${datos.evidencia.ruta}`
          );
        }

        canal.ack(mensaje);
      } catch (error) {
        console.error(
          "[WORKER] Error procesando reporte:",
          error instanceof Error
            ? error.message
            : "Error desconocido"
        );

        canal.nack(mensaje, false, true);
      }
    },
    { noAck: false }
  );

  conexion.on("close", () => {
    if (!cerrando) {
      console.error("[WORKER] Conexion AMQP cerrada");
      process.exit(1);
    }
  });

  conexion.on("error", (error) => {
    console.error(
      "[WORKER] Error AMQP:",
      error.message
    );
  });
}

async function detener() {
  if (cerrando) return;
  cerrando = true;

  console.log("[WORKER] Cerrando servicio...");

  try {
    if (canal) await canal.close();
    if (conexion) await conexion.close();
    await sql.end();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", detener);
process.on("SIGINT", detener);

iniciar().catch(async (error) => {
  console.error(
    "[WORKER] Error al iniciar:",
    error.message
  );

  await sql.end();
  process.exit(1);
});
