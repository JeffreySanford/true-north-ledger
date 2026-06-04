/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { LedgerEventResponse } from '@true-north-ledger/shared-models';
import { LedgerEventsService } from '../../ledger-events.service';
import { LedgerEventsComponent } from './ledger-events.component';

function buildEvent(action: string, id = '550e8400-e29b-41d4-a716-446655440000'): LedgerEventResponse {
  return {
    id,
    type: 'LEDGER_EVENT',
    actorType: 'user',
    actorId: 'admin',
    subjectType: 'auth',
    subjectId: 'admin',
    payload: {
      action,
      username: 'admin',
    },
    metadata: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'request-1',
      correlationId: 'correlation-1',
      sourceIp: '127.0.0.1',
      userAgent: 'vitest',
      payloadHash: 'a'.repeat(64),
      eventHash: 'b'.repeat(64),
      chainSequence: 1,
      result: 'accepted',
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
}

describe('LedgerEventsComponent', () => {
  let fixture: ComponentFixture<LedgerEventsComponent>;
  let fetchEventsMock: ReturnType<typeof vi.fn>;
  let createDemoEventMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchEventsMock = vi.fn(() => of([buildEvent('LOGIN_SUCCESS')]));
    createDemoEventMock = vi.fn(() => of(buildEvent('LOGIN_SUCCESS', '550e8400-e29b-41d4-a716-446655440001')));

    await TestBed.configureTestingModule({
      declarations: [LedgerEventsComponent],
      providers: [
        {
          provide: LedgerEventsService,
          useValue: {
            fetchEvents: fetchEventsMock,
            createDemoEvent: createDemoEventMock,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LedgerEventsComponent);
  });

  it('renders audit action and metadata for loaded events', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('LOGIN_SUCCESS');
    expect(root.textContent).toContain('Actor: user / admin');
    expect(root.textContent).toContain('Result: accepted');
    expect(root.textContent).toContain('Request: request-1');
    expect(root.textContent).toContain('Correlation: correlation-1');
    expect(root.textContent).toContain('Source IP: 127.0.0.1');
    expect(root.textContent).toContain('User Agent: vitest');
  });

  it('shows an error message when loading fails', async () => {
    fetchEventsMock.mockReturnValueOnce(throwError(() => new Error('Failed to fetch ledger events')));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Error: Failed to fetch ledger events');
  });

  it('prepends created events after create demo action', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.createDemo();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="ledger-event-row"]');
    expect(rows.length).toBe(2);
    expect(createDemoEventMock).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when demo event creation fails', async () => {
    createDemoEventMock.mockReturnValueOnce(throwError(() => 'create failed'));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.createDemo();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Error: create failed');
    expect(component.loading).toBe(false);
  });

  it('tracks event rows by immutable ledger event id', () => {
    const component = fixture.componentInstance;
    const event = buildEvent('LOGIN_SUCCESS', '550e8400-e29b-41d4-a716-446655440099');

    expect(component.trackById(0, event)).toBe('550e8400-e29b-41d4-a716-446655440099');
  });
});
