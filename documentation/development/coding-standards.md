# Coding Standards

## TypeScript Configuration

### Module Resolution

All TypeScript configurations must use modern module resolution strategies:

- **Frontend applications**: Use `moduleResolution: "bundler"` in app-specific tsconfig files for Angular applications
- **Libraries**: Keep `moduleResolution: "node"` in shared/base configs when library targets require CommonJS or legacy module resolution
- **Node.js Backend (NestJS)**: Use `moduleResolution: "nodenext"` in backend-specific configs
- **Never use deprecated options**: Avoid `moduleResolution: "node"` or `"node10"` which are deprecated as of TypeScript 5.0+

### Configuration Inheritance

- Define common settings in `tsconfig.base.json`
- Project-specific configs should extend the base and only override necessary options
- Avoid duplicating settings across multiple configuration files

## Asynchronous Patterns

### Observable-First Runtime

**All libraries and applications must expose runtime data flow as Observables. Shared state should be hot and subject-backed. Promise conversion is an exception, not a default.**

#### Why Observables?

- **Composability**: RxJS operators enable declarative data transformations
- **Cancellation**: Observables can be unsubscribed, preventing memory leaks
- **Multiple values**: Observables handle streams of data, not just single values
- **Better error handling**: Centralized error handling with `catchError` operator
- **Framework alignment**: Angular uses observables extensively (HttpClient, Router, Forms)
- **Backend support**: NestJS natively supports returning Observables from controllers

#### When to Use Observables

✅ **Use Observables for:**
- HTTP requests (frontend and backend)
- Event streams and real-time data
- Service layer methods that fetch or manipulate data
- Any operation that might be cancelled
- Operations that emit multiple values over time
- State management using `BehaviorSubject`, `ReplaySubject`, or `Subject` with a public `asObservable()` stream
- NestJS controller return values

❌ **Avoid Promises/Async-Await for:**
- HTTP calls (use Observable directly)
- Service layer business logic
- Controller endpoints (NestJS supports Observable returns)
- Event handling
- Tests for Observable-returning services
- Converting Observables with `firstValueFrom` or `lastValueFrom`

⚠️ **Exceptions (where Promises are acceptable):**
- NestJS application bootstrap and shutdown hooks that are defined by the framework as Promise-based
- TypeORM migrations and transactions, because TypeORM exposes Promise-only APIs
- Playwright and Supertest tests, because those libraries are Promise-based
- Angular/Nest TestBed setup, because compile/init APIs are Promise-based
- Browser or third-party APIs that only support Promises

When a Promise-only API is required inside application code, isolate it at the boundary and return an Observable from the public method:

```typescript
return from(promiseOnlyLibraryCall()).pipe(
  map((result) => normalizeResult(result)),
  catchError((error) => throwError(() => error)),
);
```

New imports of `firstValueFrom` and `lastValueFrom` are blocked by ESLint. If a future case genuinely needs one, document the exception in the code review and update the rule narrowly.

> **Note:** Backend NestJS application source is linted to prevent `async` method declarations in `apps/ledger-api/src/app/**/*.ts`. Prefer `Observable<T>` return types and reserve `async` only for framework bootstrap, migrations, tests, or explicitly isolated promise boundaries.

> **Note:** ESLint can help prevent Promise conversion of observable streams, but it cannot reliably enforce when a service should use a hot `Subject`/`BehaviorSubject` versus a cold `Observable`. Use architecture review for that distinction.

#### Implementation Examples

**Frontend Service (Angular):**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private http: HttpClient) {}

  // ✅ GOOD: Returns Observable
  getData(): Observable<Data[]> {
    return this.http.get<Data[]>('/api/data').pipe(
      map(data => this.validateAndTransform(data)),
      catchError(error => {
        console.error('Failed to fetch data', error);
        return throwError(() => error);
      })
    );
  }

  // ❌ BAD: Don't use async/await with HttpClient
  async getDataBad(): Promise<Data[]> {
    return firstValueFrom(this.http.get<Data[]>('/api/data'));
  }
}
```

**Frontend Component:**

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({ /* ... */ })
export class MyComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  data: Data[] = [];

  constructor(private service: DataService) {}

  ngOnInit(): void {
    this.service.getData()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => this.data = data,
        error: (error) => console.error(error)
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

**Backend Service (NestJS):**

```typescript
import { Injectable } from '@nestjs/common';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class DataService {
  private dataSubject = new BehaviorSubject<Data[]>([]);
  public data$ = this.dataSubject.asObservable();

  // ✅ GOOD: Returns Observable
  findAll(): Observable<Data[]> {
    return this.data$;
  }

  // ✅ GOOD: Returns Observable
  create(dto: CreateDto): Observable<Data> {
    try {
      const newItem = this.processDto(dto);
      const current = this.dataSubject.value;
      this.dataSubject.next([...current, newItem]);
      return this.data$.pipe(map(() => newItem));
    } catch (error) {
      return throwError(() => error);
    }
  }
}
```

> **Note:** Hot observables and subjects are ideal for shared, evolving state or event streams. They are not required for every NestJS method. Prefer cold `Observable<T>` return values for normal request/response logic, and only use `BehaviorSubject` / `Subject` when you need a shared source that can emit over time.

**Backend Controller (NestJS):**

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller('data')
export class DataController {
  constructor(private service: DataService) {}

  // ✅ GOOD: NestJS automatically handles Observable responses
  @Get()
  findAll(): Observable<Data[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateDto): Observable<Data> {
    return this.service.create(dto);
  }
}
```

#### Subscription Management

Always clean up subscriptions to prevent memory leaks:

1. **In Components**: Use `takeUntil` with a destroy subject
2. **In Services**: Store subscriptions and unsubscribe in `onDestroy`
3. **Prefer**: Use the `async` pipe in templates when possible (auto-unsubscribes)

#### Testing Observables

**Frontend (Vitest/Jest):**

```typescript
it('should fetch data', (done) => {
  service.getData().subscribe({
    next: (data) => {
      expect(data).toEqual([...]);
      done();
    }
  });
});
```

**Backend (Jest):**

```typescript
it('should return data stream', (done) => {
  service.findAll().subscribe({
    next: (data) => {
      expect(data).toEqual([...]);
      done();
    },
    error: done,
  });
});
```

#### Angular Component and Module Structure

- Feature pages and UI components must be organized as folder-scoped NgModules, not standalone page components.
- Each page feature should have its own folder with:
  - `*.component.ts`
  - `*.component.html`
  - `*.component.scss`
  - `*.module.ts`
- Use `templateUrl` and `styleUrls` instead of inline `template` and `styles`.
- Keep page templates and styles in external files so the UI can be reviewed and styled independently of component logic.
- Prefer route-level lazy-loaded feature modules for pages instead of importing standalone components directly into route definitions.
- Root shell components may still bootstrap the application, but page-level routing should resolve through NgModules.

## Angular Styling and MD3 Foundation

Angular UI styling must start from the shared style foundation in `apps/ledger-web/src/styles/`.

### Style File Responsibilities

- `_colors.scss` - MD3-aligned semantic color tokens.
- `_vars.scss` - spacing, radii, typography, elevation, and layout tokens.
- `_mixins.scss` - reusable focus, surface, and control patterns.
- `_base.scss` - global document and element defaults.
- `_components.scss` - shared app shell, page, card, button, and list classes.
- `_material.scss` - Angular Material/CDK-compatible overrides for future Material components.

### Rules

- Prefer CSS custom properties from the shared token files over literal colors, spacing, shadows, or radii in component SCSS.
- Keep repeated UI classes global when they are shared by multiple pages. Component SCSS should handle only component-specific layout.
- Cards and controls should use `--tnl-radius-md` or smaller unless a design-system exception is documented.
- Do not add one-off Material overrides inside feature components. Add shared Material/CDK overrides in `_material.scss`.
- Keep focus states visible and shared through `_mixins.scss`.
- Avoid adding large component-level styles that push the Angular `anyComponentStyle` budget; move reusable styling into the shared style layer.

## Schema Validation

All request and response payloads should be validated using shared Zod schemas from `@true-north-ledger/shared-models`.

See [API Design](../platform/api-design.md#schema-contracts) for details.

## Secrets and Local Environment Files

- Never commit `.env`, `.env.development`, `.env.production`, or any other real `.env.*` file.
- Commit only safe template files such as `.env.example`; templates must contain variable names and placeholders only, never reusable sample secrets.
- Runtime code must fail fast when required secrets are missing. Do not add fallback JWT secrets, database passwords, PgAdmin passwords, service tokens, or device tokens.
- Tests may generate ephemeral secrets in process. Do not hardcode reusable test signing keys.
- CI secrets must come from the repository or deployment secret store. Do not hardcode CI database passwords or JWT signing keys in workflow YAML.
- Rotate local development secrets after any secret-scanner alert, even when the exposed values are believed to be samples.
