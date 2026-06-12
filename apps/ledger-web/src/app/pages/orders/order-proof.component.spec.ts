import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  OrderProof,
  OrderProofVerificationResponse,
} from '@true-north-ledger/order-contracts';
import { vi } from 'vitest';
import { OrderProofComponent } from './order-proof.component';
import { OrdersModule } from './orders.module';

const now = '2026-06-05T12:00:00.000Z';

function buildProof(): OrderProof {
  return {
    orderId: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'ORD-20260605-0001',
    correlationId: '44444444-4444-4444-8444-444444444444',
    generatedAt: now,
    generator: 'ledger-api',
    proofHash: 'hash-123',
    events: [
      {
        eventId: '55555555-5555-4555-8555-555555555555',
        eventType: 'ORDER_CREATED',
        orderId: '33333333-3333-4333-8333-333333333333',
        orderNumber: 'ORD-20260605-0001',
        correlationId: '44444444-4444-4444-8444-444444444444',
        actorMetadata: { customerId: 'customer-100' },
        status: 'pending',
        actorType: 'user',
        actorId: 'admin',
        result: 'accepted',
        timestamp: now,
      },
    ],
  };
}

describe('OrderProofComponent', () => {
  let fixture: ComponentFixture<OrderProofComponent>;
  let component: OrderProofComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersModule],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderProofComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders empty and loading proof states and requests generation', () => {
    const generateSpy = vi.fn();
    component.generate.subscribe(generateSpy);

    expect(fixture.nativeElement.textContent).toContain('Proof not generated');

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const generateButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(generateButton.textContent).toContain('Generating Proof');
    expect(generateButton.disabled).toBe(true);

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
    generateButton.click();
    expect(generateSpy).toHaveBeenCalled();
  });

  it.each([
    [{ valid: true, proofHash: 'hash-123', verifiedAt: now }, 'verified', 'Proof verified'],
    [{ valid: false, proofHash: 'hash-123', verifiedAt: now, reason: 'Proof mismatch' }, 'failed', 'Proof mismatch'],
  ] as [OrderProofVerificationResponse, string, string][])(
    'renders verification state %#',
    (verification, expectedState, expectedText) => {
      fixture.componentRef.setInput('proof', buildProof());
      fixture.componentRef.setInput('verification', verification);
      fixture.detectChanges();

      expect(component.proofState).toBe(expectedState);
      expect(fixture.nativeElement.textContent).toContain(expectedText);
      expect(fixture.nativeElement.textContent).toContain('ORDER_CREATED');
      const hashCard = (fixture.nativeElement as HTMLElement).querySelector('.tnl-proof-hash-card') as HTMLElement;
      expect(hashCard.classList).toContain(`tnl-proof-hash-card--${expectedState}`);
      expect(hashCard.getAttribute('aria-label')).toContain(expectedState === 'verified' ? 'Verified' : 'Failed');
    },
  );

  it('renders a pending proof hash card before verification', () => {
    fixture.componentRef.setInput('proof', buildProof());
    fixture.detectChanges();

    const hashCard = (fixture.nativeElement as HTMLElement).querySelector('.tnl-proof-hash-card') as HTMLElement;
    expect(component.proofState).toBe('pending');
    expect(hashCard.classList).toContain('tnl-proof-hash-card--pending');
    expect(hashCard.getAttribute('aria-label')).toContain('Pending');
    expect(fixture.nativeElement.querySelector('[data-testid="proof-verification-result"]')).toBeNull();
  });

  it('emits verification and copies proof JSON', async () => {
    const verifySpy = vi.fn();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    component.verify.subscribe(verifySpy);
    fixture.componentRef.setInput('proof', buildProof());
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Verify Proof'))?.click();
    await component.copyProof();

    expect(verifySpy).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(component.proofJson);
    expect(component.actionMessage).toBe('Proof copied');
  });

  it('downloads generated proof JSON', () => {
    fixture.componentRef.setInput('proof', buildProof());
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:proof');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    });

    try {
      component.downloadProof();

      expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:proof');
      expect(component.actionMessage).toBe('Proof downloaded');
    } finally {
      createElementSpy.mockRestore();
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
    }
  });
});
