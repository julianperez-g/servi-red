import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIAS_INCIDENTE, fechaColombiaAISO, normalizarInicio, normalizarArea, normalizarCobertura, puntoEnArea, formatearArea } from "./cobertura.mjs";
import { validarEvento } from "../../worker/procesador.mjs";

const area = { type: "Polygon", coordinates: [[[-74.08,4.70],[-74.06,4.70],[-74.06,4.72],[-74.08,4.72],[-74.08,4.70]]] };
const base = { servicioId: 4, tipoNovedad: "FALLA", categoriaIncidente: "OBSTRUCCION", latitud: 4.711, longitud: -74.0721 };
test("categorías corresponden al servicio y preservan el contrato genérico", () => {
  for (const c of CATEGORIAS_INCIDENTE) assert.equal(normalizarCobertura({ ...base, servicioId: c.servicioId, tipoNovedad: c.tipo, categoriaIncidente: c.codigo }).categoriaIncidente, c.codigo);
  assert.throws(() => normalizarCobertura({ ...base, servicioId: 1 }), /categoría/);
  assert.throws(() => normalizarCobertura({ ...base, tipoNovedad: "CORTE" }), /categoría/);
  assert.throws(() => normalizarCobertura({ ...base, categoriaIncidente: {} }), /categoría/);
});
test("hora de Colombia es explícita y rechaza calendario imposible o futuro", () => {
  assert.equal(fechaColombiaAISO("2026-01-01T08:30"), "2026-01-01T13:30:00.000Z");
  for (const value of ["2026-02-30T08:00", "2026-13-01T00:00", "2026-01-01T24:00"]) assert.throws(() => fechaColombiaAISO(value));
  const now = new Date("2026-02-01T00:00:00Z");
  assert.throws(() => normalizarInicio("2026-02-02T00:00:00Z", now), /futuro/);
  assert.throws(() => normalizarInicio("2026-01-01T12:00:00", now), /zona/);
  assert.throws(() => normalizarInicio("2026-01-10T00:00:00Z", now, "2026-01-09T00:00:00Z"), /registro/);
  assert.equal(normalizarInicio(null), null);
});
test("polígono cerrado, punto interior y límite en Colombia", () => {
  assert.deepEqual(normalizarArea(area), area);
  assert.equal(puntoEnArea(area,4.71,-74.07), true);
  assert.equal(puntoEnArea(area,4.70,-74.08), true);
  assert.equal(puntoEnArea(area,5,-75), false);
  assert.throws(() => normalizarCobertura({ ...base, areaAfectada: area, latitud: 8 }), /dentro/);
});
test("rechaza cruces, huecos, líneas, anillos abiertos, campos extra y vértices repetidos", () => {
  const invalidas = [
    { ...area, coordinates: [[[-74,4],[-73,5],[-73,4],[-74,5],[-74,4]]] },
    { ...area, coordinates: [area.coordinates[0],area.coordinates[0]] },
    { ...area, coordinates: [[[-74,4],[-73,4],[-72,4],[-74,4]]] },
    { ...area, coordinates: [area.coordinates[0].slice(0,-1)] },
    { ...area, crs: "no permitido" },
    { ...area, coordinates: [[[-74,4],[-74,4],[-73,5],[-74,4]]] },
    { ...area, coordinates: [[[0,0],[1,0],[1,1],[0,0]]] },
  ];
  for (const p of invalidas) assert.throws(() => normalizarArea(p));
  const demasiados = Array.from({ length: 102 },(_,i) => [-74 + i/1000,4 + (i%2)/100]);
  assert.throws(() => normalizarArea({ ...area, coordinates: [demasiados] }), /100/);
});
test("worker acepta mensajes viejos y valida inicio/categoría/polígono de los nuevos", () => {
  const evento = { tipo: "REPORTE_CREADO", eventoId: "20000000-0000-4000-8000-000000000001", fechaEvento: "2026-01-02T00:00:00Z",
    datos: { municipioId: 1, servicioId: 1, tipoNovedad: "CORTE", descripcion: "Reporte de prueba sin campos nuevos", severidad: "BAJA", latitud: 4.711, longitud: -74.0721 } };
  const old = validarEvento(evento);
  assert.equal(old.fechaInicioEstimada,null); assert.equal(old.areaAfectada,null); assert.equal(old.categoriaIncidente,null);
  const nuevo = validarEvento({ ...evento, datos: { ...evento.datos, ...base, fechaInicioEstimada: "2026-01-01T00:00:00Z", areaAfectada: area } });
  assert.equal(nuevo.categoriaIncidente,"OBSTRUCCION");
  assert.deepEqual(nuevo.areaAfectada,area);
  assert.equal(formatearArea(null), "Sin área estimada");
  assert.match(formatearArea(10000), /ha/);
});
