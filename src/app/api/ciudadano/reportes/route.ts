import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";
import { autenticarCiudadano } from "@/lib/authCiudadano";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ciudadano = await autenticarCiudadano(
    request.headers.get("authorization")
  );

  if (!ciudadano) {
    return NextResponse.json({ error: "Inicia sesión para consultar tus reportes." }, { status: 401 });
  }

  try {
    const reportes = await sql`
      SELECT
        r.id,
        r.tipo_novedad,
        r.servicio_id,
        r.descripcion,
        r.severidad,
        r.estado,
        r.fecha_reporte,
        r.fecha_restablecimiento,
        to_jsonb(r)->>'categoria_incidente' AS categoria_incidente,
        to_jsonb(r)->>'fecha_inicio_estimada' AS fecha_inicio_estimada,
        to_jsonb(r)->'area_afectada_geojson' AS area_afectada_geojson,
        (to_jsonb(r)->>'area_afectada_m2')::numeric AS area_afectada_m2,
        m.nombre AS municipio,
        s.nombre AS servicio,
        rest.id AS restablecimiento_id,
        rest.registrado_en AS restablecimiento_registrado_en,
        rest.fecha_restablecimiento AS fecha_restablecimiento_operador,
        rest.acciones AS acciones_restablecimiento,
        rest.estado_validacion AS validacion_restablecimiento,
        rest.respuesta_ciudadano,
        aviso.fecha_servicio_reportada,
        aviso.creado_en AS aviso_creado_en,
        (notificacion.id IS NOT NULL AND rest.estado_validacion = 'PENDIENTE')
          AS tiene_notificacion_pendiente
      FROM public.reportes r
      LEFT JOIN public.municipios m ON m.id = r.municipio_id
      LEFT JOIN public.servicios s ON s.id = r.servicio_id
      LEFT JOIN LATERAL (
        SELECT x.*
        FROM public.restablecimientos x
        WHERE x.reporte_id = r.id
        ORDER BY x.registrado_en DESC
        LIMIT 1
      ) rest ON TRUE
      LEFT JOIN LATERAL (
        SELECT a.fecha_servicio_reportada, a.creado_en
        FROM public.avisos_restablecimiento a
        WHERE a.reporte_id = r.id AND a.ciudadano_id = ${ciudadano.id}
        ORDER BY a.creado_en DESC
        LIMIT 1
      ) aviso ON TRUE
      LEFT JOIN public.notificaciones_ciudadanas notificacion
        ON notificacion.restablecimiento_id = rest.id
       AND notificacion.ciudadano_id = ${ciudadano.id}
      WHERE r.ciudadano_id = ${ciudadano.id}
      ORDER BY r.fecha_reporte DESC
      LIMIT 200
    `;

    return NextResponse.json(
      { reportes },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Error consultando reportes ciudadanos:", error);
    return NextResponse.json(
      { error: "No fue posible consultar tus reportes." },
      { status: 500 }
    );
  }
}
