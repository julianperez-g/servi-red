import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
const production = process.argv.includes("--production");
const roleName = production ? "servired_denuncias_prod" : "servired_denuncias_local";
const envPath = production ? ".env.denuncias.production.local" : ".env.denuncias.local";
const leer = async (path) => { try { return await readFile(path, "utf8"); } catch (e) { if (e.code === "ENOENT") return ""; throw e; } };
const valor = (text, key) => { const v = text.match(new RegExp(`^${key}=(".*")$`, "m"))?.[1]; return v ? JSON.parse(v) : null; };
const definir = (text, key, value) => {
  const line = `${key}=${JSON.stringify(value)}`;
  const re = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, "m");
  return re.test(text) ? text.replace(re, () => line) : `${text.trimEnd()}\n${line}\n`;
};

async function configurar() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  const previous = await leer(envPath);
  const existing = valor(previous, "DATABASE_URL");
  const adminURL = new URL(process.env.DATABASE_URL);
  const serviceURL = new URL(existing || process.env.DATABASE_URL);
  const suffix = decodeURIComponent(adminURL.username).split(".").slice(1).join(".");
  const username = roleName + (suffix ? `.${suffix}` : "");
  if (existing && (serviceURL.host !== adminURL.host || serviceURL.pathname !== adminURL.pathname ||
      decodeURIComponent(serviceURL.username) !== username)) throw new Error("La configuración existente corresponde a otra base o rol; no se modificó.");
  const password = existing ? decodeURIComponent(serviceURL.password) : randomBytes(32).toString("hex");
  const apiKey = valor(previous, "DENUNCIAS_API_KEY") || randomBytes(32).toString("hex");
  serviceURL.username = username; serviceURL.password = password;
  const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    const migration = await readFile("supabase/migrations/20261125010000_denuncias_anonimas.sql", "utf8");
    await sql.begin(async (tx) => {
      const [role] = await tx`SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=${roleName}`;
      if (role && (!existing || !role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolbypassrls)) throw new Error("El rol ya existe sin credenciales compatibles; no se modificó.");
      await tx.unsafe(migration).simple();
      if (!role) await tx.unsafe(`CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password.replaceAll("'", "''")}'`);
      await tx.unsafe(`GRANT servired_denuncias_service TO ${roleName}`);
    });
  } finally { await sql.end(); }
  await writeFile(envPath, `# Privado: configuración dedicada de denuncias; no subir a Git.\nDATABASE_URL=${JSON.stringify(serviceURL.toString())}\nDENUNCIAS_API_KEY=${JSON.stringify(apiKey)}\n`, { mode: 0o600 });
  const runtime = postgres(serviceURL.toString(), { ssl: "require", prepare: false, max: 1, connect_timeout: 10 });
  try {
    const [p] = await runtime`SELECT
      has_table_privilege(current_user,'denuncias_privadas.denuncias','INSERT') AS crear,
      has_table_privilege(current_user,'public.reportes','INSERT') AS reportes,
      has_column_privilege(current_user,'public.operadores','email','SELECT') AS emails,
      has_schema_privilege('anon','denuncias_privadas','USAGE') AS publico`;
    if (!p.crear || p.reportes || p.emails || p.publico) throw new Error("Los permisos de privacidad no son los esperados.");
    await runtime`SELECT id FROM denuncias_privadas.denuncias LIMIT 0`;
  } finally { await runtime.end(); }
  if (!production) {
    let app = await leer(".env.local");
    const current = process.env.DENUNCIAS_SERVICE_URL;
    if (current && !["http://127.0.0.1:4002", "http://localhost:4002"].includes(current)) throw new Error("La app ya apunta a un servicio externo; no se sobrescribió.");
    app = definir(app, "DENUNCIAS_SERVICE_URL", "http://127.0.0.1:4002");
    app = definir(app, "DENUNCIAS_API_KEY", apiKey);
    await writeFile(".env.local", app, { mode: 0o600 });
  }
  console.log(`Denuncias configuradas con rol dedicado (${production ? "producción" : "local"}) y esquema privado. Secretos guardados en ${envPath}; no se imprimen.`);
}

try { await configurar(); }
catch (e) { console.error(e.code ? `No se pudo configurar denuncias (código ${e.code}).` : e.message); process.exitCode = 1; }
