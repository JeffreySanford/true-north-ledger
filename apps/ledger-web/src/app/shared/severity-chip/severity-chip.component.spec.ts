import { TestBed } from '@angular/core/testing';
import { SeverityChipComponent } from './severity-chip.component';

describe('SeverityChipComponent', () => {
  it('renders severity level, message, and accessible non-color state', async () => {
    await TestBed.configureTestingModule({
      declarations: [SeverityChipComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(SeverityChipComponent);
    fixture.componentRef.setInput('level', 'warning');
    fixture.componentRef.setInput('message', 'Role setup incomplete');
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.tnl-severity-chip') as HTMLElement;

    expect(chip.textContent).toContain('Warning');
    expect(chip.textContent).toContain('Role setup incomplete');
    expect(chip.getAttribute('aria-label')).toBe('Warning: Role setup incomplete');
    expect(chip.classList).toContain('tnl-severity-chip--warning');
  });
});
