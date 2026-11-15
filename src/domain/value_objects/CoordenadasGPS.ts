import { DomainError } from "../errors/DomainError";

export class CoordenadasGPS {
  private constructor(
    public readonly latitud: number,
    public readonly longitud: number
  ) {
    Object.freeze(this);
  }

  static crear(latitud: number, longitud: number): CoordenadasGPS {
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
      throw new DomainError("Coordenadas GPS invalidas.");
    }

    // Caja aproximada de Colombia, incluyendo zonas insulares.
    // La validacion territorial exacta se hara con PostGIS.
    if (
      latitud < -5 || latitud > 17 ||
      longitud < -82 || longitud > -66
    ) {
      throw new DomainError("Ubicacion fuera del area permitida.");
    }

    return new CoordenadasGPS(latitud, longitud);
  }

  toGeoJSON() {
    return {
      type: "Point" as const,
      coordinates: [this.longitud, this.latitud]
    };
  }
}
