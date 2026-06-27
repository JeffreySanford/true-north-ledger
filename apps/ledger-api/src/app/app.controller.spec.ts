import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let app: TestingModule;
  let appService: {
    getData: jest.Mock;
    getHealth: jest.Mock;
    getReadiness: jest.Mock;
    getMetrics: jest.Mock;
  };

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    appService = {
      getData: jest.fn().mockReturnValue({ message: 'Hello API' }),
      getHealth: jest.fn().mockResolvedValue({
        service: 'true-north-ledger-api',
        version: '0.1.0',
        status: 'ok',
        uptimeSeconds: 1,
        timestamp: '2026-06-20T12:00:00.000Z',
        dependencies: {
          app: { status: 'ok' },
          database: { status: 'ok', latencyMs: 1 },
          redis: { status: 'not_configured' },
        },
      }),
      getReadiness: jest.fn().mockResolvedValue({
        service: 'true-north-ledger-api',
        ready: true,
        timestamp: '2026-06-20T12:00:00.000Z',
        dependencies: {
          database: { status: 'ok', latencyMs: 1 },
        },
      }),
      getMetrics: jest.fn().mockResolvedValue('true_north_ledger_api_up 1\n'),
    };

    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appService,
        },
      ],
    }).compile();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.getData()).toEqual({ message: 'Hello API' });
    });

    it('disables the debug root endpoint in production', () => {
      const appController = app.get<AppController>(AppController);
      process.env.NODE_ENV = 'production';

      expect(() => appController.getData()).toThrow(NotFoundException);
      expect(appService.getData).not.toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('returns service health status', async () => {
      const appController = app.get<AppController>(AppController);

      await expect(appController.getHealth()).resolves.toMatchObject({
        service: 'true-north-ledger-api',
        status: 'ok',
      });
    });
  });

  describe('getReadiness', () => {
    it('returns readiness status when ready', async () => {
      const appController = app.get<AppController>(AppController);

      await expect(appController.getReadiness()).resolves.toMatchObject({
        service: 'true-north-ledger-api',
        ready: true,
      });
    });

    it('throws service unavailable when dependencies are not ready', async () => {
      const appController = app.get<AppController>(AppController);
      appService.getReadiness.mockResolvedValueOnce({
        service: 'true-north-ledger-api',
        ready: false,
        timestamp: '2026-06-20T12:00:00.000Z',
        dependencies: {
          database: { status: 'error', message: 'database unavailable' },
        },
      });

      await expect(appController.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getMetrics', () => {
    it('returns Prometheus metrics text', async () => {
      const appController = app.get<AppController>(AppController);

      await expect(appController.getMetrics()).resolves.toContain(
        'true_north_ledger_api_up 1',
      );
    });
  });
});
