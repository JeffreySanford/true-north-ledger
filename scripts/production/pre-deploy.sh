#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-apps/docker/docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
CERT_DIR="${CERT_DIR:-apps/docker/nginx/certs}"

required_vars="
NODE_ENV
PORT
JWT_SECRET
JWT_EXPIRATION
JWT_REFRESH_EXPIRATION
AUTH_USERNAME
AUTH_PASSWORD
AUTH_TENANT_ID
CORS_ORIGIN
DATABASE_URL
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
REDIS_URL
GRAFANA_ADMIN_USER
GRAFANA_ADMIN_PASSWORD
PGADMIN_EMAIL
PGADMIN_PASSWORD
"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 1
fi

require_env() {
  name="$1"
  value="$(printenv "$name" 2>/dev/null || true)"

  if [ -z "$value" ]; then
    value="$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- || true)"
  fi

  if [ -z "$value" ] || printf '%s' "$value" | grep -q '<.*>'; then
    echo "Missing or placeholder production variable: $name" >&2
    exit 1
  fi
}

for variable in $required_vars; do
  require_env "$variable"
done

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "Missing TLS certificate files in $CERT_DIR" >&2
  exit 1
fi

openssl x509 -checkend 604800 -noout -in "$CERT_DIR/fullchain.pem"

pnpm nx run ledger-api:build:production
pnpm exec typeorm-ts-node-commonjs \
  -d apps/ledger-api/src/app/typeorm.config.ts \
  migration:show

docker compose \
  --env-file "$ENV_FILE" \
  -p true-north-ledger \
  -f "$COMPOSE_FILE" \
  config >/dev/null
