import { TestBed } from '@angular/core/testing';
import { TrustSealComponent } from './trust-seal.component';

describe('TrustSealComponent', () => {
  it('renders server-derived verification text and accessible state', async () => {
    await TestBed.configureTestingModule({
      declarations: [TrustSealComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TrustSealComponent);
    fixture.componentRef.setInput('label', 'Session');
    fixture.componentRef.setInput('state', 'verified');
    fixture.detectChanges();

    const seal = fixture.nativeElement.querySelector('.tnl-trust-seal') as HTMLElement;

    expect(seal.textContent).toContain('Session');
    expect(seal.textContent).toContain('Verified by ledger state');
    expect(seal.getAttribute('aria-label')).toBe('Session: Verified by ledger state');
    expect(seal.classList).toContain('tnl-trust-seal--verified');
  });
});
