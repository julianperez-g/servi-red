import { test } from "node:test";
import assert from "node:assert/strict";
import { ConsultaInvalida, leerFiltros } from "../src/filtros.mjs";

test("valores por defecto y municipio opcional", () => {
  assert.deepEqual(leerFiltros(new URLSearchParams()), {
    desde: null, hasta: null, agrupacion: "day", municipio: null,
  });
  assert.deepEqual(leerFiltros(new URLSearchParams(
    "desde=2024-02-29&hasta=2024-03-01&agrupacion=month&municipio=2"
  )), { desde: "2024-02-29", hasta: "2024-03-01", agrupacion: "month", municipio: 2 });
});

for (const query of [
  "desde=2026-02-29", "hasta=2026-13-01", "desde=ayer", "desde=",
  "desde=0000-01-01", "desde=2026-02-01&hasta=2026-01-01",
  "agrupacion=decade", "agrupacion=month%27", "municipio=0", "municipio=-1",
  "municipio=1.5", "municipio=", "municipio=1e2", "municipio=9007199254740992",
  "municipio=1&municipio=2", "desde=2026-01-01&desde=2026-02-01",
]) {
  test(`rechaza consulta inválida: ${query}`, () => {
    assert.throws(() => leerFiltros(new URLSearchParams(query)), ConsultaInvalida);
  });
}
