import sharp from "sharp";
import { ErrorDenuncia } from "./validacion.mjs";

sharp.cache(false);
sharp.concurrency(1);

export async function limpiarFoto(foto) {
  if (!foto) return null;
  try {
    const options = { limitInputPixels: 16_000_000, animated: false, failOn: "warning" };
    const meta = await sharp(foto.bytes, options).metadata();
    const formatos = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (formatos[meta.format] !== foto.tipo || (meta.pages ?? 1) > 1) throw new Error("Formato no permitido");
    // Decodificar y recodificar: no withMetadata/keepMetadata, no original, nombre, EXIF, ICC o XMP.
    const limpia = await sharp(foto.bytes, options).rotate()
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 }).toBuffer();
    if (limpia.length > 450 * 1024) throw new Error("Imagen procesada demasiado grande");
    return limpia;
  } catch {
    throw new ErrorDenuncia(400, "No se pudo limpiar la foto. Usa una imagen estática válida de hasta 16 megapíxeles.");
  }
}
