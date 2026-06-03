# Coding Standards

## TypeScript Configuration

### Module Resolution

All TypeScript configurations must use modern module resolution strategies:

- **Libraries**: Use `moduleResolution: "bundler"` in `tsconfig.base.json`
- **Node.js Backend (NestJS)**: Use `moduleResolution: "nodenext"` in backend-specific configs
- **Never use deprecated options**: Avoid `moduleResolution: "node"` or `"node10"` which are deprecated as of TypeScript 5.0+

### Configuration Inheritance

- Define common settings in `tsconfig.base.json`
- Project-specific configs should extend the base and only override necessary options
- Avoid duplicating settings across multiple configuration files

## Asynchronous Patterns

### Strong Preference for Observables

**All libraries and applications (frontend and backend) should strongly prefer hot observables and subjects over promises and async/await patterns.**

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
- State management (using BehaviorSubject or ReplaySubject)

❌ **Avoid Promises/Async-Await for:**
- HTTP calls (use Observable directly)
- Service layer business logic
- Controller endpoints (NestJS supports Observable returns)
- Event handling

⚠️ **Exceptions (where Promises are acceptable):**
- Browser APIs that only support Promises (e.g., `crypto.subtle.digest`)
  - Wrap with `from()` operator when returning from a service method
- Third-party libraries that only provide Promise-based APIs
- One-off utility functions where observables add no value

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
it('should return data stream', async () => {
  const data = await firstValueFrom(service.findAll());
  expect(data).toEqual([...]);
});
```

## Schema Validation

All request and response payloads should be validated using shared Zod schemas from `@true-north-ledger/shared-models`.

See [API Design](../platform/api-design.md#schema-contracts) for details.
