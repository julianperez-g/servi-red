
import Link from "next/link";

const modulos = [
  {
    numero: "01",
    icono: "◎",
    categoria: "CIUDADANÍA",
    titulo: "Portal ciudadano",
    descripcion:
      "Reporta novedades en los servicios públicos, selecciona su ubicación y adjunta evidencias fotográficas.",
    caracteristicas: [
      "Registro de novedades",
      "Geolocalización",
      "Evidencias fotográficas",
    ],
    enlace: "/simulador",
    boton: "Crear un reporte",
    color: "blue",
  },
  {
    numero: "02",
    icono: "▦",
    categoria: "OPERADORES",
    titulo: "Centro de operaciones",
    descripcion:
      "Consulta incidentes georreferenciados, gestiona su atención y registra las actuaciones realizadas.",
    caracteristicas: [
      "Mapa interactivo",
      "Gestión de incidentes",
      "Historial de actuaciones",
    ],
    enlace: "/mapa",
    boton: "Acceder al panel",
    color: "cyan",
  },
  {
    numero: "03",
    icono: "▥",
    categoria: "DATOS ABIERTOS",
    titulo: "Indicadores y estadísticas",
    descripcion:
      "Consulta estadísticas agregadas de los reportes, compara servicios y municipios y descarga datos en CSV.",
    caracteristicas: [
      "Indicadores públicos",
      "Estadísticas por servicio",
      "Descarga de datos CSV",
    ],
    enlace: "/dashboard",
    boton: "Consultar estadísticas",
    color: "violet",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070e1c] text-white">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 80% 10%, rgba(37,99,235,.25), transparent 45%), radial-gradient(ellipse at 10% 70%, rgba(6,182,212,.12), transparent 40%)",
        }}
      />

      <div className="relative">
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-8">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-black shadow-lg shadow-blue-900/30">
                SR
              </div>
              <div>
                <p className="text-lg font-black tracking-tight">
                  SERVI-RED
                </p>
                <p className="text-[10px] uppercase tracking-[.18em] text-slate-400">
                  Plataforma de monitoreo
                </p>
              </div>
            </Link>

            <nav className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="hidden rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:text-white md:block"
              >
                Datos abiertos
              </Link>
              <Link
                href="/simulador"
                className="hidden rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:text-white sm:block"
              >
                Ciudadanos
              </Link>
              <Link
                href="/simulador"
                className="hidden rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:text-white sm:block"
              >
                Mis reportes
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-blue-500/40 bg-blue-600/10 px-4 py-2.5 text-sm font-semibold text-blue-200 transition hover:bg-blue-600/20"
              >
                Acceso operadores →
              </Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-5 pb-14 pt-20 md:px-8 md:pb-20 md:pt-28">
          <div className="max-w-4xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-semibold tracking-wide text-blue-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              PLATAFORMA COLABORATIVA DE SERVICIOS PÚBLICOS
            </div>

            <h1 className="text-4xl font-black leading-[1.12] tracking-tight sm:text-5xl md:text-7xl">
              Conectamos reportes
              <br />
              con{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                soluciones.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-400 md:text-lg">
              SERVI-RED integra a ciudadanos y operadores en una
              plataforma para registrar, monitorear y gestionar
              novedades de los servicios públicos domiciliarios
              mediante información georreferenciada.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/simulador"
                className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500"
              >
                Reportar una novedad →
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Consultar datos abiertos
              </Link>
              <Link
                href="/mapa"
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Centro de operaciones
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="h-px bg-gradient-to-r from-blue-500/50 via-white/10 to-transparent" />
        </div>

        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-blue-400">
                Ecosistema SERVI-RED
              </p>
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">
                Explora la plataforma
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
                Selecciona el módulo correspondiente para acceder
                a las herramientas disponibles.
              </p>
            </div>

            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-400">
              3 módulos disponibles
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {modulos.map((modulo) => (
              <article
                key={modulo.numero}
                className="group relative flex min-h-[410px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101b30]/80 p-7 transition duration-300 hover:-translate-y-1 hover:border-blue-400/40 hover:shadow-xl hover:shadow-blue-950/30"
              >
                <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-blue-500/5 blur-3xl" />

                <div className="relative flex items-start justify-between">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl ${
                      modulo.color === "blue"
                        ? "border-blue-500/20 bg-blue-500/15 text-blue-300"
                        : modulo.color === "cyan"
                        ? "border-cyan-500/20 bg-cyan-500/15 text-cyan-300"
                        : "border-violet-500/20 bg-violet-500/15 text-violet-300"
                    }`}
                  >
                    {modulo.icono}
                  </div>
                  <span className="text-sm font-bold text-slate-600">
                    {modulo.numero}
                  </span>
                </div>

                <div className="relative mt-7">
                  <p className="text-xs font-bold tracking-[.16em] text-blue-400">
                    {modulo.categoria}
                  </p>
                  <h3 className="mt-3 text-2xl font-bold tracking-tight">
                    {modulo.titulo}
                  </h3>
                  <p className="mt-4 min-h-[88px] text-sm leading-7 text-slate-400">
                    {modulo.descripcion}
                  </p>
                </div>

                <div className="relative mt-5 space-y-3">
                  {modulo.caracteristicas.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 text-sm text-slate-300"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs text-blue-400">
                        ✓
                      </span>
                      {item}
                    </div>
                  ))}
                </div>

                <div className="relative mt-auto pt-8">
                  <Link
                    href={modulo.enlace}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-bold transition hover:border-blue-500/30 hover:bg-blue-600"
                  >
                    {modulo.boton}
                    <span>→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
          <div className="grid gap-8 rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-950/50 to-[#101b30] p-7 md:grid-cols-[1.5fr_1fr] md:items-center md:p-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-400">
                Arquitectura distribuida
              </p>
              <h2 className="mt-3 text-2xl font-bold md:text-3xl">
                Información para una gestión más eficiente.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                La plataforma integra autenticación, procesamiento
                asíncrono, almacenamiento de evidencias y
                visualización geográfica para apoyar el seguimiento
                de incidentes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["01", "Registro ciudadano"],
                ["02", "Monitoreo geográfico"],
                ["03", "Gestión operativa"],
                ["04", "Datos abiertos"],
              ].map(([numero, nombre]) => (
                <div
                  key={numero}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-xl font-black text-blue-400">
                    {numero}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {nombre}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-slate-500 md:px-8">
            <p>
              © {new Date().getFullYear()} SERVI-RED · Proyecto
              académico de Arquitectura de Software
            </p>
            <p>Pontificia Universidad Javeriana · Colombia</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
