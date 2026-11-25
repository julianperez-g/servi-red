import amqp from "amqplib";
import postgres from "postgres";
import { validarEvento, guardarReporte } from "./procesador.mjs";

const {
  RABBITMQ_URL,
  DATABASE_URL,
  RABBITMQ_QUEUE = "servi-red.reportes",
} = process.env;

if (!RABBITMQ_URL || !DATABASE_URL) {
  throw new Error("Faltan RABBITMQ_URL o DATABASE_URL");
}

const sql = postgres(DATABASE_URL, {
  max: 5,
  ssl: "require",
  prepare: false,
  connect_timeout: 15,
});

let conexion;
let canal;
let cerrando = false;

async function iniciar() {
  // No consumir con un esquema antiguo: evita aceptar datos nuevos y perderlos silenciosamente.
  await sql`
    SELECT categoria_incidente, fecha_inicio_estimada,
      area_afectada_geojson, area_afectada_m2
    FROM public.reportes LIMIT 0
  `;
  console.log("[WORKER] PostgreSQL y esquema de cobertura disponibles");
  conexion = await amqp.connect(RABBITMQ_URL, { timeout: 15_000 });
  conexion.on("error", () => console.error("[WORKER] Error de conexión AMQP"));
  conexion.on("close", () => {
    if (!cerrando) process.exit(1);
  });
  canal = await conexion.createChannel();
  await canal.assertQueue(RABBITMQ_QUEUE, { durable: true });
  await canal.prefetch(1);
  await canal.consume(
    RABBITMQ_QUEUE,
    async (mensaje) => {
      if (!mensaje) return;

      let evento;
      let datos;
      try {
        evento = JSON.parse(mensaje.content.toString("utf8"));
        datos = validarEvento(evento);
      } catch {
        console.error("[WORKER] Mensaje rechazado: contrato no válido");
        canal.nack(mensaje, false, false);
        return;
      }

      try {
        const insertado = await guardarReporte(sql, evento, datos);
        console.log(
          `[WORKER] ${insertado ? "Reporte guardado" : "Reporte ya existente"}: ${evento.eventoId}`
        );
        canal.ack(mensaje);
      } catch (error) {
        const permanente = ["22023", "23514", "23503", "22P02"].includes(error.code);
        console.error(
          `[WORKER] Error ${permanente ? "permanente" : "transitorio"} al procesar reporte (${error.code || "INTERNAL"})`
        );
        canal.nack(mensaje, false, !permanente);
      }
    },
    { noAck: false }
  );
  console.log(`[WORKER] Escuchando cola: ${RABBITMQ_QUEUE}`);
}

async function detener() {
  if (cerrando) return;
  cerrando = true;
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
    `[WORKER] No se pudo iniciar (${error.code || "INTERNAL"}). Revisa la migración antes de consumir.`
  );
  await sql.end();
  process.exit(1);
});
