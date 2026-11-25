import { normalizarCobertura } from "../shared/reportes/cobertura.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validarEvento(evento) {
  if (!evento || evento.tipo !== "REPORTE_CREADO" || typeof evento.eventoId !== "string" || !UUID.test(evento.eventoId)) {
    throw new Error("Evento inválido");
  }

  const d = evento.datos;
  if (
    !d || typeof d !== "object" || Array.isArray(d) ||
    !Number.isSafeInteger(d.municipioId) || d.municipioId < 1 ||
    !Number.isSafeInteger(d.servicioId) || d.servicioId < 1 ||
    !["CORTE", "FALLA", "BAJA_CALIDAD"].includes(d.tipoNovedad) ||
    !["BAJA", "MEDIA", "ALTA"].includes(d.severidad) ||
    typeof d.descripcion !== "string" || d.descripcion.trim().length < 10 || d.descripcion.length > 2000 ||
    !Number.isFinite(d.latitud) || !Number.isFinite(d.longitud) ||
    d.latitud < -4.3 || d.latitud > 13.5 || d.longitud < -82 || d.longitud > -66 ||
    (d.ciudadanoId != null && (typeof d.ciudadanoId !== "string" || !UUID.test(d.ciudadanoId)))
  ) {
    throw new Error("Reporte no cumple validaciones");
  }

  let evidencia = null;
  if (d.evidencia != null) {
    const e = d.evidencia;
    if (
      e.bucket !== "evidencias-reportes" || typeof e.ruta !== "string" ||
      !/^temporales\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(e.ruta) ||
      !["image/jpeg", "image/png", "image/webp"].includes(e.tipo) ||
      !Number.isSafeInteger(e.tamano) || e.tamano < 1 || e.tamano > 450 * 1024
    ) {
      throw new Error("Datos de evidencia inválidos");
    }
    evidencia = {
      ruta: e.ruta,
      nombreArchivo: e.ruta.split("/").pop(),
      tipoMime: e.tipo,
      tamanoBytes: e.tamano,
    };
  }

  return {
    municipioId: d.municipioId,
    servicioId: d.servicioId,
    tipoNovedad: d.tipoNovedad,
    descripcion: d.descripcion.trim(),
    severidad: d.severidad,
    latitud: d.latitud,
    longitud: d.longitud,
    ciudadanoId: d.ciudadanoId ?? null,
    evidencia,
    ...normalizarCobertura(d, { referencia: evento.fechaEvento || new Date() }),
  };
}

export async function guardarReporte(sql, evento, d) {
  return sql.begin(async (tx) => {
    const insertados = await tx`
      INSERT INTO public.reportes (
        id, ciudadano_id, municipio_id, servicio_id, tipo_novedad,
        descripcion, severidad, estado, estado_ingesta, ubicacion, fecha_reporte,
        categoria_incidente, fecha_inicio_estimada, area_afectada_geojson
      ) VALUES (
        ${evento.eventoId}::uuid, ${d.ciudadanoId}::uuid,
        ${d.municipioId}, ${d.servicioId}, ${d.tipoNovedad}, ${d.descripcion}, ${d.severidad},
        'REPORTADO', 'PROCESADO',
        extensions.ST_SetSRID(extensions.ST_MakePoint(${d.longitud}, ${d.latitud}), 4326)::extensions.geography,
        now(), ${d.categoriaIncidente}, ${d.fechaInicioEstimada}::timestamptz,
        ${d.areaAfectada ? tx.json(d.areaAfectada) : null}::jsonb
      ) ON CONFLICT (id) DO NOTHING RETURNING id
    `;

    if (d.evidencia) {
      const e = d.evidencia;
      await tx`
        INSERT INTO public.evidencias (
          reporte_id, storage_key, nombre_archivo, tipo_mime, tamano_bytes
        )
        SELECT ${evento.eventoId}::uuid, ${e.ruta}, ${e.nombreArchivo}, ${e.tipoMime}, ${e.tamanoBytes}
        WHERE EXISTS (SELECT 1 FROM public.reportes WHERE id = ${evento.eventoId}::uuid)
          AND NOT EXISTS (
            SELECT 1 FROM public.evidencias
            WHERE reporte_id = ${evento.eventoId}::uuid AND storage_key = ${e.ruta}
          )
      `;
    }
    return insertados.length > 0;
  });
}
