import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LedgerEventsService } from './ledger-events.service';

describe('LedgerEventsService', () => {
  let service: LedgerEventsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LedgerEventsService],
    });

    service = TestBed.inject(LedgerEventsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('should fetch an empty ledger event list', async () => {
    const promise = firstValueFrom(service.fetchEvents());
    
    const request = http.expectOne('/api/v1/ledger/events');
    expect(request.request.method).toBe('GET');
    request.flush([]);

    const events = await promise;
    expect(events).toEqual([]);
  });

  it('should reject invalid ledger event responses', async () => {
    const promise = firstValueFrom(service.fetchEvents());
    
    const request = http.expectOne('/api/v1/ledger/events');
    request.flush([{ invalid: true }]);

    await expect(promise).rejects.toThrow();
  });
});
