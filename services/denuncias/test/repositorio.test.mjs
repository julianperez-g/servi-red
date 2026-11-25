import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { crearRepositorio } from "../src/repositorio.mjs";

const url = process.env.DENUNCIAS_TEST_DATABASE_URL;
test("persistencia privada, aislamiento entre empresas y transiciones atómicas", { skip: !url }, async () => {
  const endpoint = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(endpoint.hostname) || endpoint.pathname !== "/servired_denuncias_test") {
    throw new Error("El fixture solo admite PostgreSQL local en servired_denuncias_test. Nunca usar Supabase.");
  }
  const admin = postgres(url, { ssl: false, max: 1, prepare: false, onnotice: () => {} });
  const ids = [];
  const op1 = "10000000-0000-4000-8000-000000000001", op2 = "10000000-0000-4000-8000-000000000002";
  let runtime;
  try {
    await admin.unsafe(`
      DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
      CREATE TABLE IF NOT EXISTS public.municipios(id bigint PRIMARY KEY,nombre text);
      CREATE TABLE IF NOT EXISTS public.servicios(id smallint PRIMARY KEY,nombre text);
      CREATE TABLE IF NOT EXISTS public.operadores(id uuid PRIMARY KEY,empresa_id uuid,email text);
      CREATE TABLE IF NOT EXISTS public.empresa_servicios(empresa_id uuid,servicio_id smallint,PRIMARY KEY(empresa_id,servicio_id));
      INSERT INTO public.municipios VALUES(1,'Municipio fixture') ON CONFLICT DO NOTHING;
      INSERT INTO public.servicios VALUES(1,'Agua fixture'),(2,'Energía fixture') ON CONFLICT DO NOTHING;
      INSERT INTO public.operadores VALUES('${op1}','20000000-0000-4000-8000-000000000001','privado@example.test'),('${op2}','20000000-0000-4000-8000-000000000002','otro@example.test') ON CONFLICT DO NOTHING;
      INSERT INTO public.empresa_servicios VALUES('20000000-0000-4000-8000-000000000001',1),('20000000-0000-4000-8000-000000000002',2) ON CONFLICT DO NOTHING;
    `).simple();
    await admin.unsafe(await readFile(new URL("../../../supabase/migrations/20261125010000_denuncias_anonimas.sql", import.meta.url), "utf8")).simple();
    await admin.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='denuncias_fixture') THEN CREATE ROLE denuncias_fixture LOGIN PASSWORD 'solo_fixture_local'; END IF; END $$;
      GRANT servired_denuncias_service TO denuncias_fixture;`).simple();
    endpoint.username = "denuncias_fixture"; endpoint.password = "solo_fixture_local";
    runtime = postgres(endpoint.toString(), { ssl: false, prepare: false, max: 2 });
    const repo = crearRepositorio(runtime);
    const result = await repo.crear({ municipioId: 1, servicioId: 1, descripcion: "Conexión sospechosa de prueba sin datos personales", latitud: null, longitud: null }, Buffer.from("webp-ya-limpia"));
    ids.push(result.folio);
    assert.equal(result.estado, "PENDIENTE");
    const columns = await admin`SELECT column_name FROM information_schema.columns WHERE table_schema='denuncias_privadas' AND table_name='denuncias'`;
    for (const forbidden of ["ip", "user_agent", "ciudadano_id", "email", "nombre_archivo", "auth_user_id"]) assert.equal(columns.some(c => c.column_name === forbidden), false);
    const own = await repo.listar({ operadorId: op1, estado: "PENDIENTE", pagina: 0 });
    assert.equal(own.denuncias.some(d => d.id === result.folio), true);
    assert.equal((await repo.listar({ operadorId: op2, estado: "PENDIENTE", pagina: 0 })).denuncias.length, 0);
    await assert.rejects(repo.evidencia({ id: result.folio, operadorId: op2 }), { status: 404 });
    await assert.rejects(repo.moderar({ id: result.folio, operadorId: op2, estado: "EN_REVISION", estadoEsperado: "PENDIENTE", motivo: "No debería autorizarse" }), { status: 404 });
    await repo.moderar({ id: result.folio, operadorId: op1, estado: "EN_REVISION", estadoEsperado: "PENDIENTE", motivo: "Revisar evidencia técnica" });
    await assert.rejects(repo.moderar({ id: result.folio, operadorId: op1, estado: "DESCARTADA", estadoEsperado: "PENDIENTE", motivo: "Versión anterior" }), { status: 409 });
    const [audit] = await admin`SELECT count(*)::integer AS total FROM denuncias_privadas.moderaciones WHERE denuncia_id=${result.folio}::uuid`;
    assert.equal(audit.total, 1);
    await assert.rejects(runtime`SELECT email FROM public.operadores`, { code: "42501" });
    await assert.rejects(runtime`DELETE FROM denuncias_privadas.denuncias WHERE id=${result.folio}::uuid`, { code: "42501" });
    const [privacy] = await admin`SELECT has_schema_privilege('anon','denuncias_privadas','USAGE') AS publico`;
    assert.equal(privacy.publico, false);
  } finally {
    if (runtime) await runtime.end();
    for (const id of ids) await admin`DELETE FROM denuncias_privadas.denuncias WHERE id=${id}::uuid`;
    await admin.end();
  }
});
