
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { supabase } from "@/lib/supabaseClient";
import { esServicioSaneamiento, formatearArea, nombreCategoria, type AreaAfectada } from "@/domain/value_objects/cobertura";

type Severidad = "BAJA" | "MEDIA" | "ALTA";
type Estado = "REPORTADO" | "EN_ATENCION" | "RESUELTO";

type Reporte = {
  id: string;
  municipio_id: string | number;
  servicio_id: number;
  tipo_novedad: string;
  descripcion: string;
  severidad: Severidad;
  estado: Estado;
  fecha_reporte: string;
  fecha_restablecimiento: string | null;
  restablecimiento_id: string | null;
  fecha_restablecimiento_operador: string | null;
  acciones_restablecimiento: string | null;
  validacion_restablecimiento: "PENDIENTE" | "CONFIRMADO" | "OBSERVADO" | null;
  respuesta_ciudadano: string | null;
  fecha_servicio_reportada: string | null;
  latitud: number;
  longitud: number;
  tiene_evidencia: boolean;
  categoria_incidente: string | null;
  fecha_inicio_estimada: string | null;
  area_afectada_m2: number | string | null;
  area_afectada_geojson: AreaAfectada | null;
};

type Actuacion = {
  id: string;
  estado_anterior: string;
  estado_nuevo: string;
  observacion: string;
  fecha_cambio: string;
  operador: string;
};

type Grupo = {
  lat: number;
  lng: number;
  reportes: Reporte[];
};

const municipios: Record<string, string> = {
  "1": "Bogotá D.C.",
  "2": "Medellín",
  "3": "Cali",
};

const servicios: Record<number, string> = {
  1: "Agua potable",
  2: "Energía eléctrica",
  3: "Gas domiciliario",
  4: "Alcantarillado",
  5: "Aseo y residuos",
};

const colores: Record<Severidad, string> = {
  ALTA: "#dc2626",
  MEDIA: "#f59e0b",
  BAJA: "#16a34a",
};

function formatearFecha(fecha: string): string {
  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(valor);
}

function nombreEstado(estado: string): string {
  return estado.replaceAll("_", " ");
}

function siguienteEstado(estado: Estado): Estado | null {
  if (estado === "REPORTADO") return "EN_ATENCION";
  if (estado === "EN_ATENCION") return "RESUELTO";
  return null;
}

async function obtenerToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error(
      "Tu sesión ha expirado. Inicia sesión nuevamente."
    );
  }

  return data.session.access_token;
}

function agruparReportes(reportes: Reporte[]): Grupo[] {
  const grupos = new Map<string, Grupo>();

  for (const reporte of reportes) {
    const lat = Number(reporte.latitud);
    const lng = Number(reporte.longitud);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    const clave = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const existente = grupos.get(clave);

    if (existente) {
      existente.reportes.push(reporte);
    } else {
      grupos.set(clave, {
        lat,
        lng,
        reportes: [reporte],
      });
    }
  }

  return [...grupos.values()];
}

function severidadMayor(reportes: Reporte[]): Severidad {
  if (reportes.some((r) => r.severidad === "ALTA")) {
    return "ALTA";
  }

  if (reportes.some((r) => r.severidad === "MEDIA")) {
    return "MEDIA";
  }

  return "BAJA";
}

function crearPopup(reportes: Reporte[]): HTMLElement {
  const contenedor = document.createElement("div");

  contenedor.style.cssText =
    "min-width:220px;max-width:300px;max-height:360px;overflow-y:auto";

  const encabezado = document.createElement("strong");

  encabezado.textContent =
    reportes.length === 1
      ? "Detalle del incidente"
      : `${reportes.length} incidentes en esta ubicación`;

  contenedor.appendChild(encabezado);

  for (const reporte of reportes) {
    const bloque = document.createElement("div");

    bloque.style.cssText =
      "padding:10px 0;border-bottom:1px solid #e2e8f0";

    const titulo = document.createElement("strong");
    titulo.textContent =
      servicios[reporte.servicio_id] || "Servicio público";

    const ciudad = document.createElement("p");
    ciudad.textContent =
      municipios[String(reporte.municipio_id)] ||
      "Municipio desconocido";

    const descripcion = document.createElement("p");
    descripcion.textContent = reporte.descripcion;

    const fecha = document.createElement("p");
    fecha.style.cssText =
      "font-size:12px;color:#64748b;margin:8px 0";
    fecha.textContent =
      `Registrado: ${formatearFecha(reporte.fecha_reporte)}`;

    const estado = document.createElement("p");
    estado.style.cssText =
      "font-size:12px;margin:8px 0";
    estado.textContent =
      `Severidad: ${reporte.severidad} | ` +
      `Estado: ${nombreEstado(reporte.estado)}`;

    bloque.append(
      titulo,
      ciudad,
      descripcion,
      fecha,
      estado
    );
    const cobertura = document.createElement("p");
    cobertura.textContent = `${nombreCategoria(reporte.categoria_incidente)} · Inicio estimado: ${reporte.fecha_inicio_estimada ? formatearFecha(reporte.fecha_inicio_estimada) : "Sin dato"} · Área: ${formatearArea(reporte.area_afectada_m2)}`;
    bloque.appendChild(cobertura);

    function crearBoton(
      texto: string,
      color: string,
      evento: string
    ) {
      const boton = document.createElement("button");

      boton.type = "button";
      boton.textContent = texto;
      boton.style.cssText =
        `display:block;background:${color};color:white;` +
        "border:0;border-radius:8px;padding:8px 10px;" +
        "margin-top:8px;cursor:pointer;font-size:12px";

      boton.addEventListener("click", () => {
        window.dispatchEvent(
          new CustomEvent(evento, {
            detail: reporte.id,
          })
        );
      });

      return boton;
    }

    if (reporte.tiene_evidencia) {
      bloque.appendChild(
        crearBoton(
          "Ver fotografía",
          "#2563eb",
          "servired:ver-evidencia"
        )
      );
    }

    bloque.appendChild(
      crearBoton(
        "Gestionar incidente",
        "#0f172a",
        "servired:gestionar-reporte"
      )
    );

    contenedor.appendChild(bloque);
  }

  return contenedor;
}

export default function MapaReportes() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const capaMarcadores = useRef<LayerGroup | null>(null);

  const [mapaListo, setMapaListo] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [filtro, setFiltro] = useState("TODAS");
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [errorMapa, setErrorMapa] = useState("");

  const [imagenReporte, setImagenReporte] =
    useState<string | null>(null);

  const [urlEvidencia, setUrlEvidencia] =
    useState<string | null>(null);

  const [cargandoEvidencia, setCargandoEvidencia] =
    useState(false);

  const [errorEvidencia, setErrorEvidencia] = useState("");

  const [reporteGestion, setReporteGestion] =
    useState<string | null>(null);

  const [observacion, setObservacion] = useState("");
  const [fechaRestablecimiento, setFechaRestablecimiento] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorGestion, setErrorGestion] = useState("");
  const [mensajeGestion, setMensajeGestion] = useState("");

  const [historial, setHistorial] = useState<Actuacion[]>([]);
  const [cargandoHistorial, setCargandoHistorial] =
    useState(false);

  const cargarReportes = useCallback(
    async (inicial = false, silencioso = false) => {
      if (!silencioso) {
        if (inicial) {
          setCargando(true);
        } else {
          setActualizando(true);
        }
      }

      try {
        const token = await obtenerToken();

        const respuesta = await fetch("/api/reportes", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
          throw new Error(
            datos.message ||
            "No fue posible consultar los reportes"
          );
        }

        if (
          datos.status !== "ok" ||
          !Array.isArray(datos.reportes)
        ) {
          throw new Error("Respuesta inesperada de la API");
        }

        setReportes(datos.reportes);
        setError("");
      } catch (err) {
        if (!silencioso) {
          setReportes([]);
          setError(
            err instanceof Error
              ? err.message
              : "Error consultando reportes"
          );
        }
      } finally {
        if (!silencioso) {
          setCargando(false);
          setActualizando(false);
        }
      }
    },
    []
  );

  const cargarHistorial = useCallback(
    async (reporteId: string) => {
      setCargandoHistorial(true);
      setErrorGestion("");

      try {
        const token = await obtenerToken();

        const respuesta = await fetch(
          `/api/reportes/${encodeURIComponent(reporteId)}/historial`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
          throw new Error(
            datos.error || "No se pudo consultar el historial"
          );
        }

        setHistorial(
          Array.isArray(datos.historial)
            ? datos.historial
            : []
        );
      } catch (err) {
        setHistorial([]);
        setErrorGestion(
          err instanceof Error
            ? err.message
            : "Error consultando historial"
        );
      } finally {
        setCargandoHistorial(false);
      }
    },
    []
  );

  const abrirGestion = useCallback(
    (reporteId: string) => {
      setReporteGestion(reporteId);
      setObservacion("");
      setFechaRestablecimiento("");
      setErrorGestion("");
      setMensajeGestion("");
      setHistorial([]);

      void cargarHistorial(reporteId);
    },
    [cargarHistorial]
  );

  const actualizarEstado = async () => {
    if (!reporteGestion || guardando) return;

    const reporte = reportes.find(
      (r) => r.id === reporteGestion
    );

    if (!reporte) {
      setErrorGestion("Reporte no encontrado");
      return;
    }

    const reabrir = reporte.estado === "RESUELTO" &&
      reporte.validacion_restablecimiento === "OBSERVADO";
    const proximo = reabrir ? "EN_ATENCION" : siguienteEstado(reporte.estado);

    if (!proximo) {
      setErrorGestion(
        "Este incidente ya está resuelto"
      );
      return;
    }

    const texto = observacion.trim();

    if (texto.length < 5 || texto.length > 2000) {
      setErrorGestion(
        "La observación debe tener entre 5 y 2000 caracteres"
      );
      return;
    }

    let fechaRestablecimientoIso: string | undefined;
    if (proximo === "RESUELTO") {
      if (!fechaRestablecimiento) {
        setErrorGestion("Indica la fecha y hora del restablecimiento.");
        return;
      }
      const parseada = new Date(fechaRestablecimiento);
      if (!Number.isFinite(parseada.getTime())) {
        setErrorGestion("La fecha y hora del restablecimiento no es válida.");
        return;
      }
      fechaRestablecimientoIso = parseada.toISOString();
    }

    setGuardando(true);
    setErrorGestion("");
    setMensajeGestion("");

    try {
      const token = await obtenerToken();

      const respuesta = await fetch(
        `/api/reportes/${encodeURIComponent(reporteGestion)}/estado`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            estado: proximo,
            observacion: texto,
            ...(reabrir
              ? { reabrir: true }
              : fechaRestablecimientoIso
                ? { fechaRestablecimiento: fechaRestablecimientoIso }
                : {}),
          }),
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.error || "No se pudo actualizar el estado"
        );
      }

      setReportes((anteriores) =>
        anteriores.map((r) =>
          r.id === reporteGestion
            ? {
                ...r,
                estado: datos.reporte.estado,
                fecha_restablecimiento: datos.reporte.fecha_restablecimiento,
                fecha_restablecimiento_operador:
                  datos.restablecimiento?.fecha_restablecimiento ?? null,
                acciones_restablecimiento:
                  datos.restablecimiento?.acciones ?? null,
                restablecimiento_id: datos.restablecimiento?.id ?? null,
                validacion_restablecimiento:
                  datos.restablecimiento?.estado_validacion ?? null,
              }
            : r
        )
      );

      setObservacion("");
      setFechaRestablecimiento("");
      setMensajeGestion(
        reabrir
          ? "Incidente reabierto para nueva atención"
          : `Incidente actualizado a ${nombreEstado(proximo)}`
      );

      await cargarHistorial(reporteGestion);
      await cargarReportes();
    } catch (err) {
      setErrorGestion(
        err instanceof Error
          ? err.message
          : "Error actualizando el incidente"
      );
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      void cargarReportes(true);
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [cargarReportes]);

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      void cargarReportes(false, true);
    }, 30_000);
    return () => window.clearInterval(intervalo);
  }, [cargarReportes]);

  useEffect(() => {
    if (!imagenReporte) return;

    let cancelado = false;
    let urlTemporal: string | null = null;

    async function cargarFotografia() {
      setCargandoEvidencia(true);
      setErrorEvidencia("");
      setUrlEvidencia(null);

      try {
        const token = await obtenerToken();

        const respuesta = await fetch(
          `/api/evidencias/ver?reporteId=${encodeURIComponent(
            imagenReporte!
          )}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!respuesta.ok) {
          throw new Error(
            "No fue posible consultar la fotografía"
          );
        }

        const imagen = await respuesta.blob();

        if (cancelado) return;

        urlTemporal = URL.createObjectURL(imagen);
        setUrlEvidencia(urlTemporal);
      } catch (err) {
        if (!cancelado) {
          setErrorEvidencia(
            err instanceof Error
              ? err.message
              : "Error consultando evidencia"
          );
        }
      } finally {
        if (!cancelado) {
          setCargandoEvidencia(false);
        }
      }
    }

    void cargarFotografia();

    return () => {
      cancelado = true;

      if (urlTemporal) {
        URL.revokeObjectURL(urlTemporal);
      }
    };
  }, [imagenReporte]);

  useEffect(() => {
    function abrirFoto(evento: Event) {
      const id = (evento as CustomEvent<string>).detail;

      if (typeof id === "string") {
        setImagenReporte(id);
      }
    }

    function abrirPanel(evento: Event) {
      const id = (evento as CustomEvent<string>).detail;

      if (typeof id === "string") {
        abrirGestion(id);
      }
    }

    window.addEventListener(
      "servired:ver-evidencia",
      abrirFoto
    );

    window.addEventListener(
      "servired:gestionar-reporte",
      abrirPanel
    );

    return () => {
      window.removeEventListener(
        "servired:ver-evidencia",
        abrirFoto
      );

      window.removeEventListener(
        "servired:gestionar-reporte",
        abrirPanel
      );
    };
  }, [abrirGestion]);

  // Inicializar Leaflet una sola vez.
  useEffect(() => {
    let cancelado = false;
    let instancia: LeafletMap | null = null;

    async function iniciarMapa() {
      try {
        const L = await import("leaflet");

        if (cancelado || !contenedor.current) return;

        instancia = L.map(contenedor.current, {
          zoomAnimation: false,
          markerZoomAnimation: false,
          fadeAnimation: false,
        }).setView([4.7, -74.1], 6, {
          animate: false,
        });

        mapa.current = instancia;

        L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18,
          }
        ).addTo(instancia);

        capaMarcadores.current =
          L.layerGroup().addTo(instancia);

        setMapaListo(true);
        setErrorMapa("");
      } catch (err) {
        if (!cancelado) {
          setErrorMapa(
            err instanceof Error
              ? err.message
              : "No se pudo iniciar el mapa"
          );
        }
      }
    }

    void iniciarMapa();

    return () => {
      cancelado = true;
      setMapaListo(false);

      if (instancia) {
        instancia.stop();
        instancia.off();
        instancia.remove();
      }

      if (mapa.current === instancia) {
        mapa.current = null;
        capaMarcadores.current = null;
      }
    };
  }, []);

  const visibles = useMemo(
    () => reportes.filter(
      (r) => filtro === "TODAS" || r.severidad === filtro
    ),
    [reportes, filtro]
  );

  useEffect(() => {
    if (
      !mapaListo ||
      !mapa.current ||
      !capaMarcadores.current
    ) {
      return;
    }

    let cancelado = false;

    async function actualizarMarcadores() {
      const L = await import("leaflet");

      if (
        cancelado ||
        !mapa.current ||
        !capaMarcadores.current
      ) {
        return;
      }

      const instancia = mapa.current;
      const capa = capaMarcadores.current;

      instancia.stop();
      instancia.closePopup();
      capa.clearLayers();

      const grupos = agruparReportes(visibles);
      const puntos: [number, number][] = [];
      for (const reporte of visibles) {
        if (reporte.area_afectada_geojson) {
          const area = L.geoJSON(reporte.area_afectada_geojson, { style: { color: colores[reporte.severidad], fillOpacity: 0.12, className: "area-afectada" } });
          area.bindPopup(crearPopup([reporte]));
          capa.addLayer(area);
          if (area.getBounds().isValid()) puntos.push([area.getBounds().getSouth(), area.getBounds().getWest()], [area.getBounds().getNorth(), area.getBounds().getEast()]);
        }
      }

      for (const grupo of grupos) {
        const { lat, lng, reportes: incidentes } = grupo;

        puntos.push([lat, lng]);

        const color = colores[
          severidadMayor(incidentes)
        ];

        if (incidentes.length === 1) {
          const marcador = L.circleMarker(
            [lat, lng],
            {
              radius: 10,
              color: "#ffffff",
              weight: 2,
              fillColor: color,
              fillOpacity: 0.95,
            }
          );

          marcador.bindPopup(
            crearPopup(incidentes)
          );

          capa.addLayer(marcador);
        } else {
          const cantidad = incidentes.length;

          const icono = L.divIcon({
            className: "",
            html: `
              <div style="
                width:38px;
                height:38px;
                border-radius:50%;
                background:${color};
                color:white;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:800;
                font-size:14px;
                border:3px solid white;
                box-shadow:0 2px 8px rgba(0,0,0,.3);
              ">
                ${cantidad}
              </div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          });

          const marcador = L.marker(
            [lat, lng],
            { icon: icono }
          );

          marcador.bindPopup(
            crearPopup(incidentes),
            { maxWidth: 320 }
          );

          capa.addLayer(marcador);
        }
      }

      if (puntos.length > 0) {
        instancia.fitBounds(
          L.latLngBounds(puntos),
          {
            padding: [45, 45],
            maxZoom: 12,
            animate: false,
          }
        );
      }
    }

    void actualizarMarcadores();

    return () => {
      cancelado = true;
    };
  }, [mapaListo, reportes, filtro, visibles]);

  const grupos = agruparReportes(visibles);

  const totalFotos = reportes.filter(
    (r) => r.tiene_evidencia
  ).length;

  const reporteSeleccionado = reportes.find(
    (r) => r.id === reporteGestion
  );
  const saneamientoSeleccionado = esServicioSaneamiento(reporteSeleccionado?.servicio_id);

  const puedeReabrir = reporteSeleccionado?.estado === "RESUELTO" &&
    reporteSeleccionado.validacion_restablecimiento === "OBSERVADO";
  const proximoEstado = reporteSeleccionado
    ? puedeReabrir
      ? "EN_ATENCION"
      : siguienteEstado(reporteSeleccionado.estado)
    : null;

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">
              SERVI-RED
            </p>

            <h1 className="text-3xl font-bold text-slate-900">
              Panel de gestión de incidentes
            </h1>

            <p className="mt-2 text-slate-600">
              Monitoreo y atención de novedades
              en servicios públicos domiciliarios.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Inicio
            </Link>

            <Link
              href="/simulador"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Simulador ciudadano
            </Link>
            <Link
              href="/simulador"
              className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800"
            >
              Mis reportes
            </Link>

            <button
              type="button"
              onClick={() => void cargarReportes()}
              disabled={actualizando || cargando}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {actualizando
                ? "Actualizando..."
                : "Actualizar reportes"}
            </button>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-7">
          <Tarjeta
            titulo="Total de reportes"
            valor={reportes.length}
          />
          <Tarjeta
            titulo="Severidad alta"
            valor={
              reportes.filter(
                (r) => r.severidad === "ALTA"
              ).length
            }
          />
          <Tarjeta
            titulo="En atención"
            valor={
              reportes.filter(
                (r) => r.estado === "EN_ATENCION"
              ).length
            }
          />
          <Tarjeta
            titulo="Resueltos"
            valor={
              reportes.filter(
                (r) => r.estado === "RESUELTO"
              ).length
            }
          />
          <Tarjeta
            titulo="Con fotografía"
            valor={totalFotos}
          />
          <Tarjeta
            titulo="Pendientes de confirmación"
            valor={reportes.filter((r) => r.validacion_restablecimiento === "PENDIENTE").length}
          />
          <Tarjeta
            titulo="Ciudadano sigue sin servicio"
            valor={reportes.filter((r) => r.validacion_restablecimiento === "OBSERVADO").length}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Ubicación de incidentes
            </h2>

            <select
              aria-label="Filtrar por severidad"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="TODAS">
                Todas las severidades
              </option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          {error && (
            <p
              role="alert"
              className="mb-3 text-sm text-red-600"
            >
              {error}
            </p>
          )}

          {errorMapa && (
            <p
              role="alert"
              className="mb-3 text-sm text-red-600"
            >
              Error del mapa: {errorMapa}
            </p>
          )}

          <div className="relative">
            <div
              ref={contenedor}
              className="h-[300px] w-full overflow-hidden rounded-lg bg-slate-200 md:h-[380px]"
              aria-label="Mapa interactivo de incidentes"
            />

            {!mapaListo && !errorMapa && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/70 text-sm text-slate-600">
                Cargando mapa...
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-700">
            <Leyenda color="#dc2626" texto="Alta" />
            <Leyenda color="#f59e0b" texto="Media" />
            <Leyenda color="#16a34a" texto="Baja" />
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Mostrando {visibles.length} de{" "}
            {reportes.length} reportes en{" "}
            {grupos.length} ubicaciones.
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Datos de demostración académica.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Reportes registrados
          </h2>

          {cargando ? (
            <p className="py-6 text-sm text-slate-500">
              Cargando reportes...
            </p>
          ) : (
            <div className="space-y-3">
              {visibles.map((reporte) => (
                <article
                  key={reporte.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {servicios[reporte.servicio_id] ||
                        "Servicio público"}
                    </h3>

                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold text-white"
                      style={{
                        backgroundColor:
                          colores[reporte.severidad],
                      }}
                    >
                      {reporte.severidad}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    {municipios[
                      String(reporte.municipio_id)
                    ] || "Municipio desconocido"}
                  </p>

                  <p className="mt-2 text-sm text-slate-700">
                    {reporte.descripcion}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">{nombreCategoria(reporte.categoria_incidente)} · Inicio estimado: {reporte.fecha_inicio_estimada ? formatearFecha(reporte.fecha_inicio_estimada) : "Sin dato"} · Área afectada estimada: {formatearArea(reporte.area_afectada_m2)}</p>

                  <p className="mt-3 text-xs font-medium text-slate-600">
                    Registrado:{" "}
                    {formatearFecha(reporte.fecha_reporte)}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    Estado: {nombreEstado(reporte.estado)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {reporte.tiene_evidencia && (
                      <button
                        type="button"
                        onClick={() =>
                          setImagenReporte(reporte.id)
                        }
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Ver fotografía
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        abrirGestion(reporte.id)
                      }
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Gestionar incidente
                    </button>
                  </div>
                </article>
              ))}

              {visibles.length === 0 && (
                <p className="py-6 text-center text-slate-500">
                  No hay reportes para este filtro.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {reporteGestion && reporteSeleccionado && (
        <div
          role="presentation"
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            if (!guardando) {
              setReporteGestion(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gestionar incidente"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-blue-700">
                  SERVI-RED · Operadores
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Gestión del incidente
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setReporteGestion(null)
                }
                disabled={guardando}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <h3 className="font-bold text-slate-900">
                {servicios[
                  reporteSeleccionado.servicio_id
                ] || "Servicio público"}
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {municipios[
                  String(reporteSeleccionado.municipio_id)
                ] || "Municipio desconocido"}
              </p>

              <p className="mt-3 text-sm text-slate-700">
                {reporteSeleccionado.descripcion}
              </p>

              <p className="mt-3 text-xs text-slate-500">
                Estado:{" "}
                {nombreEstado(reporteSeleccionado.estado)}
                {" · "}
                Severidad: {reporteSeleccionado.severidad}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Registrado:{" "}
                {formatearFecha(
                  reporteSeleccionado.fecha_reporte
                )}
              </p>

              {reporteSeleccionado.fecha_servicio_reportada && (
                <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                  El ciudadano informó la solución o recuperación del servicio el{" "}
                  {formatearFecha(reporteSeleccionado.fecha_servicio_reportada)}.
                </p>
              )}

              <p className="mt-3 text-xs text-slate-600">
                Categoría: {nombreCategoria(reporteSeleccionado.categoria_incidente)} · Inicio estimado: {reporteSeleccionado.fecha_inicio_estimada ? formatearFecha(reporteSeleccionado.fecha_inicio_estimada) : "Sin dato"} · Área estimada: {formatearArea(reporteSeleccionado.area_afectada_m2)}
              </p>

              {reporteSeleccionado.fecha_restablecimiento_operador && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <p>
                    {saneamientoSeleccionado ? "Solución registrada:" : "Restablecimiento registrado:"}{" "}
                    <strong>{formatearFecha(reporteSeleccionado.fecha_restablecimiento_operador)}</strong>
                  </p>
                  {reporteSeleccionado.acciones_restablecimiento && (
                    <p className="mt-1">
                      Acciones: {reporteSeleccionado.acciones_restablecimiento}
                    </p>
                  )}
                  {reporteSeleccionado.validacion_restablecimiento && (
                    <p className="mt-1 font-semibold">
                      Validación ciudadana: {reporteSeleccionado.validacion_restablecimiento}
                    </p>
                  )}
                  <p className="mt-1 text-xs">
                    Duración estimada desde el reporte: {Math.max(
                      0,
                      (new Date(reporteSeleccionado.fecha_restablecimiento_operador).getTime() -
                        new Date(reporteSeleccionado.fecha_reporte).getTime()) / 3_600_000
                    ).toFixed(1)} horas.
                  </p>
                </div>
              )}

              {reporteSeleccionado.validacion_restablecimiento === "OBSERVADO" && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">
                  El ciudadano indicó que sigue sin servicio. Reabre el caso para continuar la atención.
                </p>
              )}
            </div>

            {mensajeGestion && (
              <p
                role="status"
                className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700"
              >
                {mensajeGestion}
              </p>
            )}

            {errorGestion && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {errorGestion}
              </p>
            )}

            <div className="mt-6">
              <h3 className="text-lg font-bold text-slate-900">
                Actualizar estado
              </h3>

              {proximoEstado ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    {puedeReabrir ? "Acción requerida:" : "Próximo estado permitido:"}{" "}
                    <strong>
                      {nombreEstado(proximoEstado)}
                    </strong>
                  </p>

                  <label
                    htmlFor="observacion"
                    className="mt-4 block text-sm font-semibold text-slate-700"
                  >
                    {proximoEstado === "RESUELTO"
                      ? "Acciones realizadas por el operador"
                      : puedeReabrir
                        ? "Motivo de reapertura"
                        : "Observación del operador"}
                  </label>

                  <textarea
                    id="observacion"
                    value={observacion}
                    onChange={(e) =>
                      setObservacion(e.target.value)
                    }
                    rows={4}
                    maxLength={2000}
                    placeholder={proximoEstado === "RESUELTO"
                      ? "Describe las acciones realizadas para restablecer el servicio..."
                      : "Describe la actuación realizada..."}
                    className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                  />

                  <p className="mt-1 text-xs text-slate-500">
                    {observacion.trim().length}/2000 caracteres.
                    Mínimo 5.
                  </p>

                  {proximoEstado === "RESUELTO" && (
                    <label
                      htmlFor="fecha-restablecimiento"
                      className="mt-4 block text-sm font-semibold text-slate-700"
                    >
                       {saneamientoSeleccionado ? "Fecha y hora de solución de la afectación" : "Fecha y hora del restablecimiento"}
                      <input
                        id="fecha-restablecimiento"
                        type="datetime-local"
                        required
                        value={fechaRestablecimiento}
                        onChange={(event) => setFechaRestablecimiento(event.target.value)}
                        className="mt-2 block w-full rounded-lg border border-slate-300 p-3 text-sm font-normal text-slate-900"
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void actualizarEstado()
                    }
                    disabled={
                      guardando ||
                      observacion.trim().length < 5 ||
                      (proximoEstado === "RESUELTO" && !fechaRestablecimiento)
                    }
                    className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {guardando
                      ? "Guardando actuación..."
                      : puedeReabrir
                        ? "Reabrir reporte"
                        : proximoEstado === "RESUELTO"
                           ? saneamientoSeleccionado ? "Registrar solución" : "Registrar restablecimiento"
                          : `Cambiar a ${nombreEstado(proximoEstado)}`}
                  </button>
                </>
              ) : (
                <p className="mt-3 rounded-lg bg-green-50 p-4 text-sm text-green-800">
                  Este incidente está resuelto o no admite
                  nuevas transiciones.
                </p>
              )}
            </div>

            <div className="mt-7 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">
                  Historial de actuaciones
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    void cargarHistorial(reporteGestion)
                  }
                  disabled={cargandoHistorial}
                  className="text-sm font-semibold text-blue-700 disabled:opacity-50"
                >
                  Actualizar
                </button>
              </div>

              {cargandoHistorial ? (
                <p className="mt-4 text-sm text-slate-500">
                  Consultando historial...
                </p>
              ) : historial.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  No hay actuaciones registradas todavía.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {historial.map((actuacion) => (
                    <div
                      key={actuacion.id}
                      className="rounded-lg border border-slate-200 p-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {nombreEstado(
                          actuacion.estado_anterior
                        )}
                        {" → "}
                        {nombreEstado(
                          actuacion.estado_nuevo
                        )}
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {actuacion.observacion}
                      </p>

                      <p className="mt-3 text-xs text-slate-500">
                        {actuacion.operador}
                        {" · "}
                        {formatearFecha(
                          actuacion.fecha_cambio
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {imagenReporte && (
        <div
          role="presentation"
          className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setImagenReporte(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Evidencia fotográfica"
            className="relative w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                Evidencia fotográfica
              </h2>

              <button
                type="button"
                onClick={() =>
                  setImagenReporte(null)
                }
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
              >
                Cerrar ✕
              </button>
            </div>

            {cargandoEvidencia && (
              <p className="py-8 text-center text-slate-600">
                Cargando fotografía...
              </p>
            )}

            {errorEvidencia && (
              <p
                role="alert"
                className="py-5 text-sm text-red-600"
              >
                {errorEvidencia}
              </p>
            )}

            {urlEvidencia && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urlEvidencia}
                alt="Fotografía adjunta al reporte ciudadano"
                className="max-h-[70vh] w-full rounded-xl bg-slate-100 object-contain"
              />
            )}

            <p className="mt-3 break-all text-xs text-slate-500">
              Reporte: {imagenReporte}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">
        {titulo}
      </p>

      <p className="mt-2 text-3xl font-bold text-slate-900">
        {valor}
      </p>
    </div>
  );
}

function Leyenda({
  color,
  texto,
}: {
  color: string;
  texto: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{texto}</span>
    </div>
  );
}
