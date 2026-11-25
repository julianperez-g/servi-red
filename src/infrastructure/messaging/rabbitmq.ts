
import "server-only";
import amqp from "amqplib";
import { configurarRabbitMQ } from "./rabbitmq-config.mjs";

const QUEUE_NAME =
  process.env.RABBITMQ_QUEUE || "servi-red.reportes";

export type EventoReporte = {
  eventoId: string;
  tipo: "REPORTE_CREADO";
  fechaEvento: string;
  datos: {
    ciudadanoId: string | null;
    municipioId: number;
    servicioId: number;
    tipoNovedad: "CORTE" | "FALLA" | "BAJA_CALIDAD";
    descripcion: string;
    severidad: "BAJA" | "MEDIA" | "ALTA";
    latitud: number;
    longitud: number;
  };
};

export async function publicarReporte(
  evento: EventoReporte
): Promise<void> {
  const { url, opciones } = configurarRabbitMQ();
  const conexion = await amqp.connect(url, opciones);

  try {
    const canal = await conexion.createConfirmChannel();

    try {
      await canal.assertQueue(QUEUE_NAME, {
        durable: true,
      });

      const mensaje = Buffer.from(
        JSON.stringify(evento),
        "utf-8"
      );

      const aceptado = canal.sendToQueue(
        QUEUE_NAME,
        mensaje,
        {
          persistent: true,
          contentType: "application/json",
          messageId: evento.eventoId,
          timestamp: Date.now(),
        }
      );

      if (!aceptado) {
        console.log(
          "Buffer AMQP lleno; esperando confirmacion del broker"
        );
      }

      await canal.waitForConfirms();

      console.log(
        `Evento publicado correctamente: ${evento.eventoId}`
      );
    } finally {
      await canal.close();
    }
  } finally {
    await conexion.close();
  }
}
