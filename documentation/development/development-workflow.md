# Development Workflow

## Package Manager

Use pnpm.

```sh
pnpm install
```

## Nx Commands

List projects:

```sh
pnpm nx show projects
```

Run the Angular app:

```sh
pnpm start:web
```

Run the API:

```sh
pnpm start:api
```

Start infrastructure and applications:

```sh
pnpm start:all
```

Start infrastructure only:

```sh
pnpm docker:up
```

Stop infrastructure:

```sh
pnpm docker:down
```

Swagger UI:

```sh
http://localhost:3000/api/docs
```

Quality gates:

```sh
pnpm nx run-many -t lint
pnpm nx run-many -t test
pnpm nx run-many -t build
pnpm nx e2e ledger-web-e2e
```

View the project graph:

```sh
pnpm nx graph
```

## Current Projects

The current Nx projects are:

- `ledger-web`
- `ledger-web-e2e`
- `ledger-api`
- `shared-models`
- `ledger-contracts`
- `auth-contracts`
- `device-contracts`
- `audit-contracts`

Angular is now bootstrapped with standalone application APIs. New Angular routes should prefer standalone components and route-level providers where practical.
