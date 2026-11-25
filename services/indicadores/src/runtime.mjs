import postgres from "postgres";
import { crearHandler } from "./http.mjs";
import { consultarIndicadores } from "./repositorio.mjs";

/** Mismo runtime y consultas en Docker y en Vercel, sin duplicar cálculos. */
export function crearRuntime({ DATABASE_URL, INDICADORES_API_KEY } = process.env) {
  if (!DATABASE_URL) throw new Error("Configura DATABASE_URL para indicadores.");

  const sql = postgres(DATABASE_URL, {
    ssl: "require",
    prepare: false,
    max: 3,
    connect_timeout: 5,
    idle_timeout: 5,
    connection: { application_name: "servi-red-indicadores", statement_timeout: 8000 },
  });

  const handler = crearHandler({
    apiKey: INDICADORES_API_KEY,
    consultar: (filtros) => consultarIndicadores(sql, filtros),
    comprobarDB: () => sql`SELECT 1`,
  });
  return { sql, handler };
}
