import { NextRequest, NextResponse } from "next/server";
import {
  consultarServicioIndicadores,
  ErrorServicioIndicadores,
} from "@/infrastructure/indicators/http-client.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  try {
    const datos = await consultarServicioIndicadores(request.nextUrl.searchParams, {
      url: process.env.INDICADORES_SERVICE_URL,
      apiKey: process.env.INDICADORES_API_KEY,
      production: process.env.NODE_ENV === "production",
    });
    return NextResponse.json(datos, { headers });
  } catch (error) {
    if (error instanceof ErrorServicioIndicadores) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers }
      );
    }
    console.error("Error consultando el servicio de indicadores.");
    return NextResponse.json(
      { error: "No fue posible consultar los indicadores públicos." },
      { status: 502, headers }
    );
  }
}
