import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { DevicesComponent } from './devices.component';

const routes: Route[] = [{ path: '', component: DevicesComponent }];

@NgModule({
  declarations: [DevicesComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class DevicesModule {}
