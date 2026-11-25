
import { NextRequest, NextResponse } from "next/server";
import {
  autenticarOperador,
  sqlOperadores,
} from "@/lib/authOperador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const operador = await autenticarOperador(
      request.headers.get("authorization")
    );

    if (!operador) {
      return NextResponse.json(
        {
          status: "error",
          message: "Operador no autenticado o no autorizado",
        },
        { status: 401 }
      );
    }

    const reportes = await sqlOperadores`
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
        to_jsonb(r)->>'categoria_incidente' AS categoria_incidente,
        to_jsonb(r)->>'fecha_inicio_estimada' AS fecha_inicio_estimada,
        to_jsonb(r)->'area_afectada_geojson' AS area_afectada_geojson,
        (to_jsonb(r)->>'area_afectada_m2')::numeric AS area_afectada_m2,
        r.creado_en,
        rest.id AS restablecimiento_id,
        rest.fecha_restablecimiento AS fecha_restablecimiento_operador,
        rest.acciones AS acciones_restablecimiento,
        rest.estado_validacion AS validacion_restablecimiento,
        rest.respuesta_ciudadano,
        aviso.fecha_servicio_reportada,
        ST_Y(r.ubicacion::geometry) AS latitud,
        ST_X(r.ubicacion::geometry) AS longitud,
        EXISTS (
          SELECT 1
          FROM public.evidencias e
          WHERE e.reporte_id = r.id
        ) AS tiene_evidencia
      FROM public.reportes r
      LEFT JOIN LATERAL (
        SELECT
          x.id,
          x.fecha_restablecimiento,
          x.acciones,
          x.estado_validacion,
          x.respuesta_ciudadano
        FROM public.restablecimientos x
        WHERE x.reporte_id = r.id
        ORDER BY x.registrado_en DESC
        LIMIT 1
      ) rest ON TRUE
      LEFT JOIN public.avisos_restablecimiento aviso
        ON aviso.reporte_id = r.id
       AND aviso.ciudadano_id = r.ciudadano_id
      WHERE EXISTS (
        SELECT 1
        FROM public.empresa_servicios es
        WHERE es.empresa_id = ${operador.empresa_id}
          AND es.servicio_id = r.servicio_id
      )
      ORDER BY r.fecha_reporte DESC
      LIMIT 100
    `;

    return NextResponse.json(
      {
        status: "ok",
        sistema: "SERVI-RED",
        total: reportes.length,
        reportes,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    console.error("Error consultando reportes:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible consultar los reportes",
      },
      { status: 500 }
    );
  }
}
