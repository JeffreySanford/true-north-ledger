# Backup and Restore

This guide covers production database backups, restores, and disaster recovery for the True North Ledger production Docker Compose stack.

PostgreSQL is the source of truth for application data. Grafana and Prometheus data are persisted in Docker volumes, but their provisioning files live in the repository and can be recreated with the production compose stack.

## Prerequisites

- Docker Compose access on the production host.
- A complete `.env.production` file with production database variables.
- The production compose file at `apps/docker/docker-compose.production.yml`.
- Enough free disk space in the backup target directory for a compressed PostgreSQL custom-format dump.
- A tested process for moving backup files to durable storage outside the production host.

The production scripts use these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROJECT_NAME` | `true-north-ledger` | Docker Compose project name. |
| `ENV_FILE` | `.env.production` | Production environment file passed to Docker Compose. |
| `BACKUP_DIR` | `backups` | Local directory for generated backup files. |
| `POSTGRES_SERVICE` | `postgres` | Compose service name for PostgreSQL. |

## Backup Procedures

Run the backup script from the repository root:

```sh
scripts/production/backup.sh
```

The script verifies that `ENV_FILE` exists, creates `BACKUP_DIR` if needed, and writes a PostgreSQL custom-format dump with `pg_dump -Fc`.

Backup files are named with a UTC timestamp:

```text
backups/true-north-ledger-YYYYMMDDTHHMMSSZ.dump
```

Use explicit variables when backing up a non-default stack or writing to a mounted backup location:

```sh
ENV_FILE=.env.production \
PROJECT_NAME=true-north-ledger \
BACKUP_DIR=/var/backups/true-north-ledger \
POSTGRES_SERVICE=postgres \
scripts/production/backup.sh
```

After each backup:

1. Copy the `.dump` file to durable storage that is not on the production host.
2. Record the backup timestamp, commit SHA, and production image tags in the deployment log.
3. Keep backup storage access restricted to operators who are allowed to restore production data.
4. Periodically restore a recent backup into a non-production environment to verify that the file is usable.

## Restore Procedures

Restores are destructive. The restore script requires explicit confirmation:

```sh
RESTORE_CONFIRM=restore scripts/production/restore.sh backups/true-north-ledger-YYYYMMDDTHHMMSSZ.dump
```

The script verifies the backup file and `ENV_FILE`, then runs:

```sh
pg_restore --clean --if-exists --no-owner
```

Use explicit variables when restoring a non-default stack:

```sh
RESTORE_CONFIRM=restore \
ENV_FILE=.env.production \
PROJECT_NAME=true-north-ledger \
POSTGRES_SERVICE=postgres \
scripts/production/restore.sh /var/backups/true-north-ledger/true-north-ledger-YYYYMMDDTHHMMSSZ.dump
```

Recommended restore sequence:

1. Announce a maintenance window and stop writes at the load balancer or reverse proxy.
2. Capture a final backup if the current database is accessible.
3. Confirm the target backup file and deployment version.
4. Run `RESTORE_CONFIRM=restore scripts/production/restore.sh <backup.dump>`.
5. Restart dependent services if they cache application state:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml restart ledger-api ledger-web
```

6. Verify the stack and application checks:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml ps
curl -fsS https://<production-host>/api/health
curl -fsS https://<production-host>/api/ready
curl -fsS https://<production-host>/api/metrics
curl -fsS https://<production-host>/api/v1/ledger/events/chain/verify
```

7. Re-enable traffic after health, readiness, metrics, and ledger-chain verification pass.

## Disaster Recovery

Use this process when the production database or host is lost and a known-good backup must be restored.

1. Provision a replacement host with Docker, the repository, TLS certificates, and `.env.production`.
2. Restore required Docker volumes only when they are available and known to be healthy. PostgreSQL data should come from the selected `.dump` file.
3. Start the infrastructure without accepting public traffic:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml up -d postgres redis prometheus grafana
```

4. Restore the selected backup:

```sh
RESTORE_CONFIRM=restore scripts/production/restore.sh <backup.dump>
```

5. Start the full production stack:

```sh
scripts/production/deploy.sh
```

6. Verify `/api/health`, `/api/ready`, `/api/metrics`, and `/api/v1/ledger/events/chain/verify`.
7. Confirm Grafana is reachable on `3001:3000` and Prometheus is scraping `ledger-api:3000/api/metrics`.
8. Re-enable traffic only after the application, monitoring, and ledger-chain checks pass.

If the last known-good backup is older than the most recent deployment, review migration compatibility before restoring. Prefer restoring the backup with the application version that produced it, then upgrade through the normal deployment path.
