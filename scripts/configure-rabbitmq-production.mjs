import { randomBytes, X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const hostname = process.argv[process.argv.indexOf("--hostname") + 1];
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
if (!process.argv.includes("--hostname") || !/^[a-z0-9.-]+$/i.test(hostname || "") ||
    !process.argv.includes("--port") || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Uso: node scripts/configure-rabbitmq-production.mjs --hostname DOMINIO_TCP --port PUERTO_TCP");
}

const output = ".env.rabbitmq.production.local";
if (existsSync(output)) throw new Error(`${output} ya existe; no se sobrescriben credenciales.`);
const base = process.platform === "win32"
  ? join(process.env.LOCALAPPDATA, "Temp", "opencode")
  : join(process.env.TMPDIR || "/tmp", "opencode");
mkdirSync(base, { recursive: true });
const dir = mkdtempSync(join(base, "servired-rabbitmq-"));
const run = (...args) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });

try {
  // No depender del openssl.cnf global, que puede no existir en Windows.
  writeFileSync(join(dir, "req.cnf"), "[req]\ndistinguished_name=dn\n[dn]\n");
  run("req", "-x509", "-newkey", "rsa:3072", "-nodes", "-days", "3650", "-sha256",
    "-config", "req.cnf", "-subj", "/CN=SERVI-RED AMQP CA", "-keyout", "ca.key", "-out", "ca.pem",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  run("req", "-newkey", "rsa:2048", "-nodes", "-sha256", "-config", "req.cnf", "-subj", `/CN=${hostname}`,
    "-keyout", "server.key", "-out", "server.csr");
  writeFileSync(join(dir, "server.ext"), [
    "basicConstraints=critical,CA:FALSE", "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth", `subjectAltName=DNS:${hostname}`, "",
  ].join("\n"));
  run("x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key",
    "-CAcreateserial", "-out", "server.pem", "-days", "365", "-sha256", "-extfile", "server.ext");
  const user = "servired_app";
  const password = randomBytes(32).toString("hex");
  const toBase64 = (file) => readFileSync(join(dir, file)).toString("base64");
  const values = {
    RABBITMQ_DEFAULT_USER: user,
    RABBITMQ_DEFAULT_PASS: password,
    RABBITMQ_DEFAULT_VHOST: "servired",
    RABBITMQ_ERLANG_COOKIE: randomBytes(32).toString("hex"),
    RABBITMQ_CA_CERT_BASE64: toBase64("ca.pem"),
    RABBITMQ_CA_KEY_BASE64: toBase64("ca.key"),
    RABBITMQ_TLS_CERT_BASE64: toBase64("server.pem"),
    RABBITMQ_TLS_KEY_BASE64: toBase64("server.key"),
    RABBITMQ_URL: `amqps://${user}:${password}@${hostname}:${port}/servired?heartbeat=30`,
    RABBITMQ_PRIVATE_URL: `amqp://${user}:${password}@rabbitmq.railway.internal:5672/servired?heartbeat=30`,
    RABBITMQ_QUEUE: "servi-red.reportes",
  };
  writeFileSync(output, "# Privado: no subir a Git ni compartir.\n" +
    Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n",
    { mode: 0o600, flag: "wx" });
  const cert = new X509Certificate(readFileSync(join(dir, "server.pem")));
  console.log(`Configuracion privada guardada en ${output}. Certificado valido hasta ${cert.validTo}.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
