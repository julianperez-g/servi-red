export type AreaAfectada = { type: "Polygon"; coordinates: number[][][] };
export {
  CATEGORIAS_INCIDENTE, MAX_VERTICES, MAX_REPORTE_BYTES, nombreCategoria,
  esServicioSaneamiento, formatearArea, fechaColombiaAISO, normalizarInicio,
  normalizarArea, normalizarCobertura, puntoEnArea,
} from "../../../shared/reportes/cobertura.mjs";
