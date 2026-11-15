
import { NextRequest, NextResponse } from "next/server";
import {
  autenticarOperador,
  sqlOperadores,
} from "@/lib/authOperador";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const operador = await autenticarOperador(
      request.headers.get("authorization")
    );

    if (!operador) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return NextResponse.json(
        { error: "ID inválido" },
        { status: 400 }
      );
    }

    const permisos = await sqlOperadores`
      SELECT 1
      FROM public.reportes r
      INNER JOIN public.empresa_servicios es
        ON es.servicio_id = r.servicio_id
      WHERE r.id = ${id}
        AND es.empresa_id = ${operador.empresa_id}
      LIMIT 1
    `;

    if (permisos.length === 0) {
      return NextResponse.json(
        { error: "Reporte no encontrado o sin permiso" },
        { status: 404 }
      );
    }

    const historial = await sqlOperadores`
      SELECT
        h.id,
        h.estado_anterior,
        h.estado_nuevo,
        h.observacion,
        h.fecha_cambio,
        o.nombre AS operador
      FROM public.historial_estados_reportes h
      INNER JOIN public.operadores o
        ON o.id = h.operador_id
      WHERE h.reporte_id = ${id}
      ORDER BY h.fecha_cambio DESC, h.id DESC
    `;

    return NextResponse.json({ historial });
  } catch (error) {
    console.error("Error consultando historial:", error);

    return NextResponse.json(
      { error: "No se pudo consultar el historial" },
      { status: 500 }
    );
  }
}
