import { TestBed } from '@angular/core/testing';
import { ProofHashCardComponent } from './proof-hash-card.component';

describe('ProofHashCardComponent', () => {
  it('renders proof hash summary with verified state text and aria label', async () => {
    await TestBed.configureTestingModule({
      declarations: [ProofHashCardComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProofHashCardComponent);
    fixture.componentRef.setInput('label', 'Proof integrity');
    fixture.componentRef.setInput('algorithm', 'SHA-256');
    fixture.componentRef.setInput('hash', 'abc123');
    fixture.componentRef.setInput('state', 'verified');
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.tnl-proof-hash-card') as HTMLElement;

    expect(card.textContent).toContain('Proof integrity');
    expect(card.textContent).toContain('Verified');
    expect(card.textContent).toContain('SHA-256');
    expect(card.textContent).toContain('abc123');
    expect(card.getAttribute('aria-label')).toBe('Proof integrity: Verified. SHA-256 abc123.');
  });

  it('renders pending and failed state variants', async () => {
    await TestBed.configureTestingModule({
      declarations: [ProofHashCardComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProofHashCardComponent);
    fixture.componentRef.setInput('hash', 'def456');
    fixture.componentRef.setInput('state', 'pending');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pending');

    fixture.componentRef.setInput('state', 'failed');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Failed');
  });
});
