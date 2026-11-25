#!/bin/sh
set -eu

: "${RABBITMQ_CA_CERT_BASE64:?Falta el certificado CA}"
: "${RABBITMQ_TLS_CERT_BASE64:?Falta el certificado del broker}"
: "${RABBITMQ_TLS_KEY_BASE64:?Falta la clave TLS del broker}"
: "${RABBITMQ_DEFAULT_USER:?Falta el usuario AMQP}"
: "${RABBITMQ_DEFAULT_PASS:?Falta la contraseña AMQP}"

umask 077
mkdir -p /etc/rabbitmq/tls
printf '%s' "$RABBITMQ_CA_CERT_BASE64" | base64 -d > /etc/rabbitmq/tls/ca.pem
printf '%s' "$RABBITMQ_TLS_CERT_BASE64" | base64 -d > /etc/rabbitmq/tls/server.pem
printf '%s' "$RABBITMQ_TLS_KEY_BASE64" | base64 -d > /etc/rabbitmq/tls/server.key
chown -R rabbitmq:rabbitmq /etc/rabbitmq/tls

exec /usr/local/bin/docker-entrypoint.sh "$@"
