# Deployment Secrets

Production deployments load runtime configuration from the deployment secret store or an ignored `.env.production` file. Do not commit real production values.

Use `.env.example` only as a variable-name template. Replace every placeholder in the target environment before starting `apps/docker/docker-compose.production.yml`.

## Required API Variables

| Variable | Purpose | Secret handling |
| --- | --- | --- |
| `NODE_ENV` | Enables production runtime validation when set to `production`. | Configuration value; expected value is `production`. |
| `PORT` | API listen port inside the container. | Configuration value; default container port is `3000`. |
| `JWT_SECRET` | Signs access and refresh JWTs. | Store as a high-entropy secret; rotate if exposed. |
| `JWT_EXPIRATION` | Access token lifetime. | Configuration value; keep shorter in production than long-lived local sessions. |
| `JWT_REFRESH_EXPIRATION` | Refresh token lifetime. | Configuration value; align with session policy. |
| `AUTH_USERNAME` | Initial bootstrap admin username. | Treat as sensitive operational access data. |
| `AUTH_PASSWORD` | Initial bootstrap admin password. | Store as a secret; rotate immediately after bootstrap if possible. |
| `AUTH_TENANT_ID` | Tenant UUID used by seeded auth workflows. | Configuration value; must be a valid UUID. |
| `CORS_ORIGIN` | Allowed web origin before the Nginx production boundary. | Configuration value; use the HTTPS production origin only. |
| `DATABASE_URL` | Full PostgreSQL connection URL used by tooling and runtime integrations. | Store as a secret because it embeds credentials. |
| `POSTGRES_HOST` | PostgreSQL hostname. | Configuration value; compose production uses `postgres`. |
| `POSTGRES_PORT` | PostgreSQL port. | Configuration value; compose production uses `5432`. |
| `POSTGRES_DB` | PostgreSQL database name. | Configuration value unless local policy treats database names as sensitive. |
| `POSTGRES_USER` | PostgreSQL application user. | Treat as sensitive operational access data. |
| `POSTGRES_PASSWORD` | PostgreSQL application user password. | Store as a secret; rotate on operator turnover or suspected exposure. |
| `REDIS_URL` | Redis connection URL used by the API. | Store as a secret if credentials are embedded. |

## Required Admin Console Variables

| Variable | Purpose | Secret handling |
| --- | --- | --- |
| `GRAFANA_ADMIN_USER` | Initial Grafana administrator username. | Treat as sensitive operational access data. |
| `GRAFANA_ADMIN_PASSWORD` | Initial Grafana administrator password. | Store as a secret; rotate after first login. |
| `PGADMIN_EMAIL` | PgAdmin login email. | Treat as sensitive operational access data. |
| `PGADMIN_PASSWORD` | PgAdmin login password. | Store as a secret; rotate after first login. |

## Secret Management Rules

- Source production values from a deployment secret manager, CI/CD protected secrets, or a host-level `.env.production` file excluded from git.
- Keep `.env.example` placeholder-only. Never add reusable passwords, JWT signing keys, service tokens, device keys, or database URLs with real credentials.
- Generate `JWT_SECRET`, `POSTGRES_PASSWORD`, `AUTH_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`, and `PGADMIN_PASSWORD` with a password manager or cryptographic random generator.
- Restrict read access to production secrets to operators and deployment automation that need them.
- Rotate secrets after staff changes, leaked logs, failed secret scans, or emergency access.
- Keep `DATABASE_URL` consistent with the discrete `POSTGRES_*` values so app runtime, tooling, and compose services point at the same database.
- Use a single HTTPS origin in `CORS_ORIGIN`; production Nginx should be the browser-facing boundary.
- Do not log environment dumps in production support requests. Share variable names and validation errors only.

## Pre-Deployment Check

Before starting the production compose stack:

1. Confirm every required variable above exists in the deployment environment.
2. Confirm no value is still wrapped in `<placeholder>` syntax.
3. Confirm `.env.production` is ignored by git on the deployment host.
4. Confirm Grafana and PgAdmin bootstrap passwords are scheduled for rotation after first login.
5. Confirm `/api/health`, `/api/ready`, and `/api/metrics` respond after startup.
