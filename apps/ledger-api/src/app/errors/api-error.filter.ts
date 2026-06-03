import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiErrorResponseSchema } from '@true-north-ledger/ledger-contracts';

interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
}

interface HttpResponseLike {
  status(statusCode: number): { json(body: unknown): void };
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponseLike>();
    const request = http.getRequest<HttpRequestLike>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const responseObject =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};

    const body = ApiErrorResponseSchema.parse({
      statusCode,
      message:
        responseObject['message'] ??
        (typeof exceptionResponse === 'string' ? exceptionResponse : 'Internal server error'),
      error: typeof responseObject['error'] === 'string' ? responseObject['error'] : HttpStatus[statusCode],
      details: responseObject['details'],
      requestId: this.firstHeaderValue(request.headers['x-request-id']),
      correlationId: this.firstHeaderValue(request.headers['x-correlation-id']),
    });

    response.status(statusCode).json(body);
  }

  private firstHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
