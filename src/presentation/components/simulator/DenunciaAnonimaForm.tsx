"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { municipios, servicios } from "./catalogos";

const Mapa = dynamic(() => import("./MapaSeleccionUbicacion"), { ssr: false,
  loading: () => <p className="p-4 text-sm">Cargando mapa del hecho...</p> });
const campo = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100";

export default function DenunciaAnonimaForm({ onVolver }: { onVolver: () => void }) {
  const [municipioId, setMunicipio] = useState(1);
  const [servicioId, setServicio] = useState(2);
  const [descripcion, setDescripcion] = useState("");
  const [conPunto, setConPunto] = useState(false);
  const [punto, setPunto] = useState({ latitud: 4.711, longitud: -74.0721 });
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [folio, setFolio] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  function seleccionarFoto(file: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewRef.current); setFoto(file);
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    setError(""); setFolio("");
    if (!acepta || descripcion.trim().length < 20) { setError("Describe el hecho con al menos 20 caracteres y revisa el aviso de privacidad."); return; }
    setEnviando(true);
    try {
      let imagen;
      if (foto) {
        if (!foto.size || foto.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(foto.type)) {
          throw new Error("Usa una foto JPG, PNG o WebP de hasta 2 MB.");
        }
        const bytes = new Uint8Array(await foto.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        // No enviar nombre de archivo, última modificación ni metadatos de sesión.
        imagen = { tipo: foto.type, base64: btoa(binary) };
      }
      const response = await fetch("/api/denuncias", {
        method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ municipioId, servicioId, descripcion: descripcion.trim(),
          ...(conPunto ? punto : {}), ...(imagen ? { foto: imagen } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.folio !== "string") throw new Error(data.error || "No se pudo recibir la denuncia.");
      setFolio(data.folio); setDescripcion(""); seleccionarFoto(null); setAcepta(false); setConPunto(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible enviar la denuncia."); }
    finally { setEnviando(false); }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-bold tracking-widest text-violet-700">SERVI-RED · SIMULADOR</p>
            <h1 className="mt-2 text-3xl font-bold">Denuncia anónima</h1>
            <p className="mt-2 text-sm text-slate-600">Canal privado para informar posibles conexiones fraudulentas. No necesitas una cuenta.</p></div>
          <button type="button" onClick={onVolver} disabled={enviando} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50">← Volver a reportes</button>
        </header>
        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 rounded-2xl bg-violet-700 p-5 text-white"><h2 className="text-xl font-bold">Describe el hecho, no tu identidad</h2><p className="mt-2 text-sm text-violet-100">Tu denuncia entra a una bandeja privada de moderación. No aparecerá en el mapa ni en los datos abiertos.</p></div>
            <form onSubmit={enviar} className="space-y-5">
              <fieldset disabled={enviando} className="space-y-5 disabled:opacity-60">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold"><span>Municipio del hecho</span><select className={campo} value={municipioId} onChange={(e) => {
                    const id = Number(e.target.value); setMunicipio(id);
                    const m = municipios.find((x) => x.id === id); if (m) setPunto({ latitud: m.lat, longitud: m.lng });
                  }}>{municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
                  <label className="space-y-2 text-sm font-semibold"><span>Servicio</span><select className={campo} value={servicioId} onChange={(e) => setServicio(Number(e.target.value))}>{servicios.map((s) => <option key={s.id} value={s.id}>{s.icono} {s.nombre}</option>)}</select></label>
                </div>
                <label className="block space-y-2 text-sm font-semibold"><span>¿Qué conexión sospechosa observaste?</span>
                  <textarea className={`${campo} min-h-36`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} minLength={20} maxLength={2000} required placeholder="Ejemplo: Se observa un cable conectado directamente a la red sin pasar por el medidor, junto al poste de la esquina..." />
                  <span className="block text-right text-xs font-normal text-slate-500">{descripcion.length}/2000 · No escribas tu nombre, documento ni contacto.</span>
                </label>
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" checked={conPunto} onChange={(e) => setConPunto(e.target.checked)} className="mt-1" /><span>Indicar el punto de la conexión sospechosa (opcional)</span></label>
                  <p className="text-xs text-slate-600">No solicitamos tu GPS. No marques tu domicilio salvo que sea el lugar del hecho.</p>
                  {conPunto && <>
                    <p className="text-xs text-amber-800">El mapa carga imágenes de OpenStreetMap, que puede recibir datos técnicos de tu conexión. También puedes escribir las coordenadas.</p>
                    <Mapa {...punto} onCambiarUbicacion={(latitud, longitud) => setPunto({ latitud, longitud })} />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-xs">Latitud del hecho<input className={campo} type="number" step="any" min={-4.3} max={13.5} required value={punto.latitud} onChange={(e) => setPunto({ ...punto, latitud: Number(e.target.value) })} /></label>
                      <label className="space-y-1 text-xs">Longitud del hecho<input className={campo} type="number" step="any" min={-82} max={-66} required value={punto.longitud} onChange={(e) => setPunto({ ...punto, longitud: Number(e.target.value) })} /></label>
                    </div>
                  </>}
                </div>
                <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <label className="block text-sm font-semibold" htmlFor="foto-denuncia">Foto de la conexión (opcional)</label>
                  <input ref={fileRef} id="foto-denuncia" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(e) => {
                    setError(""); const file = e.target.files?.[0] ?? null;
                    if (file && (!file.size || file.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
                      setError("Usa una foto JPG, PNG o WebP de hasta 2 MB."); e.target.value = ""; seleccionarFoto(null); return;
                    } seleccionarFoto(file);
                  }} />
                  <p className="text-xs text-slate-600">Hasta 2 MB y 16 megapíxeles. El servidor elimina EXIF/GPS y guarda solo una nueva imagen WebP. No se guarda el original ni su nombre.</p>
                  <p className="text-xs font-semibold text-amber-800">Evita rostros, placas, documentos, reflejos y otros elementos que revelen quién eres: quitar EXIF no oculta lo que se ve en la foto.</p>
                  {preview && <>
                    {/* Blob local: no enviarlo al optimizador remoto de imágenes. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Vista previa local de la evidencia" className="max-h-64 w-full rounded-xl object-contain" />
                    <button type="button" className="text-sm font-semibold text-violet-700" onClick={() => { seleccionarFoto(null); if (fileRef.current) fileRef.current.value = ""; }}>Quitar foto</button>
                  </>}
                </div>
                <label className="flex items-start gap-3 rounded-xl bg-violet-50 p-4 text-sm text-violet-950"><input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} required className="mt-1" /><span>Revisé el texto y la foto para no identificarme. Entiendo que la limpieza automática no reconoce todos los nombres o detalles visibles y que el alojamiento puede conservar registros técnicos.</span></label>
              </fieldset>
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
              {folio && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold text-emerald-900">Denuncia recibida · Pendiente de moderación</p><p className="mt-2 break-all text-sm text-emerald-900">Folio: {folio}</p><p className="mt-2 text-xs text-emerald-800">Guarda este folio fuera del navegador si lo necesitas. No se vincula con tu cuenta ni aparece en Mis reportes. No existe consulta pública del contenido.</p></div>}
              <button type="submit" disabled={enviando} className="w-full rounded-xl bg-violet-700 px-5 py-4 font-bold text-white disabled:opacity-60">{enviando ? "Limpiando y enviando al canal privado..." : "Enviar denuncia sin identificarme"}</button>
              <p className="text-center text-xs text-slate-500">Simulación académica. No es un canal de emergencias ni una denuncia oficial ante autoridades.</p>
            </form>
          </section>
          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">¿Cómo se protege tu identidad?</h2>
              <ol className="mt-5 space-y-4 text-sm">{[
                ["1. Sin cuenta", "El formulario no envía tu sesión, correo, teléfono, nombre o documento."],
                ["2. Limpieza antes de guardar", "El microservicio reduce correos, teléfonos, documentos e IP escritos en el texto y recodifica la foto sin metadatos."],
                ["3. Persistencia privada", "Se guarda el hecho denunciado, no IP, navegador o identificadores del remitente."],
                ["4. Moderación", "Solo operadores autorizados para ese servicio revisan la denuncia y su evidencia. Admitirla no demuestra fraude."],
              ].map(([titulo, texto]) => <li key={titulo} className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-violet-900">{titulo}</p><p className="mt-1 leading-relaxed text-slate-600">{texto}</p></li>)}</ol>
            </section>
            <section className="rounded-2xl bg-slate-900 p-6 text-white"><h2 className="text-lg font-bold">Microservicio independiente</h2><p className="mt-3 text-sm leading-relaxed text-slate-300">Este envío no usa la cola de reportes ciudadanos. Next.js actúa como proxy y el servicio Docker de denuncias valida, anonimiza y persiste en su esquema privado.</p><code className="mt-4 block rounded-lg bg-slate-800 p-3 text-xs text-violet-200">Simulador → API → denuncias → PostgreSQL privado</code></section>
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-relaxed text-amber-950"><h2 className="font-bold">Límites del anonimato</h2><p className="mt-2">Vercel, Railway y otros intermediarios pueden conservar IP en sus registros. La aplicación no los persiste, pero no puede garantizar anonimato absoluto ni eliminar identidades visibles en una foto o relato.</p></section>
          </aside>
        </div>
      </div>
    </main>
  );
}
