import { TestBed } from '@angular/core/testing';
import { StatusChipComponent } from './status-chip.component';

describe('StatusChipComponent', () => {
  it('renders label, non-color state text, and accessible state name', async () => {
    await TestBed.configureTestingModule({
      declarations: [StatusChipComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('label', 'Ledger chain');
    fixture.componentRef.setInput('stateText', 'Verified');
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.tnl-status-chip') as HTMLElement;

    expect(chip.textContent).toContain('Ledger chain');
    expect(chip.textContent).toContain('Verified');
    expect(chip.getAttribute('aria-label')).toBe('Ledger chain: Verified');
    expect(chip.classList).toContain('tnl-status-chip--success');
  });
});
