import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "../src/http.mjs";

const apiKey = "a".repeat(64);

async function iniciar(t, overrides = {}) {
  const server = createServer(crearHandler({
    apiKey,
    consultar: async (filtros) => ({ filtros, resumen: { total: 0 } }),
    comprobarDB: async () => {},
    logError: () => {},
    ...overrides,
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  return (path, options = {}) => fetch(`${url}${path}`, options);
}

test("healthcheck sin clave verifica la base de datos", async (t) => {
  let comprobado = false;
  const pedir = await iniciar(t, { comprobarDB: async () => { comprobado = true; } });
  const response = await pedir("/health");
  assert.equal(response.status, 200);
  assert.equal(comprobado, true);
  assert.deepEqual(await response.json(), { status: "ok", servicio: "indicadores" });
});

test("requiere clave antes de consultar o validar filtros", async (t) => {
  let llamadas = 0;
  const pedir = await iniciar(t, { consultar: async () => { llamadas++; } });
  for (const headers of [{}, { Authorization: "Bearer incorrecta" }]) {
    assert.equal((await pedir("/v1/continuidad?desde=fecha-invalida", { headers })).status, 401);
  }
  assert.equal(llamadas, 0);
});

test("conserva filtros y no permite cachear la respuesta", async (t) => {
  const pedir = await iniciar(t);
  const response = await pedir("/v1/continuidad?municipio=1&agrupacion=year", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).filtros.municipio, 1);
});

test("devuelve 400 por filtros inválidos y 405/404 para rutas no permitidas", async (t) => {
  const pedir = await iniciar(t);
  assert.equal((await pedir("/v1/continuidad?agrupacion=decade", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })).status, 400);
  assert.equal((await pedir("/v1/continuidad", { method: "POST" })).status, 405);
  assert.equal((await pedir("/otra-ruta")).status, 404);
});

test("un fallo de base devuelve 503 sin detalles privados", async (t) => {
  const fallar = async () => { throw new Error("postgresql://dato-privado"); };
  const pedir = await iniciar(t, { consultar: fallar, comprobarDB: fallar });
  for (const path of ["/health", "/v1/continuidad"]) {
    const response = await pedir(path, { headers: { Authorization: `Bearer ${apiKey}` } });
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes("postgresql"), false);
  }
});

test("no arranca con una clave ausente o demasiado corta", () => {
  assert.throws(() => crearHandler({ apiKey: "corta" }));
});
