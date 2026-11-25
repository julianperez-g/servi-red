import { NextResponse } from "next/server";
import { ErrorSolicitudHTTP } from "../http/leer-json.mjs";

export const headersPrivados = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function falloDenuncias(error: unknown) {
  // No loguear el error: podría contener texto, cabeceras, credenciales o una foto.
  const status = error instanceof ErrorSolicitudHTTP ? error.status : 503;
  const message = error instanceof ErrorSolicitudHTTP ? error.message : "El canal de denuncias no está disponible.";
  return NextResponse.json({ error: message }, { status, headers: { ...headersPrivados, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
