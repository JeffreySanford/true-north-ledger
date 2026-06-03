import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { App } from './app';
import { appRoutes } from './app.routes';
import { DashboardPage } from './dashboard.page';
import { LedgerEventsPage } from './ledger-events.page';
import { DevicesPage } from './devices.page';
import { ProofsPage } from './proofs.page';
import { SettingsPage } from './settings.page';

@NgModule({
  declarations: [App],
  imports: [
    BrowserModule,
    HttpClientModule,
    RouterModule.forRoot(appRoutes),
    DashboardPage,
    LedgerEventsPage,
    DevicesPage,
    ProofsPage,
    SettingsPage,
  ],
  bootstrap: [App],
})
export class AppModule {}
