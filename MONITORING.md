# Monitoring

True North Ledger production monitoring is provisioned through Docker Compose using Prometheus and Grafana.

## Grafana Access

- Service: `grafana`
- Compose port: `3001:3000`
- Local URL after deployment: `http://localhost:3001`
- Admin credentials: `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` from the deployment secret store or ignored `.env.production`
- Dashboard provisioning path: `apps/docker/grafana/provisioning/dashboards/dashboards.yml`
- Dashboard JSON: `apps/docker/grafana/dashboards/true-north-ledger-overview.json`

Rotate the initial Grafana admin password after first login.

## Dashboard Overview

The provisioned dashboard is `True North Ledger Production Overview` with UID `true-north-ledger-production`.

Panels:

- `API availability` tracks `true_north_ledger_api_up`.
- `API uptime` tracks `true_north_ledger_api_uptime_seconds`.
- `Database availability` tracks `true_north_ledger_database_up`.
- `WebSocket connections` tracks `true_north_ledger_websocket_connections_active`.
- `Redis configuration` tracks `true_north_ledger_redis_configured`.
- `WebSocket connection trend` tracks active WebSocket clients over time.
- `HTTP request rate` tracks `sum(rate(true_north_ledger_http_requests_total[5m])) by (method, route, status_code)`.
- `HTTP p95 duration` tracks `histogram_quantile(0.95, sum(rate(true_north_ledger_http_request_duration_seconds_bucket[5m])) by (le, route))`.
- `Database query p95 duration` tracks `histogram_quantile(0.95, sum(rate(true_north_ledger_database_query_duration_seconds_bucket[5m])) by (le, operation))`.
- `Ledger event creation rate` tracks `sum(rate(true_north_ledger_ledger_events_created_total[5m])) by (event_type, subject_type, result)`.
- `Device heartbeat rate` tracks `sum(rate(true_north_ledger_device_heartbeats_total[5m])) by (device_type, heartbeat_status, device_status)`.

The dashboard refreshes every 15 seconds and defaults to the last 6 hours.

## Prometheus Scraping

Prometheus is configured in `apps/docker/prometheus/prometheus.yml`.

Scrape targets:

- `true-north-ledger-api` scrapes `ledger-api:3000` at `/api/metrics`.
- `prometheus` scrapes `prometheus:9090`.

The global scrape interval and evaluation interval are both 15 seconds.

The API registers `@willsoto/nestjs-prometheus` through `MetricsModule` for Nest-compatible Prometheus wiring. The production scrape endpoint remains the custom `/api/metrics` controller so the `true_north_ledger_*` counters, gauges, and histograms stay in one stable response.

## Alert Configuration

Alert rules are defined in `apps/docker/prometheus/rules/ledger-alerts.yml`.

Configured alerts:

- `TrueNorthLedgerApiDown`: critical when `true_north_ledger_api_up == 0` for 1 minute.
- `TrueNorthLedgerDatabaseUnavailable`: critical when `true_north_ledger_database_up == 0` for 1 minute.
- `TrueNorthLedgerWebSocketConnectionsDropped`: warning when `true_north_ledger_websocket_connections_active == 0` for 10 minutes.
- `TrueNorthLedgerHighApiUptimeResetRate`: warning when API uptime changes more than 3 times in 15 minutes.

Review alert thresholds before public production launch because expected WebSocket client volume can vary by deployment.

## Metric Definitions

| Metric | Type | Meaning |
| --- | --- | --- |
| `true_north_ledger_api_up` | gauge | `1` when the API process reports healthy. |
| `true_north_ledger_api_uptime_seconds` | gauge | API process uptime in seconds. |
| `true_north_ledger_database_up` | gauge | `1` when database health checks pass. |
| `true_north_ledger_redis_configured` | gauge | `1` when Redis configuration is present. |
| `true_north_ledger_websocket_connections_active` | gauge | Current active WebSocket connection count. |
| `true_north_ledger_http_requests_total` | counter | Total HTTP requests by method, route, and status code. |
| `true_north_ledger_http_request_duration_seconds` | histogram | HTTP request duration buckets, count, and sum by method, route, and status code. |
| `true_north_ledger_database_query_duration_seconds` | histogram | Database query duration buckets, count, and sum by operation and status. |
| `true_north_ledger_ledger_events_created_total` | counter | Total ledger events created by event type, subject type, and result. |
| `true_north_ledger_device_heartbeats_total` | counter | Total device heartbeats by device type, heartbeat status, and resulting device status. |

## Local Validation

After the production stack starts:

1. Open `/api/metrics` and confirm the `true_north_ledger_*` metrics render as Prometheus text.
2. Open Prometheus and verify the `true-north-ledger-api` target is up.
3. Open Grafana on port `3001` and verify the dashboard loads.
4. Check Prometheus alerts for API, database, WebSocket, and uptime reset conditions.
