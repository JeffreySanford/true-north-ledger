#!/usr/bin/env sh
set -eu

CERT_DIR="${CERT_DIR:-apps/docker/nginx/certs}"
CERT_DAYS="${CERT_DAYS:-365}"
CERT_SUBJECT="${CERT_SUBJECT:-/CN=localhost}"
CERT_ALT_NAMES="${CERT_ALT_NAMES:-DNS:localhost,IP:127.0.0.1}"

mkdir -p "$CERT_DIR"

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -days "$CERT_DAYS" \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -subj "$CERT_SUBJECT" \
  -addext "subjectAltName=$CERT_ALT_NAMES"

chmod 600 "$CERT_DIR/privkey.pem"

echo "Generated development TLS certificate: $CERT_DIR/fullchain.pem"
echo "Generated development TLS private key: $CERT_DIR/privkey.pem"
