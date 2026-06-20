import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ProgressRailComponent } from './progress-rail.component';

describe('ProgressRailComponent', () => {
  it('renders progress count and non-color state text for each step', async () => {
    await TestBed.configureTestingModule({
      declarations: [ProgressRailComponent],
      imports: [CommonModule],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProgressRailComponent);
    fixture.componentRef.setInput('title', 'Auth setup progress');
    fixture.componentRef.setInput('steps', [
      { label: 'Login created', state: 'complete' },
      { label: 'Roles seeded', state: 'current' },
      { label: 'Production token storage decided', state: 'pending' },
    ]);
    fixture.detectChanges();

    const rail = fixture.nativeElement.querySelector('[data-testid="progress-rail"]') as HTMLElement;

    expect(rail.getAttribute('aria-label')).toBe('Auth setup progress: 1 of 3 complete');
    expect(rail.textContent).toContain('1 of 3 complete');
    expect(rail.textContent).toContain('Login created');
    expect(rail.textContent).toContain('Complete');
    expect(rail.textContent).toContain('Roles seeded');
    expect(rail.textContent).toContain('Current');
    expect(rail.textContent).toContain('Production token storage decided');
    expect(rail.textContent).toContain('Pending');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="progress-rail-step"]')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('[data-testid="progress-rail-step"]')?.getAttribute('aria-label')).toBe('Login created: Complete');
  });
});
