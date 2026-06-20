import { TestBed } from '@angular/core/testing';
import { SeverityChipComponent } from './severity-chip.component';

describe('SeverityChipComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SeverityChipComponent],
    }).compileComponents();
  });

  it.each([
    ['info', 'Info'],
    ['success', 'Success'],
    ['warning', 'Warning'],
    ['error', 'Error'],
    ['critical', 'Critical'],
  ] as const)('renders %s level, message, and accessible non-color state', (level, label) => {
    const fixture = TestBed.createComponent(SeverityChipComponent);
    const message = `${label} state message`;
    fixture.componentRef.setInput('level', level);
    fixture.componentRef.setInput('message', message);
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('[data-testid="severity-chip"]') as HTMLElement;

    expect(chip.textContent).toContain(label);
    expect(chip.textContent).toContain(message);
    expect(chip.getAttribute('aria-label')).toBe(`${label}: ${message}`);
    expect(chip.classList).toContain(`tnl-severity-chip--${level}`);
  });
});
