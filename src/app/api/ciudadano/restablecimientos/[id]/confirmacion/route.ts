import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";
import { autenticarCiudadano } from "@/lib/authCiudadano";

export const runtime = "nodejs";

export async function PATCH(
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
    return NextResponse.json({ error: "ID de restablecimiento inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const respuesta = (body as Record<string, unknown> | null)?.respuesta;
  if (respuesta !== "CONFIRMO" && respuesta !== "SIGUE_SIN_SERVICIO") {
    return NextResponse.json({ error: "Respuesta de restablecimiento inválida." }, { status: 400 });
  }

  try {
    const resultado = await sql.begin(async (tx) => {
      const filas = await tx`
        SELECT x.id, x.estado_validacion, x.reporte_id
        FROM public.restablecimientos x
        INNER JOIN public.reportes r ON r.id = x.reporte_id
        WHERE x.id = ${id} AND r.ciudadano_id = ${ciudadano.id}
        FOR UPDATE OF x
      `;
      if (!filas.length) return { status: 404 as const };
      if (filas[0].estado_validacion !== "PENDIENTE") {
        return { status: 409 as const };
      }

      const estadoValidacion = respuesta === "CONFIRMO"
        ? "CONFIRMADO"
        : "OBSERVADO";
      const actualizados = await tx`
        UPDATE public.restablecimientos
        SET
          estado_validacion = ${estadoValidacion},
          respuesta_ciudadano = ${respuesta},
          confirmado_por = ${ciudadano.id},
          confirmado_en = now()
        WHERE id = ${id}
        RETURNING id, estado_validacion, respuesta_ciudadano, confirmado_en
      `;
      return { status: 200 as const, restablecimiento: actualizados[0] };
    });

    if (resultado.status !== 200) {
      return NextResponse.json(
        { error: resultado.status === 404 ? "Notificación no encontrada." : "Esta notificación ya fue respondida." },
        { status: resultado.status }
      );
    }
    return NextResponse.json({ ok: true, restablecimiento: resultado.restablecimiento });
  } catch (error) {
    console.error("Error confirmando restablecimiento:", error);
    return NextResponse.json({ error: "No se pudo guardar la confirmación." }, { status: 500 });
  }
}
