import { TestBed } from '@angular/core/testing';
import { LedgerEventCardComponent } from './ledger-event-card.component';

describe('LedgerEventCardComponent', () => {
  it('renders audit event fields and accessible result state', async () => {
    await TestBed.configureTestingModule({
      declarations: [LedgerEventCardComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(LedgerEventCardComponent);
    fixture.componentRef.setInput('eventType', 'LOGIN_SUCCESS');
    fixture.componentRef.setInput('actor', 'admin');
    fixture.componentRef.setInput('subject', 'session');
    fixture.componentRef.setInput('hash', 'abc123');
    fixture.componentRef.setInput('timestamp', '2026-06-04T00:00:00.000Z');
    fixture.componentRef.setInput('result', 'accepted');
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="ledger-event-card"]') as HTMLElement;

    expect(card.textContent).toContain('LOGIN_SUCCESS');
    expect(card.textContent).toContain('Accepted');
    expect(card.textContent).toContain('admin');
    expect(card.textContent).toContain('session');
    expect(card.textContent).toContain('abc123');
    expect(card.getAttribute('aria-label')).toBe(
      'LOGIN_SUCCESS: Accepted. Actor admin. Subject session. Hash abc123.',
    );
  });
});
