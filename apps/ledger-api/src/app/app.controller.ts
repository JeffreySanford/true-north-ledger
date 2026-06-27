import {
  Controller,
  Get,
  Header,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get API health status' })
  @ApiOkResponse({
    description: 'Basic API health response.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { message: 'Hello API' },
    },
  })
  getData() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Debug endpoint is disabled in production');
    }

    return this.appService.getData();
  }

  @Get('health')
  @ApiOperation({ summary: 'Get API health and dependency status' })
  @ApiOkResponse({
    description: 'Service health response with dependency status.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        service: 'true-north-ledger-api',
        version: '0.1.0',
        status: 'ok',
        uptimeSeconds: 42,
        timestamp: '2026-06-20T12:00:00.000Z',
        dependencies: {
          app: { status: 'ok' },
          database: { status: 'ok', latencyMs: 3 },
          redis: { status: 'not_configured' },
        },
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Get API readiness for orchestration checks' })
  @ApiOkResponse({
    description: 'Service is ready to receive traffic.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        service: 'true-north-ledger-api',
        ready: true,
        timestamp: '2026-06-20T12:00:00.000Z',
        dependencies: {
          database: { status: 'ok', latencyMs: 2 },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Service is running but not ready to receive traffic.',
  })
  async getReadiness() {
    const readiness = await this.appService.getReadiness();

    if (!readiness.ready) {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Get API metrics in Prometheus text format' })
  @ApiOkResponse({
    description: 'Prometheus-formatted API metrics.',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example:
            '# HELP true_north_ledger_api_up Whether the API process is running.\ntrue_north_ledger_api_up 1\n',
        },
      },
    },
  })
  getMetrics() {
    return this.appService.getMetrics();
  }
}
