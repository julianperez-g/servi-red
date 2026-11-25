import { createServer } from "node:http";
import postgres from "postgres";
import { crearRepositorio } from "./repositorio.mjs";
import { crearHandler } from "./http.mjs";

const port = Number(process.env.PORT || 4002);
if (!process.env.DATABASE_URL || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Configura DATABASE_URL y un PORT válido para denuncias.");
}
const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require", prepare: false, max: 3, connect_timeout: 8, idle_timeout: 10,
  connection: { application_name: "servired-denuncias", statement_timeout: 10_000 },
});
const server = createServer(crearHandler({ apiKey: process.env.DENUNCIAS_API_KEY, repositorio: crearRepositorio(sql) }));
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.listen(port, "0.0.0.0", () => console.log(`Servicio de denuncias escuchando en puerto ${port}`));
let cerrando = false;
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  const timeout = setTimeout(() => process.exit(1), 15_000).unref();
  await new Promise((resolve) => server.close(resolve));
  await sql.end({ timeout: 5 });
  clearTimeout(timeout);
}
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
