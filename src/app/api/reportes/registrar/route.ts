
import { NextRequest, NextResponse } from "next/server";
import { validarReporte } from "@/application/validators/validarReporte";
import {
  publicarReporte,
  type EventoReporte,
} from "@/infrastructure/messaging/rabbitmq";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentType =
      request.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        {
          status: "error",
          message: "Se requiere application/json",
        },
        { status: 415 }
      );
    }

    const longitudCuerpo =
      Number(request.headers.get("content-length") || 0);

    if (longitudCuerpo > 10_000) {
      return NextResponse.json(
        {
          status: "error",
          message: "El reporte supera el tamaño permitido",
        },
        { status: 413 }
      );
    }

    let entrada: unknown;

    try {
      const texto = await request.text();

      if (Buffer.byteLength(texto, "utf8") > 10_000) {
        return NextResponse.json(
          {
            status: "error",
            message: "El reporte supera el tamaño permitido",
          },
          { status: 413 }
        );
      }

      entrada = JSON.parse(texto);
    } catch {
      return NextResponse.json(
        {
          status: "error",
          message: "JSON invalido",
        },
        { status: 400 }
      );
    }

    const validacion = validarReporte(entrada);

    if (!validacion.valido) {
      return NextResponse.json(
        {
          status: "error",
          message: validacion.error,
        },
        { status: 400 }
      );
    }

    const evento: EventoReporte = {
      eventoId: crypto.randomUUID(),
      tipo: "REPORTE_CREADO",
      fechaEvento: new Date().toISOString(),
      datos: validacion.datos,
    };

    await publicarReporte(evento);

    return NextResponse.json(
      {
        status: "accepted",
        message: "Reporte recibido para procesamiento",
        reporteId: evento.eventoId,
        estado: "EN_COLA",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error(
      "Error registrando reporte:",
      error instanceof Error
        ? error.message
        : "Error desconocido"
    );

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible registrar el reporte",
      },
      { status: 503 }
    );
  }
}
