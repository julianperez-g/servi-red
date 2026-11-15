import { DomainError } from "../errors/DomainError";

export const MAX_PAYLOAD_BYTES = 500000;
export const MAX_FOTO_BYTES = 450000;

export type TipoFoto =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export interface EvidenciaFotoProps {
  storageKey: string;
  nombre: string;
  tipo: TipoFoto;
  tamanoBytes: number;
}

export class EvidenciaFoto {
  private constructor(
    public readonly storageKey: string,
    public readonly nombre: string,
    public readonly tipo: TipoFoto,
    public readonly tamanoBytes: number
  ) {
    Object.freeze(this);
  }

  static crear(props: EvidenciaFotoProps): EvidenciaFoto {
    if (!props.storageKey.trim() || !props.nombre.trim()) {
      throw new DomainError("Datos de evidencia incompletos.");
    }

    if (
      !["image/jpeg", "image/png", "image/webp"]
        .includes(props.tipo)
    ) {
      throw new DomainError("Formato de fotografia no permitido.");
    }

    if (
      !Number.isSafeInteger(props.tamanoBytes) ||
      props.tamanoBytes <= 0 ||
      props.tamanoBytes > MAX_FOTO_BYTES
    ) {
      throw new DomainError("La fotografia excede el limite.");
    }

    return new EvidenciaFoto(
      props.storageKey,
      props.nombre,
      props.tipo,
      props.tamanoBytes
    );
  }
}
