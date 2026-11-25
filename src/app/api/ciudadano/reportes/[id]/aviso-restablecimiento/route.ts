import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";
import { autenticarCiudadano } from "@/lib/authCiudadano";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ciudadano = await autenticarCiudadano(
    request.headers.get("authorization")
  );
  if (!ciudadano) {
    return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "ID de reporte inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const fechaTexto = (body as Record<string, unknown> | null)?.fechaServicio;
  if (typeof fechaTexto !== "string") {
    return NextResponse.json({ error: "Indica cuándo volvió el servicio." }, { status: 400 });
  }
  const fechaServicio = new Date(fechaTexto);
  if (!Number.isFinite(fechaServicio.getTime()) || fechaServicio.getTime() > Date.now()) {
    return NextResponse.json({ error: "La fecha debe ser válida y no futura." }, { status: 400 });
  }

  try {
    const aviso = await sql.begin(async (tx) => {
      const reportes = await tx`
        SELECT id, estado, fecha_reporte
        FROM public.reportes
        WHERE id = ${id} AND ciudadano_id = ${ciudadano.id}
        FOR UPDATE
      `;
      if (!reportes.length) return { status: 404 as const };
      const reporte = reportes[0];
      if (reporte.estado === "RESUELTO") return { status: 409 as const };
      if (fechaServicio.getTime() < new Date(reporte.fecha_reporte).getTime()) {
        return { status: 400 as const };
      }

      const filas = await tx`
        INSERT INTO public.avisos_restablecimiento (
          reporte_id, ciudadano_id, fecha_servicio_reportada
        ) VALUES (
          ${id}, ${ciudadano.id}, ${fechaServicio.toISOString()}
        )
        ON CONFLICT (reporte_id, ciudadano_id)
        DO UPDATE SET
          fecha_servicio_reportada = EXCLUDED.fecha_servicio_reportada,
          creado_en = now()
        RETURNING id, fecha_servicio_reportada, creado_en
      `;
      return { status: 200 as const, aviso: filas[0] };
    });

    if (aviso.status !== 200) {
      const messages = {
        400: "La hora indicada no puede ser anterior al reporte.",
        404: "Reporte no encontrado.",
        409: "El operador ya registró el restablecimiento; confirma la notificación pendiente.",
      };
      return NextResponse.json(
        { error: messages[aviso.status] },
        { status: aviso.status }
      );
    }
    return NextResponse.json({ ok: true, aviso: aviso.aviso });
  } catch (error) {
    console.error("Error guardando aviso de restablecimiento:", error);
    return NextResponse.json({ error: "No se pudo guardar el aviso." }, { status: 500 });
  }
}
