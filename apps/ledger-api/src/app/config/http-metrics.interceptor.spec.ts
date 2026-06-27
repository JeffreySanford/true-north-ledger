import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('HttpMetricsInterceptor', () => {
  let metricsService: {
    recordHttpRequest: jest.Mock;
  };
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    metricsService = {
      recordHttpRequest: jest.fn(),
    };
    interceptor = new HttpMetricsInterceptor(
      metricsService as unknown as MetricsService,
    );
  });

  it('records HTTP request metrics after successful responses', async () => {
    const context = buildHttpContext({
      method: 'GET',
      originalUrl: '/api/health?verbose=true',
      route: { path: 'health' },
      statusCode: 200,
    });
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        next: (value) => {
          expect(value).toEqual({ ok: true });
        },
        error: reject,
        complete: resolve,
      });
    });

    expect(metricsService.recordHttpRequest).toHaveBeenCalledWith({
      method: 'GET',
      route: '/health',
      statusCode: 200,
      durationSeconds: expect.any(Number),
    });
  });

  it('records HTTP request metrics after failed responses', async () => {
    const context = buildHttpContext({
      method: 'POST',
      originalUrl: '/api/v1/orders',
      statusCode: 500,
    });
    const next: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        next: () => reject(new Error('Expected an error response')),
        error: (error: unknown) => {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('boom');
          resolve();
        },
        complete: () => reject(new Error('Expected stream to error')),
      });
    });

    expect(metricsService.recordHttpRequest).toHaveBeenCalledWith({
      method: 'POST',
      route: '/api/v1/orders',
      statusCode: 500,
      durationSeconds: expect.any(Number),
    });
  });

  it('ignores non-HTTP contexts', async () => {
    const context = {
      getType: () => 'ws',
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        next: (value) => {
          expect(value).toBe('ok');
        },
        error: reject,
        complete: resolve,
      });
    });
    expect(metricsService.recordHttpRequest).not.toHaveBeenCalled();
  });

  function buildHttpContext(options: {
    method: string;
    originalUrl: string;
    statusCode: number;
    route?: { path: string };
  }): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: options.method,
          originalUrl: options.originalUrl,
          route: options.route,
        }),
        getResponse: () => ({
          statusCode: options.statusCode,
        }),
      }),
    } as unknown as ExecutionContext;
  }
});
