import { DomainError } from "../errors/DomainError";
import { CoordenadasGPS } from "../value_objects/CoordenadasGPS";
import { SERVICIOS, type TipoServicio } from "./Reporte";

export interface DenunciaAnonimaProps {
  id: string;
  municipioId: string;
  servicio: TipoServicio;
  descripcion: string;
  ubicacion: CoordenadasGPS;
  fechaDenuncia: Date;
}

export class DenunciaAnonima {
  readonly id: string;
  readonly municipioId: string;
  readonly servicio: TipoServicio;
  readonly descripcion: string;
  readonly ubicacion: CoordenadasGPS;
  private readonly fecha: Date;

  private constructor(props: DenunciaAnonimaProps) {
    this.id = props.id;
    this.municipioId = props.municipioId;
    this.servicio = props.servicio;
    this.descripcion = props.descripcion.trim();
    this.ubicacion = props.ubicacion;
    this.fecha = new Date(props.fechaDenuncia);
    Object.freeze(this);
  }

  static crear(input: unknown): DenunciaAnonima {
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    ) {
      throw new DomainError("Denuncia invalida.");
    }

    const data = input as Record<string, unknown>;

    const camposPermitidos = [
      "id", "municipioId", "servicio",
      "descripcion", "ubicacion", "fechaDenuncia"
    ];

    if (
      Object.keys(data).some(
        key => !camposPermitidos.includes(key)
      )
    ) {
      throw new DomainError(
        "La denuncia contiene datos no permitidos."
      );
    }

    if (
      typeof data.id !== "string" ||
      !data.id.trim() ||
      typeof data.municipioId !== "string" ||
      !data.municipioId.trim() ||
      typeof data.descripcion !== "string" ||
      !data.descripcion.trim() ||
      data.descripcion.length > 1000 ||
      !SERVICIOS.includes(data.servicio as TipoServicio) ||
      !(data.ubicacion instanceof CoordenadasGPS) ||
      !(data.fechaDenuncia instanceof Date) ||
      !Number.isFinite(data.fechaDenuncia.getTime())
    ) {
      throw new DomainError("Datos de denuncia invalidos.");
    }

    return new DenunciaAnonima({
      id: data.id,
      municipioId: data.municipioId,
      servicio: data.servicio as TipoServicio,
      descripcion: data.descripcion,
      ubicacion: data.ubicacion,
      fechaDenuncia: data.fechaDenuncia
    });
  }

  get fechaDenuncia(): Date {
    return new Date(this.fecha);
  }
}
