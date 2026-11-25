
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const token = authorization.slice(7);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const databaseUrl = process.env.DATABASE_URL;

    if (!supabaseUrl || !supabaseKey || !databaseUrl) {
      return NextResponse.json(
        { error: "Configuración del servidor incompleta" },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await authClient.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Sesión inválida o expirada" },
        { status: 401 }
      );
    }

    if (
      process.env.NODE_ENV === "production" &&
      data.user.app_metadata?.servi_red_test_operator === true
    ) {
      return NextResponse.json(
        { error: "Las cuentas de prueba no están habilitadas en producción." },
        { status: 403 }
      );
    }

    const sql = postgres(databaseUrl, { max: 1 });

    try {
      const operadores = await sql`
        SELECT
          o.id,
          o.nombre,
          o.email,
          o.rol,
          o.empresa_id,
          e.nombre AS empresa
        FROM public.operadores o
        JOIN public.empresas e
          ON e.id = o.empresa_id
        WHERE o.auth_user_id = ${data.user.id}
        LIMIT 1
      `;

      if (operadores.length === 0) {
        return NextResponse.json(
          { error: "Usuario sin operador autorizado" },
          { status: 403 }
        );
      }

      return NextResponse.json({
        autorizado: true,
        operador: operadores[0],
      });
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error("Error validando operador:", error);

    return NextResponse.json(
      { error: "Error interno al validar el operador" },
      { status: 500 }
    );
  }
}
