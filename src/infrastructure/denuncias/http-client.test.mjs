import { test } from "node:test";
import assert from "node:assert/strict";
import { llamarDenuncias, leerJsonLimitado } from "./http-client.mjs";

const config = { url: "https://denuncias.example", apiKey: "b".repeat(64), production: true };
test("proxy público no reenvía tokens, cookies, IP o navegador del cliente", async () => {
  const body = { municipioId: 1, servicioId: 2, descripcion: "Conexión sospechosa al lado del poste" };
  let llamada;
  const result = await llamarDenuncias({ path: "/v1/denuncias", method: "POST", body }, { ...config, fetcher: async (url, options) => {
    llamada = { url, options }; return Response.json({ folio: "folio", estado: "PENDIENTE" }, { status: 201 });
  } });
  assert.equal(result.status, 201);
  assert.equal(llamada.url.pathname, "/v1/denuncias");
  assert.deepEqual(Object.keys(llamada.options.headers).sort(), ["Accept", "Authorization", "Content-Type"]);
  assert.equal(llamada.options.credentials, "omit");
  assert.equal(llamada.options.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(llamada.options.body), body);
});
test("clave ausente, HTTP externo o producción local impiden el envío", async () => {
  for (const change of [{ apiKey: "" }, { url: "http://denuncias.example" }, { url: "http://localhost:4002" }, { url: "https://user:secret@denuncias.example" }]) {
    await assert.rejects(llamarDenuncias({ path: "/v1/denuncias" }, { ...config, ...change }), { status: 503 });
  }
});
test("errores remotos de moderación y red no se convierten en éxito", async () => {
  await assert.rejects(llamarDenuncias({ path: "/v1/moderacion" }, { ...config, fetcher: async () => Response.json({ error: "Estado cambiado" }, { status: 409 }) }), { status: 409 });
  await assert.rejects(llamarDenuncias({ path: "/v1/denuncias" }, { ...config, fetcher: async () => { throw new Error("url privada"); } }), { status: 502 });
});
test("límite de cuerpo funciona sin Content-Length y no registra el texto", async () => {
  const request = (text) => new Request("http://localhost/api/denuncias", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
  assert.deepEqual(await leerJsonLimitado(request('{"ok":true}'), 30), { ok: true });
  await assert.rejects(leerJsonLimitado(request("x".repeat(40)), 30), { status: 413 });
  await assert.rejects(leerJsonLimitado(request("no json"), 30), { status: 400 });
});
