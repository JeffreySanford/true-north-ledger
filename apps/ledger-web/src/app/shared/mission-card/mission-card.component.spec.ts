import { TestBed } from '@angular/core/testing';
import { MissionCardComponent } from './mission-card.component';

describe('MissionCardComponent', () => {
  it('renders mission state and state source text accessibly', async () => {
    await TestBed.configureTestingModule({
      declarations: [MissionCardComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(MissionCardComponent);
    fixture.componentRef.setInput('title', 'Verify your first ledger event');
    fixture.componentRef.setInput('description', 'Review the latest chain verification result.');
    fixture.componentRef.setInput('state', 'ready');
    fixture.componentRef.setInput('sourceText', 'Derived from ledger API state');
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.tnl-mission-card') as HTMLElement;

    expect(card.textContent).toContain('Verify your first ledger event');
    expect(card.textContent).toContain('Ready');
    expect(card.textContent).toContain('Derived from ledger API state');
    expect(card.getAttribute('aria-label')).toBe(
      'Verify your first ledger event: Ready. Derived from ledger API state',
    );
  });
});
