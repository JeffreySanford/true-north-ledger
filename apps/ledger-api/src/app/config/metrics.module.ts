import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';
import { prometheusModuleOptions } from './prometheus.config';

@Global()
@Module({
  imports: [PrometheusModule.register(prometheusModuleOptions)],
  providers: [MetricsService],
  exports: [MetricsService, PrometheusModule],
})
export class MetricsModule {}
