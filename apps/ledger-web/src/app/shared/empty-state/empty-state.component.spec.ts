import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EmptyStateComponent],
    }).compileComponents();
  });

  it.each([
    ['task_alt', 'T'],
    ['task', 'T'],
    ['info', 'I'],
    ['unknown', 'I'],
  ])('renders accessible empty state copy with %s icon fallback', (icon, glyph) => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('icon', icon);
    fixture.componentRef.setInput('title', 'No missions yet');
    fixture.componentRef.setInput('message', 'Verified setup tasks will appear here.');
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('[data-testid="empty-state"]') as HTMLElement;
    const iconElement = fixture.nativeElement.querySelector('.tnl-empty-state__icon') as HTMLElement;

    expect(emptyState.getAttribute('aria-label')).toBe('No missions yet');
    expect(emptyState.textContent).toContain('No missions yet');
    expect(emptyState.textContent).toContain('Verified setup tasks will appear here.');
    expect(iconElement.textContent?.trim()).toBe(glyph);
    expect(iconElement.getAttribute('aria-hidden')).toBe('true');
  });
});
