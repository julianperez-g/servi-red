
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseStorage } from "@/infrastructure/storage/supabaseStorage";

export const runtime = "nodejs";

const BUCKET = "evidencias-reportes";
const MAX_BYTES = 450 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const archivo = formData.get("archivo");

    if (!(archivo instanceof File)) {
      return NextResponse.json(
        { status: "error", message: "No se recibió una imagen." },
        { status: 400 }
      );
    }

    if (archivo.size > MAX_BYTES || archivo.size === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "La imagen debe pesar máximo 450 KB.",
        },
        { status: 400 }
      );
    }

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

    if (!tiposPermitidos.includes(archivo.type)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Solo se permiten imágenes JPG, PNG o WebP.",
        },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());

    const esJPEG =
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;

    const esPNG =
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a &&
      bytes[8] === 0x0a;

    const esWebP =
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

    const extension = esJPEG
      ? "jpg"
      : esPNG
        ? "png"
        : esWebP
          ? "webp"
          : null;

    const tipoDetectado = esJPEG
      ? "image/jpeg"
      : esPNG
        ? "image/png"
        : esWebP
          ? "image/webp"
          : null;

    if (!extension || tipoDetectado !== archivo.type) {
      return NextResponse.json(
        {
          status: "error",
          message: "El contenido de la imagen no es válido.",
        },
        { status: 400 }
      );
    }

    const ruta = `temporales/${randomUUID()}.${extension}`;

    const { error } = await supabaseStorage.storage
      .from(BUCKET)
      .upload(ruta, bytes, {
        contentType: tipoDetectado,
        upsert: false,
      });

    if (error) {
      console.error("Error de Storage:", error.message);

      return NextResponse.json(
        { status: "error", message: "No fue posible guardar la imagen." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "ok",
      evidencia: {
        bucket: BUCKET,
        ruta,
        tipo: tipoDetectado,
        tamano: archivo.size,
      },
    });
  } catch (error) {
    console.error("Error subiendo evidencia:", error);

    return NextResponse.json(
      { status: "error", message: "Error procesando la fotografía." },
      { status: 500 }
    );
  }
}
