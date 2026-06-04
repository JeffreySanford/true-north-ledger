import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Route, RouterModule } from '@angular/router';
import { MobileScanComponent } from './mobile-scan.component';

const routes: Route[] = [{ path: '', component: MobileScanComponent }];

@NgModule({
  declarations: [MobileScanComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class MobileScanModule {}
