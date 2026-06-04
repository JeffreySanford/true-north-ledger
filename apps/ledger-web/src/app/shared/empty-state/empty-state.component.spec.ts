import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  it('renders accessible empty state copy without relying on icon-only meaning', async () => {
    await TestBed.configureTestingModule({
      declarations: [EmptyStateComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('icon', 'task_alt');
    fixture.componentRef.setInput('title', 'No missions yet');
    fixture.componentRef.setInput('message', 'Verified setup tasks will appear here.');
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('[data-testid="empty-state"]') as HTMLElement;

    expect(emptyState.getAttribute('aria-label')).toBe('No missions yet');
    expect(emptyState.textContent).toContain('No missions yet');
    expect(emptyState.textContent).toContain('Verified setup tasks will appear here.');
  });
});
