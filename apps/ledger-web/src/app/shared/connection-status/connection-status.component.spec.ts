import { TestBed } from '@angular/core/testing';
import { ConnectionStatusComponent } from './connection-status.component';

describe('ConnectionStatusComponent', () => {
  it('renders connection state, detail text, and an accessible state label', async () => {
    await TestBed.configureTestingModule({
      declarations: [ConnectionStatusComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ConnectionStatusComponent);
    fixture.componentRef.setInput('label', 'API');
    fixture.componentRef.setInput('state', 'connected');
    fixture.componentRef.setInput('detail', 'Development API reachable');
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.tnl-connection-status') as HTMLElement;

    expect(status.textContent).toContain('API');
    expect(status.textContent).toContain('Connected');
    expect(status.textContent).toContain('Development API reachable');
    expect(status.getAttribute('aria-label')).toBe('API: Connected. Development API reachable');
    expect(status.classList).toContain('tnl-connection-status--connected');
  });
});
