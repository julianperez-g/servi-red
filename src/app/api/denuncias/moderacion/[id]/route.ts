import { NextRequest, NextResponse } from "next/server";
import { autenticarOperador } from "@/lib/authOperador";
import { llamarDenuncias, leerJsonLimitado } from "@/infrastructure/denuncias/http-client.mjs";
import { falloDenuncias, headersPrivados } from "@/infrastructure/denuncias/respuesta";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const operador = await autenticarOperador(request.headers.get("authorization"));
    if (!operador) return NextResponse.json({ error: "Operador no autorizado." }, { status: 401, headers: headersPrivados });
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Folio no válido." }, { status: 400, headers: headersPrivados });
    const body = await leerJsonLimitado(request, 4096);
    const resultado = await llamarDenuncias({ path: `/v1/moderacion/${id}`, method: "PATCH", body, operadorId: operador.id });
    return NextResponse.json(resultado.datos, { headers: headersPrivados });
  } catch (error) { return falloDenuncias(error); }
}
