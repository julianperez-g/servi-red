import { NextRequest, NextResponse } from "next/server";
import { autenticarOperador } from "@/lib/authOperador";
import { llamarDenuncias } from "@/infrastructure/denuncias/http-client.mjs";
import { falloDenuncias, headersPrivados } from "@/infrastructure/denuncias/respuesta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const operador = await autenticarOperador(request.headers.get("authorization"));
    if (!operador) return NextResponse.json({ error: "Operador no autorizado." }, { status: 401, headers: headersPrivados });
    const resultado = await llamarDenuncias({ path: "/v1/moderacion", operadorId: operador.id, params: request.nextUrl.searchParams });
    return NextResponse.json(resultado.datos, { headers: headersPrivados });
  } catch (error) { return falloDenuncias(error); }
}
