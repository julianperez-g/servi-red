
export type EvidenciaReporte = {
  bucket: string;
  ruta: string;
  tipo: string;
  tamano: number;
};

export type DatosReporte = {
  municipioId: number;
  servicioId: number;
  tipoNovedad: "CORTE" | "FALLA" | "BAJA_CALIDAD";
  descripcion: string;
  severidad: "BAJA" | "MEDIA" | "ALTA";
  latitud: number;
  longitud: number;
  evidencia?: EvidenciaReporte;
};

type ResultadoValidacion =
  | { valido: true; datos: DatosReporte }
  | { valido: false; error: string };

const TIPOS = ["CORTE", "FALLA", "BAJA_CALIDAD"];
const SEVERIDADES = ["BAJA", "MEDIA", "ALTA"];

const TIPOS_IMAGEN = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_IMAGEN = 450 * 1024;

export function validarReporte(
  entrada: unknown
): ResultadoValidacion {
  if (
    !entrada ||
    typeof entrada !== "object" ||
    Array.isArray(entrada)
  ) {
    return {
      valido: false,
      error: "El cuerpo debe ser un objeto JSON",
    };
  }

  const d = entrada as Record<string, unknown>;

  if (
    !Number.isSafeInteger(d.municipioId) ||
    Number(d.municipioId) <= 0
  ) {
    return {
      valido: false,
      error: "Municipio invalido",
    };
  }

  if (
    !Number.isSafeInteger(d.servicioId) ||
    Number(d.servicioId) <= 0
  ) {
    return {
      valido: false,
      error: "Servicio invalido",
    };
  }

  if (!TIPOS.includes(String(d.tipoNovedad))) {
    return {
      valido: false,
      error: "Tipo de novedad invalido",
    };
  }

  if (!SEVERIDADES.includes(String(d.severidad))) {
    return {
      valido: false,
      error: "Severidad invalida",
    };
  }

  if (
    typeof d.descripcion !== "string" ||
    d.descripcion.trim().length < 10 ||
    d.descripcion.length > 2000
  ) {
    return {
      valido: false,
      error:
        "La descripcion debe tener entre 10 y 2000 caracteres",
    };
  }

  if (
    typeof d.latitud !== "number" ||
    typeof d.longitud !== "number" ||
    !Number.isFinite(d.latitud) ||
    !Number.isFinite(d.longitud) ||
    d.latitud < -4.3 ||
    d.latitud > 13.5 ||
    d.longitud < -82 ||
    d.longitud > -66
  ) {
    return {
      valido: false,
      error: "Coordenadas fuera del rango permitido",
    };
  }

  const permitidos = [
    "municipioId",
    "servicioId",
    "tipoNovedad",
    "descripcion",
    "severidad",
    "latitud",
    "longitud",
    "evidencia",
  ];

  const desconocidos = Object.keys(d).filter(
    (clave) => !permitidos.includes(clave)
  );

  if (desconocidos.length > 0) {
    return {
      valido: false,
      error: "El reporte contiene campos no permitidos",
    };
  }

  let evidencia: EvidenciaReporte | undefined;

  if (d.evidencia !== undefined) {
    if (
      !d.evidencia ||
      typeof d.evidencia !== "object" ||
      Array.isArray(d.evidencia)
    ) {
      return {
        valido: false,
        error: "Evidencia invalida",
      };
    }

    const e = d.evidencia as Record<string, unknown>;

    if (
      Object.keys(e).some(
        (clave) =>
          !["bucket", "ruta", "tipo", "tamano"].includes(
            clave
          )
      )
    ) {
      return {
        valido: false,
        error: "La evidencia contiene campos no permitidos",
      };
    }

    if (e.bucket !== "evidencias-reportes") {
      return {
        valido: false,
        error: "Bucket de evidencia invalido",
      };
    }

    if (
      typeof e.ruta !== "string" ||
      !/^temporales\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i.test(
        e.ruta
      )
    ) {
      return {
        valido: false,
        error: "Ruta de evidencia invalida",
      };
    }

    if (
      typeof e.tipo !== "string" ||
      !TIPOS_IMAGEN.includes(e.tipo)
    ) {
      return {
        valido: false,
        error: "Tipo de imagen invalido",
      };
    }

    if (
      typeof e.tamano !== "number" ||
      !Number.isSafeInteger(e.tamano) ||
      e.tamano <= 0 ||
      e.tamano > MAX_IMAGEN
    ) {
      return {
        valido: false,
        error: "Tamano de imagen invalido",
      };
    }

    evidencia = {
      bucket: e.bucket,
      ruta: e.ruta,
      tipo: e.tipo,
      tamano: e.tamano,
    };
  }

  const datos: DatosReporte = {
    municipioId: Number(d.municipioId),
    servicioId: Number(d.servicioId),
    tipoNovedad:
      d.tipoNovedad as DatosReporte["tipoNovedad"],
    descripcion: d.descripcion.trim(),
    severidad: d.severidad as DatosReporte["severidad"],
    latitud: d.latitud,
    longitud: d.longitud,
  };

  if (evidencia) {
    datos.evidencia = evidencia;
  }

  return {
    valido: true,
    datos,
  };
}
