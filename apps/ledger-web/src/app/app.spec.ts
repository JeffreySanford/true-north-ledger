import { TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { App } from './app';
import { DashboardPage } from './dashboard.page';
import { LedgerEventsPage } from './ledger-events.page';
import { DevicesPage } from './devices.page';
import { ProofsPage } from './proofs.page';
import { SettingsPage } from './settings.page';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([]), DashboardPage, LedgerEventsPage, DevicesPage, ProofsPage, SettingsPage],
      declarations: [App],
    }).compileComponents();
  });

  it('should render the shell navigation and app title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="app-nav"]')).toBeTruthy();
    expect(compiled.textContent).toContain('True North Ledger');
  });
});
