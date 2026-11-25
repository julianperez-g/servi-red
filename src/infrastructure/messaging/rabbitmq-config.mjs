/** Configuración exclusiva de servidor. Nunca deshabilita la validación TLS. */
export function configurarRabbitMQ({
  url = process.env.RABBITMQ_URL,
  caBase64 = process.env.RABBITMQ_CA_CERT_BASE64,
  production = process.env.NODE_ENV === "production",
} = {}) {
  if (!url) throw new Error("RABBITMQ_URL no esta configurada");

  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("RABBITMQ_URL no es una URL valida");
  }
  if (!["amqp:", "amqps:"].includes(endpoint.protocol)) {
    throw new Error("RabbitMQ requiere el protocolo amqp o amqps");
  }
  if (production && endpoint.protocol !== "amqps:") {
    throw new Error("RabbitMQ requiere TLS (amqps) desde Vercel en produccion");
  }

  const opciones = { timeout: 10_000 };
  if (endpoint.protocol === "amqps:") {
    opciones.rejectUnauthorized = true;
    opciones.minVersion = "TLSv1.2";
    if (caBase64) {
      const ca = Buffer.from(caBase64, "base64");
      if (!ca.toString("utf8").includes("-----BEGIN CERTIFICATE-----")) {
        throw new Error("RABBITMQ_CA_CERT_BASE64 no contiene un certificado PEM");
      }
      opciones.ca = ca;
    }
  }
  return { url, opciones };
}
