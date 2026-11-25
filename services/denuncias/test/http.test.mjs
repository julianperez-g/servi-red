import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "../src/http.mjs";

const apiKey = "a".repeat(64);
const operador = "a68e7863-d0dc-4d26-ac69-4ef306209501";
const datos = { municipioId: 1, servicioId: 2, descripcion: "Conexión sospechosa en un poste. Escribir a alguien@example.com" };
async function iniciar(t, overrides = {}) {
  const capturas = [];
  const repositorio = { comprobarDB: async () => {}, crear: async (...args) => { capturas.push(args); return { folio: operador, estado: "PENDIENTE" }; }, listar: async () => ({ denuncias: [] }), ...overrides };
  const logs = [];
  const server = createServer(crearHandler({ apiKey, repositorio, logError: (msg) => logs.push(msg) }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const pedir = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  return { pedir, capturas, logs };
}
const post = (extra = {}) => ({ method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...extra }, body: JSON.stringify(datos) });
test("healthcheck mínimo; servicio exige clave antes de recibir una denuncia", async (t) => {
  const { pedir, capturas } = await iniciar(t);
  assert.equal((await pedir("/health")).status, 200);
  assert.equal((await pedir("/v1/denuncias", { ...post(), headers: { "Content-Type": "application/json" } })).status, 401);
  assert.equal(capturas.length, 0);
});
test("no persiste IP, agente, cookie o identidad de cabeceras; limpia texto antes del repositorio", async (t) => {
  const { pedir, capturas } = await iniciar(t);
  const response = await pedir("/v1/denuncias", post({ "X-Forwarded-For": "192.0.2.77", "User-Agent": "mi navegador privado", Cookie: "sesion=privada" }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const saved = JSON.stringify(capturas);
  for (const value of ["192.0.2.77", "mi navegador privado", "sesion", "alguien@example.com"]) assert.equal(saved.includes(value), false);
  assert.deepEqual(Object.keys(capturas[0][0]).sort(), ["descripcion", "latitud", "longitud", "municipioId", "servicioId"]);
});
test("la lista privada exige identidad de moderador suministrada por el proxy", async (t) => {
  const { pedir } = await iniciar(t);
  const headers = { Authorization: `Bearer ${apiKey}` };
  assert.equal((await pedir("/v1/moderacion", { headers })).status, 403);
  assert.equal((await pedir("/v1/moderacion", { headers: { ...headers, "X-Operador-Id": operador } })).status, 200);
  assert.equal((await pedir("/v1/moderacion?estado=MAL", { headers: { ...headers, "X-Operador-Id": operador } })).status, 400);
});
test("errores internos no exponen la excepción ni se loguea información sensible", async (t) => {
  const { pedir, logs } = await iniciar(t, { crear: async () => { throw new Error("identidad-privada postgres://secreto"); } });
  const response = await pedir("/v1/denuncias", post());
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("secreto"), false);
  assert.deepEqual(logs, ["Fallo interno del servicio de denuncias."]);
});
test("presupuesto global antiabuso no necesita identificar al remitente", async (t) => {
  const { pedir, capturas } = await iniciar(t);
  for (let i = 0; i < 20; i++) assert.equal((await pedir("/v1/denuncias", post())).status, 201);
  const response = await pedir("/v1/denuncias", post());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(capturas.length, 20);
});
