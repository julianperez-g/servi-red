
import "server-only";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey || !databaseUrl) {
  throw new Error(
    "Faltan variables de Supabase o DATABASE_URL"
  );
}

const authClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const sqlOperadores = postgres(databaseUrl, {
  max: 5,
});

export type OperadorAutenticado = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  empresa_id: string;
};

export async function autenticarOperador(
  authorization: string | null
): Promise<OperadorAutenticado | null> {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  if (!token) return null;

  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) return null;
  if (
    process.env.NODE_ENV === "production" &&
    data.user.app_metadata?.servi_red_test_operator === true
  ) {
    return null;
  }

  const operadores = await sqlOperadores`
    SELECT
      o.id,
      o.nombre,
      o.email,
      o.rol,
      o.empresa_id
    FROM public.operadores o
    INNER JOIN public.empresas e
      ON e.id = o.empresa_id
    WHERE o.auth_user_id = ${data.user.id}
    LIMIT 1
  `;

  if (operadores.length === 0) return null;

  return operadores[0] as OperadorAutenticado;
}
