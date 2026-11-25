export class ErrorServicioIndicadores extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Cliente exclusivo servidor-servidor. La ruta pública no reenvía cookies,
 * tokens de usuarios, cabeceras arbitrarias ni URLs suministradas por clientes.
 * @param {URLSearchParams} params
 * @param {{ url?: string, apiKey?: string, production?: boolean, fetcher?: typeof fetch }} config
 */
export async function consultarServicioIndicadores(params, config) {
  const { url, apiKey, production = false, fetcher = fetch } = config;
  if (!url || !apiKey || apiKey.length < 32) {
    throw new ErrorServicioIndicadores(503, "El servicio de indicadores no está configurado.");
  }

  let endpoint;
  try {
    endpoint = new URL(url);
    const esLocal = ["localhost", "127.0.0.1", "[::1]", "indicadores"].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      endpoint.pathname !== "/" ||
      (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && !production && esLocal)) ||
      (production && esLocal)) {
      throw new Error("URL de servicio inválida");
    }
    endpoint.pathname = "/v1/continuidad";
  } catch {
    throw new ErrorServicioIndicadores(503, "La URL del servicio de indicadores no es válida.");
  }

  for (const [nombre, valor] of params) {
    if (["desde", "hasta", "agrupacion", "municipio"].includes(nombre)) {
      endpoint.searchParams.append(nombre, valor);
    }
  }

  let response;
  let datos;
  try {
    response = await fetcher(endpoint, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    datos = await response.json();
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new ErrorServicioIndicadores(timeout ? 504 : 502,
      timeout ? "El servicio de indicadores tardó demasiado en responder." :
        "No fue posible conectar con el servicio de indicadores.");
  }

  if (response.status === 400) {
    throw new ErrorServicioIndicadores(400, "Rango de fechas, municipio o agrupación inválidos.");
  }
  if (!response.ok || !datos || typeof datos !== "object" ||
    !datos.resumen || typeof datos.resumen.total !== "number" ||
    !["estados", "severidades", "servicios", "municipios", "departamentos", "periodos"].every(
      (campo) => Array.isArray(datos[campo])
    )) {
    throw new ErrorServicioIndicadores(502, "El servicio de indicadores devolvió una respuesta inválida.");
  }
  return datos;
}
