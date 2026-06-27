# Production Deployment

Production deployment is driven by the Docker Compose stack in `apps/docker/docker-compose.production.yml` and the scripts in `scripts/production`.

## Prerequisites

- Docker with Compose v2.
- `pnpm install` completed in the repository checkout.
- Production values provided through a secret store or ignored `.env.production` file.
- TLS certificate files available at `apps/docker/nginx/certs/fullchain.pem` and `apps/docker/nginx/certs/privkey.pem`.
- Host SSH hardening reviewed through [Host Security](host-security.md), including fail2ban when SSH is exposed.
- Database migrations reviewed through the pre-deployment check.

For local production-stack validation only, run `scripts/production/generate-self-signed-cert.sh` to create temporary self-signed files at the Nginx certificate paths. Public production deployments must replace them with CA-issued certificates such as Let's Encrypt before traffic is opened.

## Deployment Flow

1. Prepare production secrets using [Deployment Secrets](deployment-secrets.md).
2. Run `scripts/production/pre-deploy.sh`.
3. Run `scripts/production/build.sh` to build API and web images.
4. Run `scripts/production/deploy.sh` to start or update the production stack.
5. Verify `/api/health`, `/api/ready`, `/api/metrics`, Prometheus, and Grafana after startup.

## Backup And Restore

Create a database backup before deployment:

```sh
scripts/production/backup.sh
```

Restore requires an explicit confirmation variable because it replaces database objects from the dump:

```sh
RESTORE_CONFIRM=restore scripts/production/restore.sh backups/true-north-ledger-YYYYMMDDTHHMMSSZ.dump
```

## Rollback Procedure

1. Stop new traffic at the load balancer or maintenance boundary.
2. Capture a fresh backup with `scripts/production/backup.sh`.
3. Redeploy the last known good image tag or compose revision.
4. Restore the last known good database dump only when the schema or data change requires it.
5. Run `docker compose --env-file .env.production -p true-north-ledger -f apps/docker/docker-compose.production.yml ps`.
6. Recheck `/api/health`, `/api/ready`, and `/api/metrics`.
7. Reopen traffic after API, web, database, Redis, Prometheus, and Grafana are healthy.
