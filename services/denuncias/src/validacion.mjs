export class ErrorDenuncia extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const MAX_BODY = 3 * 1024 * 1024;
export const MAX_FOTO = 2 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ESTADOS = ["PENDIENTE", "EN_REVISION", "ADMITIDA", "DESCARTADA"];

export function objetoEstricto(input, campos) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !campos.includes(key))) {
    throw new ErrorDenuncia(400, "La solicitud contiene campos no permitidos.");
  }
}

/** Reducción determinista de PII; NO promete reconocer toda identidad en texto libre. */
export function anonimizarTexto(texto) {
  return texto.normalize("NFKC")
    .replace(/[\p{Cf}\p{Cc}]/gu, " ")
    .replace(/\b(?:me llamo|mi nombre es|soy el denunciante[, :]*)\s+[\p{L}]+(?:\s+[\p{L}]+){0,3}/giu, "[identidad omitida]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[correo omitido]")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu, "[enlace omitido]")
    .replace(/(?<![\p{L}\d])(?:\d{1,3}\.){3}\d{1,3}(?!\d)/gu, "[IP omitida]")
    .replace(/(?<![\p{L}\d])(?:[a-f\d]{0,4}:){2,}[a-f\d:]{0,39}(?![\p{L}\d])/giu, "[IP omitida]")
    .replace(/\b(?:c[eé]dula|c\.?\s*c\.?|documento|identificaci[oó]n)\s*(?:n[uú]mero|nro\.?|no\.?|n[.°º])?\s*[:#-]?\s*[\d. -]{5,20}/giu, "[documento omitido] ")
    .replace(/(?<!\d)(?:\+?57[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, "[teléfono omitido]")
    .replace(/\b(?:tel[eé]fono|celular|whatsapp|contacto)\s*[:#-]?\s*\+?[\d ()-]{7,22}/giu, "[contacto omitido] ")
    .replace(/\s+/g, " ").trim();
}

export function validarDenuncia(input) {
  objetoEstricto(input, ["municipioId", "servicioId", "descripcion", "latitud", "longitud", "foto"]);
  if (!Number.isSafeInteger(input.municipioId) || input.municipioId < 1 ||
      !Number.isSafeInteger(input.servicioId) || input.servicioId < 1 ||
      typeof input.descripcion !== "string" || input.descripcion.trim().length < 20 ||
      input.descripcion.length > 2000) {
    throw new ErrorDenuncia(400, "Indica municipio, servicio y una descripción de 20 a 2000 caracteres.");
  }
  const descripcion = anonimizarTexto(input.descripcion);
  if (descripcion.length < 20 || descripcion.length > 2000) {
    throw new ErrorDenuncia(400, "La descripción anonimizada debe tener entre 20 y 2000 caracteres.");
  }
  const sinPunto = input.latitud == null && input.longitud == null;
  if (!sinPunto && (!Number.isFinite(input.latitud) || !Number.isFinite(input.longitud) ||
      input.latitud < -4.3 || input.latitud > 13.5 || input.longitud < -82 || input.longitud > -66)) {
    throw new ErrorDenuncia(400, "El punto del hecho debe estar en Colombia; puedes omitirlo.");
  }
  let foto = null;
  if (input.foto != null) {
    objetoEstricto(input.foto, ["tipo", "base64"]);
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.foto.tipo) ||
        typeof input.foto.base64 !== "string" || !input.foto.base64.length ||
        input.foto.base64.length > Math.ceil(MAX_FOTO / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.foto.base64)) {
      throw new ErrorDenuncia(400, "La foto debe ser JPG, PNG o WebP de hasta 2 MB.");
    }
    const bytes = Buffer.from(input.foto.base64, "base64");
    if (!bytes.length || bytes.length > MAX_FOTO) throw new ErrorDenuncia(400, "Foto fuera del límite de 2 MB.");
    foto = { tipo: input.foto.tipo, bytes };
  }
  // Lista cerrada: jamás se incorporan cabeceras, IP, identidad o nombre de archivo.
  return { municipioId: input.municipioId, servicioId: input.servicioId, descripcion,
    latitud: sinPunto ? null : input.latitud, longitud: sinPunto ? null : input.longitud, foto };
}

export function validarModeracion(input) {
  objetoEstricto(input, ["estado", "estadoEsperado", "motivo"]);
  if (!ESTADOS.includes(input.estadoEsperado) || !ESTADOS.includes(input.estado) ||
      typeof input.motivo !== "string" || input.motivo.trim().length < 5 || input.motivo.length > 1000) {
    throw new ErrorDenuncia(400, "Indica un estado válido y un motivo de 5 a 1000 caracteres.");
  }
  const transiciones = { PENDIENTE: ["EN_REVISION", "DESCARTADA"], EN_REVISION: ["ADMITIDA", "DESCARTADA"] };
  if (!transiciones[input.estadoEsperado]?.includes(input.estado)) {
    throw new ErrorDenuncia(409, "La transición de moderación no está permitida.");
  }
  const motivo = anonimizarTexto(input.motivo);
  if (motivo.length < 5 || motivo.length > 1000) throw new ErrorDenuncia(400, "Motivo no válido después de anonimizar.");
  return { estado: input.estado, estadoEsperado: input.estadoEsperado, motivo };
}
