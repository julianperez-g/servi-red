
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("servi-red@service.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;

    async function comprobarSesion() {
      try {
        const { data } = await supabase.auth.getSession();

        if (!data.session) return;

        const respuesta = await fetch("/api/auth/operador", {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
          cache: "no-store",
        });

        if (respuesta.ok) {
          const resultado = await respuesta.json();

          if (resultado.autorizado) {
            router.replace("/mapa");
          }
        }
      } finally {
        if (activo) {
          setVerificando(false);
        }
      }
    }

    void comprobarSesion();

    return () => {
      activo = false;
    };
  }, [router]);

  async function iniciarSesion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError || !data.session) {
        throw new Error(
          authError?.message || "Credenciales incorrectas"
        );
      }

      const respuesta = await fetch("/api/auth/operador", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        cache: "no-store",
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok || !resultado.autorizado) {
        await supabase.auth.signOut();

        throw new Error(
          resultado.error || "No tienes acceso al panel"
        );
      }

      router.replace("/mapa");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible iniciar sesión"
      );
    } finally {
      setLoading(false);
    }
  }

  if (verificando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Verificando sesión...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">
            SR
          </div>

          <h1 className="text-3xl font-bold text-white">
            SERVI-RED
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Plataforma de gestión de servicios públicos
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white">
            Acceso de operadores
          </h2>

          <p className="mb-7 mt-2 text-sm text-slate-400">
            Ingresa tus credenciales para acceder al panel.
          </p>

          <form
            onSubmit={iniciarSesion}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Correo electrónico
              </label>

              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Contraseña
              </label>

              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {loading
                ? "Validando acceso..."
                : "Iniciar sesión"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          SERVI-RED · Acceso exclusivo para operadores
        </p>
      </div>
    </main>
  );
}
