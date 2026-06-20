import { TestBed } from '@angular/core/testing';
import { TrustSealComponent } from './trust-seal.component';

describe('TrustSealComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TrustSealComponent],
    }).compileComponents();
  });

  it.each([
    ['verified', 'Verified by ledger state', 'V'],
    ['pending', 'Verification pending', 'P'],
    ['failed', 'Verification failed', 'X'],
  ] as const)('renders %s server-derived verification text and accessible state', (state, stateText, icon) => {
    const fixture = TestBed.createComponent(TrustSealComponent);
    fixture.componentRef.setInput('label', 'Session');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const seal = fixture.nativeElement.querySelector('[data-testid="trust-seal"]') as HTMLElement;

    expect(seal.textContent).toContain('Session');
    expect(seal.textContent).toContain(stateText);
    expect(seal.textContent).toContain(icon);
    expect(seal.getAttribute('aria-label')).toBe(`Session: ${stateText}`);
    expect(seal.classList).toContain(`tnl-trust-seal--${state}`);
  });
});
