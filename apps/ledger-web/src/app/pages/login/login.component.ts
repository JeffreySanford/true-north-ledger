import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'tnl-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})

export class LoginComponent {
  protected readonly form = new FormGroup({
    username: new FormControl('', Validators.required),
    password: new FormControl('', Validators.required),
    rememberMe: new FormControl(false),
  });
  protected errorMessage = '';
  protected isSubmitting = false;
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.errorMessage = 'Please enter a username and password.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const username = this.form.get('username')?.value ?? '';
    const password = this.form.get('password')?.value ?? '';
    const rememberMe = this.form.get('rememberMe')?.value === true;
    this.authService.setRememberSession(rememberMe);

    this.authService.login({ username, password }).subscribe({
      next: () => {
        const redirectUrl = this.authService.getRedirectUrl();
        if (redirectUrl) {
          this.authService.clearRedirectUrl();
          this.router.navigateByUrl(redirectUrl);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (error) => {
        this.errorMessage = error.message || 'Login failed';
        this.isSubmitting = false;
      },
    });
  }
}
