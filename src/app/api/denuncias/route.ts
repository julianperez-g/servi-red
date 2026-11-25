import { NextRequest, NextResponse } from "next/server";
import { llamarDenuncias, leerJsonLimitado } from "@/infrastructure/denuncias/http-client.mjs";
import { falloDenuncias, headersPrivados } from "@/infrastructure/denuncias/respuesta";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // No leer sesión, cookies, Authorization, IP, X-Forwarded-For o User-Agent.
    const body = await leerJsonLimitado(request);
    const resultado = await llamarDenuncias({ path: "/v1/denuncias", method: "POST", body });
    return NextResponse.json(resultado.datos, { status: resultado.status, headers: headersPrivados });
  } catch (error) { return falloDenuncias(error); }
}
