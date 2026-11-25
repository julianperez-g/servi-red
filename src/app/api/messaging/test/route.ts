
import { NextRequest, NextResponse } from "next/server";
import {
  publicarReporte,
  type EventoReporte,
} from "@/infrastructure/messaging/rabbitmq";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const hostname = request.nextUrl.hostname;

  const esLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (
    process.env.NODE_ENV !== "development" ||
    !esLocal
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: "Ruta no disponible",
      },
      { status: 404 }
    );
  }

  try {
    const evento: EventoReporte = {
      eventoId: crypto.randomUUID(),
      tipo: "REPORTE_CREADO",
      fechaEvento: new Date().toISOString(),
      datos: {
        ciudadanoId: null,
        municipioId: 1,
        servicioId: 1,
        tipoNovedad: "CORTE",
        descripcion:
          "Reporte ficticio para comprobar la comunicación con RabbitMQ.",
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
    console.error("Error publicando evento:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible publicar el evento",
      },
      { status: 503 }
    );
  }
}
