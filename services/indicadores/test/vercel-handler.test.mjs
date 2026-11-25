import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandlerVercel } from "../src/vercel-handler.mjs";

test("libera conexiones tras responder sin destruir el pool", async () => {
  let cerradas = 0;
  const tareas = [];
  const handler = crearHandlerVercel({
    sql: { close: async () => { cerradas++; } },
    handler: async (_request, response) => { response.terminada = true; },
    waitUntil: (tarea) => tareas.push(tarea),
  });
  const response = {};
  await handler({}, response);
  assert.equal(response.terminada, true);
  await Promise.all(tareas);
  assert.equal(cerradas, 1);
  await handler({}, {});
  assert.equal(cerradas, 2);
});

test("no cierra el pool mientras haya peticiones concurrentes activas", async () => {
  let finalizar;
  let cerradas = 0;
  const enCurso = new Promise((resolve) => { finalizar = resolve; });
  const tareas = [];
  const handler = crearHandlerVercel({
    sql: { close: async () => { cerradas++; } },
    handler: async (request) => { if (request.lenta) await enCurso; },
    waitUntil: (tarea) => tareas.push(tarea),
  });
  const lenta = handler({ lenta: true }, {});
  await handler({}, {});
  assert.equal(cerradas, 0);
  finalizar();
  await lenta;
  await Promise.all(tareas);
  assert.equal(cerradas, 1);
});

test("también limpia tras un fallo y no expone errores de conexión", async () => {
  const tareas = [];
  const logs = [];
  const handler = crearHandlerVercel({
    sql: { close: async () => { throw new Error("postgresql://privado"); } },
    handler: async () => { throw new Error("fallo de petición"); },
    waitUntil: (tarea) => tareas.push(tarea),
    logError: (mensaje) => logs.push(mensaje),
  });
  await assert.rejects(handler({}, {}), /fallo de petición/);
  await Promise.all(tareas);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes("postgresql"), false);
});
