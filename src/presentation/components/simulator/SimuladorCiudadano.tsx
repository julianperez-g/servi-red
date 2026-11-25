
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import MisReportesCiudadano from "./MisReportesCiudadano";

const MapaSeleccionUbicacion = dynamic(
  () => import("./MapaSeleccionUbicacion"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center bg-slate-100">
        Cargando mapa...
      </div>
    ),
  }
);

type Tipo = "CORTE" | "FALLA" | "BAJA_CALIDAD";
type Severidad = "BAJA" | "MEDIA" | "ALTA";

type Formulario = {
  municipioId: number;
  servicioId: number;
  tipoNovedad: Tipo;
  descripcion: string;
  severidad: Severidad;
  latitud: number;
  longitud: number;
};

type Evidencia = {
  bucket: string;
  ruta: string;
  tipo: string;
  tamano: number;
};

type Respuesta = {
  status?: string;
  message?: string;
  reporteId?: string;
  estado?: string;
};

const municipios = [
  { id: 1, nombre: "Bogotá D.C.", lat: 4.711, lng: -74.0721 },
  { id: 2, nombre: "Medellín", lat: 6.2442, lng: -75.5812 },
  { id: 3, nombre: "Cali", lat: 3.4516, lng: -76.532 },
];

const servicios = [
  { id: 1, nombre: "Agua potable", icono: "💧" },
  { id: 2, nombre: "Energía eléctrica", icono: "⚡" },
  { id: 3, nombre: "Gas domiciliario", icono: "🔥" },
  { id: 4, nombre: "Alcantarillado", icono: "🚰" },
  { id: 5, nombre: "Aseo y residuos", icono: "♻️" },
];

const inicial: Formulario = {
  municipioId: 1,
  servicioId: 2,
  tipoNovedad: "CORTE",
  descripcion: "",
  severidad: "MEDIA",
  latitud: 4.711,
  longitud: -74.0721,
};

const campo =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 " +
  "text-sm text-slate-900 outline-none focus:border-blue-500 " +
  "focus:ring-2 focus:ring-blue-100";

export default function SimuladorCiudadano() {
  const [vista, setVista] = useState<"reporte" | "mis-reportes">("reporte");
  const [form, setForm] = useState<Formulario>(inicial);
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gps, setGps] = useState(false);
  const [error, setError] = useState("");
  const [etapa, setEtapa] = useState("");
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState("");

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function limpiarFoto() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFoto(null);
    setPreview(null);
  }

  function actualizar<K extends keyof Formulario>(
    clave: K,
    valor: Formulario[K]
  ) {
    setForm((actual) => ({ ...actual, [clave]: valor }));
    setError("");
    setRespuesta(null);
  }

  function cambiarMunicipio(id: number) {
    const m = municipios.find((item) => item.id === id);
    if (!m) return;

    setForm((actual) => ({
      ...actual,
      municipioId: id,
      latitud: m.lat,
      longitud: m.lng,
    }));
    setError("");
  }

  function seleccionarFoto(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;

    if (!archivo) {
      limpiarFoto();
      return;
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        archivo.type
      )
    ) {
      setError("Solo se permiten JPG, PNG o WebP.");
      limpiarFoto();
      e.target.value = "";
      return;
    }

    if (archivo.size === 0 || archivo.size > 450 * 1024) {
      setError("La imagen debe pesar máximo 450 KB.");
      limpiarFoto();
      e.target.value = "";
      return;
    }

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(archivo);
    setPreview(previewRef.current);
    setFoto(archivo);
    setError("");
  }

  function usarGPS() {
    if (!navigator.geolocation) {
      setError("El navegador no permite geolocalización.");
      return;
    }

    setGps(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((actual) => ({
          ...actual,
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
        }));
        setGps(false);
      },
      () => {
        setError(
          "No se pudo obtener la ubicación. Selecciónala en el mapa."
        );
        setGps(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  }

  async function subirFotografia(archivo: File): Promise<Evidencia> {
    const datos = new FormData();
    datos.append("archivo", archivo);

    const response = await fetch("/api/evidencias/subir", {
      method: "POST",
      body: datos,
    });

    const resultado: {
      status?: string;
      message?: string;
      evidencia?: Evidencia;
    } = await response.json();

    if (
      !response.ok ||
      resultado.status !== "ok" ||
      !resultado.evidencia
    ) {
      throw new Error(
        resultado.message || "No fue posible subir la fotografía."
      );
    }

    return resultado.evidencia;
  }

  async function enviarReporte(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;

    setError("");
    setRespuesta(null);

    if (form.descripcion.trim().length < 10) {
      setError("La descripción debe tener mínimo 10 caracteres.");
      return;
    }

    if (
      !Number.isFinite(form.latitud) ||
      !Number.isFinite(form.longitud)
    ) {
      setError("Coordenadas inválidas.");
      return;
    }

    const { data: sesion } = await supabase.auth.getSession();
    if (!sesion.session) {
      setError("Inicia sesión o crea una cuenta ciudadana antes de enviar el reporte.");
      return;
    }

    setEnviando(true);

    let evidencia: Evidencia | undefined;

    try {
      if (foto) {
        setEtapa("Subiendo fotografía a Supabase Storage...");
        evidencia = await subirFotografia(foto);
      }

      setEtapa("Publicando reporte en RabbitMQ...");

      const response = await fetch("/api/reportes/registrar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sesion.session.access_token}`,
        },
        body: JSON.stringify({
          ...form,
          descripcion: form.descripcion.trim(),
          ...(evidencia ? { evidencia } : {}),
        }),
      });

      const resultado: Respuesta = await response.json();

      if (!response.ok) {
        throw new Error(
          resultado.message || "No se pudo registrar el reporte."
        );
      }

      setRespuesta(resultado);
      setUltimoEnvio(new Date().toLocaleString("es-CO"));
      setForm((actual) => ({ ...actual, descripcion: "" }));
      limpiarFoto();
      setEtapa("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado."
      );
      setEtapa("");
    } finally {
      setEnviando(false);
    }
  }

  if (vista === "mis-reportes") {
    return <MisReportesCiudadano onVolver={() => setVista("reporte")} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-widest text-blue-600">
              SERVI-RED
            </p>
            <h1 className="mt-1 text-3xl font-bold">
              Simulador ciudadano
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Registro de novedades en servicios públicos domiciliarios.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVista("mis-reportes")}
            className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-800"
          >
            Mis reportes / Cuenta
          </button>
          <Link
            href="/mapa"
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Ver mapa de reportes ↗
          </Link>
          </div>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[430px_1fr]">
          <section className="mx-auto w-full max-w-[430px] rounded-[36px] border-[7px] border-slate-900 bg-white shadow-xl">
            <div className="mx-auto mt-3 h-2 w-24 rounded-full bg-slate-900" />

            <div className="px-5 pb-7 pt-6 sm:px-7">
              <div className="mb-6 rounded-2xl bg-blue-600 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-100">
                  Portal ciudadano
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  Reportar incidente
                </h2>
                <p className="mt-2 text-sm text-blue-100">
                  Ayuda a identificar problemas en los servicios de tu ciudad.
                </p>
              </div>

              <form onSubmit={enviarReporte} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Municipio
                  </label>
                  <select
                    className={campo}
                    value={form.municipioId}
                    onChange={(e) =>
                      cambiarMunicipio(Number(e.target.value))
                    }
                  >
                    {municipios.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Servicio afectado
                  </label>
                  <select
                    className={campo}
                    value={form.servicioId}
                    onChange={(e) =>
                      actualizar("servicioId", Number(e.target.value))
                    }
                  >
                    {servicios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icono} {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Tipo de novedad
                  </label>
                  <select
                    className={campo}
                    value={form.tipoNovedad}
                    onChange={(e) =>
                      actualizar("tipoNovedad", e.target.value as Tipo)
                    }
                  >
                    <option value="CORTE">Corte del servicio</option>
                    <option value="FALLA">Falla en el servicio</option>
                    <option value="BAJA_CALIDAD">
                      Baja calidad del servicio
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Severidad
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["BAJA", "MEDIA", "ALTA"] as const).map(
                      (nivel) => {
                        const activo = form.severidad === nivel;
                        const colores = {
                          BAJA: "bg-green-600",
                          MEDIA: "bg-amber-500",
                          ALTA: "bg-red-600",
                        };

                        return (
                          <button
                            key={nivel}
                            type="button"
                            onClick={() =>
                              actualizar("severidad", nivel)
                            }
                            className={`rounded-xl border px-2 py-3 text-xs font-bold ${
                              activo
                                ? `${colores[nivel]} border-transparent text-white`
                                : "border-slate-200 bg-white text-slate-500"
                            }`}
                          >
                            {nivel}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Descripción del incidente
                  </label>
                  <textarea
                    className={`${campo} min-h-28 resize-y`}
                    value={form.descripcion}
                    maxLength={2000}
                    placeholder="Ejemplo: Desde esta mañana no tenemos energía..."
                    onChange={(e) =>
                      actualizar("descripcion", e.target.value)
                    }
                    required
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {form.descripcion.length}/2000
                  </p>
                </div>

                <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
                  <div>
                    <p className="text-sm font-semibold">
                      📍 Ubicación del reporte
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Selecciona dónde ocurrió el incidente.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={usarGPS}
                    disabled={gps}
                    className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 disabled:opacity-60"
                  >
                    {gps
                      ? "Buscando ubicación..."
                      : "📍 Usar mi ubicación actual"}
                  </button>

                  <MapaSeleccionUbicacion
                    latitud={form.latitud}
                    longitud={form.longitud}
                    onCambiarUbicacion={(latitud, longitud) =>
                      setForm((actual) => ({
                        ...actual,
                        latitud,
                        longitud,
                      }))
                    }
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">
                        Latitud
                      </label>
                      <input
                        className={campo}
                        type="number"
                        step="any"
                        required
                        value={form.latitud}
                        onChange={(e) =>
                          actualizar("latitud", Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">
                        Longitud
                      </label>
                      <input
                        className={campo}
                        type="number"
                        step="any"
                        required
                        value={form.longitud}
                        onChange={(e) =>
                          actualizar("longitud", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-semibold">
                    📷 Evidencia fotográfica (opcional)
                  </label>

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={seleccionarFoto}
                    disabled={enviando}
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:font-semibold file:text-blue-700"
                  />

                  <p className="text-xs text-slate-500">
                    JPG, PNG o WebP. Máximo 450 KB.
                  </p>

                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt="Vista previa de la fotografía"
                      className="max-h-48 w-full rounded-xl object-contain"
                    />
                  )}

                  {foto && (
                    <p className="text-xs text-blue-700">
                      {foto.name} ·{" "}
                      {(foto.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                {respuesta && (
                  <div
                    role="status"
                    className="rounded-xl border border-green-200 bg-green-50 p-4"
                  >
                    <p className="font-bold text-green-800">
                      ✓ Reporte recibido
                    </p>
                    <p className="mt-1 text-sm text-green-700">
                      El evento fue aceptado para procesamiento.
                    </p>
                    <p className="mt-2 break-all text-xs text-green-700">
                      ID: {respuesta.reporteId}
                    </p>
                    <p className="mt-1 text-xs text-green-700">
                      Estado inicial: {respuesta.estado}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  {enviando
                    ? etapa || "Procesando..."
                    : "Enviar reporte ciudadano"}
                </button>

                <p className="text-center text-xs text-slate-400">
                  Simulación académica. No reporta emergencias reales.
                </p>
              </form>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">
                Centro de simulación
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Cada reporte enviado recorre la infraestructura de SERVI-RED.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  ["01", "Supabase Storage", "Almacena la fotografía opcional."],
                  ["02", "API REST", "Valida y recibe el reporte."],
                  ["03", "RabbitMQ", "Publica el evento en la cola."],
                  ["04", "Worker", "Procesa el evento y la evidencia."],
                  ["05", "PostgreSQL + PostGIS", "Guarda el incidente georreferenciado."],
                  ["06", "Panel de operadores", "Muestra reportes y fotografías."],
                ].map(([numero, titulo, detalle]) => (
                  <div
                    key={numero}
                    className="flex gap-4 rounded-xl bg-slate-50 p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-sm font-bold text-blue-700">
                      {numero}
                    </div>
                    <div>
                      <p className="font-semibold">{titulo}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {detalle}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">
                Estado de la última solicitud
              </h3>

              {respuesta ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p>Respuesta: {respuesta.status}</p>
                  <p>Enviado: {ultimoEnvio}</p>
                  <p>Estado inicial: {respuesta.estado}</p>
                  <p className="break-all text-xs text-slate-500">
                    {respuesta.reporteId}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Todavía no has enviado ningún reporte en esta sesión.
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-900 p-6 text-white">
              <h3 className="text-lg font-bold">
                Demostración de arquitectura
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Detén el worker para comprobar que RabbitMQ conserva los mensajes pendientes.
              </p>
              <code className="mt-4 block rounded-lg bg-slate-800 p-3 text-xs text-blue-200">
                docker compose stop worker
              </code>
              <code className="mt-2 block rounded-lg bg-slate-800 p-3 text-xs text-green-200">
                docker compose start worker
              </code>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
