import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Route, RouterModule } from '@angular/router';
import { TabletReceivingComponent } from './tablet-receiving.component';

const routes: Route[] = [{ path: '', component: TabletReceivingComponent }];

@NgModule({
  declarations: [TabletReceivingComponent],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class TabletReceivingModule {}
