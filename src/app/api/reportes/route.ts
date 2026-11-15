
import { NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reportes = await sql`
      SELECT
        r.id,
        r.municipio_id,
        r.servicio_id,
        r.tipo_novedad,
        r.descripcion,
        r.severidad,
        r.estado,
        r.estado_ingesta,
        r.fecha_reporte,
        r.fecha_restablecimiento,
        r.creado_en,

        ST_Y(r.ubicacion::geometry) AS latitud,
        ST_X(r.ubicacion::geometry) AS longitud,

        EXISTS (
          SELECT 1
          FROM public.evidencias AS e
          WHERE e.reporte_id = r.id
        ) AS tiene_evidencia

      FROM public.reportes AS r

      ORDER BY r.fecha_reporte DESC

      LIMIT 100
    `;

    return NextResponse.json({
      status: "ok",
      sistema: "SERVI-RED",
      total: reportes.length,
      reportes,
    });
  } catch (error) {
    console.error(
      "Error consultando reportes:",
      error instanceof Error
        ? error.message
        : "Error desconocido"
    );

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible consultar los reportes",
      },
      { status: 500 }
    );
  }
}
