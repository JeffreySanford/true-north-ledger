import { TestBed } from '@angular/core/testing';
import { ConnectionStatusComponent } from './connection-status.component';

describe('ConnectionStatusComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConnectionStatusComponent],
    }).compileComponents();
  });

  it.each([
    ['connected', 'Connected'],
    ['connecting', 'Connecting'],
    ['disconnected', 'Disconnected'],
    ['failed', 'Failed'],
  ] as const)('renders %s connection state, detail text, and an accessible state label', (state, stateText) => {
    const fixture = TestBed.createComponent(ConnectionStatusComponent);
    fixture.componentRef.setInput('label', 'API');
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('detail', `${stateText} detail`);
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('[data-testid="connection-status"]') as HTMLElement;

    expect(status.textContent).toContain('API');
    expect(status.textContent).toContain(stateText);
    expect(status.textContent).toContain(`${stateText} detail`);
    expect(status.getAttribute('aria-label')).toBe(`API: ${stateText}. ${stateText} detail`);
    expect(status.classList).toContain(`tnl-connection-status--${state}`);
  });
});
