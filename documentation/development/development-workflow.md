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
pnpm nx serve ledger-web
```

Build:

```sh
pnpm nx build ledger-web
```

Lint:

```sh
pnpm nx lint ledger-web
```

Unit tests:

```sh
pnpm nx test ledger-web
```

E2E tests:

```sh
pnpm nx e2e ledger-web-e2e
```

View the project graph:

```sh
pnpm nx graph
```

## Generator Notes

Angular was generated module-based with `standalone: false`.

Recommended next generators:

```sh
pnpm nx g @nx/nest:app apps/ledger-api --frontendProject=ledger-web
pnpm nx g @nx/js:lib libs/shared-models
pnpm nx g @nx/js:lib libs/ledger-contracts
pnpm nx g @nx/js:lib libs/auth-contracts
pnpm nx g @nx/js:lib libs/device-contracts
pnpm nx g @nx/js:lib libs/audit-contracts
```

## Current Caution

The previous Angular generation completed successfully, then appears to have been attempted a second time. The second failure only reported that `apps/ledger-web` already exists.

The current Nx projects are:

- `ledger-web`
- `ledger-web-e2e`
