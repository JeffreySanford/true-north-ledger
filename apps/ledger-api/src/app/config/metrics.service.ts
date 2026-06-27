import { Injectable } from '@nestjs/common';

export interface HttpRequestMetricSample {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

export interface DatabaseQueryMetricSample {
  operation: string;
  status: 'ok' | 'error';
  durationSeconds: number;
}

export interface LedgerEventCreatedMetricSample {
  eventType: string;
  subjectType: string;
  result: string;
}

export interface DeviceHeartbeatMetricSample {
  deviceType: string;
  heartbeatStatus: string;
  deviceStatus: string;
}

interface HttpRequestMetricBucket {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

interface DatabaseQueryMetricBucket {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

const httpDurationBuckets = [
  0.005,
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2.5,
  5,
  10,
];

const databaseDurationBuckets = [
  0.001,
  0.005,
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2.5,
  5,
];

@Injectable()
export class MetricsService {
  private readonly httpRequestMetrics = new Map<string, HttpRequestMetricBucket>();
  private readonly databaseQueryMetrics = new Map<string, DatabaseQueryMetricBucket>();
  private readonly ledgerEventsCreatedMetrics = new Map<string, number>();
  private readonly deviceHeartbeatMetrics = new Map<string, number>();

  recordHttpRequest(sample: HttpRequestMetricSample): void {
    const normalized: HttpRequestMetricSample = {
      method: sample.method.toUpperCase(),
      route: sample.route,
      statusCode: sample.statusCode,
      durationSeconds: Math.max(0, sample.durationSeconds),
    };
    const key = this.httpMetricKey(normalized);
    const metric = this.httpRequestMetrics.get(key) ?? {
      count: 0,
      sum: 0,
      buckets: new Map(httpDurationBuckets.map((bucket) => [bucket, 0])),
    };

    metric.count += 1;
    metric.sum += normalized.durationSeconds;
    for (const bucket of httpDurationBuckets) {
      if (normalized.durationSeconds <= bucket) {
        metric.buckets.set(bucket, (metric.buckets.get(bucket) ?? 0) + 1);
      }
    }

    this.httpRequestMetrics.set(key, metric);
  }

  renderHttpMetrics(): string[] {
    const lines = [
      '# HELP true_north_ledger_http_requests_total Total HTTP requests by method, route, and status code.',
      '# TYPE true_north_ledger_http_requests_total counter',
    ];

    for (const [key, metric] of this.httpRequestMetrics.entries()) {
      const labels = this.labelsForKey(key);
      lines.push(`true_north_ledger_http_requests_total{${labels}} ${metric.count}`);
    }

    lines.push(
      '# HELP true_north_ledger_http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE true_north_ledger_http_request_duration_seconds histogram',
    );

    for (const [key, metric] of this.httpRequestMetrics.entries()) {
      const baseLabels = this.labelsForKey(key);
      for (const bucket of httpDurationBuckets) {
        lines.push(
          `true_north_ledger_http_request_duration_seconds_bucket{${baseLabels},le="${bucket}"} ${metric.buckets.get(bucket) ?? 0}`,
        );
      }
      lines.push(
        `true_north_ledger_http_request_duration_seconds_bucket{${baseLabels},le="+Inf"} ${metric.count}`,
        `true_north_ledger_http_request_duration_seconds_sum{${baseLabels}} ${this.formatNumber(metric.sum)}`,
        `true_north_ledger_http_request_duration_seconds_count{${baseLabels}} ${metric.count}`,
      );
    }

    return lines;
  }

  recordDatabaseQuery(sample: DatabaseQueryMetricSample): void {
    const normalized: DatabaseQueryMetricSample = {
      operation: sample.operation,
      status: sample.status,
      durationSeconds: Math.max(0, sample.durationSeconds),
    };
    const key = this.databaseMetricKey(normalized);
    const metric = this.databaseQueryMetrics.get(key) ?? {
      count: 0,
      sum: 0,
      buckets: new Map(databaseDurationBuckets.map((bucket) => [bucket, 0])),
    };

    metric.count += 1;
    metric.sum += normalized.durationSeconds;
    for (const bucket of databaseDurationBuckets) {
      if (normalized.durationSeconds <= bucket) {
        metric.buckets.set(bucket, (metric.buckets.get(bucket) ?? 0) + 1);
      }
    }

    this.databaseQueryMetrics.set(key, metric);
  }

  renderDatabaseMetrics(): string[] {
    const lines = [
      '# HELP true_north_ledger_database_query_duration_seconds Database query duration in seconds.',
      '# TYPE true_north_ledger_database_query_duration_seconds histogram',
    ];

    for (const [key, metric] of this.databaseQueryMetrics.entries()) {
      const baseLabels = this.databaseLabelsForKey(key);
      for (const bucket of databaseDurationBuckets) {
        lines.push(
          `true_north_ledger_database_query_duration_seconds_bucket{${baseLabels},le="${bucket}"} ${metric.buckets.get(bucket) ?? 0}`,
        );
      }
      lines.push(
        `true_north_ledger_database_query_duration_seconds_bucket{${baseLabels},le="+Inf"} ${metric.count}`,
        `true_north_ledger_database_query_duration_seconds_sum{${baseLabels}} ${this.formatNumber(metric.sum)}`,
        `true_north_ledger_database_query_duration_seconds_count{${baseLabels}} ${metric.count}`,
      );
    }

    return lines;
  }

  recordLedgerEventCreated(sample: LedgerEventCreatedMetricSample): void {
    const key = this.ledgerEventMetricKey(sample);
    this.ledgerEventsCreatedMetrics.set(
      key,
      (this.ledgerEventsCreatedMetrics.get(key) ?? 0) + 1,
    );
  }

  renderLedgerEventMetrics(): string[] {
    const lines = [
      '# HELP true_north_ledger_ledger_events_created_total Total ledger events created.',
      '# TYPE true_north_ledger_ledger_events_created_total counter',
    ];

    for (const [key, count] of this.ledgerEventsCreatedMetrics.entries()) {
      lines.push(`true_north_ledger_ledger_events_created_total{${this.ledgerEventLabelsForKey(key)}} ${count}`);
    }

    return lines;
  }

  recordDeviceHeartbeat(sample: DeviceHeartbeatMetricSample): void {
    const key = this.deviceHeartbeatMetricKey(sample);
    this.deviceHeartbeatMetrics.set(
      key,
      (this.deviceHeartbeatMetrics.get(key) ?? 0) + 1,
    );
  }

  renderDeviceHeartbeatMetrics(): string[] {
    const lines = [
      '# HELP true_north_ledger_device_heartbeats_total Total device heartbeats recorded.',
      '# TYPE true_north_ledger_device_heartbeats_total counter',
    ];

    for (const [key, count] of this.deviceHeartbeatMetrics.entries()) {
      lines.push(`true_north_ledger_device_heartbeats_total{${this.deviceHeartbeatLabelsForKey(key)}} ${count}`);
    }

    return lines;
  }

  private httpMetricKey(sample: HttpRequestMetricSample): string {
    return JSON.stringify({
      method: sample.method,
      route: sample.route,
      statusCode: sample.statusCode,
    });
  }

  private labelsForKey(key: string): string {
    const labels = JSON.parse(key) as {
      method: string;
      route: string;
      statusCode: number;
    };

    return [
      `method="${this.escapeLabel(labels.method)}"`,
      `route="${this.escapeLabel(labels.route)}"`,
      `status_code="${labels.statusCode}"`,
    ].join(',');
  }

  private databaseMetricKey(sample: DatabaseQueryMetricSample): string {
    return JSON.stringify({
      operation: sample.operation,
      status: sample.status,
    });
  }

  private databaseLabelsForKey(key: string): string {
    const labels = JSON.parse(key) as {
      operation: string;
      status: string;
    };

    return [
      `operation="${this.escapeLabel(labels.operation)}"`,
      `status="${this.escapeLabel(labels.status)}"`,
    ].join(',');
  }

  private ledgerEventMetricKey(sample: LedgerEventCreatedMetricSample): string {
    return JSON.stringify({
      eventType: sample.eventType,
      subjectType: sample.subjectType,
      result: sample.result,
    });
  }

  private ledgerEventLabelsForKey(key: string): string {
    const labels = JSON.parse(key) as {
      eventType: string;
      subjectType: string;
      result: string;
    };

    return [
      `event_type="${this.escapeLabel(labels.eventType)}"`,
      `subject_type="${this.escapeLabel(labels.subjectType)}"`,
      `result="${this.escapeLabel(labels.result)}"`,
    ].join(',');
  }

  private deviceHeartbeatMetricKey(sample: DeviceHeartbeatMetricSample): string {
    return JSON.stringify({
      deviceType: sample.deviceType,
      heartbeatStatus: sample.heartbeatStatus,
      deviceStatus: sample.deviceStatus,
    });
  }

  private deviceHeartbeatLabelsForKey(key: string): string {
    const labels = JSON.parse(key) as {
      deviceType: string;
      heartbeatStatus: string;
      deviceStatus: string;
    };

    return [
      `device_type="${this.escapeLabel(labels.deviceType)}"`,
      `heartbeat_status="${this.escapeLabel(labels.heartbeatStatus)}"`,
      `device_status="${this.escapeLabel(labels.deviceStatus)}"`,
    ].join(',');
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private formatNumber(value: number): string {
    return Number(value.toFixed(6)).toString();
  }
}
