import { test } from "node:test";
import assert from "node:assert/strict";
import { consultarServicioIndicadores, ErrorServicioIndicadores } from "./http-client.mjs";

const respuesta = {
  resumen: { total: 0 }, estados: [], severidades: [], servicios: [],
  municipios: [], departamentos: [], periodos: [],
};
const baseConfig = { url: "http://127.0.0.1:4001", apiKey: "a".repeat(64) };

test("proxy reenvía únicamente filtros y la clave servidor-servidor", async () => {
  const datos = await consultarServicioIndicadores(new URLSearchParams(
    "desde=2026-01-01&agrupacion=month&municipio=2&token=privado"
  ), {
    ...baseConfig,
    fetcher: async (url, options) => {
      assert.equal(url.pathname, "/v1/continuidad");
      assert.equal(url.searchParams.get("municipio"), "2");
      assert.equal(url.searchParams.has("token"), false);
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Bearer ${baseConfig.apiKey}`);
      return Response.json(respuesta);
    },
  });
  assert.deepEqual(datos, respuesta);
});

test("devuelve 503 por configuración ausente o URL insegura en producción", async () => {
  for (const config of [
    {}, { ...baseConfig, production: true },
    { ...baseConfig, url: "https://host.example/otra-ruta" },
    { ...baseConfig, url: "https://host.example?token=no" },
    { ...baseConfig, url: "https://usuario:secreto@host.example" },
  ]) {
    await assert.rejects(consultarServicioIndicadores(new URLSearchParams(), config),
      (error) => error instanceof ErrorServicioIndicadores && error.status === 503);
  }
});

test("admite URL HTTPS externa para Vercel", async () => {
  await consultarServicioIndicadores(new URLSearchParams(), {
    ...baseConfig, url: "https://indicadores.example.com", production: true,
    fetcher: async () => Response.json(respuesta),
  });
});

for (const [nombre, fetcher, status] of [
  ["red caída", async () => { throw new TypeError("fetch failed"); }, 502],
  ["timeout", async () => { throw new DOMException("timeout", "TimeoutError"); }, 504],
  ["filtros inválidos", async () => Response.json({ error: "inválido" }, { status: 400 }), 400],
  ["clave rechazada", async () => Response.json({}, { status: 401 }), 502],
  ["servicio caído", async () => Response.json({}, { status: 503 }), 502],
  ["HTML en vez de JSON", async () => new Response("<html>fallo</html>"), 502],
  ["contrato incorrecto", async () => Response.json({ status: "ok" }), 502],
]) {
  test(`maneja ${nombre} sin devolver datos vacíos como éxito`, async () => {
    await assert.rejects(consultarServicioIndicadores(new URLSearchParams(), {
      ...baseConfig, fetcher,
    }), (error) => error instanceof ErrorServicioIndicadores && error.status === status);
  });
}
