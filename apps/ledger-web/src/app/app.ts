import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'tnl-root',
  imports: [RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'ledger-web';
}
