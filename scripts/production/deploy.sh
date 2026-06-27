#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-apps/docker/docker-compose.production.yml}"
PROJECT_NAME="${PROJECT_NAME:-true-north-ledger}"
ENV_FILE="${ENV_FILE:-.env.production}"

scripts/production/pre-deploy.sh
scripts/production/build.sh

docker compose \
  --env-file "$ENV_FILE" \
  -p "$PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans

docker compose \
  --env-file "$ENV_FILE" \
  -p "$PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  ps
