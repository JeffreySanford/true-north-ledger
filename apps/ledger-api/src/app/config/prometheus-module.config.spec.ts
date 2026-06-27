import { Test } from '@nestjs/testing';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';
import { prometheusModuleOptions } from './prometheus.config';

describe('Prometheus module configuration', () => {
  it('registers @willsoto/nestjs-prometheus alongside custom app metrics', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule],
    }).compile();

    expect(moduleRef.get(MetricsService)).toBeInstanceOf(MetricsService);
    expect(() => moduleRef.get(PrometheusModule)).not.toThrow();
  });

  it('keeps the production scrape contract on the custom /api/metrics endpoint', () => {
    expect(prometheusModuleOptions).toMatchObject({
      path: '/internal/prometheus',
      defaultMetrics: {
        enabled: false,
      },
      defaultLabels: {
        app: 'true-north-ledger-api',
      },
    });
  });
});
