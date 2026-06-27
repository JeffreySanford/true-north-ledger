import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('production monitoring config', () => {
  const prometheus = readFileSync(
    workspacePath('apps', 'docker', 'prometheus', 'prometheus.yml'),
    'utf8',
  );
  const alerts = readFileSync(
    workspacePath('apps', 'docker', 'prometheus', 'rules', 'ledger-alerts.yml'),
    'utf8',
  );
  const grafanaIni = readFileSync(
    workspacePath('apps', 'docker', 'grafana', 'grafana.ini'),
    'utf8',
  );
  const grafanaDatasource = readFileSync(
    workspacePath(
      'apps',
      'docker',
      'grafana',
      'provisioning',
      'datasources',
      'prometheus.yml',
    ),
    'utf8',
  );
  const grafanaDashboardProvider = readFileSync(
    workspacePath(
      'apps',
      'docker',
      'grafana',
      'provisioning',
      'dashboards',
      'dashboards.yml',
    ),
    'utf8',
  );
  const dashboard = JSON.parse(
    readFileSync(
      workspacePath(
        'apps',
        'docker',
        'grafana',
        'dashboards',
        'true-north-ledger-overview.json',
      ),
      'utf8',
    ),
  ) as { title: string; panels: Array<{ title: string }> };

  it('configures Prometheus to scrape API metrics every 15 seconds', () => {
    expect(prometheus).toContain('scrape_interval: 15s');
    expect(prometheus).toContain('evaluation_interval: 15s');
    expect(prometheus).toContain('metrics_path: /api/metrics');
    expect(prometheus).toContain('ledger-api:3000');
    expect(prometheus).toContain('/etc/prometheus/rules/*.yml');
  });

  it('defines production alert rules for API, database, and WebSocket health', () => {
    expect(alerts).toContain('TrueNorthLedgerApiDown');
    expect(alerts).toContain('TrueNorthLedgerDatabaseUnavailable');
    expect(alerts).toContain('TrueNorthLedgerWebSocketConnectionsDropped');
    expect(alerts).toContain('true_north_ledger_api_up == 0');
    expect(alerts).toContain('true_north_ledger_database_up == 0');
  });

  it('provisions Grafana with Prometheus datasource and production dashboard', () => {
    expect(grafanaIni).toContain('admin_user = ${GRAFANA_ADMIN_USER}');
    expect(grafanaIni).toContain('admin_password = ${GRAFANA_ADMIN_PASSWORD}');
    expect(grafanaDatasource).toContain('url: http://prometheus:9090');
    expect(grafanaDatasource).toContain('isDefault: true');
    expect(grafanaDashboardProvider).toContain('/var/lib/grafana/dashboards');
    expect(dashboard.title).toBe('True North Ledger Production Overview');
    expect(dashboard.panels.map((panel) => panel.title)).toEqual(
      expect.arrayContaining([
        'API availability',
        'API uptime',
        'Database availability',
        'WebSocket connections',
        'WebSocket connection trend',
      ]),
    );
  });
});
