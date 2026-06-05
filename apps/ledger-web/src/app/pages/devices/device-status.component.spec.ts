/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device, LedgerEventResponse } from '@true-north-ledger/shared-models';
import { DeviceStatusComponent } from './device-status.component';

const now = '2026-06-04T12:00:00.000Z';

function buildDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Receiving scanner',
    type: 'scanner',
    tenantId: '00000000-0000-0000-0000-000000000000',
    status: 'active',
    permissions: ['device.heartbeat.write'],
    metadata: {},
    lastSeenAt: now,
    online: true,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    heartbeatFailureCount: 0,
    autoSuspendedAt: null,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<LedgerEventResponse> = {}): LedgerEventResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'DEVICE_LEDGER_EVENT',
    actorType: 'user',
    actorId: 'admin',
    subjectType: 'device',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    deviceId: '550e8400-e29b-41d4-a716-446655440000',
    deviceType: 'scanner',
    payload: { action: 'DEVICE_STATUS_CHANGED', status: 'suspended' },
    metadata: {
      tenantId: '00000000-0000-0000-0000-000000000000',
      requestId: 'request-1',
      correlationId: 'correlation-1',
      userAgent: 'vitest',
      payloadHash: 'payload-hash',
      eventHash: 'event-hash',
      chainSequence: 1,
      result: 'accepted',
      timestamp: now,
    },
    createdAt: now,
    ...overrides,
  };
}

describe('DeviceStatusComponent', () => {
  let fixture: ComponentFixture<DeviceStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DeviceStatusComponent],
      imports: [CommonModule],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceStatusComponent);
    fixture.componentInstance.device = buildDevice();
    fixture.componentInstance.events = [buildEvent()];
  });

  it('renders status controls, warning text, and audit trail', () => {
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Status');
    expect(root.textContent).toContain('Suspended and revoked devices cannot authenticate');
    expect(root.textContent).toContain('Status audit trail');
    expect(root.textContent).toContain('DEVICE_STATUS_CHANGED');
    expect(root.textContent).toContain('suspended');
  });

  it('confirms before emitting a critical status change', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const emitSpy = vi.spyOn(fixture.componentInstance.statusChange, 'emit');

    fixture.componentInstance.requestStatusChange('suspended');

    expect(confirmSpy).toHaveBeenCalledWith(
      'Change Receiving scanner to suspended? Device-key access will be blocked.',
    );
    expect(emitSpy).toHaveBeenCalledWith('suspended');
  });

  it('does not emit status changes when confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const emitSpy = vi.spyOn(fixture.componentInstance.statusChange, 'emit');

    fixture.componentInstance.requestStatusChange('suspended');

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('emits revoke requests and disables controls for revoked devices', () => {
    const emitSpy = vi.spyOn(fixture.componentInstance.revokeDevice, 'emit');
    fixture.componentInstance.requestRevocation();
    expect(emitSpy).toHaveBeenCalledOnce();

    fixture.componentInstance.device = buildDevice({ status: 'revoked', online: false });
    fixture.detectChanges();

    expect(((fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement).disabled).toBe(true);
    expect(((fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
