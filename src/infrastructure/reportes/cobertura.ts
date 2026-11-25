import "server-only";
import { sql } from "@/infrastructure/database/postgres";
import type { DatosReporte } from "@/application/validators/validarReporte";
import { ErrorSolicitudHTTP } from "../http/leer-json.mjs";

/** Verificar migración y geometría antes de aceptar/publicar el evento. */
export async function comprobarCobertura(datos: DatosReporte): Promise<number | null> {
  if (!datos.categoriaIncidente && !datos.fechaInicioEstimada && !datos.areaAfectada) return null;
  await sql`SELECT categoria_incidente,fecha_inicio_estimada,area_afectada_geojson,area_afectada_m2 FROM public.reportes LIMIT 0`;
  const catalogos = await sql`SELECT 1 FROM public.municipios m CROSS JOIN public.servicios s WHERE m.id=${datos.municipioId} AND s.id=${datos.servicioId}`;
  if (!catalogos.length) throw new ErrorSolicitudHTTP(400, "Municipio o servicio no disponible.");
  const [result] = await sql`SELECT public.validar_area_reportada(
    ${datos.areaAfectada ? sql.json(datos.areaAfectada) : null}::jsonb,
    ${datos.latitud}::double precision,${datos.longitud}::double precision) AS superficie`;
  return result.superficie == null ? null : Number(result.superficie);
}
