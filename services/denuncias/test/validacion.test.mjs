import { test } from "node:test";
import assert from "node:assert/strict";
import { anonimizarTexto, validarDenuncia, validarModeracion } from "../src/validacion.mjs";

const base = { municipioId: 1, servicioId: 2, descripcion: "Posible conexión irregular junto al poste de la esquina." };
test("solo persiste datos del hecho; la ubicación es opcional", () => {
  assert.deepEqual(validarDenuncia(base), { ...base, latitud: null, longitud: null, foto: null });
});
test("elimina correo, teléfono, documento, IP, enlace e identificación voluntaria", () => {
  const result = anonimizarTexto("Me llamo Ana Pérez. Contacto: 3101234567; correo ana@example.com; cédula 123456789. IP 192.0.2.40 o 2001:db8::a. https://perfil.example/ana");
  for (const privateValue of ["Ana Pérez", "3101234567", "ana@example.com", "123456789", "192.0.2.40", "2001:db8::a", "perfil.example"]) assert.equal(result.includes(privateValue), false);
  assert.match(result, /omitid/);
});
for (const key of ["ip", "userAgent", "ciudadanoId", "nombre", "correo", "telefono", "auth_user_id"]) {
  test(`rechaza campo de identidad ${key}`, () => assert.throws(() => validarDenuncia({ ...base, [key]: "no guardar" }), { status: 400 }));
}
test("valida catálogos, descripción y coordenadas", () => {
  for (const change of [{ municipioId: 0 }, { servicioId: "2" }, { descripcion: "corta" }, { latitud: 4 }, { latitud: 90, longitud: -74 }]) assert.throws(() => validarDenuncia({ ...base, ...change }), { status: 400 });
  assert.equal(validarDenuncia({ ...base, latitud: 4.7, longitud: -74 }).latitud, 4.7);
});
test("no admite nombre de archivo ni base64 corrupto", () => {
  for (const foto of [{ tipo: "image/jpeg", base64: "%%%" }, { tipo: "image/svg+xml", base64: "YQ==" }, { tipo: "image/jpeg", base64: "YQ==", nombre: "Ana.jpg" }]) assert.throws(() => validarDenuncia({ ...base, foto }), { status: 400 });
});
test("moderación valida transiciones y limpia motivos", () => {
  assert.equal(validarModeracion({ estadoEsperado: "PENDIENTE", estado: "EN_REVISION", motivo: "Revisar conexión sospechosa" }).estado, "EN_REVISION");
  for (const from of ["ADMITIDA", "DESCARTADA"]) assert.throws(() => validarModeracion({ estadoEsperado: from, estado: "PENDIENTE", motivo: "Reabrir sin permiso" }), { status: 409 });
  assert.throws(() => validarModeracion({ estadoEsperado: "PENDIENTE", estado: "ADMITIDA", motivo: "No debe saltar revisión" }), { status: 409 });
});
