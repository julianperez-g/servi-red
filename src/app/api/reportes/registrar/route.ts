
import { NextRequest, NextResponse } from "next/server";
import { validarReporte } from "@/application/validators/validarReporte";
import { autenticarCiudadano } from "@/lib/authCiudadano";
import { comprobarCobertura } from "@/infrastructure/reportes/cobertura";
import { MAX_REPORTE_BYTES } from "@/domain/value_objects/cobertura";
import { leerJsonLimitado, ErrorSolicitudHTTP } from "@/infrastructure/http/leer-json.mjs";
import {
  publicarReporte,
  type EventoReporte,
} from "@/infrastructure/messaging/rabbitmq";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const ciudadano = await autenticarCiudadano(
      request.headers.get("authorization")
    );

    if (!ciudadano) {
      return NextResponse.json(
        { status: "error", message: "Inicia sesión para registrar un reporte." },
        { status: 401 }
      );
    }

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

    if (longitudCuerpo > MAX_REPORTE_BYTES) {
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
      entrada = await leerJsonLimitado(request, MAX_REPORTE_BYTES);
    } catch (error) {
      return NextResponse.json(
        {
          status: "error",
          message: error instanceof ErrorSolicitudHTTP ? error.message : "JSON invalido",
        },
        { status: error instanceof ErrorSolicitudHTTP ? error.status : 400 }
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

    const areaAfectadaM2 = await comprobarCobertura(validacion.datos);
    const evento: EventoReporte = {
      eventoId: crypto.randomUUID(),
      tipo: "REPORTE_CREADO",
      fechaEvento: new Date().toISOString(),
      datos: {
        ...validacion.datos,
        ciudadanoId: ciudadano.id,
      },
    };

    await publicarReporte(evento);

    return NextResponse.json(
      {
        status: "accepted",
        message: "Reporte recibido para procesamiento",
        reporteId: evento.eventoId,
        estado: "EN_COLA",
        areaAfectadaM2,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ErrorSolicitudHTTP) return NextResponse.json({ status: "error", message: error.message }, { status: error.status });
    const codigo = (error as { code?: string })?.code;
    if (["22023", "XX000"].includes(codigo || "")) return NextResponse.json({ status: "error", message: "El polígono no es válido para calcular su superficie." }, { status: 400 });
    if (["42703", "42883"].includes(codigo || "")) return NextResponse.json({ status: "error", message: "La migración de cobertura funcional aún no está aplicada en esta base de datos." }, { status: 503 });
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
