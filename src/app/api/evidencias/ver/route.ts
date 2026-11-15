
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";
import { supabaseStorage } from "@/infrastructure/storage/supabaseStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "evidencias-reportes";

export async function GET(request: NextRequest) {
  try {
    const reporteId = request.nextUrl.searchParams.get("reporteId");

    if (
      !reporteId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        reporteId
      )
    ) {
      return NextResponse.json(
        { status: "error", message: "ID de reporte invalido" },
        { status: 400 }
      );
    }

    const evidencias = await sql`
      SELECT
        e.storage_key,
        e.tipo_mime
      FROM public.evidencias AS e
      INNER JOIN public.reportes AS r
        ON r.id = e.reporte_id
      WHERE e.reporte_id = ${reporteId}::uuid
      ORDER BY e.creado_en DESC
      LIMIT 1
    `;

    if (evidencias.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Este reporte no tiene evidencia",
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

    const bytes = await data.arrayBuffer();
    const tipo = String(evidencias[0].tipo_mime);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": [
          "image/jpeg",
          "image/png",
          "image/webp",
        ].includes(tipo)
          ? tipo
          : "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Error consultando evidencia:",
      error instanceof Error
        ? error.message
        : "Error desconocido"
    );

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible consultar la evidencia",
      },
      { status: 500 }
    );
  }
}
