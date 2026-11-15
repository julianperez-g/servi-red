
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

    if (
      nuevoEstado !== "EN_ATENCION" &&
      nuevoEstado !== "RESUELTO"
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

    const resultado = await sqlOperadores.begin(async (tx) => {
      const reportes = await tx`
        SELECT
          r.id,
          r.estado,
          r.servicio_id
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
                THEN GREATEST(NOW(), fecha_reporte)
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

      return actualizados[0];
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Estado actualizado correctamente",
      reporte: resultado,
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
