import { createHash, timingSafeEqual } from "node:crypto";
import { ConsultaInvalida, leerFiltros } from "./filtros.mjs";

function autorizado(authorization, apiKey) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const hash = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(authorization.slice(7)), hash(apiKey));
}

export function crearHandler({ apiKey, consultar, comprobarDB, logError = console.error }) {
  if (!apiKey || apiKey.length < 32) {
    throw new Error("INDICADORES_API_KEY debe tener al menos 32 caracteres.");
  }

  return async (request, response) => {
    const enviar = (status, datos, headers = {}) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      });
      response.end(JSON.stringify(datos));
    };

    try {
      // La base es constante: no confiar en Host para resolver rutas.
      const url = new URL(request.url, "http://indicadores.internal");
      if (!["/health", "/v1/continuidad"].includes(url.pathname)) {
        return enviar(404, { error: "Ruta no encontrada." });
      }
      if (request.method !== "GET") {
        return enviar(405, { error: "Método no permitido." }, { Allow: "GET" });
      }
      if (url.pathname === "/health") {
        await comprobarDB();
        return enviar(200, { status: "ok", servicio: "indicadores" });
      }
      if (!autorizado(request.headers.authorization, apiKey)) {
        return enviar(401, { error: "Servicio no autorizado." });
      }

      const filtros = leerFiltros(url.searchParams);
      return enviar(200, await consultar(filtros));
    } catch (error) {
      if (error instanceof ConsultaInvalida) {
        return enviar(400, { error: error.message });
      }
      // No registrar URLs de conexión, parámetros ni credenciales.
      logError("Error en servicio de indicadores", { codigo: error?.code ?? "INTERNAL" });
      return enviar(503, { error: "El servicio de indicadores no está disponible." });
    }
  };
}
