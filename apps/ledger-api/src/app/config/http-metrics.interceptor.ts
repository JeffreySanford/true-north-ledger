import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { MetricsService } from './metrics.service';

interface HttpRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  route?: {
    path?: string;
  };
}

interface HttpResponseLike {
  statusCode?: number;
}

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const response = context.switchToHttp().getResponse<HttpResponseLike>();
    const startedAt = performance.now();

    return next.handle().pipe(
      finalize(() => {
        this.metricsService.recordHttpRequest({
          method: request.method ?? 'UNKNOWN',
          route: this.routeLabel(request),
          statusCode: response.statusCode ?? 0,
          durationSeconds: Math.max(0, performance.now() - startedAt) / 1000,
        });
      }),
    );
  }

  private routeLabel(request: HttpRequestLike): string {
    if (request.route?.path) {
      return request.route.path.startsWith('/')
        ? request.route.path
        : `/${request.route.path}`;
    }

    const url = request.originalUrl ?? request.url ?? 'unknown';
    return url.split('?')[0] || 'unknown';
  }
}
