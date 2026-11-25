import { NextResponse } from "next/server";
import { ErrorServicioDenuncias } from "./http-client.mjs";

export const headersPrivados = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function falloDenuncias(error: unknown) {
  // No loguear el error: podría contener texto, cabeceras, credenciales o una foto.
  const status = error instanceof ErrorServicioDenuncias ? error.status : 503;
  const message = error instanceof ErrorServicioDenuncias ? error.message : "El canal de denuncias no está disponible.";
  return NextResponse.json({ error: message }, { status, headers: { ...headersPrivados, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
