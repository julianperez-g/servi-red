import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL,
  TEST_OPERATOR_EMAIL = "operador.demo@servi-red.test",
  TEST_OPERATOR_PASSWORD,
  ALLOW_TEST_OPERATOR_PROVISIONING,
} = process.env;

if (process.env.NODE_ENV === "production") {
  throw new Error("La cuenta de prueba solo se puede provisionar localmente.");
}

if (ALLOW_TEST_OPERATOR_PROVISIONING !== "true") {
  throw new Error(
    "Añade ALLOW_TEST_OPERATOR_PROVISIONING=true a .env.local para autorizar esta operación."
  );
}

if (
  !NEXT_PUBLIC_SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !DATABASE_URL ||
  !TEST_OPERATOR_PASSWORD
) {
  throw new Error(
    "Se requieren NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL y TEST_OPERATOR_PASSWORD."
  );
}

const email = TEST_OPERATOR_EMAIL.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("TEST_OPERATOR_EMAIL no tiene un formato válido.");
}
if (TEST_OPERATOR_PASSWORD.length < 12) {
  throw new Error("TEST_OPERATOR_PASSWORD debe tener al menos 12 caracteres.");
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sql = postgres(DATABASE_URL, {
  ssl: "require",
  connect_timeout: 10,
  prepare: false,
  max: 1,
});

const TEST_ACCOUNT_FLAG = "servi_red_test_operator";

async function buscarUsuarioExistente() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email
    );
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

async function provisionar() {
  const [operadorExistente] = await sql`
    SELECT id, empresa_id, rol, auth_user_id
    FROM public.operadores
    WHERE lower(email) = ${email}
    LIMIT 1
  `;

  let usuario = await buscarUsuarioExistente();
  if (
    usuario &&
    usuario.app_metadata?.[TEST_ACCOUNT_FLAG] !== true
  ) {
    throw new Error(
      "Ese correo ya pertenece a una cuenta no demo; no se modificó."
    );
  }
  if (
    operadorExistente?.auth_user_id &&
    operadorExistente.auth_user_id !== usuario?.id
  ) {
    throw new Error(
      "El registro de operador ya está vinculado a otra cuenta; no se modificó."
    );
  }

  const appMetadata = {
    ...(usuario?.app_metadata ?? {}),
    [TEST_ACCOUNT_FLAG]: true,
  };

  if (usuario) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      usuario.id,
      {
        password: TEST_OPERATOR_PASSWORD,
        email_confirm: true,
        app_metadata: appMetadata,
      }
    );
    if (error) throw error;
    usuario = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: TEST_OPERATOR_PASSWORD,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { full_name: "Operador de prueba SERVI-RED" },
    });
    if (error) throw error;
    usuario = data.user;
  }

  if (!usuario) throw new Error("Supabase no devolvió el usuario de prueba.");

  if (operadorExistente) {
    await sql`
      UPDATE public.operadores
      SET auth_user_id = ${usuario.id}
      WHERE id = ${operadorExistente.id}
    `;
  } else {
    const [empresa] = await sql`
      SELECT id
      FROM public.empresas
      WHERE activa = true
      ORDER BY creado_en
      LIMIT 1
    `;
    if (!empresa) {
      throw new Error("No hay una empresa activa para asociar el operador demo.");
    }

    const [rolExistente] = await sql`
      SELECT rol
      FROM public.operadores
      ORDER BY creado_en
      LIMIT 1
    `;
    const rol = rolExistente?.rol ?? "OPERADOR";

    await sql`
      INSERT INTO public.operadores (
        empresa_id, nombre, email, rol, auth_user_id
      ) VALUES (
        ${empresa.id},
        'Operador de prueba SERVI-RED',
        ${email},
        ${rol},
        ${usuario.id}
      )
    `;
  }

  console.log(`Cuenta de prueba lista: ${email}`);
  console.log("Email confirmado; no se envió ningún correo.");
  console.log("No se crean duplicados al volver a ejecutar el script.");
  console.log("La contraseña se configura en TEST_OPERATOR_PASSWORD y no se imprime.");
}

try {
  await provisionar();
} catch (error) {
  console.error(
    "No se pudo provisionar la cuenta de prueba:",
    error instanceof Error ? error.message : "error desconocido"
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
