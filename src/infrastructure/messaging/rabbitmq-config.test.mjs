import { test } from "node:test";
import assert from "node:assert/strict";
import { configurarRabbitMQ } from "./rabbitmq-config.mjs";

test("conserva AMQP para Docker local", () => {
  const config = configurarRabbitMQ({ url: "amqp://localhost", production: false, caBase64: "" });
  assert.equal(config.url, "amqp://localhost");
  assert.equal(config.opciones.timeout, 10_000);
  assert.equal(config.opciones.ca, undefined);
});

test("produccion rechaza conexiones sin TLS y protocolos inesperados", () => {
  for (const url of ["amqp://localhost", "https://broker.example", "no es una URL"]) {
    assert.throws(() => configurarRabbitMQ({ url, production: true }));
  }
});

test("TLS valida la identidad y permite CA privada sin desactivar verificacion", () => {
  const pem = "-----BEGIN CERTIFICATE-----\ncertificado\n-----END CERTIFICATE-----";
  const config = configurarRabbitMQ({
    url: "amqps://broker.example:5671",
    caBase64: Buffer.from(pem).toString("base64"),
    production: true,
  });
  assert.equal(config.opciones.rejectUnauthorized, true);
  assert.equal(config.opciones.minVersion, "TLSv1.2");
  assert.equal(config.opciones.ca.toString(), pem);
});

test("con CA publica usa la confianza del sistema y rechaza CA privada invalida", () => {
  const config = configurarRabbitMQ({ url: "amqps://broker.example", caBase64: "", production: true });
  assert.equal(config.opciones.ca, undefined);
  assert.equal(config.opciones.rejectUnauthorized, true);
  assert.throws(() => configurarRabbitMQ({ url: config.url, caBase64: "invalido", production: true }));
});
