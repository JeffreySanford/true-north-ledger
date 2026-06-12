import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { OrderTimelineEvent } from '@true-north-ledger/order-contracts';
import { OrderTimelineComponent } from './order-timeline.component';
import { OrdersModule } from './orders.module';

const now = '2026-06-05T12:00:00.000Z';

function buildEvent(overrides: Partial<OrderTimelineEvent> = {}): OrderTimelineEvent {
  return {
    eventId: '55555555-5555-4555-8555-555555555555',
    eventType: 'ORDER_STATUS_CHANGED',
    orderId: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'ORD-20260605-0001',
    correlationId: '44444444-4444-4444-8444-444444444444',
    actorMetadata: { customerId: 'customer-100' },
    previousStatus: 'pending',
    status: 'confirmed',
    reason: 'Moved to confirmed',
    actorType: 'user',
    actorId: 'admin',
    result: 'accepted',
    timestamp: now,
    ...overrides,
  };
}

describe('OrderTimelineComponent', () => {
  let fixture: ComponentFixture<OrderTimelineComponent>;
  let component: OrderTimelineComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersModule],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderTimelineComponent);
    component = fixture.componentInstance;
    component.events = [buildEvent()];
    component.currentStatus = 'confirmed';
    fixture.detectChanges();
  });

  it('renders the current timeline event with accessible state text', () => {
    const root = fixture.nativeElement as HTMLElement;
    const event = root.querySelector('[data-testid="order-timeline-event"]') as HTMLElement;

    expect(event.classList).toContain('order-timeline__event--current');
    expect(event.getAttribute('aria-label')).toContain('Status confirmed');
    expect(root.textContent).toContain('ORDER_STATUS_CHANGED');
    expect(root.textContent).toContain('Moved to confirmed');
    expect(root.querySelector('.tnl-ledger-event-card')?.getAttribute('aria-label')).toContain('ORDER_STATUS_CHANGED: Accepted');
    expect(root.querySelector('.tnl-timeline-rail')?.getAttribute('aria-label')).toBe('Order ledger milestones: 1 entries');
  });

  it('expands and collapses event details', async () => {
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button') as HTMLButtonElement;

    expect(root.querySelector('[data-testid="order-timeline-details"]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="order-timeline-details"]')?.textContent).toContain('44444444-4444-4444-8444-444444444444');
    expect(root.querySelector('[data-testid="order-timeline-details"]')?.textContent).toContain('customer-100');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="order-timeline-details"]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders a decorative connector between each pair of timeline events', () => {
    const timelineFixture = TestBed.createComponent(OrderTimelineComponent);
    timelineFixture.componentInstance.events = [
      buildEvent(),
      buildEvent({
        eventId: '66666666-6666-4666-8666-666666666666',
        previousStatus: 'confirmed',
        status: 'processing',
      }),
      buildEvent({
        eventId: '77777777-7777-4777-8777-777777777777',
        previousStatus: 'processing',
        status: 'shipped',
      }),
    ];
    timelineFixture.detectChanges();

    const root = timelineFixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="order-timeline-event"]')).toHaveLength(3);
    expect(root.querySelectorAll('[data-testid="order-timeline-connector"]')).toHaveLength(2);
    expect(root.querySelector('.order-timeline__track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('maps accepted, current, and rejected events into shared timeline rail and event cards', () => {
    const timelineFixture = TestBed.createComponent(OrderTimelineComponent);
    timelineFixture.componentInstance.currentStatus = 'processing';
    timelineFixture.componentInstance.events = [
      buildEvent({ status: 'confirmed' }),
      buildEvent({
        eventId: '66666666-6666-4666-8666-666666666666',
        previousStatus: 'confirmed',
        status: 'processing',
      }),
      buildEvent({
        eventId: '77777777-7777-4777-8777-777777777777',
        status: 'failed',
        result: 'rejected',
      }),
    ];
    timelineFixture.detectChanges();

    const root = timelineFixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.tnl-timeline-rail__entry--done')).toHaveLength(1);
    expect(root.querySelectorAll('.tnl-timeline-rail__entry--current')).toHaveLength(1);
    expect(root.querySelectorAll('.tnl-timeline-rail__entry--blocked')).toHaveLength(1);
    expect(root.querySelectorAll('.tnl-ledger-event-card')).toHaveLength(3);
    expect(root.querySelector('.tnl-ledger-event-card--rejected')?.textContent).toContain('Rejected');
  });

  it('uses zero-duration entry and detail animations when reduced motion is preferred', () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });

    try {
      const reducedMotionFixture = TestBed.createComponent(OrderTimelineComponent);
      const reducedMotionComponent = reducedMotionFixture.componentInstance as unknown as {
        motionTimings: { cardDuration: string; expandDuration: string; collapseDuration: string };
      };

      expect(reducedMotionComponent.motionTimings).toMatchObject({
        cardDuration: '0ms',
        expandDuration: '0ms',
        collapseDuration: '0ms',
      });
    } finally {
      if (originalMatchMedia) {
        Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      } else {
        delete (window as Partial<Window>).matchMedia;
      }
    }
  });
});
