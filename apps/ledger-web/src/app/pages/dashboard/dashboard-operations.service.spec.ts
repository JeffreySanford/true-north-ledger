import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { DevicesService } from '../../devices.service';
import { InventoryService } from '../../inventory.service';
import { DashboardOperationsService } from './dashboard-operations.service';

describe('DashboardOperationsService', () => {
  let service: DashboardOperationsService;
  let httpTestingController: HttpTestingController;
  let inventoryService: { getAnomalies: ReturnType<typeof vi.fn> };
  let devicesService: { listDevices: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    inventoryService = {
      getAnomalies: vi.fn(() => of({ anomalies: [], total: 2 })),
    };
    devicesService = {
      listDevices: vi.fn(() =>
        of({
          devices: [
            { online: true },
            { online: true },
            { online: false },
          ],
          total: 3,
          page: 1,
          pageSize: 100,
        }),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: InventoryService,
          useValue: inventoryService,
        },
        {
          provide: DevicesService,
          useValue: devicesService,
        },
      ],
    });

    service = TestBed.inject(DashboardOperationsService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('parses active WebSocket connections from Prometheus metrics', () => {
    expect(
      service.parseActiveConnections(
        [
          'true_north_ledger_api_up 1',
          'true_north_ledger_websocket_connections_active 7',
        ].join('\n'),
      ),
    ).toBe(7);
  });

  it('loads live operations state from API-backed metrics, anomalies, and devices', async () => {
    let snapshot: unknown;
    service.fetchSnapshot().subscribe((value) => {
      snapshot = value;
    });

    const request = httpTestingController.expectOne('/api/metrics');
    expect(request.request.method).toBe('GET');
    request.flush('true_north_ledger_websocket_connections_active 5\n');

    expect(snapshot).toEqual({
      activeConnections: 5,
      openAnomalies: 2,
      deviceHeartbeat: {
        total: 3,
        online: 2,
        missing: 1,
      },
      source: 'api',
    });
    expect(inventoryService.getAnomalies).toHaveBeenCalledOnce();
    expect(devicesService.listDevices).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
    });
  });
});
