export class ConsultaInvalida extends Error {}

const AGRUPACIONES = new Set(["day", "month", "year"]);

function fechaValida(fecha) {
  if (fecha === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith("0000")) {
    return false;
  }
  const parseada = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(parseada.getTime()) &&
    parseada.toISOString().slice(0, 10) === fecha;
}

/** @param {URLSearchParams} params */
export function leerFiltros(params) {
  for (const nombre of ["desde", "hasta", "agrupacion", "municipio"]) {
    if (params.getAll(nombre).length > 1) {
      throw new ConsultaInvalida("No se pueden repetir los filtros.");
    }
  }

  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const agrupacion = params.get("agrupacion") ?? "day";
  const municipioTexto = params.get("municipio");
  const municipio = municipioTexto === null ? null : Number(municipioTexto);

  if (
    !fechaValida(desde) || !fechaValida(hasta) ||
    (desde && hasta && desde > hasta) || !AGRUPACIONES.has(agrupacion)
  ) {
    throw new ConsultaInvalida("Rango de fechas o agrupación inválida.");
  }
  if (municipioTexto !== null && (
    !/^[1-9]\d*$/.test(municipioTexto) ||
    !Number.isSafeInteger(municipio) || municipio < 1
  )) {
    throw new ConsultaInvalida("El municipio debe ser un identificador positivo.");
  }

  return { desde, hasta, agrupacion, municipio };
}
