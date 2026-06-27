# Production Deployment

This guide is the operator entry point for deploying True North Ledger with the production Docker Compose stack.

Detailed environment-variable guidance lives in [Deployment Secrets](documentation/operations/deployment-secrets.md). Backup and restore procedures live in [Backup and Restore](BACKUP.md). Monitoring operations live in [Monitoring](MONITORING.md). Host-level SSH hardening guidance lives in [Host Security](documentation/operations/host-security.md).

## Prerequisites

- Docker with Compose v2 installed on the production host.
- Node.js and `pnpm` available for pre-deployment build and migration checks.
- Repository checkout on the release branch or tag being deployed.
- Dependencies installed with `pnpm install`.
- Production secrets supplied through an ignored `.env.production` file or an external secret store.
- TLS files at `apps/docker/nginx/certs/fullchain.pem` and `apps/docker/nginx/certs/privkey.pem`.
- fail2ban configured for SSH on production hosts where SSH is exposed.
- Network access for ports `80`, `443`, `3001` for Grafana, and `5050` for optional PgAdmin when enabled.

For local production-stack validation only, generate temporary self-signed TLS files:

```sh
scripts/production/generate-self-signed-cert.sh
```

Do not use self-signed certificates for public production traffic. Install CA-issued certificates, such as Let's Encrypt, at the same Nginx certificate paths before deployment.

## Installation Steps

From the repository root:

```sh
pnpm install
```

Create the production environment file from the placeholder template and replace every placeholder with a real production value:

```sh
cp .env.example .env.production
```

Run the pre-deployment validation:

```sh
scripts/production/pre-deploy.sh
```

Build production images:

```sh
scripts/production/build.sh
```

Deploy or update the stack:

```sh
scripts/production/deploy.sh
```

## Configuration Guide

The production stack is defined by `apps/docker/docker-compose.production.yml`.

The deployment scripts support these overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPOSE_FILE` | `apps/docker/docker-compose.production.yml` | Compose file used by build, pre-deploy, and deploy scripts. |
| `PROJECT_NAME` | `true-north-ledger` | Docker Compose project name. |
| `ENV_FILE` | `.env.production` | Environment file passed to Docker Compose. |
| `CERT_DIR` | `apps/docker/nginx/certs` | TLS certificate directory checked before deployment. |

Required production variables are documented in [Deployment Secrets](documentation/operations/deployment-secrets.md). The pre-deploy script rejects missing or placeholder values before running builds, migration visibility checks, and Compose validation.

## Starting And Stopping Services

Start or update the full stack:

```sh
scripts/production/deploy.sh
```

Inspect running services:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml ps
```

Stop the stack without removing persistent volumes:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml down
```

Restart API and web services after non-schema configuration changes:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml restart ledger-api ledger-web nginx
```

Check service logs:

```sh
docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml logs --tail=200 ledger-api nginx
```

## Verification

After deployment, verify:

```sh
curl -fsS https://<production-host>/api/health
curl -fsS https://<production-host>/api/ready
curl -fsS https://<production-host>/api/metrics
curl -fsS https://<production-host>/api/docs
```

Also confirm:

- `https://<production-host>/` serves the Angular web app.
- `/api` routes proxy to `ledger-api`.
- `/ws` routes support WebSocket upgrade traffic.
- Grafana is reachable on `3001:3000`.
- Prometheus scrapes `ledger-api:3000/api/metrics`.

## Troubleshooting

If `scripts/production/pre-deploy.sh` fails:

- Check `.env.production` for `Missing or placeholder values`.
- Confirm TLS files exist in `apps/docker/nginx/certs`.
- Use `scripts/production/generate-self-signed-cert.sh` only for local development or staging smoke tests.
- Review TypeORM migration output before deploying a schema-changing release.
- Run `docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml config` to validate Compose interpolation.

If containers are unhealthy:

- Run `docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml ps`.
- Inspect API, Nginx, PostgreSQL, Redis, Prometheus, or Grafana logs with `docker compose logs --tail=200 <service>`.
- Recheck `/api/health`, `/api/ready`, and `/api/metrics`.
- Confirm PostgreSQL credentials in `.env.production` match the Compose service configuration.

If deployment needs to be rolled back, follow the rollback procedure in [Production Deployment](documentation/operations/production-deployment.md) and use [Backup and Restore](BACKUP.md) before destructive database changes.
