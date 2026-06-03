import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { SettingsComponent } from './settings.component';

const routes: Route[] = [{ path: '', component: SettingsComponent }];

@NgModule({
  declarations: [SettingsComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class SettingsModule {}
