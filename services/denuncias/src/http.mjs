import { createHash, timingSafeEqual } from "node:crypto";
import { ErrorDenuncia, ESTADOS, MAX_BODY, UUID, validarDenuncia, validarModeracion } from "./validacion.mjs";
import { limpiarFoto } from "./imagenes.mjs";

const hash = (value) => createHash("sha256").update(value).digest();
async function leerJSON(request) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new ErrorDenuncia(415, "Se requiere application/json.");
  }
  if (Number(request.headers["content-length"]) > MAX_BODY) throw new ErrorDenuncia(413, "La solicitud supera 3 MB.");
  const partes = []; let size = 0;
  for await (const parte of request) {
    size += parte.length;
    if (size > MAX_BODY) throw new ErrorDenuncia(413, "La solicitud supera 3 MB.");
    partes.push(parte);
  }
  try { return JSON.parse(Buffer.concat(partes).toString("utf8")); }
  catch { throw new ErrorDenuncia(400, "JSON no válido."); }
}

export function crearHandler({ apiKey, repositorio, procesarFoto = limpiarFoto, logError = console.error }) {
  if (!apiKey || apiKey.length < 32) throw new Error("DENUNCIAS_API_KEY requiere al menos 32 caracteres.");
  let activas = 0; let tokens = 20; let inicio = Date.now();
  return async (request, response) => {
    const enviar = (status, datos, tipo = "application/json; charset=utf-8") => {
      response.writeHead(status, { "Content-Type": tipo, "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        ...(status === 429 ? { "Retry-After": "60" } : {}) });
      response.end(Buffer.isBuffer(datos) ? datos : JSON.stringify(datos));
    };
    let ocupada = false;
    try {
      const url = new URL(request.url, "http://denuncias.internal");
      if (url.pathname === "/health" && request.method === "GET") {
        await repositorio.comprobarDB(); return enviar(200, { status: "ok", servicio: "denuncias" });
      }
      const authorization = request.headers.authorization;
      if (typeof authorization !== "string" || !authorization.startsWith("Bearer ") ||
          !timingSafeEqual(hash(authorization.slice(7)), hash(apiKey))) {
        return enviar(401, { error: "Servicio no autorizado." });
      }
      if (url.pathname === "/v1/denuncias" && request.method === "POST") {
        if (Date.now() - inicio >= 60_000) { tokens = 20; inicio = Date.now(); }
        if (tokens <= 0) throw new ErrorDenuncia(429, "El canal está ocupado. Inténtalo en un minuto.");
        if (activas >= 2) throw new ErrorDenuncia(503, "El canal está procesando otras denuncias. Inténtalo de nuevo.");
        tokens--; activas++; ocupada = true;
        const { foto, ...datos } = validarDenuncia(await leerJSON(request));
        const evidencia = await procesarFoto(foto);
        return enviar(201, await repositorio.crear(datos, evidencia));
      }
      const operadorId = request.headers["x-operador-id"];
      if (typeof operadorId !== "string" || !UUID.test(operadorId)) throw new ErrorDenuncia(403, "Moderación no autorizada.");
      if (url.pathname === "/v1/moderacion" && request.method === "GET") {
        const estado = url.searchParams.get("estado") || "PENDIENTE";
        const pagina = url.searchParams.get("pagina") || "0";
        if ([...url.searchParams.keys()].some((k) => !["estado", "pagina"].includes(k)) ||
            url.searchParams.getAll("estado").length > 1 || url.searchParams.getAll("pagina").length > 1 ||
            !ESTADOS.includes(estado) || !/^\d{1,4}$/.test(pagina)) throw new ErrorDenuncia(400, "Filtros de moderación inválidos.");
        return enviar(200, await repositorio.listar({ operadorId, estado, pagina: Number(pagina) }));
      }
      const match = url.pathname.match(/^\/v1\/moderacion\/([^/]+)(\/evidencia)?$/);
      if (match && UUID.test(match[1])) {
        if (match[2] && request.method === "GET") return enviar(200, await repositorio.evidencia({ id: match[1], operadorId }), "image/webp");
        if (!match[2] && request.method === "PATCH") {
          return enviar(200, await repositorio.moderar({ id: match[1], operadorId, ...validarModeracion(await leerJSON(request)) }));
        }
      }
      return enviar(404, { error: "Ruta no encontrada." });
    } catch (error) {
      if (error instanceof ErrorDenuncia) return enviar(error.status, { error: error.message });
      // Mensaje fijo: no volcar errores SQL, cuerpos, cabeceras, IP, archivos ni tokens.
      logError("Fallo interno del servicio de denuncias.");
      return enviar(503, { error: "El servicio de denuncias no está disponible." });
    } finally { if (ocupada) activas--; }
  };
}
