
import { NextResponse } from "next/server";
import {
  publicarReporte,
  type EventoReporte,
} from "@/infrastructure/messaging/rabbitmq";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { status: "error", message: "Ruta no disponible" },
      { status: 404 }
    );
  }

  try {
    const evento: EventoReporte = {
      eventoId: crypto.randomUUID(),
      tipo: "REPORTE_CREADO",
      fechaEvento: new Date().toISOString(),
      datos: {
        municipioId: 1,
        servicioId: 1,
        tipoNovedad: "CORTE",
        descripcion:
          "Reporte ficticio para comprobar la comunicacion con RabbitMQ.",
        severidad: "MEDIA",
        latitud: 4.711,
        longitud: -74.0721,
      },
    };

    await publicarReporte(evento);

    return NextResponse.json(
      {
        status: "ok",
        message: "Evento publicado en RabbitMQ",
        eventoId: evento.eventoId,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error(
      "Error publicando evento:",
      error instanceof Error
        ? error.message
        : "Error desconocido"
    );

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible publicar el evento",
      },
      { status: 503 }
    );
  }
}
