import { type PrometheusOptions } from '@willsoto/nestjs-prometheus';

export const prometheusModuleOptions: PrometheusOptions = {
  path: '/internal/prometheus',
  defaultMetrics: {
    enabled: false,
  },
  defaultLabels: {
    app: 'true-north-ledger-api',
  },
};
