import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const AGRUPACIONES = ["day", "month", "year"] as const;
type Agrupacion = (typeof AGRUPACIONES)[number];

function fechaValida(fecha: string | null): boolean {
  if (fecha === null) return true;
  if (!FORMATO_FECHA.test(fecha)) return false;
  const parseada = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(parseada.getTime()) &&
    parseada.toISOString().slice(0, 10) === fecha;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const agrupacionSolicitada = params.get("agrupacion") ?? "day";

  if (
    !fechaValida(desde) ||
    !fechaValida(hasta) ||
    (desde && hasta && desde > hasta) ||
    !AGRUPACIONES.includes(agrupacionSolicitada as Agrupacion)
  ) {
    return NextResponse.json(
      { error: "Rango de fechas o agrupación inválida." },
      { status: 400 }
    );
  }

  const agrupacion = agrupacionSolicitada as Agrupacion;
  const filtroFechas = sql`
    (${desde}::date IS NULL OR r.fecha_reporte >=
      (${desde}::date::timestamp AT TIME ZONE 'America/Bogota'))
    AND (${hasta}::date IS NULL OR r.fecha_reporte <
      ((${hasta}::date + 1)::timestamp AT TIME ZONE 'America/Bogota'))
  `;

  try {
    const [resumen, estados, severidades, servicios, municipios,
      departamentos, periodos] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE r.estado = 'REPORTADO')::int AS pendientes,
          COUNT(*) FILTER (WHERE r.estado = 'EN_ATENCION')::int AS en_atencion,
          COUNT(*) FILTER (WHERE r.estado = 'RESUELTO')::int AS resueltos,
          COUNT(*) FILTER (WHERE r.severidad = 'ALTA')::int AS alta_severidad,
          COUNT(*) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
          )::int AS total_cortes,
          COUNT(*) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          )::int AS cortes_resueltos,
          ROUND(COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          ), 0)::numeric, 1) AS duracion_total_horas,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          )::numeric, 1) AS horas_promedio
        FROM public.reportes r
        WHERE ${filtroFechas}
      `,
      sql`
        SELECT r.estado::text AS nombre, COUNT(*)::int AS total
        FROM public.reportes r
        WHERE ${filtroFechas}
        GROUP BY r.estado
        ORDER BY total DESC
      `,
      sql`
        SELECT r.severidad::text AS nombre, COUNT(*)::int AS total
        FROM public.reportes r
        WHERE ${filtroFechas}
        GROUP BY r.severidad
        ORDER BY total DESC
      `,
      sql`
        SELECT
          COALESCE(s.nombre, 'Sin servicio') AS nombre,
          COUNT(*)::int AS reportes,
          COUNT(*) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
          )::int AS cortes,
          ROUND(COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          ), 0)::numeric, 1) AS duracion_total_horas,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          )::numeric, 1) AS duracion_promedio_horas
        FROM public.reportes r
        LEFT JOIN public.servicios s ON s.id = r.servicio_id
        WHERE ${filtroFechas}
        GROUP BY s.nombre
        ORDER BY cortes DESC, reportes DESC
      `,
      sql`
        SELECT
          COALESCE(m.nombre, 'Sin municipio') AS nombre,
          COUNT(*)::int AS reportes,
          COUNT(*) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
          )::int AS cortes,
          ROUND(COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          ), 0)::numeric, 1) AS duracion_total_horas,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          )::numeric, 1) AS duracion_promedio_horas
        FROM public.reportes r
        LEFT JOIN public.municipios m ON m.id = r.municipio_id
        WHERE ${filtroFechas}
        GROUP BY m.nombre
        ORDER BY cortes DESC, reportes DESC
      `,
      sql`
        SELECT
          COALESCE(d.nombre, 'Sin departamento') AS nombre,
          d.codigo_dane,
          COUNT(*)::int AS reportes,
          COUNT(*) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
          )::int AS cortes,
          ROUND(COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          ), 0)::numeric, 1) AS duracion_total_horas,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          )::numeric, 1) AS duracion_promedio_horas
        FROM public.reportes r
        LEFT JOIN public.municipios m ON m.id = r.municipio_id
        LEFT JOIN public.departamentos d ON d.id = m.departamento_id
        WHERE ${filtroFechas}
        GROUP BY d.id, d.nombre, d.codigo_dane
        ORDER BY cortes DESC, reportes DESC
      `,
      sql`
        SELECT
          date_trunc(
            ${agrupacion}, r.fecha_reporte AT TIME ZONE 'America/Bogota'
          )::date::text AS nombre,
          COUNT(*)::int AS reportes,
          COUNT(*) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
          )::int AS cortes,
          ROUND(COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          ), 0)::numeric, 1) AS duracion_total_horas,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (
              r.fecha_restablecimiento - r.fecha_reporte
            )) / 3600
          ) FILTER (
            WHERE UPPER(r.tipo_novedad) = 'CORTE'
              AND r.fecha_restablecimiento IS NOT NULL
              AND r.fecha_restablecimiento >= r.fecha_reporte
          )::numeric, 1) AS duracion_promedio_horas
        FROM public.reportes r
        WHERE ${filtroFechas}
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
        departamentos,
        periodos,
        agrupacion,
        rango: { desde, hasta },
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
      { error: "No fue posible consultar los indicadores públicos." },
      { status: 500 }
    );
  }
}
