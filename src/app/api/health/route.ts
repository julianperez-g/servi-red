
import { NextResponse } from "next/server";
import { sql } from "@/infrastructure/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resultado = await sql`
      SELECT
        current_database() AS database,
        NOW() AS server_time,
        (
          SELECT COUNT(*)::integer
          FROM public.servicios
        ) AS total_servicios,
        (
          SELECT COUNT(*)::integer
          FROM public.municipios
        ) AS total_municipios
    `;

    return NextResponse.json({
      status: "ok",
      sistema: "SERVI-RED",
      database: resultado[0].database,
      servicios: resultado[0].total_servicios,
      municipios: resultado[0].total_municipios,
      timestamp: resultado[0].server_time,
    });
  } catch (error) {
    console.error(
      "Error de conexion PostgreSQL:",
      error instanceof Error ? error.message : "Error desconocido"
    );

    return NextResponse.json(
      {
        status: "error",
        message: "No fue posible conectar con PostgreSQL",
      },
      { status: 503 }
    );
  }
}
