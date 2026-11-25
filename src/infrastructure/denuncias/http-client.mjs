export class ErrorServicioDenuncias extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Lee un cuerpo con límite real, aunque Content-Length falte o sea falso. */
export async function leerJsonLimitado(request, max = 3 * 1024 * 1024) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ErrorServicioDenuncias(415, "Se requiere application/json.");
  }
  if (Number(request.headers.get("content-length")) > max) throw new ErrorServicioDenuncias(413, "La solicitud supera el tamaño permitido.");
  if (!request.body) throw new ErrorServicioDenuncias(400, "Solicitud vacía.");
  const reader = request.body.getReader();
  const partes = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new ErrorServicioDenuncias(413, "La solicitud supera el tamaño permitido."); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(partes).toString("utf8")); }
  catch { throw new ErrorServicioDenuncias(400, "JSON no válido."); }
}

/**
 * Solo servidor-servidor. Jamás acepta o reenvía cabeceras del denunciante.
 * @param {{ path: string, method?: string, body?: unknown, operadorId?: string, params?: URLSearchParams }} request
 * @param {{ url?: string, apiKey?: string, production?: boolean, fetcher?: typeof fetch }} config
 */
export async function llamarDenuncias({ path, method = "GET", body, operadorId, params }, {
  url = process.env.DENUNCIAS_SERVICE_URL,
  apiKey = process.env.DENUNCIAS_API_KEY,
  production = process.env.NODE_ENV === "production",
  fetcher = fetch,
} = {}) {
  if (!url || !apiKey || apiKey.length < 32) throw new ErrorServicioDenuncias(503, "El canal de denuncias no está configurado.");
  let endpoint;
  try {
    endpoint = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]", "denuncias"].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
        (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && !production && local)) ||
        (production && local) ||
        !/^\/v1\/(denuncias|moderacion(?:\/[0-9a-f-]{36}(?:\/evidencia)?)?)$/.test(path)) throw new Error();
    endpoint.pathname = path;
    if (params) for (const [key, value] of params) endpoint.searchParams.append(key, value);
  } catch { throw new ErrorServicioDenuncias(503, "La conexión del canal de denuncias no es válida."); }
  const headers = { Accept: path.endsWith("/evidencia") ? "image/webp" : "application/json", Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (operadorId) headers["X-Operador-Id"] = operadorId;
  let response;
  try {
    response = await fetcher(endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(18_000) });
  } catch (error) {
    const timeout = ["AbortError", "TimeoutError"].includes(error?.name);
    throw new ErrorServicioDenuncias(timeout ? 504 : 502, timeout ? "El canal tardó demasiado. No reenvíes automáticamente: podrías duplicar la denuncia." : "No fue posible conectar con el canal de denuncias.");
  }
  if (response.ok && path.endsWith("/evidencia")) {
    if (!response.headers.get("content-type")?.startsWith("image/webp")) throw new ErrorServicioDenuncias(502, "Evidencia no válida.");
    return { status: 200, imagen: new Uint8Array(await response.arrayBuffer()) };
  }
  let datos;
  try { datos = await response.json(); } catch { throw new ErrorServicioDenuncias(502, "Respuesta no válida del canal de denuncias."); }
  if (!response.ok) {
    const status = [400, 403, 404, 409, 413, 415, 429, 503].includes(response.status) ? response.status : 502;
    throw new ErrorServicioDenuncias(status, status === 502 ? "El canal de denuncias no está disponible." : datos.error || "No se pudo procesar la solicitud.");
  }
  return { status: response.status, datos };
}
