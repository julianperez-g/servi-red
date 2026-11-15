import type { DenunciaAnonima } from "../entities/DenunciaAnonima";

export interface IDenunciaRepository {
  guardar(denuncia: DenunciaAnonima): Promise<void>;
  buscarPorId(id: string): Promise<DenunciaAnonima | null>;
}
