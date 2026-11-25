import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validarEvento, guardarReporte } from "../worker/procesador.mjs";
import { consultarIndicadores } from "../services/indicadores/src/repositorio.mjs";
import { CATEGORIAS_INCIDENTE } from "../shared/reportes/cobertura.mjs";
import { createRequire } from "node:module";

const url = process.env.COBERTURA_TEST_DATABASE_URL;
test("PostGIS: migración aditiva, superficie calculada, categorías 4/5 y mensajes antiguos", { skip: !url }, async (t) => {
  const endpoint = new URL(url);
  if (!["localhost","127.0.0.1"].includes(endpoint.hostname) || endpoint.pathname !== "/servired_cobertura_test") throw new Error("Solo se admite la base local desechable servired_cobertura_test; nunca Supabase.");
  const sql = postgres(url, { ssl: false, prepare: false, max: 1, onnotice: () => {} });
  const requireWorker = createRequire(new URL("../worker/package.json",import.meta.url));
  const workerFactory = requireWorker("postgres");
  const workerSql = workerFactory(url,{ssl:false,prepare:false,max:1,onnotice:()=>{}});
  t.after(() => sql.end());
  t.after(() => workerSql.end());
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
    CREATE TABLE IF NOT EXISTS public.departamentos(id bigint PRIMARY KEY,nombre text,codigo_dane text);
    CREATE TABLE IF NOT EXISTS public.municipios(id bigint PRIMARY KEY,nombre text,departamento_id bigint);
    CREATE TABLE IF NOT EXISTS public.servicios(id smallint PRIMARY KEY,nombre text);
    CREATE TABLE IF NOT EXISTS public.reportes(id uuid PRIMARY KEY,ciudadano_id uuid,municipio_id bigint REFERENCES public.municipios,
      servicio_id smallint REFERENCES public.servicios,tipo_novedad text,descripcion text,severidad text,estado text,estado_ingesta text,
      ubicacion extensions.geography(Point,4326),fecha_reporte timestamptz NOT NULL DEFAULT now(),fecha_restablecimiento timestamptz);
    CREATE TABLE IF NOT EXISTS public.evidencias(reporte_id uuid REFERENCES public.reportes ON DELETE CASCADE,storage_key text,nombre_archivo text,tipo_mime text,tamano_bytes integer);
    INSERT INTO public.departamentos VALUES(1,'Departamento fixture','01') ON CONFLICT DO NOTHING;
    INSERT INTO public.municipios VALUES(1,'Municipio fixture',1) ON CONFLICT DO NOTHING;
    INSERT INTO public.servicios VALUES(1,'Agua'),(4,'Alcantarillado'),(5,'Aseo y residuos') ON CONFLICT DO NOTHING;
  `).simple();
  const migration = await readFile(new URL("../supabase/migrations/20261126000000_cobertura_funcional.sql",import.meta.url),"utf8");
  const ids = [];
  try {
    const oldId = randomUUID(); ids.push(oldId);
    await sql`INSERT INTO public.reportes(id,municipio_id,servicio_id,tipo_novedad,descripcion,estado,severidad,fecha_reporte)
      VALUES(${oldId}::uuid,1,1,'CORTE','Histórico antes de la migración','REPORTADO','BAJA','2026-01-01')`;
    await sql.unsafe(migration).simple();
    await sql.unsafe(migration).simple();
    const [old] = await sql`SELECT fecha_inicio_estimada,area_afectada_m2 FROM public.reportes WHERE id=${oldId}::uuid`;
    assert.equal(old.fecha_inicio_estimada,null); assert.equal(old.area_afectada_m2,null);
    const area = { type: "Polygon",coordinates: [[[-74.08,4.70],[-74.06,4.70],[-74.06,4.72],[-74.08,4.72],[-74.08,4.70]]] };
    for (const categoria of CATEGORIAS_INCIDENTE) {
      const {servicioId,codigo:categoriaIncidente,tipo:tipoNovedad} = categoria;
      const evento = { tipo: "REPORTE_CREADO",eventoId: randomUUID(),fechaEvento: new Date().toISOString(),datos: {
        municipioId:1,servicioId,tipoNovedad,categoriaIncidente,fechaInicioEstimada:"2026-01-01T00:00:00Z",areaAfectada:area,
        descripcion:"Caso de saneamiento del fixture aislado",severidad:"MEDIA",latitud:4.711,longitud:-74.0721,
      }};
      ids.push(evento.eventoId);
      const datos = validarEvento(evento);
      assert.equal(await guardarReporte(workerSql,evento,datos),true);
      assert.equal(await guardarReporte(workerSql,evento,datos),false);
      const [saved] = await sql`SELECT categoria_incidente,area_afectada_m2,area_afectada_geojson,fecha_inicio_estimada FROM public.reportes WHERE id=${evento.eventoId}::uuid`;
      assert.equal(saved.categoria_incidente,categoriaIncidente);
      assert.ok(Number(saved.area_afectada_m2)>4_000_000&&Number(saved.area_afectada_m2)<6_000_000);
      assert.deepEqual(saved.area_afectada_geojson,area);
      const real = Number(saved.area_afectada_m2);
      await sql`UPDATE public.reportes SET area_afectada_m2=1 WHERE id=${evento.eventoId}::uuid`;
      const [again] = await sql`SELECT area_afectada_m2 FROM public.reportes WHERE id=${evento.eventoId}::uuid`;
      assert.equal(Number(again.area_afectada_m2),real,"El trigger no confía en superficies suministradas");
      await assert.rejects(sql`UPDATE public.reportes SET fecha_inicio_estimada=fecha_reporte+interval '1 day' WHERE id=${evento.eventoId}::uuid`,{code:"23514"});
      await assert.rejects(sql`UPDATE public.reportes SET categoria_incidente='OTRA' WHERE id=${evento.eventoId}::uuid`,{code:"23514"});
    }
    for (const servicioId of [1,4,5]) {
      const legacy = {tipo:"REPORTE_CREADO",eventoId:randomUUID(),datos:{municipioId:1,servicioId,tipoNovedad:"CORTE",descripcion:"Evento antiguo después de migrar",severidad:"BAJA",latitud:4.711,longitud:-74.0721}};
      ids.push(legacy.eventoId);
      await guardarReporte(workerSql,legacy,validarEvento(legacy));
      const [sinDatos] = await sql`SELECT categoria_incidente,fecha_inicio_estimada,area_afectada_m2 FROM public.reportes WHERE id=${legacy.eventoId}::uuid`;
      assert.deepEqual(sinDatos,{categoria_incidente:null,fecha_inicio_estimada:null,area_afectada_m2:null});
    }
    await assert.rejects(sql`SELECT public.validar_area_reportada(${sql.json(area)}::jsonb,8.0::double precision,-75.0::double precision)`,{code:"22023"});
    const cruzada = {type:"Polygon",coordinates:[[[-74,4],[-73,5],[-73,4],[-74,5],[-74,4]]]};
    await assert.rejects(sql`SELECT public.validar_area_reportada(${sql.json(cruzada)}::jsonb,4.5::double precision,-73.5::double precision)`,{code:"22023"});
    const indicadores = await consultarIndicadores(sql,{desde:"2020-01-01",hasta:"2099-01-01",agrupacion:"month",municipio:null});
    assert.equal(indicadores.servicios.find(s=>s.nombre==="Aseo y residuos").aplica_continuidad,false);
    assert.equal(indicadores.servicios.find(s=>s.nombre==="Alcantarillado").cortes,0);
    assert.equal(indicadores.resumen.total_cortes,2,"Los CORTE históricos de saneamiento no son continuidad de redes");
  } finally { for (const id of ids) await sql`DELETE FROM public.reportes WHERE id=${id}::uuid`; }
});
