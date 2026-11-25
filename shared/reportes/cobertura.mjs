/** Contrato compartido por navegador, API y worker. Sin dependencias de Node.js. */
export const CATEGORIAS_INCIDENTE = Object.freeze([
  { codigo: "OBSTRUCCION", servicioId: 4, tipo: "FALLA", nombre: "Obstrucción o taponamiento" },
  { codigo: "DESBORDAMIENTO", servicioId: 4, tipo: "FALLA", nombre: "Desbordamiento de aguas residuales" },
  { codigo: "DANO_RED", servicioId: 4, tipo: "FALLA", nombre: "Daño en red de alcantarillado" },
  { codigo: "RECOLECCION_INCUMPLIDA", servicioId: 5, tipo: "FALLA", nombre: "Recolección no realizada" },
  { codigo: "ACUMULACION_RESIDUOS", servicioId: 5, tipo: "FALLA", nombre: "Acumulación de residuos" },
  { codigo: "BARRIDO_DEFICIENTE", servicioId: 5, tipo: "BAJA_CALIDAD", nombre: "Barrido o limpieza deficiente" },
]);
export const MAX_VERTICES = 100;
export const MAX_REPORTE_BYTES = 20_000;

export function nombreCategoria(codigo) {
  return CATEGORIAS_INCIDENTE.find((c) => c.codigo === codigo)?.nombre || "Sin categoría específica";
}
export function esServicioSaneamiento(id) { return [4, 5].includes(Number(id)); }
export function formatearArea(valor) {
  if (valor == null || !Number.isFinite(Number(valor)) || Number(valor) <= 0) return "Sin área estimada";
  const m2 = Number(valor);
  const [numero, unidad] = m2 >= 1_000_000 ? [m2 / 1_000_000, "km²"] : m2 >= 10_000 ? [m2 / 10_000, "ha"] : [m2, "m²"];
  return `${numero.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ${unidad}`;
}

function calendarioValido(year, month, day, hour, minute, second = 0) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return year >= 1900 && year <= 9999 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && second >= 0 && second < 60;
}

/** datetime-local se interpreta expresamente en Colombia, no en la zona del navegador. */
export function fechaColombiaAISO(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !calendarioValido(...match.slice(1).map(Number))) throw new Error("Indica una fecha y hora de Colombia válidas.");
  return new Date(`${value}:00-05:00`).toISOString();
}

export function normalizarInicio(value, ahora = new Date(), referencia = ahora) {
  if (value == null || value === "") return null;
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || !calendarioValido(...match.slice(1, 7).map(Number))) throw new Error("El inicio estimado requiere una fecha ISO válida con zona horaria.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(new Date(referencia).getTime()) || date > ahora || date > new Date(referencia)) {
    throw new Error("El inicio estimado no puede ser futuro ni posterior al registro.");
  }
  return date.toISOString();
}

const iguales = (a, b) => a[0] === b[0] && a[1] === b[1];
const cruz = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function sobreSegmento(p, a, b) {
  return Math.abs(cruz(a, b, p)) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-12 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;
}
function seCruzan(a, b, c, d) {
  const x = cruz(a, b, c), y = cruz(a, b, d), z = cruz(c, d, a), w = cruz(c, d, b);
  return (Math.sign(x) !== Math.sign(y) && Math.sign(z) !== Math.sign(w)) ||
    sobreSegmento(c, a, b) || sobreSegmento(d, a, b) || sobreSegmento(a, c, d) || sobreSegmento(b, c, d);
}

export function puntoEnArea(area, latitud, longitud) {
  if (!area) return true;
  const ring = area.coordinates[0], p = [longitud, latitud];
  let dentro = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (sobreSegmento(p, a, b)) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
  }
  return dentro;
}

/**
 * Polígono WGS84 simple, sin agujeros, con límite explícito de complejidad.
 * @returns {{ type: "Polygon", coordinates: number[][][] } | null}
 */
export function normalizarArea(input) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !["type", "coordinates"].includes(k)) ||
      input.type !== "Polygon" || !Array.isArray(input.coordinates) || input.coordinates.length !== 1 || !Array.isArray(input.coordinates[0])) {
    throw new Error("Dibuja un único polígono, sin huecos ni campos adicionales.");
  }
  const ring = input.coordinates[0];
  if (ring.length < 4 || ring.length > MAX_VERTICES + 1) throw new Error("El área necesita entre 3 y 100 vértices y un contorno cerrado.");
  const puntos = ring.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < -82 || p[0] > -66 || p[1] < -4.3 || p[1] > 13.5) {
      throw new Error("Las coordenadas del área deben ser pares [longitud, latitud] dentro del rango de Colombia.");
    }
    return p.map((n) => Number(n.toFixed(6)));
  });
  if (!iguales(puntos[0], puntos.at(-1))) throw new Error("Cierra el contorno del área afectada.");
  const n = puntos.length - 1;
  if (new Set(puntos.slice(0, -1).map((p) => p.join(","))).size !== n) throw new Error("El área contiene vértices repetidos o demasiado cercanos.");
  let superficie = 0;
  for (let i = 0; i < n; i++) {
    // Trasladar al origen reduce la cancelación numérica para áreas pequeñas.
    superficie += cruz(puntos[0], puntos[i], puntos[i + 1]);
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (seCruzan(puntos[i], puntos[i + 1], puntos[j], puntos[j + 1])) throw new Error("El polígono no puede cruzarse ni tocarse a sí mismo.");
    }
  }
  if (Math.abs(superficie) < 1e-12) throw new Error("El área no puede ser una línea ni tener superficie nula.");
  return { type: "Polygon", coordinates: [puntos] };
}

export function normalizarCobertura(datos, { ahora = new Date(), referencia = ahora } = {}) {
  const categoriaIncidente = datos.categoriaIncidente ?? null;
  if (categoriaIncidente !== null) {
    const c = CATEGORIAS_INCIDENTE.find((x) => x.codigo === categoriaIncidente);
    if (!c || c.servicioId !== Number(datos.servicioId) || c.tipo !== datos.tipoNovedad) throw new Error("La categoría no corresponde al servicio y tipo de novedad.");
  }
  const fechaInicioEstimada = normalizarInicio(datos.fechaInicioEstimada, ahora, referencia);
  const areaAfectada = normalizarArea(datos.areaAfectada);
  if (areaAfectada && !puntoEnArea(areaAfectada, datos.latitud, datos.longitud)) throw new Error("El punto del incidente debe estar dentro o sobre el área dibujada.");
  return { categoriaIncidente, fechaInicioEstimada, areaAfectada };
}
