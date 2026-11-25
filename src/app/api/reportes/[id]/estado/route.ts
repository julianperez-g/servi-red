
import { NextRequest, NextResponse } from "next/server";
import {
  autenticarOperador,
  sqlOperadores,
} from "@/lib/authOperador";

export const runtime = "nodejs";

type Estado = "REPORTADO" | "EN_ATENCION" | "RESUELTO";

const transiciones: Record<Estado, Estado | null> = {
  REPORTADO: "EN_ATENCION",
  EN_ATENCION: "RESUELTO",
  RESUELTO: null,
};

class ErrorGestion extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const operador = await autenticarOperador(
      request.headers.get("authorization")
    );

    if (!operador) {
      return NextResponse.json(
        { error: "Operador no autenticado o no autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return NextResponse.json(
        { error: "ID de reporte inválido" },
        { status: 400 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "JSON inválido" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const datos = body as Record<string, unknown>;
    const nuevoEstado = datos.estado;
    const observacion = datos.observacion;
    const reabrir = datos.reabrir === true;

    if (
      (nuevoEstado !== "EN_ATENCION" && nuevoEstado !== "RESUELTO") ||
      (reabrir && nuevoEstado !== "EN_ATENCION")
    ) {
      return NextResponse.json(
        { error: "Estado solicitado no permitido" },
        { status: 400 }
      );
    }

    if (
      typeof observacion !== "string" ||
      observacion.trim().length < 5 ||
      observacion.trim().length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "La observación debe tener entre 5 y 2000 caracteres",
        },
        { status: 400 }
      );
    }

    let fechaRestablecimiento: Date | null = null;
    if (nuevoEstado === "RESUELTO") {
      if (typeof datos.fechaRestablecimiento !== "string") {
        return NextResponse.json(
          { error: "Indica la fecha y hora del restablecimiento." },
          { status: 400 }
        );
      }

      fechaRestablecimiento = new Date(datos.fechaRestablecimiento);
      if (
        !Number.isFinite(fechaRestablecimiento.getTime()) ||
        fechaRestablecimiento.getTime() > Date.now()
      ) {
        return NextResponse.json(
          { error: "La fecha de restablecimiento debe ser válida y no futura." },
          { status: 400 }
        );
      }
    }

    const resultado = await sqlOperadores.begin(async (tx) => {
      const reportes = await tx`
        SELECT
          r.id,
          r.estado,
          r.servicio_id,
          r.ciudadano_id,
          r.fecha_reporte
        FROM public.reportes r
        WHERE r.id = ${id}
        FOR UPDATE
      `;

      if (reportes.length === 0) {
        throw new ErrorGestion(404, "Reporte no encontrado");
      }

      const reporte = reportes[0];

      const permisos = await tx`
        SELECT 1
        FROM public.empresa_servicios es
        WHERE es.empresa_id = ${operador.empresa_id}
          AND es.servicio_id = ${reporte.servicio_id}
        LIMIT 1
      `;

      if (permisos.length === 0) {
        throw new ErrorGestion(
          403,
          "Tu empresa no tiene permiso sobre este servicio"
        );
      }

      const estadoAnterior = reporte.estado as Estado;

      if (
        fechaRestablecimiento &&
        fechaRestablecimiento.getTime() <
          new Date(reporte.fecha_reporte).getTime()
      ) {
        throw new ErrorGestion(
          400,
          "El restablecimiento no puede ser anterior al reporte"
        );
      }

      if (reabrir) {
        if (estadoAnterior !== "RESUELTO") {
          throw new ErrorGestion(409, "Solo se puede reabrir un reporte resuelto");
        }

        const ultimaRestauracion = await tx`
          SELECT id, estado_validacion
          FROM public.restablecimientos
          WHERE reporte_id = ${id}
          ORDER BY registrado_en DESC
          LIMIT 1
          FOR UPDATE
        `;

        if (ultimaRestauracion[0]?.estado_validacion !== "OBSERVADO") {
          throw new ErrorGestion(
            409,
            "El ciudadano no ha reportado que siga sin servicio"
          );
        }

        const reabierto = await tx`
          UPDATE public.reportes
          SET estado = 'EN_ATENCION', fecha_restablecimiento = NULL
          WHERE id = ${id}
          RETURNING id, estado, fecha_restablecimiento
        `;

        await tx`
          INSERT INTO public.historial_estados_reportes (
            reporte_id, operador_id, estado_anterior, estado_nuevo, observacion
          ) VALUES (
            ${id}, ${operador.id}, 'RESUELTO', 'EN_ATENCION', ${observacion.trim()}
          )
        `;

        return { reporte: reabierto[0], restablecimiento: null };
      }

      if (
        !Object.prototype.hasOwnProperty.call(
          transiciones,
          estadoAnterior
        ) ||
        transiciones[estadoAnterior] !== nuevoEstado
      ) {
        throw new ErrorGestion(
          409,
          `No se permite pasar de ${estadoAnterior} a ${nuevoEstado}`
        );
      }

      const actualizados = await tx`
        UPDATE public.reportes
        SET
          estado = ${nuevoEstado},
          fecha_restablecimiento =
            CASE
              WHEN ${nuevoEstado} = 'RESUELTO'
                THEN ${fechaRestablecimiento?.toISOString() ?? null}::timestamptz
              ELSE NULL
            END
        WHERE id = ${id}
        RETURNING
          id,
          estado,
          fecha_restablecimiento
      `;

      await tx`
        INSERT INTO public.historial_estados_reportes (
          reporte_id,
          operador_id,
          estado_anterior,
          estado_nuevo,
          observacion
        )
        VALUES (
          ${id},
          ${operador.id},
          ${estadoAnterior},
          ${nuevoEstado},
          ${observacion.trim()}
        )
      `;

      let restablecimiento = null;
      if (nuevoEstado === "RESUELTO" && fechaRestablecimiento) {
        const insertados = await tx`
          INSERT INTO public.restablecimientos (
            reporte_id,
            operador_id,
            fecha_restablecimiento,
            acciones
          ) VALUES (
            ${id},
            ${operador.id},
            ${fechaRestablecimiento.toISOString()},
            ${observacion.trim()}
          )
          RETURNING id, fecha_restablecimiento, acciones, estado_validacion
        `;
        restablecimiento = insertados[0];

        if (reporte.ciudadano_id) {
          await tx`
            INSERT INTO public.notificaciones_ciudadanas (
              ciudadano_id, reporte_id, restablecimiento_id
            ) VALUES (
              ${reporte.ciudadano_id}, ${id}, ${restablecimiento.id}
            )
            ON CONFLICT (restablecimiento_id, ciudadano_id) DO NOTHING
          `;
        }
      }

      return {
        reporte: actualizados[0],
        restablecimiento,
      };
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Estado actualizado correctamente",
      reporte: resultado.reporte,
      restablecimiento: resultado.restablecimiento,
    });
  } catch (error) {
    if (error instanceof ErrorGestion) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Error actualizando reporte:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el reporte" },
      { status: 500 }
    );
  }
}
