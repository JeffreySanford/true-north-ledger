#!/usr/bin/env sh
set -eu

PROJECT_NAME="${PROJECT_NAME:-true-north-ledger}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/true-north-ledger-$timestamp.dump"

docker compose \
  --env-file "$ENV_FILE" \
  -p "$PROJECT_NAME" \
  -f apps/docker/docker-compose.production.yml \
  exec -T "$POSTGRES_SERVICE" \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup_file"

echo "$backup_file"
