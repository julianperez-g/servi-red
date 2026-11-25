export class ErrorSolicitudHTTP extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Límite real incluso cuando Content-Length falta o es falso. Nunca registra el cuerpo. */
export async function leerJsonLimitado(request, max = 3 * 1024 * 1024) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ErrorSolicitudHTTP(415, "Se requiere application/json.");
  if (Number(request.headers.get("content-length")) > max) throw new ErrorSolicitudHTTP(413, "La solicitud supera el tamaño permitido.");
  if (!request.body) throw new ErrorSolicitudHTTP(400, "Solicitud vacía.");
  const reader = request.body.getReader(), partes = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new ErrorSolicitudHTTP(413, "La solicitud supera el tamaño permitido."); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(partes).toString("utf8")); }
  catch { throw new ErrorSolicitudHTTP(400, "JSON no válido."); }
}
