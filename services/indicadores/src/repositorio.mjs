/**
 * Una sola consulta y snapshot por petición; ninguna operación modifica datos.
 * Los periodos se asignan por fecha_reporte en America/Bogota. La duración
 * completa se atribuye a ese periodo, aunque el restablecimiento ocurra después.
 */
export async function consultarIndicadores(sql, filtros) {
  const { desde, hasta, agrupacion, municipio } = filtros;

  const datos = await sql.begin("read only", async (tx) => {
    const [fila] = await tx`
      WITH base AS (
        SELECT
          r.estado, r.severidad, r.municipio_id,
          m.nombre AS municipio,
          COALESCE(s.nombre, 'Sin servicio') AS servicio,
          d.id AS departamento_id,
          COALESCE(d.nombre, 'Sin departamento') AS departamento,
          d.codigo_dane,
          date_trunc(
            ${agrupacion}, r.fecha_reporte AT TIME ZONE 'America/Bogota'
          )::date::text AS periodo,
          UPPER(r.tipo_novedad) = 'CORTE' AS es_corte,
          CASE WHEN UPPER(r.tipo_novedad) = 'CORTE'
            AND r.fecha_restablecimiento IS NOT NULL
            AND r.fecha_restablecimiento >= r.fecha_reporte
          THEN EXTRACT(EPOCH FROM (
            r.fecha_restablecimiento - r.fecha_reporte
          )) / 3600 END AS duracion_horas
        FROM public.reportes r
        LEFT JOIN public.servicios s ON s.id = r.servicio_id
        LEFT JOIN public.municipios m ON m.id = r.municipio_id
        LEFT JOIN public.departamentos d ON d.id = m.departamento_id
        WHERE (${desde}::date IS NULL OR r.fecha_reporte >=
          (${desde}::date::timestamp AT TIME ZONE 'America/Bogota'))
          AND (${hasta}::date IS NULL OR r.fecha_reporte <
            ((${hasta}::date + 1)::timestamp AT TIME ZONE 'America/Bogota'))
          AND (${municipio}::bigint IS NULL OR r.municipio_id = ${municipio})
      ), resumen AS (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE estado = 'REPORTADO')::int AS pendientes,
          COUNT(*) FILTER (WHERE estado = 'EN_ATENCION')::int AS en_atencion,
          COUNT(*) FILTER (WHERE estado = 'RESUELTO')::int AS resueltos,
          COUNT(*) FILTER (WHERE severidad = 'ALTA')::int AS alta_severidad,
          COUNT(*) FILTER (WHERE es_corte)::int AS total_cortes,
          COUNT(duracion_horas)::int AS cortes_resueltos,
          ROUND(COALESCE(SUM(duracion_horas), 0), 1) AS duracion_total_horas,
          ROUND(AVG(duracion_horas), 1) AS horas_promedio
        FROM base
      ), estados AS (
        SELECT estado::text AS nombre, COUNT(*)::int AS total
        FROM base GROUP BY estado
      ), severidades AS (
        SELECT severidad::text AS nombre, COUNT(*)::int AS total
        FROM base GROUP BY severidad
      ), servicios AS (
        SELECT servicio AS nombre, COUNT(*)::int AS reportes,
          COUNT(*) FILTER (WHERE es_corte)::int AS cortes,
          ROUND(COALESCE(SUM(duracion_horas), 0), 1) AS duracion_total_horas,
          ROUND(AVG(duracion_horas), 1) AS duracion_promedio_horas
        FROM base GROUP BY servicio
      ), municipios AS (
        SELECT municipio_id, COALESCE(municipio, 'Sin municipio') AS nombre,
          COUNT(*)::int AS reportes,
          COUNT(*) FILTER (WHERE es_corte)::int AS cortes,
          ROUND(COALESCE(SUM(duracion_horas), 0), 1) AS duracion_total_horas,
          ROUND(AVG(duracion_horas), 1) AS duracion_promedio_horas
        FROM base GROUP BY municipio_id, municipio
      ), departamentos AS (
        SELECT departamento AS nombre, codigo_dane,
          COUNT(*)::int AS reportes,
          COUNT(*) FILTER (WHERE es_corte)::int AS cortes,
          ROUND(COALESCE(SUM(duracion_horas), 0), 1) AS duracion_total_horas,
          ROUND(AVG(duracion_horas), 1) AS duracion_promedio_horas
        FROM base GROUP BY departamento_id, departamento, codigo_dane
      ), periodos AS (
        SELECT periodo AS nombre, COUNT(*)::int AS reportes,
          COUNT(*) FILTER (WHERE es_corte)::int AS cortes,
          ROUND(COALESCE(SUM(duracion_horas), 0), 1) AS duracion_total_horas,
          ROUND(AVG(duracion_horas), 1) AS duracion_promedio_horas
        FROM base GROUP BY periodo
      ), continuidad AS (
        SELECT municipio_id, COALESCE(municipio, 'Sin municipio') AS nombre,
          periodo, COUNT(*)::int AS reportes,
          COUNT(*) FILTER (WHERE es_corte)::int AS cortes,
          COUNT(duracion_horas)::int AS cortes_resueltos,
          ROUND(COALESCE(SUM(duracion_horas), 0), 1) AS duracion_total_horas,
          ROUND(AVG(duracion_horas), 1) AS duracion_promedio_horas
        FROM base GROUP BY municipio_id, municipio, periodo
      )
      SELECT json_build_object(
        'resumen', (SELECT row_to_json(resumen) FROM resumen),
        'estados', COALESCE((SELECT json_agg(estados ORDER BY total DESC, nombre) FROM estados), '[]'::json),
        'severidades', COALESCE((SELECT json_agg(severidades ORDER BY total DESC, nombre) FROM severidades), '[]'::json),
        'servicios', COALESCE((SELECT json_agg(servicios ORDER BY cortes DESC, reportes DESC, nombre) FROM servicios), '[]'::json),
        'municipios', COALESCE((SELECT json_agg(municipios ORDER BY cortes DESC, reportes DESC, municipio_id) FROM municipios), '[]'::json),
        'departamentos', COALESCE((SELECT json_agg(departamentos ORDER BY cortes DESC, reportes DESC, nombre) FROM departamentos), '[]'::json),
        'periodos', COALESCE((SELECT json_agg(periodos ORDER BY nombre) FROM periodos), '[]'::json),
        'continuidad', COALESCE((SELECT json_agg(continuidad ORDER BY periodo, municipio_id) FROM continuidad), '[]'::json)
      ) AS indicadores
    `;
    return fila.indicadores;
  });

  return {
    ...datos,
    agrupacion,
    rango: { desde, hasta },
    filtros: { municipio },
    actualizado_en: new Date().toISOString(),
  };
}
