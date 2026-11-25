import { createServer } from "node:http";
import { crearRuntime } from "./runtime.mjs";

const { PORT = "4001" } = process.env;
const port = Number(PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Configura un PORT válido para indicadores.");
}

const { sql, handler } = crearRuntime();
const server = createServer(handler);
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Servicio de indicadores escuchando en puerto ${port}`);
});

let cerrando = false;
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  const limite = setTimeout(() => process.exit(1), 10_000);
  limite.unref();
  server.close(async () => {
    await sql.end({ timeout: 5 });
    clearTimeout(limite);
  });
}
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
