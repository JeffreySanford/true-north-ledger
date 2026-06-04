import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { UnauthorizedComponent } from './unauthorized.component';

const routes: Route[] = [{ path: '', component: UnauthorizedComponent }];

@NgModule({
  imports: [CommonModule, RouterModule.forChild(routes)],
  declarations: [UnauthorizedComponent],
})
export class UnauthorizedModule {}
