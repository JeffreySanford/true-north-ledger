import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TimelineRailComponent } from './timeline-rail.component';

describe('TimelineRailComponent', () => {
  it('renders timeline entries and status text variants', async () => {
    await TestBed.configureTestingModule({
      declarations: [TimelineRailComponent],
      imports: [CommonModule],
    }).compileComponents();

    const fixture = TestBed.createComponent(TimelineRailComponent);
    fixture.componentRef.setInput('title', 'Verification timeline');
    fixture.componentRef.setInput('entries', [
      { title: 'Session started', timestamp: '09:30', state: 'done' },
      { title: 'Proof check running', timestamp: '09:31', state: 'current' },
      { title: 'Role sync blocked', timestamp: '09:32', state: 'blocked' },
      { title: 'Archive snapshot', timestamp: '09:33', state: 'upcoming' },
    ]);
    fixture.detectChanges();

    const rail = fixture.nativeElement.querySelector('[data-testid="timeline-rail"]') as HTMLElement;

    expect(rail.getAttribute('aria-label')).toBe('Verification timeline: 4 entries');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="timeline-rail-entry"]')).toHaveLength(4);
    expect(rail.textContent).toContain('Session started');
    expect(rail.textContent).toContain('Done');
    expect(rail.textContent).toContain('Proof check running');
    expect(rail.textContent).toContain('Current');
    expect(rail.textContent).toContain('Role sync blocked');
    expect(rail.textContent).toContain('Blocked');
    expect(rail.textContent).toContain('Archive snapshot');
    expect(rail.textContent).toContain('Upcoming');
  });
});
