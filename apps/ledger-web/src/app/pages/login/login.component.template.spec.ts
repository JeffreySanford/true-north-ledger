/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LoginComponent } from './login.component';
import { AuthService } from '../../auth.service';

const testBedPlatform = TestBed as unknown as { platform?: unknown };
if (!testBedPlatform.platform) {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}

describe('LoginComponent template', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: vi.fn(() => of({})),
            setRememberSession: vi.fn(),
            getRedirectUrl: vi.fn(() => null),
            clearRedirectUrl: vi.fn(),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(),
            navigateByUrl: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders forgot password placeholder link for PI-2', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const placeholder = root.querySelector('[data-testid="forgot-password-placeholder"]') as HTMLElement;
    const link = placeholder.querySelector('a') as HTMLAnchorElement;
    const rememberCheckbox = root.querySelector('input[formControlName="rememberMe"]') as HTMLInputElement;

    expect(placeholder.textContent).toContain('Forgot password?');
    expect(placeholder.textContent).toContain('Coming in PI-2.');
    expect(link.getAttribute('href')).toBe('/login#forgot-password');
    expect(rememberCheckbox).toBeTruthy();
    expect(rememberCheckbox.checked).toBe(false);
  });
});
