"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ReporteCiudadano = {
  id: string;
  tipo_novedad: string;
  descripcion: string;
  severidad: string;
  estado: string;
  fecha_reporte: string;
  fecha_restablecimiento: string | null;
  municipio: string | null;
  servicio: string | null;
  restablecimiento_id: string | null;
  restablecimiento_registrado_en: string | null;
  fecha_restablecimiento_operador: string | null;
  acciones_restablecimiento: string | null;
  validacion_restablecimiento: "PENDIENTE" | "CONFIRMADO" | "OBSERVADO" | null;
  respuesta_ciudadano: string | null;
  fecha_servicio_reportada: string | null;
  aviso_creado_en: string | null;
  tiene_notificacion_pendiente: boolean;
};

function fechaLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : date.toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

function formatoLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function MisReportesCiudadano({
  onVolver,
}: {
  onVolver: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [registrar, setRegistrar] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reportes, setReportes] = useState<ReporteCiudadano[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [fechasServicio, setFechasServicio] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargarReportes = useCallback(async (token: string, silencioso = false) => {
    if (!silencioso) {
      setCargando(true);
      setError("");
    }
    try {
      const response = await fetch("/api/ciudadano/reportes", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar tus reportes.");
      setReportes(data.reportes as ReporteCiudadano[]);
    } catch (err) {
      if (!silencioso) {
        setError(err instanceof Error ? err.message : "Error cargando tus reportes.");
      }
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setSession(data.session);
      setVerificando(false);
    });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const temporizador = window.setTimeout(() => {
      void cargarReportes(session.access_token);
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [session, cargarReportes]);

  useEffect(() => {
    if (!session) return;
    const intervalo = window.setInterval(() => {
      void cargarReportes(session.access_token, true);
    }, 30_000);
    return () => window.clearInterval(intervalo);
  }, [session, cargarReportes]);

  async function autenticar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMensaje("");
    setProcesando("auth");
    try {
      if (registrar) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        if (data.session) {
          setSession(data.session);
          setMensaje("Cuenta creada. Ya puedes consultar y reportar tus novedades.");
        } else {
          setMensaje("Cuenta creada. Revisa tu correo para confirmar el registro y luego inicia sesión.");
          setRegistrar(false);
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError || !data.session) throw authError ?? new Error("No se pudo iniciar sesión.");
        setSession(data.session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo autenticar.");
    } finally {
      setProcesando(null);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    setSession(null);
    setReportes([]);
  }

  async function avisarRestablecimiento(reporte: ReporteCiudadano) {
    if (!session) return;
    const value = fechasServicio[reporte.id];
    if (!value) {
      setError("Indica la fecha y hora en que volvió el servicio.");
      return;
    }
    setProcesando(reporte.id);
    setError("");
    setMensaje("");
    try {
      const response = await fetch(
        `/api/ciudadano/reportes/${encodeURIComponent(reporte.id)}/aviso-restablecimiento`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ fechaServicio: new Date(value).toISOString() }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo enviar el aviso.");
      setMensaje("Aviso enviado al operador. Gracias por informar cuándo volvió el servicio.");
      await cargarReportes(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el aviso.");
    } finally {
      setProcesando(null);
    }
  }

  async function responderRestablecimiento(
    reporte: ReporteCiudadano,
    respuesta: "CONFIRMO" | "SIGUE_SIN_SERVICIO"
  ) {
    if (!session || !reporte.restablecimiento_id) return;
    setProcesando(reporte.restablecimiento_id);
    setError("");
    setMensaje("");
    try {
      const response = await fetch(
        `/api/ciudadano/restablecimientos/${encodeURIComponent(reporte.restablecimiento_id)}/confirmacion`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ respuesta }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la respuesta.");
      setMensaje(respuesta === "CONFIRMO"
        ? "Restablecimiento confirmado. Gracias por validar el servicio."
        : "Avisamos al operador que sigues sin servicio para que revise el caso.");
      await cargarReportes(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la respuesta.");
    } finally {
      setProcesando(null);
    }
  }

  if (verificando) {
    return <main className="flex min-h-screen items-center justify-center">Verificando sesión…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-xs font-bold uppercase tracking-widest text-blue-700">SERVI-RED / INICIO</Link>
            <h1 className="mt-2 text-3xl font-extrabold">Mis reportes</h1>
            <p className="mt-1 text-sm text-slate-600">Consulta tus novedades y confirma el restablecimiento del servicio.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onVolver} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Volver al simulador</button>
            {session && (
              <button onClick={() => void cerrarSesion()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Cerrar sesión</button>
            )}
          </div>
        </header>

        {mensaje && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{mensaje}</p>}
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {!session ? (
          <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">{registrar ? "Crear cuenta ciudadana" : "Iniciar sesión"}</h2>
            <p className="mt-2 text-sm text-slate-600">La cuenta vincula tus reportes y permite validar el restablecimiento de tus servicios.</p>
            <form onSubmit={autenticar} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">Correo electrónico
                <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">Contraseña
                <input type="password" required minLength={8} autoComplete={registrar ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <button disabled={procesando === "auth"} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {procesando === "auth" ? "Procesando…" : registrar ? "Crear cuenta" : "Entrar"}
              </button>
            </form>
            <button onClick={() => { setRegistrar(!registrar); setError(""); }} className="mt-4 text-sm font-semibold text-blue-700">
              {registrar ? "Ya tengo cuenta · Iniciar sesión" : "¿No tienes cuenta? Regístrate"}
            </button>
          </section>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
              <span>Sesión: {session.user.email}</span>
              <button onClick={onVolver} className="font-bold underline">Crear un reporte</button>
            </div>

            {cargando ? <p className="py-12 text-center text-slate-500">Cargando reportes…</p> : reportes.length === 0 ? (
              <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <p>Aún no hay reportes asociados a esta cuenta.</p>
                <button onClick={onVolver} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Reportar una novedad</button>
              </section>
            ) : (
              <div className="space-y-5">
                {reportes.map((reporte) => {
                  const pendiente = reporte.tiene_notificacion_pendiente &&
                    reporte.validacion_restablecimiento === "PENDIENTE" &&
                    reporte.restablecimiento_id;
                  const permiteAviso = reporte.estado !== "RESUELTO" &&
                    (!reporte.fecha_servicio_reportada ||
                      (reporte.validacion_restablecimiento === "OBSERVADO" &&
                        reporte.aviso_creado_en &&
                        reporte.restablecimiento_registrado_en &&
                        new Date(reporte.aviso_creado_en).getTime() <=
                          new Date(reporte.restablecimiento_registrado_en).getTime()));
                  const fechaInicial = reporte.fecha_servicio_reportada
                    ? formatoLocalInput(reporte.fecha_servicio_reportada)
                    : "";

                  return (
                    <article key={reporte.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-bold">{reporte.servicio || "Servicio público"} · {reporte.tipo_novedad.replaceAll("_", " ")}</h2>
                          <p className="mt-1 text-sm text-slate-600">{reporte.municipio || "Municipio no disponible"} · {reporte.descripcion}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{reporte.estado.replaceAll("_", " ")}</span>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">Reportado: {fechaLocal(reporte.fecha_reporte)}</p>

                      {reporte.fecha_servicio_reportada && (
                        <p className="mt-2 text-sm text-blue-800">Informaste que el servicio volvió: {fechaLocal(reporte.fecha_servicio_reportada)}. El operador puede revisar este aviso.</p>
                      )}

                      {reporte.fecha_restablecimiento_operador && (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                          <p><strong>Restablecimiento registrado por el operador:</strong> {fechaLocal(reporte.fecha_restablecimiento_operador)}</p>
                          {reporte.acciones_restablecimiento && <p className="mt-1"><strong>Acciones:</strong> {reporte.acciones_restablecimiento}</p>}
                          <p className="mt-1 text-xs text-slate-600">Duración estimada desde el reporte: {Math.max(0, (new Date(reporte.fecha_restablecimiento_operador).getTime() - new Date(reporte.fecha_reporte).getTime()) / 3_600_000).toFixed(1)} horas.</p>
                        </div>
                      )}

                      {permiteAviso && (
                        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                          <h3 className="font-semibold">¿Ya tienes servicio?</h3>
                          <label className="mt-2 block text-sm">Indica cuándo volvió
                            <input
                              type="datetime-local"
                              required
                              value={fechasServicio[reporte.id] ?? fechaInicial}
                              onChange={(event) => setFechasServicio((actual) => ({ ...actual, [reporte.id]: event.target.value }))}
                              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"
                            />
                          </label>
                          <button onClick={() => void avisarRestablecimiento(reporte)} disabled={procesando === reporte.id} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            {procesando === reporte.id ? "Enviando…" : "Ya tengo servicio"}
                          </button>
                        </div>
                      )}

                      {pendiente && (
                        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4" role="status">
                          <h3 className="font-bold text-amber-950">Notificación: el operador registró el restablecimiento</h3>
                          <p className="mt-1 text-sm text-amber-900">Confirma si el servicio volvió. Una sola respuesta es suficiente.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => void responderRestablecimiento(reporte, "CONFIRMO")} disabled={procesando === reporte.restablecimiento_id} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Sí, volvió</button>
                            <button onClick={() => void responderRestablecimiento(reporte, "SIGUE_SIN_SERVICIO")} disabled={procesando === reporte.restablecimiento_id} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Sigo sin servicio</button>
                          </div>
                        </div>
                      )}

                      {reporte.validacion_restablecimiento === "CONFIRMADO" && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800">Restablecimiento confirmado por ti.</p>}
                      {reporte.validacion_restablecimiento === "OBSERVADO" && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">Informaste que sigues sin servicio. El operador debe revisar el incidente.</p>}
                    </article>
                  );
                })}
              </div>
            )}
            <button onClick={() => void cargarReportes(session.access_token)} className="mt-5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Actualizar mis reportes</button>
          </>
        )}
      </div>
    </main>
  );
}
