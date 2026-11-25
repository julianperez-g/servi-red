import { DomainError } from "../errors/DomainError";
import { CoordenadasGPS } from "../value_objects/CoordenadasGPS";
import { EvidenciaFoto } from "../value_objects/EvidenciaFoto";
import { normalizarCobertura, type AreaAfectada } from "../value_objects/cobertura";

export const SERVICIOS = [
  "AGUA", "ENERGIA", "GAS", "ALCANTARILLADO", "ASEO"
] as const;

export type TipoServicio = typeof SERVICIOS[number];

export type EstadoReporte =
  | "REPORTADO"
  | "EN_ATENCION"
  | "RESUELTO";

export type EstadoIngesta =
  | "EN_COLA"
  | "PROCESADO";

export type Severidad = "BAJA" | "MEDIA" | "ALTA";

export type TipoNovedad =
  | "CORTE"
  | "FALLA"
  | "BAJA_CALIDAD";

export interface ReporteProps {
  id: string;
  ciudadanoId: string | null;
  municipioId: string;
  servicio: TipoServicio;
  tipoNovedad: TipoNovedad;
  descripcion: string;
  ubicacion: CoordenadasGPS;
  severidad: Severidad;
  fechaReporte: Date;
  evidencias?: readonly EvidenciaFoto[];
  estado?: EstadoReporte;
  fechaRestablecimiento?: Date | null;
  categoriaIncidente?: string | null;
  fechaInicioEstimada?: Date | null;
  areaAfectada?: AreaAfectada | null;
}

export class Reporte {
  readonly id: string;
  readonly ciudadanoId: string | null;
  readonly municipioId: string;
  readonly servicio: TipoServicio;
  readonly tipoNovedad: TipoNovedad;
  readonly descripcion: string;
  readonly ubicacion: CoordenadasGPS;
  readonly severidad: Severidad;
  readonly evidencias: readonly EvidenciaFoto[];
  readonly categoriaIncidente: string | null;
  private readonly inicioEstimado: Date | null;
  private readonly areaEstimada: AreaAfectada | null;

  private readonly fechaCreacion: Date;
  private _estado: EstadoReporte;
  private _fechaRestablecimiento: Date | null;

  constructor(props: ReporteProps) {
    if (!props.id.trim() || !props.municipioId.trim()) {
      throw new DomainError("ID y municipio obligatorios.");
    }

    if (
      !props.descripcion.trim() ||
      props.descripcion.length > 1000
    ) {
      throw new DomainError("Descripcion invalida.");
    }

    if (!SERVICIOS.includes(props.servicio)) {
      throw new DomainError("Servicio no permitido.");
    }

    if (
      !["CORTE", "FALLA", "BAJA_CALIDAD"]
        .includes(props.tipoNovedad)
    ) {
      throw new DomainError("Tipo de novedad invalido.");
    }

    if (!["BAJA", "MEDIA", "ALTA"].includes(props.severidad)) {
      throw new DomainError("Severidad invalida.");
    }

    const estado = props.estado ?? "REPORTADO";

    if (
      !["REPORTADO", "EN_ATENCION", "RESUELTO"]
        .includes(estado)
    ) {
      throw new DomainError("Estado de reporte invalido.");
    }

    if (
      !(props.ubicacion instanceof CoordenadasGPS) ||
      !(props.fechaReporte instanceof Date) ||
      !Number.isFinite(props.fechaReporte.getTime())
    ) {
      throw new DomainError("Ubicacion o fecha invalida.");
    }

    const restablecimiento = props.fechaRestablecimiento ?? null;

    if (
      restablecimiento !== null &&
      (!(restablecimiento instanceof Date) ||
       !Number.isFinite(restablecimiento.getTime()) ||
       restablecimiento.getTime() < props.fechaReporte.getTime())
    ) {
      throw new DomainError("Fecha de restablecimiento invalida.");
    }

    if ((estado === "RESUELTO") !== (restablecimiento !== null)) {
      throw new DomainError(
        "El estado resuelto requiere fecha de restablecimiento."
      );
    }

    this.id = props.id;
    this.ciudadanoId = props.ciudadanoId;
    this.municipioId = props.municipioId;
    this.servicio = props.servicio;
    this.tipoNovedad = props.tipoNovedad;
    this.descripcion = props.descripcion.trim();
    this.ubicacion = props.ubicacion;
    this.severidad = props.severidad;
    this.evidencias = Object.freeze([...(props.evidencias ?? [])]);
    this.fechaCreacion = new Date(props.fechaReporte);
    try {
      const cobertura = normalizarCobertura({ servicioId: SERVICIOS.indexOf(props.servicio) + 1,
        tipoNovedad: props.tipoNovedad, categoriaIncidente: props.categoriaIncidente,
        fechaInicioEstimada: props.fechaInicioEstimada?.toISOString(), areaAfectada: props.areaAfectada,
        latitud: props.ubicacion.latitud, longitud: props.ubicacion.longitud },
      { ahora: props.fechaReporte, referencia: props.fechaReporte });
      this.categoriaIncidente = cobertura.categoriaIncidente;
      this.inicioEstimado = cobertura.fechaInicioEstimada ? new Date(cobertura.fechaInicioEstimada) : null;
      this.areaEstimada = cobertura.areaAfectada;
    } catch (error) { throw new DomainError(error instanceof Error ? error.message : "Cobertura inválida."); }
    this._estado = estado;
    this._fechaRestablecimiento = restablecimiento
      ? new Date(restablecimiento)
      : null;
  }

  get fechaReporte(): Date {
    return new Date(this.fechaCreacion);
  }

  get estado(): EstadoReporte {
    return this._estado;
  }

  get fechaInicioEstimada(): Date | null { return this.inicioEstimado ? new Date(this.inicioEstimado) : null; }
  get areaAfectada(): AreaAfectada | null { return this.areaEstimada ? structuredClone(this.areaEstimada) : null; }

  get fechaRestablecimiento(): Date | null {
    return this._fechaRestablecimiento
      ? new Date(this._fechaRestablecimiento)
      : null;
  }

  iniciarAtencion(): void {
    if (this._estado !== "REPORTADO") {
      throw new DomainError("Transicion de estado no permitida.");
    }

    this._estado = "EN_ATENCION";
  }

  resolver(fecha: Date): void {
    if (this._estado !== "EN_ATENCION") {
      throw new DomainError(
        "El reporte debe estar en atencion."
      );
    }

    if (
      !(fecha instanceof Date) ||
      !Number.isFinite(fecha.getTime()) ||
      fecha.getTime() < this.fechaCreacion.getTime()
    ) {
      throw new DomainError("Fecha de resolucion invalida.");
    }

    this._fechaRestablecimiento = new Date(fecha);
    this._estado = "RESUELTO";
  }

  duracionCorteMinutos(): number | null {
    if (!this._fechaRestablecimiento) return null;

    return (
      this._fechaRestablecimiento.getTime() -
      this.fechaCreacion.getTime()
    ) / 60000;
  }
}
