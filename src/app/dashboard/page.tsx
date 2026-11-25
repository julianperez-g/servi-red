
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Grupo = {
  nombre: string;
  total: number;
};

type GrupoContinuidad = {
  nombre: string;
  municipio_id?: number;
  codigo_dane?: string | null;
  reportes: number;
  cortes: number;
  duracion_total_horas: number | string;
  duracion_promedio_horas: number | string | null;
  aplica_continuidad?: boolean;
};

type DatosDashboard = {
  resumen: {
    total: number;
    pendientes: number;
    en_atencion: number;
    resueltos: number;
    alta_severidad: number;
    total_cortes: number;
    cortes_resueltos: number;
    duracion_total_horas: number | string;
    horas_promedio: string | number | null;
  };
  estados: Grupo[];
  severidades: Grupo[];
  servicios: GrupoContinuidad[];
  municipios: GrupoContinuidad[];
  departamentos: GrupoContinuidad[];
  periodos: GrupoContinuidad[];
  agrupacion: "day" | "month" | "year";
  actualizado_en: string;
};

function formatearNombre(nombre: string) {
  return nombre.replaceAll("_", " ");
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  color = "text-slate-900",
}: {
  titulo: string;
  valor: string | number;
  detalle: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {titulo}
      </p>

      <p className={`mt-3 text-4xl font-extrabold ${color}`}>
        {valor}
      </p>

      <p className="mt-2 text-xs text-slate-400">
        {detalle}
      </p>
    </div>
  );
}

function GraficaBarras({
  titulo,
  subtitulo,
  datos,
  color = "bg-blue-600",
}: {
  titulo: string;
  subtitulo: string;
  datos: Grupo[];
  color?: string;
}) {
  const maximo = Math.max(1, ...datos.map((d) => d.total));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">
        {titulo}
      </h2>

      <p className="mb-6 mt-1 text-sm text-slate-500">
        {subtitulo}
      </p>

      {datos.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No hay información disponible.
        </p>
      ) : (
        <div className="space-y-5">
          {datos.map((dato) => (
            <div key={dato.nombre}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">
                  {formatearNombre(dato.nombre)}
                </span>

                <span className="text-sm font-bold text-slate-900">
                  {dato.total}
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${color} transition-all`}
                  style={{
                    width: `${(dato.total / maximo) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GraficaContinuidad({
  titulo,
  subtitulo,
  datos,
  color = "bg-blue-600",
}: {
  titulo: string;
  subtitulo: string;
  datos: GrupoContinuidad[];
  color?: string;
}) {
  const maximo = Math.max(1, ...datos.map((dato) => dato.cortes));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
      <p className="mb-6 mt-1 text-sm text-slate-500">{subtitulo}</p>
      {datos.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No hay información disponible para este periodo.
        </p>
      ) : (
        <div className="space-y-5">
          {datos.map((dato) => {
            const etiqueta = dato.codigo_dane
              ? `${dato.nombre} · DANE ${dato.codigo_dane}`
              : dato.nombre;
            const duracion = dato.duracion_promedio_horas;

            return (
              <div key={`${dato.municipio_id ?? dato.nombre}-${dato.codigo_dane ?? ""}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {etiqueta}
                  </span>
                  <span className="text-xs text-slate-600">
                    {dato.aplica_continuidad === false ? `${dato.reportes} incidentes · Continuidad: no aplica` : `${dato.cortes} cortes · ${dato.reportes} reportes`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${(dato.cortes / maximo) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {dato.aplica_continuidad === false ? "La resolución de incidentes de saneamiento no se presenta como duración de cortes." : <>Duración total: {Number(dato.duracion_total_horas).toFixed(1)} h
                  {" · "}
                  Promedio de cortes resueltos: {duracion == null
                    ? "N/D"
                    : `${Number(duracion).toFixed(1)} h`}</>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function exportarCSV(datos: DatosDashboard) {
  const filas: string[][] = [
    ["SERVI-RED - Indicadores de continuidad"],
    ["Fecha de actualización", datos.actualizado_en],
    ["Agrupación temporal", datos.agrupacion],
    [],
    ["Indicador", "Valor"],
    ["Total de reportes", String(datos.resumen.total)],
    ["Pendientes", String(datos.resumen.pendientes)],
    ["En atención", String(datos.resumen.en_atencion)],
    ["Resueltos", String(datos.resumen.resueltos)],
    ["Alta severidad", String(datos.resumen.alta_severidad)],
    ["Cortes reportados", String(datos.resumen.total_cortes)],
    ["Cortes resueltos", String(datos.resumen.cortes_resueltos)],
    ["Duración total estimada (horas)", String(datos.resumen.duracion_total_horas)],
    [
      "Duración promedio estimada (horas)",
      String(datos.resumen.horas_promedio ?? "N/D"),
    ],
  ];

  const secciones: [string, GrupoContinuidad[]][] = [
    ["Continuidad por servicio", datos.servicios],
    ["Continuidad por municipio", datos.municipios],
    ["Continuidad por departamento", datos.departamentos],
    ["Continuidad por periodo", datos.periodos],
  ];

  for (const [titulo, grupos] of secciones) {
    filas.push([]);
    filas.push([titulo]);
    filas.push([
      "Grupo",
      "Código DANE",
      "Reportes",
      "Cortes",
      "Duración total estimada (horas)",
      "Duración promedio de cortes resueltos (horas)",
    ]);

    for (const grupo of grupos) {
      filas.push([
        grupo.nombre,
        grupo.codigo_dane ?? "",
        String(grupo.reportes),
        grupo.aplica_continuidad === false ? "No aplica" : String(grupo.cortes),
        grupo.aplica_continuidad === false ? "No aplica" : String(grupo.duracion_total_horas),
        grupo.aplica_continuidad === false ? "No aplica" : String(grupo.duracion_promedio_horas ?? "N/D"),
      ]);
    }
  }

  for (const [titulo, grupos] of [
    ["Estados", datos.estados],
    ["Severidades", datos.severidades],
  ] as [string, Grupo[]][]) {
    filas.push([], [titulo, "Cantidad"]);
    for (const grupo of grupos) filas.push([grupo.nombre, String(grupo.total)]);
  }

  const escapar = (valor: string) => {
    const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replaceAll('"', '""')}"`;
  };

  const csv = "\uFEFF" +
    filas.map((fila) => fila.map(escapar).join(";")).join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = "SERVI-RED_Datos_Abiertos.csv";
  enlace.click();

  URL.revokeObjectURL(url);
}

export default function DashboardPublico() {
  const [datos, setDatos] = useState<DatosDashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [agrupacion, setAgrupacion] = useState<"day" | "month" | "year">("day");

  const cargarDatos = useCallback(async () => {
    try {
      const parametros = new URLSearchParams({ agrupacion });
      if (desde) parametros.set("desde", desde);
      if (hasta) parametros.set("hasta", hasta);
      const respuesta = await fetch(`/api/dashboard?${parametros.toString()}`, {
        cache: "no-store",
      });

      if (!respuesta.ok) {
        throw new Error("No fue posible obtener las estadísticas.");
      }

      const resultado: DatosDashboard = await respuesta.json();
      setDatos(resultado);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado."
      );
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, agrupacion]);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      void cargarDatos();
    }, 0);

    return () => window.clearTimeout(temporizador);
  }, [cargarDatos]);

  const promedio = datos?.resumen.horas_promedio;
  const parametrosExportacion = new URLSearchParams();
  if (desde) parametrosExportacion.set("desde", desde);
  if (hasta) parametrosExportacion.set("hasta", hasta);
  const urlExportacion = `/api/reportes/exportar${
    parametrosExportacion.size ? `?${parametrosExportacion.toString()}` : ""
  }`;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <Link
              href="/"
              className="text-xs font-bold uppercase tracking-widest text-blue-600"
            >
              SERVI-RED / INICIO
            </Link>

            <h1 className="mt-2 text-2xl font-extrabold">
              Portal Público de Datos Abiertos
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Monitoreo de servicios públicos domiciliarios
            </p>
          </div>

          <span className="rounded-full bg-green-50 px-4 py-2 text-xs font-bold text-green-700">
            ACCESO PÚBLICO
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section className="rounded-2xl bg-slate-900 p-7 text-white">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                Observatorio ciudadano
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Estadísticas de continuidad del servicio
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Consulta indicadores agregados de los reportes
                ciudadanos registrados en SERVI-RED.
                La información se presenta con fines académicos y
                demostrativos. El CSV de reportes permite filtrar por fecha;
                no representa un formato regulatorio oficial.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-slate-300">
                Desde
                <input
                  type="date"
                  value={desde}
                  onChange={(event) => {
                    setDesde(event.target.value);
                    setCargando(true);
                    setError("");
                  }}
                  className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs font-medium text-slate-300">
                Hasta
                <input
                  type="date"
                  value={hasta}
                  onChange={(event) => {
                    setHasta(event.target.value);
                    setCargando(true);
                    setError("");
                  }}
                  className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs font-medium text-slate-300">
                Agrupar por
                <select
                  value={agrupacion}
                  onChange={(event) => {
                    setAgrupacion(
                      event.target.value as "day" | "month" | "year"
                    );
                    setCargando(true);
                    setError("");
                  }}
                  className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="day">Día</option>
                  <option value="month">Mes</option>
                  <option value="year">Año</option>
                </select>
              </label>
              <button
                onClick={() => {
                  setCargando(true);
                  setError("");
                  void cargarDatos();
                }}
                disabled={cargando}
                className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                Actualizar
              </button>

              <button
                onClick={() => datos && exportarCSV(datos)}
                disabled={!datos || cargando}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                Descargar indicadores CSV
              </button>
              <a
                href={urlExportacion}
                className="rounded-lg border border-blue-400 px-5 py-3 text-sm font-semibold text-blue-200 hover:bg-blue-950"
              >
                Descargar reportes CSV
              </a>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            {error}
          </div>
        )}

        {cargando ? (
          <div className="py-24 text-center text-slate-500">
            Consultando indicadores públicos...
          </div>
        ) : datos ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Tarjeta
                titulo="Reportes registrados"
                valor={datos.resumen.total}
                detalle="En el rango seleccionado"
              />

              <Tarjeta
                titulo="Pendientes"
                valor={datos.resumen.pendientes}
                detalle="Estado reportado"
                color="text-amber-600"
              />

              <Tarjeta
                titulo="En atención"
                valor={datos.resumen.en_atencion}
                detalle="Incidentes en gestión"
                color="text-blue-600"
              />

              <Tarjeta
                titulo="Resueltos"
                valor={datos.resumen.resueltos}
                detalle="Incidentes cerrados"
                color="text-green-600"
              />

              <Tarjeta
                titulo="Alta severidad"
                valor={datos.resumen.alta_severidad}
                detalle="Reportes clasificados como alta"
                color="text-red-600"
              />

              <Tarjeta
                titulo="Cortes reportados"
                valor={datos.resumen.total_cortes}
                detalle="Tipo de novedad: corte"
                color="text-amber-600"
              />

              <Tarjeta
                titulo="Cortes resueltos"
                valor={datos.resumen.cortes_resueltos}
                detalle="Con fecha de restablecimiento válida"
                color="text-green-600"
              />

              <Tarjeta
                titulo="Duración total estimada"
                valor={`${Number(datos.resumen.duracion_total_horas).toFixed(1)} h`}
                detalle="Desde el registro hasta el restablecimiento"
                color="text-blue-700"
              />

              <Tarjeta
                titulo="Duración promedio estimada"
                valor={
                  promedio !== null && promedio !== undefined
                    ? `${Number(promedio).toFixed(1)} h`
                    : "N/D"
                }
                detalle="Cortes resueltos; desde registro hasta restablecimiento"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <GraficaContinuidad
                titulo="Continuidad por servicio"
                subtitulo="Frecuencia de cortes y duración estimada por servicio"
                datos={datos.servicios}
              />

              <GraficaContinuidad
                titulo="Continuidad por departamento"
                subtitulo="Frecuencia de cortes agrupada por departamento (código DANE)"
                datos={datos.departamentos}
                color="bg-indigo-600"
              />

              <GraficaContinuidad
                titulo="Continuidad por municipio"
                subtitulo="Frecuencia de cortes y duración estimada por municipio"
                datos={datos.municipios}
                color="bg-cyan-600"
              />

              <GraficaBarras
                titulo="Estado de los reportes"
                subtitulo="Seguimiento de la atención"
                datos={datos.estados}
                color="bg-emerald-600"
              />

              <GraficaBarras
                titulo="Severidad de incidentes"
                subtitulo="Clasificación de las afectaciones"
                datos={datos.severidades}
                color="bg-amber-500"
              />

              <div className="lg:col-span-2">
                <GraficaContinuidad
                  titulo="Continuidad por periodo"
                  subtitulo={`Reportes, cortes y duración agrupados por ${
                    agrupacion === "day" ? "día" : agrupacion === "month" ? "mes" : "año"
                  } en el rango seleccionado`}
                  datos={datos.periodos}
                  color="bg-cyan-600"
                />
              </div>
            </section>

            <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
              <p>
                Última actualización:{" "}
                {new Date(datos.actualizado_en).toLocaleString(
                  "es-CO",
                  { timeZone: "America/Bogota" }
                )}
              </p>

              <p className="mt-2">
                SERVI-RED · Proyecto académico.
                Los datos no sustituyen información oficial
                de empresas prestadoras o entidades reguladoras.
              </p>
              <p className="mt-2">
                La duración se estima desde la fecha de registro hasta el
                restablecimiento; no equivale a la hora real de inicio de la
                interrupción. El inicio declarado por el ciudadano es estimado y no sustituye esta métrica histórica.
                La continuidad se limita a agua, energía y gas; alcantarillado y aseo/residuos se contabilizan como incidentes, sin equiparar sus tiempos de resolución a cortes.
              </p>
            </footer>
          </>
        ) : (
          <p className="py-20 text-center text-slate-500">
            No hay estadísticas disponibles.
          </p>
        )}
      </div>
    </main>
  );
}
