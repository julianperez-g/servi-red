import { randomUUID } from "node:crypto";
import { ErrorDenuncia } from "./validacion.mjs";

export function crearRepositorio(sql) {
  const puedeVer = (tx, id, operadorId) => tx`
    SELECT d.id, d.estado FROM denuncias_privadas.denuncias d
    WHERE d.id = ${id}::uuid AND EXISTS (
      SELECT 1 FROM public.operadores o JOIN public.empresa_servicios es ON es.empresa_id = o.empresa_id
      WHERE o.id = ${operadorId}::uuid AND es.servicio_id = d.servicio_id
    ) FOR UPDATE OF d
  `;
  return {
    comprobarDB: () => sql`SELECT 1 FROM denuncias_privadas.denuncias LIMIT 0`,
    crear: (datos, evidencia) => sql.begin(async (tx) => {
      // Presupuesto global atómico, sin IP, hash de IP, cookies ni identificadores del remitente.
      await tx`SELECT pg_advisory_xact_lock(20261125, 2)`;
      const [limite] = await tx`SELECT count(*)::integer AS total FROM denuncias_privadas.denuncias WHERE creada_en > now() - interval '1 minute'`;
      if (limite.total >= 20) throw new ErrorDenuncia(429, "El canal está ocupado. Inténtalo en un minuto.");
      const catalogos = await tx`SELECT 1 FROM public.municipios m CROSS JOIN public.servicios s WHERE m.id=${datos.municipioId} AND s.id=${datos.servicioId}`;
      if (!catalogos.length) throw new ErrorDenuncia(400, "Municipio o servicio no disponible.");
      const id = randomUUID();
      await tx`INSERT INTO denuncias_privadas.denuncias
        (id, municipio_id, servicio_id, descripcion, latitud, longitud, evidencia)
        VALUES (${id}::uuid, ${datos.municipioId}, ${datos.servicioId}, ${datos.descripcion}, ${datos.latitud}, ${datos.longitud}, ${evidencia})`;
      return { folio: id, estado: "PENDIENTE" };
    }),
    listar: async ({ operadorId, estado, pagina }) => {
      const denuncias = await sql`
        SELECT d.id, d.descripcion, d.estado, d.latitud, d.longitud, d.creada_en, d.actualizada_en,
          m.nombre AS municipio, s.nombre AS servicio, (d.evidencia IS NOT NULL) AS tiene_evidencia,
          (SELECT h.motivo FROM denuncias_privadas.moderaciones h WHERE h.denuncia_id=d.id ORDER BY h.creada_en DESC LIMIT 1) AS ultimo_motivo
        FROM denuncias_privadas.denuncias d
        JOIN public.municipios m ON m.id=d.municipio_id JOIN public.servicios s ON s.id=d.servicio_id
        WHERE d.estado=${estado} AND EXISTS (
          SELECT 1 FROM public.operadores o JOIN public.empresa_servicios es ON es.empresa_id=o.empresa_id
          WHERE o.id=${operadorId}::uuid AND es.servicio_id=d.servicio_id
        ) ORDER BY d.creada_en DESC, d.id DESC LIMIT 21 OFFSET ${pagina * 20}
      `;
      return { denuncias: denuncias.slice(0, 20), hayMas: denuncias.length > 20, pagina };
    },
    moderar: ({ id, operadorId, estado, estadoEsperado, motivo }) => sql.begin(async (tx) => {
      const [denuncia] = await puedeVer(tx, id, operadorId);
      if (!denuncia) throw new ErrorDenuncia(404, "Denuncia no encontrada o sin permiso para ese servicio.");
      if (denuncia.estado !== estadoEsperado) throw new ErrorDenuncia(409, "Otro operador ya modificó esta denuncia. Actualiza la lista.");
      await tx`UPDATE denuncias_privadas.denuncias SET estado=${estado}, actualizada_en=now() WHERE id=${id}::uuid`;
      await tx`INSERT INTO denuncias_privadas.moderaciones (id, denuncia_id, operador_id, estado_anterior, estado_nuevo, motivo)
        VALUES (${randomUUID()}::uuid, ${id}::uuid, ${operadorId}::uuid, ${estadoEsperado}, ${estado}, ${motivo})`;
      return { id, estado };
    }),
    evidencia: async ({ id, operadorId }) => {
      const [fila] = await sql`SELECT d.evidencia FROM denuncias_privadas.denuncias d
        WHERE d.id=${id}::uuid AND d.evidencia IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.operadores o JOIN public.empresa_servicios es ON es.empresa_id=o.empresa_id
          WHERE o.id=${operadorId}::uuid AND es.servicio_id=d.servicio_id
        )`;
      if (!fila) throw new ErrorDenuncia(404, "Evidencia no encontrada o sin permiso.");
      return fila.evidencia;
    },
  };
}
