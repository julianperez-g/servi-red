import { NextRequest, NextResponse } from "next/server";
import { autenticarOperador } from "@/lib/authOperador";
import { llamarDenuncias } from "@/infrastructure/denuncias/http-client.mjs";
import { falloDenuncias, headersPrivados } from "@/infrastructure/denuncias/respuesta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const operador = await autenticarOperador(request.headers.get("authorization"));
    if (!operador) return NextResponse.json({ error: "Operador no autorizado." }, { status: 401, headers: headersPrivados });
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Folio no válido." }, { status: 400, headers: headersPrivados });
    const resultado = await llamarDenuncias({ path: `/v1/moderacion/${id}/evidencia`, operadorId: operador.id });
    return new Response(resultado.imagen, { headers: { ...headersPrivados, "Content-Type": "image/webp", "Content-Disposition": "inline; filename=evidencia.webp" } });
  } catch (error) { return falloDenuncias(error); }
}
