#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-apps/docker/docker-compose.production.yml}"
PROJECT_NAME="${PROJECT_NAME:-true-north-ledger}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 1
fi

docker compose \
  --env-file "$ENV_FILE" \
  -p "$PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  build "$@"
