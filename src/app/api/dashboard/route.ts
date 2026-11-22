
import { NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [resumen, estados, severidades, servicios, municipios, evolucion] =
      await Promise.all([
        sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE estado = 'REPORTADO'
            )::int AS pendientes,
            COUNT(*) FILTER (
              WHERE estado = 'EN_ATENCION'
            )::int AS en_atencion,
            COUNT(*) FILTER (
              WHERE estado = 'RESUELTO'
            )::int AS resueltos,
            COUNT(*) FILTER (
              WHERE severidad = 'ALTA'
            )::int AS alta_severidad,
            ROUND(
              AVG(
                EXTRACT(EPOCH FROM (
                  fecha_restablecimiento - fecha_reporte
                )) / 3600
              ) FILTER (
                WHERE estado = 'RESUELTO'
                  AND fecha_restablecimiento IS NOT NULL
                  AND fecha_restablecimiento >= fecha_reporte
              )::numeric,
              1
            ) AS horas_promedio
          FROM public.reportes
        `,

        sql`
          SELECT
            estado::text AS nombre,
            COUNT(*)::int AS total
          FROM public.reportes
          GROUP BY estado
          ORDER BY total DESC
        `,

        sql`
          SELECT
            severidad::text AS nombre,
            COUNT(*)::int AS total
          FROM public.reportes
          GROUP BY severidad
          ORDER BY total DESC
        `,

        sql`
          SELECT
            COALESCE(s.nombre, 'Sin servicio') AS nombre,
            COUNT(*)::int AS total
          FROM public.reportes r
          LEFT JOIN public.servicios s
            ON s.id = r.servicio_id
          GROUP BY s.nombre
          ORDER BY total DESC
        `,

        sql`
          SELECT
            COALESCE(m.nombre, 'Sin municipio') AS nombre,
            COUNT(*)::int AS total
          FROM public.reportes r
          LEFT JOIN public.municipios m
            ON m.id = r.municipio_id
          GROUP BY m.nombre
          ORDER BY total DESC
        `,

        sql`
          SELECT
            (fecha_reporte AT TIME ZONE 'America/Bogota')::date::text
              AS nombre,
            COUNT(*)::int AS total
          FROM public.reportes
          WHERE fecha_reporte >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY 1
        `,
      ]);

    return NextResponse.json(
      {
        resumen: resumen[0],
        estados,
        severidades,
        servicios,
        municipios,
        evolucion,
        actualizado_en: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    console.error("Error en dashboard público:", error);

    return NextResponse.json(
      {
        error: "No fue posible consultar los indicadores públicos.",
      },
      { status: 500 }
    );
  }
}
