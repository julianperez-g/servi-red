import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_EXPORTACION = 50_000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

type FilaExportacion = Record<string, string | number | null>;

function escaparCSV(valor: unknown): string {
  let texto = valor == null ? "" : String(valor);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replaceAll('"', '""')}"`;
}

function fechaValida(fecha: string | null): boolean {
  if (fecha === null) return true;
  if (!FECHA_ISO.test(fecha)) return false;
  const parseada = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(parseada.getTime()) &&
    parseada.toISOString().slice(0, 10) === fecha;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const servicio = params.get("servicio");
  const municipio = params.get("municipio");
  const severidad = params.get("severidad")?.toUpperCase() ?? null;
  const estado = params.get("estado")?.toUpperCase() ?? null;
  const novedad = params.get("novedad")?.toUpperCase() ?? null;

  if (!fechaValida(desde) || !fechaValida(hasta)) {
    return NextResponse.json(
      { error: "Las fechas deben tener formato YYYY-MM-DD y ser válidas." },
      { status: 400 }
    );
  }
  if (desde && hasta && desde > hasta) {
    return NextResponse.json(
      { error: "La fecha inicial no puede ser posterior a la fecha final." },
      { status: 400 }
    );
  }
  if (
    (servicio !== null && !/^\d+$/.test(servicio)) ||
    (municipio !== null && !/^\d+$/.test(municipio)) ||
    (severidad !== null && !["BAJA", "MEDIA", "ALTA"].includes(severidad)) ||
    (estado !== null && !["REPORTADO", "EN_ATENCION", "RESUELTO"].includes(estado)) ||
    (novedad !== null && !["CORTE", "FALLA", "BAJA_CALIDAD"].includes(novedad))
  ) {
    return NextResponse.json(
      { error: "Uno o más filtros no son válidos." },
      { status: 400 }
    );
  }

  try {
    const reportes = await sql<FilaExportacion[]>`
      SELECT
        to_char(
          r.fecha_reporte AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) AS fecha_reporte,
        NULL::timestamptz AS fecha_inicio,
        m.nombre AS municipio,
        d.nombre AS departamento,
        d.codigo_dane AS departamento_codigo_dane,
        CASE r.tipo_novedad::text
          WHEN 'CORTE' THEN 'Corte del servicio'
          WHEN 'FALLA' THEN 'Falla en el servicio'
          WHEN 'BAJA_CALIDAD' THEN 'Baja calidad del servicio'
          ELSE r.tipo_novedad::text
        END AS tipo_novedad,
        s.nombre AS servicio,
        r.severidad::text AS severidad,
        r.estado::text AS estado_reporte,
        NULL::numeric AS magnitud_area,
        NULL::text AS resultado_validacion,
        NULL::timestamptz AS fecha_respuesta,
        r.descripcion
      FROM public.reportes r
      LEFT JOIN public.municipios m ON m.id = r.municipio_id
      LEFT JOIN public.departamentos d ON d.id = m.departamento_id
      LEFT JOIN public.servicios s ON s.id = r.servicio_id
      WHERE (${desde}::date IS NULL OR r.fecha_reporte >= ${desde}::date)
        AND (${hasta}::date IS NULL OR r.fecha_reporte < ${hasta}::date + INTERVAL '1 day')
        AND (${servicio}::int IS NULL OR r.servicio_id = ${servicio}::int)
        AND (${municipio}::int IS NULL OR r.municipio_id = ${municipio}::int)
        AND (${severidad}::text IS NULL OR r.severidad::text = ${severidad}::text)
        AND (${estado}::text IS NULL OR r.estado::text = ${estado}::text)
        AND (${novedad}::text IS NULL OR r.tipo_novedad::text = ${novedad}::text)
      ORDER BY r.fecha_reporte DESC, r.id
      LIMIT ${LIMITE_EXPORTACION}
    `;

    const columnas = [
      "fecha_reporte", "fecha_inicio", "municipio", "departamento",
      "departamento_codigo_dane",
      "tipo_novedad", "servicio", "severidad", "estado_reporte",
      "magnitud_area", "resultado_validacion", "fecha_respuesta", "descripcion",
    ];
    const lineas = [
      columnas.map(escaparCSV).join(";"),
      ...reportes.map((reporte) =>
        columnas.map((columna) => escaparCSV(reporte[columna])).join(";")
      ),
    ];
    const csv = `\uFEFF${lineas.join("\r\n")}\r\n`;
    const hoy = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="SERVI-RED_reportes_${hoy}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error exportando reportes públicos:", error);
    return NextResponse.json(
      { error: "No fue posible generar la exportación de reportes." },
      { status: 500 }
    );
  }
}
