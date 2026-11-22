
import { NextRequest, NextResponse } from "next/server";
import {
  autenticarOperador,
  sqlOperadores,
} from "@/lib/authOperador";
import { supabaseStorage } from "@/infrastructure/storage/supabaseStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "evidencias-reportes";

export async function GET(request: NextRequest) {
  try {
    const operador = await autenticarOperador(
      request.headers.get("authorization")
    );

    if (!operador) {
      return NextResponse.json(
        {
          status: "error",
          message: "No autorizado",
        },
        { status: 401 }
      );
    }

    const reporteId = request.nextUrl.searchParams.get("reporteId");

    if (
      !reporteId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        reporteId
      )
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "ID de reporte inválido",
        },
        { status: 400 }
      );
    }

    const evidencias = await sqlOperadores`
      SELECT
        e.storage_key,
        e.tipo_mime
      FROM public.evidencias e
      INNER JOIN public.reportes r
        ON r.id = e.reporte_id
      WHERE e.reporte_id = ${reporteId}::uuid
        AND EXISTS (
          SELECT 1
          FROM public.empresa_servicios es
          WHERE es.empresa_id = ${operador.empresa_id}
            AND es.servicio_id = r.servicio_id
        )
      ORDER BY e.creado_en DESC
      LIMIT 1
    `;

    if (evidencias.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Evidencia no encontrada o sin permiso",
        },
        { status: 404 }
      );
    }

    const ruta = String(evidencias[0].storage_key);

    const { data, error } = await supabaseStorage.storage
      .from(BUCKET)
      .download(ruta);

    if (error || !data) {
      console.error(
        "Error descargando evidencia:",
        error?.message
      );

      return NextResponse.json(
        {
          status: "error",
          message: "No fue posible recuperar la fotografía",
        },
        { status: 502 }
      );
    }

    const tipo = String(evidencias[0].tipo_mime);

    const tipoSeguro = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(tipo)
      ? tipo
      : "application/octet-stream";

    return new NextResponse(await data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": tipoSeguro,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error consultando evidencia:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible consultar la evidencia",
      },
      { status: 500 }
    );
  }
}
