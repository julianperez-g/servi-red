"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Estado = "PENDIENTE" | "EN_REVISION" | "ADMITIDA" | "DESCARTADA";
type Denuncia = { id: string; descripcion: string; estado: Estado; municipio: string; servicio: string;
  latitud: number | null; longitud: number | null; creada_en: string; tiene_evidencia: boolean; ultimo_motivo: string | null };
const estados: Estado[] = ["PENDIENTE", "EN_REVISION", "ADMITIDA", "DESCARTADA"];
const etiquetas = { PENDIENTE: "Pendientes", EN_REVISION: "En revisión", ADMITIDA: "Admitidas", DESCARTADA: "Descartadas" };

export default function ModeracionDenuncias() {
  const [estado, setEstado] = useState<Estado>("PENDIENTE");
  const [pagina, setPagina] = useState(0);
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ocupada, setOcupada] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [imagen, setImagen] = useState<{ id: string; url: string } | null>(null);
  const imagenRef = useRef<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => () => { if (imagenRef.current) URL.revokeObjectURL(imagenRef.current); }, []);

  const autorizacion = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Inicia sesión como operador.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  };
  useEffect(() => {
    const controller = new AbortController();
    async function cargar() {
      try {
        const headers = await autorizacion();
        if (controller.signal.aborted) return;
        setCargando(true); setError("");
        const response = await fetch(`/api/denuncias/moderacion?estado=${estado}&pagina=${pagina}`, { headers, cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar la bandeja.");
        if (!controller.signal.aborted) { setDenuncias(data.denuncias); setHayMas(data.hayMas); }
      } catch (e) { if (!controller.signal.aborted) { setDenuncias([]); setError(e instanceof Error ? e.message : "Error de conexión."); } }
      finally { if (!controller.signal.aborted) setCargando(false); }
    }
    void cargar();
    return () => controller.abort();
  }, [estado, pagina, recarga]);

  async function moderar(denuncia: Denuncia, nuevo: Estado) {
    if (ocupada) return;
    const motivo = motivos[denuncia.id]?.trim() || "";
    if (motivo.length < 5) { setError("Escribe un motivo de al menos 5 caracteres antes de moderar."); return; }
    setOcupada(denuncia.id); setError(""); setAviso("");
    try {
      const response = await fetch(`/api/denuncias/moderacion/${denuncia.id}`, { method: "PATCH",
        headers: { ...await autorizacion(), "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevo, estadoEsperado: denuncia.estado, motivo }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo moderar.");
      setAviso("Moderación guardada con historial del operador. La denuncia sigue siendo privada.");
      setRecarga((r) => r + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Error de moderación."); }
    finally { setOcupada(""); }
  }

  async function verEvidencia(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/denuncias/moderacion/${id}/evidencia`, { headers: await autorizacion(), cache: "no-store" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "No se pudo ver la evidencia."); }
      const url = URL.createObjectURL(await response.blob());
      if (imagenRef.current) URL.revokeObjectURL(imagenRef.current);
      imagenRef.current = url; setImagen({ id, url });
    } catch (e) { setError(e instanceof Error ? e.message : "Error de evidencia."); }
  }

  return <main className="mx-auto max-w-6xl px-4 py-8 text-slate-900">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold tracking-widest text-violet-700">BANDEJA PRIVADA</p><h1 className="mt-2 text-3xl font-bold">Moderación de denuncias anónimas</h1><p className="mt-2 text-sm text-slate-600">Solo servicios asignados a tu empresa. No hay datos de identidad del remitente ni publicación automática.</p></div><Link href="/mapa" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold">Volver al mapa</Link></header>
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Una denuncia describe una sospecha, no prueba fraude. Admitirla significa remitirla a investigación; evita reproducir datos personales innecesarios en el motivo.</div>
    <nav aria-label="Estados de moderación" className="mb-6 flex flex-wrap gap-2">{estados.map((s) => <button key={s} type="button" aria-pressed={estado === s} onClick={() => { setEstado(s); setPagina(0); setAviso(""); }} className={`rounded-xl px-4 py-3 text-sm font-bold ${s === estado ? "bg-violet-700 text-white" : "border border-slate-200 bg-white"}`}>{etiquetas[s]}</button>)}<button type="button" onClick={() => setRecarga((r) => r + 1)} disabled={cargando} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">Actualizar</button></nav>
    {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {aviso && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{aviso}</p>}
    {cargando ? <p role="status" className="rounded-xl bg-white p-8">Cargando denuncias...</p> : denuncias.length === 0 ? <p className="rounded-xl bg-white p-8 text-slate-600">No hay denuncias visibles en este estado.</p> : <div className="space-y-5">{denuncias.map((d) => <article key={d.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold text-violet-950">{d.servicio} · {d.municipio}</h2><span className="text-xs text-slate-500">{new Date(d.creada_en).toLocaleString("es-CO")}</span></div>
      <p className="mt-2 break-all text-xs text-slate-500">Folio: {d.id}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{d.descripcion}</p>
      {d.latitud != null && <p className="mt-3 text-xs text-slate-600">Punto del hecho: {d.latitud}, {d.longitud}</p>}
      {d.ultimo_motivo && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Último motivo: {d.ultimo_motivo}</p>}
      {d.tiene_evidencia && <button type="button" onClick={() => void verEvidencia(d.id)} className="mt-4 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800">Ver evidencia privada sin EXIF</button>}
      {imagen?.id === d.id && <div className="mt-4">
        {/* Blob autorizado: no exponer una URL de evidencia al optimizador. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imagen.url} alt="Evidencia privada de la conexión sospechosa" className="max-h-96 max-w-full rounded-xl" />
        <button type="button" className="mt-2 text-sm text-slate-600" onClick={() => { if (imagenRef.current) URL.revokeObjectURL(imagenRef.current); imagenRef.current = null; setImagen(null); }}>Cerrar imagen</button>
      </div>}
      {["PENDIENTE", "EN_REVISION"].includes(d.estado) && <div className="mt-5 space-y-3 border-t border-slate-100 pt-4"><label className="block text-sm font-semibold">Motivo de moderación<textarea className="mt-2 block min-h-20 w-full rounded-xl border border-slate-300 p-3 font-normal" minLength={5} maxLength={1000} value={motivos[d.id] || ""} onChange={(e) => setMotivos((m) => ({ ...m, [d.id]: e.target.value }))} placeholder="Describe el criterio de revisión sin añadir identidades innecesarias." /></label><div className="flex flex-wrap gap-2">
        {d.estado === "PENDIENTE" && <button type="button" disabled={!!ocupada} onClick={() => void moderar(d, "EN_REVISION")} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Tomar en revisión</button>}
        {d.estado === "EN_REVISION" && <button type="button" disabled={!!ocupada} onClick={() => void moderar(d, "ADMITIDA")} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Admitir para investigación</button>}
        <button type="button" disabled={!!ocupada} onClick={() => void moderar(d, "DESCARTADA")} className="rounded-xl border border-red-300 px-4 py-3 text-sm font-bold text-red-800 disabled:opacity-50">Descartar</button>
      </div></div>}
    </article>)}</div>}
    <div className="mt-6 flex items-center justify-between"><button type="button" disabled={pagina === 0 || cargando} onClick={() => setPagina((p) => p - 1)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 disabled:opacity-40">Anterior</button><span className="text-sm text-slate-600">Página {pagina + 1}</span><button type="button" disabled={!hayMas || cargando} onClick={() => setPagina((p) => p + 1)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 disabled:opacity-40">Siguiente</button></div>
  </main>;
}
