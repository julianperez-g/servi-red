import type {
  IndicadorContinuidad
} from "../entities/IndicadorContinuidad";

export interface IIndicadorRepository {
  guardar(indicador: IndicadorContinuidad): Promise<void>;
  listarPorMunicipio(
    municipioId: string
  ): Promise<IndicadorContinuidad[]>;
}
