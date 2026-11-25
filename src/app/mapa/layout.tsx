
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Operador = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  empresa: string;
};

export default function MapaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [verificando, setVerificando] = useState(true);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [error, setError] = useState("");
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    let activo = true;

    async function verificarAcceso() {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !data.session) {
          router.replace("/login");
          return;
        }

        const respuesta = await fetch("/api/auth/operador", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
          cache: "no-store",
        });

        if (respuesta.status === 401 || respuesta.status === 403) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        if (!respuesta.ok) {
          throw new Error("No se pudo verificar el acceso al panel.");
        }

        const resultado = await respuesta.json();

        if (!resultado.autorizado || !resultado.operador) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        if (activo) {
          setOperador(resultado.operador);
          setError("");
        }
      } catch (err) {
        if (activo) {
          setError(
            err instanceof Error
              ? err.message
              : "Error verificando la sesión"
          );
        }
      } finally {
        if (activo) {
          setVerificando(false);
        }
      }
    }

    void verificarAcceso();

    return () => {
      activo = false;
    };
  }, [router]);

  async function cerrarSesion() {
    setCerrando(true);

    try {
      const { error: logoutError } =
        await supabase.auth.signOut();

      if (logoutError) {
        throw logoutError;
      }

      setOperador(null);
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cerrar la sesión"
      );
      setCerrando(false);
    }
  }

  if (verificando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />

          <h1 className="text-xl font-bold text-white">
            SERVI-RED
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Verificando sesión del operador...
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-xl font-bold text-white">
            No se pudo verificar el acceso
          </h1>

          <p className="mt-3 text-sm text-red-300">
            {error}
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!operador) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Redirigiendo al inicio de sesión...
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold">
              SR
            </div>

            <div>
              <p className="font-bold tracking-wide">
                SERVI-RED
              </p>

              <p className="text-xs text-slate-400">
                Panel de operadores
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/mapa/denuncias" className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Moderar denuncias</Link>
            <div className="text-right">
              <p className="text-sm font-semibold">
                {operador.nombre}
              </p>

              <p className="text-xs text-slate-400">
                {operador.email}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void cerrarSesion()}
              disabled={cerrando}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {cerrando
                ? "Cerrando sesión..."
                : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
