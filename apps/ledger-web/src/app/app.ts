import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'tnl-root',
  imports: [RouterModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {
  protected title = 'ledger-web';
}
