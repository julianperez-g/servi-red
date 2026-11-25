import { test } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { leerFiltros } from "../src/filtros.mjs";
import { consultarIndicadores } from "../src/repositorio.mjs";

const databaseUrl = process.env.INDICADORES_TEST_DATABASE_URL;

test("SQL de continuidad contra fixture aislado", { skip: !databaseUrl }, async (t) => {
  const sql = postgres(databaseUrl, { ssl: false, prepare: false, max: 1, connect_timeout: 5 });
  t.after(() => sql.end());
  const [fixture] = await sql`SELECT version FROM public.indicadores_test_fixture`;
  assert.equal(fixture.version, 1, "Se requiere la base aislada con test/fixtures.sql");
  const consultar = (query) => consultarIndicadores(sql, leerFiltros(new URLSearchParams(query)));

  await t.test("rango inclusivo en Colombia y criterios de duración", async () => {
    const datos = await consultar("desde=2026-01-01&hasta=2026-01-31&agrupacion=month");
    assert.deepEqual(datos.resumen, {
      total: 6, pendientes: 0, en_atencion: 1, resueltos: 5, alta_severidad: 2,
      total_cortes: 5, cortes_resueltos: 3, duracion_total_horas: 26, horas_promedio: 8.7,
    });
    assert.equal(datos.periodos.length, 1);
    assert.equal(datos.periodos[0].nombre, "2026-01-01");
    assert.equal(datos.continuidad.length, 2);
    assert.deepEqual(datos.municipios.map((m) => m.municipio_id), [1, 2]);
    assert.equal(datos.municipios[0].nombre, datos.municipios[1].nombre);
    assert.equal(datos.municipios[0].cortes, 4);
    assert.equal(datos.municipios[0].duracion_promedio_horas, 1);
  });

  await t.test("el municipio filtra todos los agregados", async () => {
    const datos = await consultar("desde=2026-01-01&hasta=2026-01-31&municipio=1&agrupacion=year");
    assert.equal(datos.resumen.total, 4);
    assert.equal(datos.resumen.total_cortes, 4);
    assert.equal(datos.municipios.length, 1);
    assert.equal(datos.continuidad.length, 1);
    assert.equal(datos.periodos[0].reportes, 4);
    assert.equal(datos.servicios.reduce((total, s) => total + s.reportes, 0), 4);
  });

  await t.test("agrupa periodos locales, no UTC", async () => {
    const datos = await consultar("agrupacion=month");
    assert.deepEqual(datos.periodos.map((p) => [p.nombre, p.reportes]), [
      ["2025-12-01", 1], ["2026-01-01", 6], ["2026-02-01", 1],
    ]);
    assert.equal(datos.resumen.duracion_total_horas, 29);
    assert.equal(datos.resumen.horas_promedio, 7.3);
    assert.equal(datos.continuidad.length, 4);
  });

  await t.test("sin datos: ceros, promedio nulo y arreglos vacíos", async () => {
    const datos = await consultar("desde=2040-01-01&hasta=2040-01-01");
    assert.equal(datos.resumen.total, 0);
    assert.equal(datos.resumen.duracion_total_horas, 0);
    assert.equal(datos.resumen.horas_promedio, null);
    for (const campo of ["estados", "severidades", "servicios", "municipios", "departamentos", "periodos", "continuidad"]) {
      assert.deepEqual(datos[campo], []);
    }
  });
});
