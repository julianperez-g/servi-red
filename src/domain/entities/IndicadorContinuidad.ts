import { DomainError } from "../errors/DomainError";
import { SERVICIOS, type TipoServicio } from "./Reporte";

export interface IndicadorContinuidadProps {
  municipioId: string;
  servicio: TipoServicio;
  inicioPeriodo: Date;
  finPeriodo: Date;
  cantidadCortes: number;
  duracionTotalMinutos: number;
}

export class IndicadorContinuidad {
  private readonly datos: IndicadorContinuidadProps;

  constructor(props: IndicadorContinuidadProps) {
    if (
      !props.municipioId.trim() ||
      !SERVICIOS.includes(props.servicio) ||
      !(props.inicioPeriodo instanceof Date) ||
      !(props.finPeriodo instanceof Date) ||
      !Number.isFinite(props.inicioPeriodo.getTime()) ||
      !Number.isFinite(props.finPeriodo.getTime()) ||
      props.inicioPeriodo >= props.finPeriodo ||
      !Number.isSafeInteger(props.cantidadCortes) ||
      props.cantidadCortes < 0 ||
      !Number.isFinite(props.duracionTotalMinutos) ||
      props.duracionTotalMinutos < 0
    ) {
      throw new DomainError("Indicador de continuidad invalido.");
    }

    if (
      props.cantidadCortes === 0 &&
      props.duracionTotalMinutos !== 0
    ) {
      throw new DomainError(
        "No puede existir duracion sin cortes."
      );
    }

    this.datos = {
      ...props,
      inicioPeriodo: new Date(props.inicioPeriodo),
      finPeriodo: new Date(props.finPeriodo)
    };
  }

  get frecuenciaCortes(): number {
    return this.datos.cantidadCortes;
  }

  get duracionTotalHoras(): number {
    return this.datos.duracionTotalMinutos / 60;
  }

  get duracionPromedioHoras(): number {
    if (this.datos.cantidadCortes === 0) return 0;

    return (
      this.datos.duracionTotalMinutos /
      this.datos.cantidadCortes / 60
    );
  }
}
