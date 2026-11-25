import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const roleName = "servired_indicadores_local";
const serviceEnvPath = ".env.indicadores.local";
const appEnvPath = ".env.local";

async function leerOpcional(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}

function leerGenerada(texto, clave) {
  const valor = texto.match(new RegExp(`^${clave}=(".*")$`, "m"))?.[1];
  return valor ? JSON.parse(valor) : null;
}

function definir(texto, clave, valor) {
  const linea = `${clave}=${JSON.stringify(valor)}`;
  const patron = new RegExp(`^\\s*(?:export\\s+)?${clave}\\s*=.*$`, "m");
  if (patron.test(texto)) return texto.replace(patron, () => linea);
  return `${texto}${texto.endsWith("\n") ? "" : "\n"}${linea}\n`;
}

async function configurar() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL en .env.local.");
  const [appEnv, serviceEnv] = await Promise.all([
    leerOpcional(appEnvPath), leerOpcional(serviceEnvPath),
  ]);
  const serviceUrl = process.env.INDICADORES_SERVICE_URL || "http://127.0.0.1:4001";
  if (!["http://127.0.0.1:4001", "http://localhost:4001"].includes(serviceUrl.replace(/\/$/, ""))) {
    throw new Error("La URL ya apunta a otro servicio. El setup local no modifica despliegues externos.");
  }
  const apiKey = process.env.INDICADORES_API_KEY ||
    leerGenerada(serviceEnv, "INDICADORES_API_KEY") || randomBytes(32).toString("hex");
  if (apiKey.length < 32) throw new Error("La clave del servicio debe tener al menos 32 caracteres.");

  const adminUrl = new URL(process.env.DATABASE_URL);
  const existente = leerGenerada(serviceEnv, "DATABASE_URL");
  const lecturaUrl = existente ? new URL(existente) : new URL(adminUrl);
  // El pooler de Supabase identifica el proyecto mediante usuario.<project-ref>.
  const sufijo = decodeURIComponent(adminUrl.username).split(".").slice(1).join(".");
  const usuarioEsperado = roleName + (sufijo ? `.${sufijo}` : "");
  if (existente && (lecturaUrl.host !== adminUrl.host ||
    lecturaUrl.pathname !== adminUrl.pathname ||
    decodeURIComponent(lecturaUrl.username) !== usuarioEsperado)) {
    throw new Error("La configuración existente de indicadores corresponde a otra base o rol; no se modificó.");
  }
  const password = existente ? decodeURIComponent(lecturaUrl.password) :
    randomBytes(32).toString("hex");
  lecturaUrl.username = usuarioEsperado;
  lecturaUrl.password = password;

  const sql = postgres(process.env.DATABASE_URL, {
    ssl: "require", prepare: false, max: 1, connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    const migration = await readFile(
      "supabase/migrations/20261125000000_indicadores_lectura.sql", "utf8"
    );
    await sql.begin(async (tx) => {
      const [rol] = await tx`
        SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
        FROM pg_roles WHERE rolname = ${roleName}
      `;
      if (rol && (!existente || !rol.rolcanlogin || rol.rolsuper ||
        rol.rolcreaterole || rol.rolcreatedb || rol.rolbypassrls)) {
        throw new Error("El rol local ya existe sin credenciales compatibles; no se modificó su contraseña.");
      }
      await tx.unsafe(migration).simple();
      if (!rol) {
        // Identificador constante y contraseña generada internamente; no son entradas HTTP.
        await tx.unsafe(`CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password.replaceAll("'", "''")}'`);
      }
      await tx.unsafe(`GRANT servired_indicadores_reader TO ${roleName}`);
      await tx.unsafe(`ALTER ROLE ${roleName} SET default_transaction_read_only = on`);
    });
  } finally {
    await sql.end();
  }

  // Persistir solo credenciales NUEVAS del microservicio, nunca cambiar las existentes
  // de Supabase Auth, PostgreSQL administrador, RabbitMQ o cuentas de prueba.
  await writeFile(serviceEnvPath,
    `# Generado por npm run setup:indicadores; no subir a Git.\n` +
    `DATABASE_URL=${JSON.stringify(lecturaUrl.toString())}\n` +
    `INDICADORES_API_KEY=${JSON.stringify(apiKey)}\n`, { mode: 0o600 });
  let actualizado = definir(appEnv, "INDICADORES_SERVICE_URL", serviceUrl);
  actualizado = definir(actualizado, "INDICADORES_API_KEY", apiKey);
  await writeFile(appEnvPath, actualizado, { mode: 0o600 });

  const lectura = postgres(lecturaUrl.toString(), {
    ssl: "require", prepare: false, max: 1, connect_timeout: 10,
  });
  try {
    const [permisos] = await lectura`
      SELECT
        has_column_privilege(current_user, 'public.reportes', 'fecha_reporte', 'SELECT') AS lectura,
        has_column_privilege(current_user, 'public.reportes', 'descripcion', 'SELECT') AS descripcion,
        has_table_privilege(current_user, 'public.reportes', 'INSERT,UPDATE,DELETE') AS escritura
    `;
    if (!permisos.lectura || permisos.descripcion || permisos.escritura) {
      throw new Error("Los permisos de la cuenta de indicadores no son los esperados.");
    }
    await lectura`SELECT COUNT(*) FROM public.reportes`;
  } finally {
    await lectura.end();
  }
  console.log("Indicadores configurado en http://127.0.0.1:4001 con un rol nuevo de solo lectura.");
  console.log("Configuración privada guardada en .env.indicadores.local y .env.local; no se imprimen claves.");
  console.log("Inicia el servicio con docker compose up -d --build indicadores.");
}

try {
  await configurar();
} catch (error) {
  // Los errores SQL/de red pueden contener la conexión: no volcarlos en consola.
  console.error(error.code ? `No se pudo configurar indicadores (código ${error.code}).` :
    error.message ?? "No se pudo configurar indicadores.");
  process.exitCode = 1;
}
