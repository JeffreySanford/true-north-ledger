import { TestBed } from '@angular/core/testing';
import { StatusChipComponent } from './status-chip.component';

describe('StatusChipComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StatusChipComponent],
    }).compileComponents();
  });

  it.each([
    ['info', 'Route ready'],
    ['success', 'Verified'],
    ['warning', 'Needs review'],
    ['error', 'Blocked'],
    ['neutral', 'Queued'],
  ] as const)('renders %s tone with non-color state text and accessible state name', (tone, stateText) => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('label', 'Ledger chain');
    fixture.componentRef.setInput('stateText', stateText);
    fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('[data-testid="status-chip"]') as HTMLElement;

    expect(chip.textContent).toContain('Ledger chain');
    expect(chip.textContent).toContain(stateText);
    expect(chip.getAttribute('aria-label')).toBe(`Ledger chain: ${stateText}`);
    expect(chip.classList).toContain(`tnl-status-chip--${tone}`);
  });
});
