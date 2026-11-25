import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { limpiarFoto } from "../src/imagenes.mjs";

test("recodifica la foto sin EXIF, XMP, ICC ni datos originales", async () => {
  const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#3978c9" } })
    .jpeg().withMetadata({ exif: { IFD0: { Artist: "DENUNCIANTE PRIVADO", ImageDescription: "domicilio privado" } } }).toBuffer();
  assert.ok((await sharp(original).metadata()).exif);
  const cleaned = await limpiarFoto({ tipo: "image/jpeg", bytes: original });
  const meta = await sharp(cleaned).metadata();
  assert.equal(meta.format, "webp");
  for (const key of ["exif", "icc", "xmp", "iptc"]) assert.equal(meta[key], undefined);
  assert.equal(cleaned.includes(Buffer.from("DENUNCIANTE PRIVADO")), false);
  assert.notDeepEqual(cleaned, original);
});
test("rechaza SVG, foto corrupta y tipo MIME falsificado", async () => {
  await assert.rejects(limpiarFoto({ tipo: "image/jpeg", bytes: Buffer.from("foto no válida") }), { status: 400 });
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(limpiarFoto({ tipo: "image/jpeg", bytes: png }), { status: 400 });
  await assert.rejects(limpiarFoto({ tipo: "image/png", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>') }), { status: 400 });
  assert.equal(await limpiarFoto(null), null);
});
