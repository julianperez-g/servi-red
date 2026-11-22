
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Grupo = {
  nombre: string;
  total: number;
};

type DatosDashboard = {
  resumen: {
    total: number;
    pendientes: number;
    en_atencion: number;
    resueltos: number;
    alta_severidad: number;
    horas_promedio: string | number | null;
  };
  estados: Grupo[];
  severidades: Grupo[];
  servicios: Grupo[];
  municipios: Grupo[];
  evolucion: Grupo[];
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

function exportarCSV(datos: DatosDashboard) {
  const filas: string[][] = [
    ["SERVI-RED - Estadísticas públicas"],
    ["Fecha de actualización", datos.actualizado_en],
    [],
    ["Indicador", "Valor"],
    ["Total de reportes", String(datos.resumen.total)],
    ["Pendientes", String(datos.resumen.pendientes)],
    ["En atención", String(datos.resumen.en_atencion)],
    ["Resueltos", String(datos.resumen.resueltos)],
    ["Alta severidad", String(datos.resumen.alta_severidad)],
    [
      "Duración promedio (horas)",
      String(datos.resumen.horas_promedio ?? "N/D"),
    ],
  ];

  const secciones: [string, Grupo[]][] = [
    ["Estados", datos.estados],
    ["Severidades", datos.severidades],
    ["Servicios", datos.servicios],
    ["Municipios", datos.municipios],
    ["Evolución últimos 30 días", datos.evolucion],
  ];

  for (const [titulo, grupos] of secciones) {
    filas.push([]);
    filas.push([titulo, "Cantidad"]);

    for (const grupo of grupos) {
      filas.push([grupo.nombre, String(grupo.total)]);
    }
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

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const respuesta = await fetch("/api/dashboard", {
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
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const promedio = datos?.resumen.horas_promedio;

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
                La información se presenta con fines
                académicos y demostrativos.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void cargarDatos()}
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
                Descargar CSV
              </button>
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
                detalle="Total histórico"
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
                titulo="Duración promedio"
                valor={
                  promedio !== null && promedio !== undefined
                    ? `${Number(promedio).toFixed(1)} h`
                    : "N/D"
                }
                detalle="Entre reporte y restablecimiento"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <GraficaBarras
                titulo="Reportes por servicio"
                subtitulo="Distribución por tipo de servicio público"
                datos={datos.servicios}
              />

              <GraficaBarras
                titulo="Reportes por municipio"
                subtitulo="Comparación territorial"
                datos={datos.municipios}
                color="bg-indigo-600"
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
                <GraficaBarras
                  titulo="Evolución de reportes"
                  subtitulo="Reportes diarios registrados durante los últimos 30 días"
                  datos={datos.evolucion}
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
