#!/usr/bin/env sh
set -eu

PROJECT_NAME="${PROJECT_NAME:-true-north-ledger}"
ENV_FILE="${ENV_FILE:-.env.production}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

if [ "${RESTORE_CONFIRM:-}" != "restore" ]; then
  echo "Set RESTORE_CONFIRM=restore to confirm database restore." >&2
  exit 1
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: RESTORE_CONFIRM=restore scripts/production/restore.sh <backup.dump>" >&2
  exit 1
fi

backup_file="$1"

if [ ! -f "$backup_file" ]; then
  echo "Missing backup file: $backup_file" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 1
fi

docker compose \
  --env-file "$ENV_FILE" \
  -p "$PROJECT_NAME" \
  -f apps/docker/docker-compose.production.yml \
  exec -T "$POSTGRES_SERVICE" \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$backup_file"
