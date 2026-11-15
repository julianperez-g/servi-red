import type {
  Reporte,
  EstadoReporte,
  TipoServicio
} from "../entities/Reporte";

export interface FiltrosReporte {
  servicio?: TipoServicio;
  estado?: EstadoReporte;
  municipioId?: string;
}

export interface IReporteRepository {
  guardar(reporte: Reporte): Promise<void>;
  buscarPorId(id: string): Promise<Reporte | null>;
  listar(filtros?: FiltrosReporte): Promise<Reporte[]>;
  actualizar(reporte: Reporte): Promise<void>;
  buscarPorProximidad(
    latitud: number,
    longitud: number,
    radioMetros: number
  ): Promise<Reporte[]>;
}
