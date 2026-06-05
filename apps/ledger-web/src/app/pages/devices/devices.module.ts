import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Route } from '@angular/router';
import { VisualPrimitivesModule } from '../../shared/visual-primitives.module';
import { DeviceDetailComponent } from './device-detail.component';
import { DeviceRegistrationComponent } from './device-registration.component';
import { DeviceStatusComponent } from './device-status.component';
import { DevicesComponent } from './devices.component';

const routes: Route[] = [
  { path: '', component: DevicesComponent },
  { path: ':id', component: DeviceDetailComponent },
];

@NgModule({
  declarations: [DevicesComponent, DeviceDetailComponent, DeviceRegistrationComponent, DeviceStatusComponent],
  imports: [CommonModule, ReactiveFormsModule, VisualPrimitivesModule, RouterModule.forChild(routes)],
})
export class DevicesModule {}
