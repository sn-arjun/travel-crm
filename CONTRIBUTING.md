# Contributing to TravelCRM Pro

How to change this codebase as it is today. For setup and the commands to run the product, start with [README.md](README.md).

## Ground rules

- **One npm workspace, installed from the root.** Run `npm ci` at the repository root only. Never run `npm install` or `npm ci` inside `backend/` or `super-admin/`. `node scripts/fresh-clone-check.mjs` proves a clean setup still works; run it (after committing) when you touch dependencies or scripts.
- **Never weaken or skip a test** to get green (no `.skip`, no looser assertions, no raised baselines). Fix the cause. Counts of passing tests only go up.
- **No paid calls in tests or routine runs.** Tests mock providers. Never start the local stack with `--ai` except to record an AI feature on purpose, because that uses billed Workers AI.
- **No secrets in the repository.** Examples hold names only (see "Environment variables" below). `backend/.dev.vars` is gitignored.
- **Do not edit generated files by hand:** `backend/.wrangler.*.toml` (from `scripts/gen-wrangler.mjs`) and `backend/src/db/tenant-migrations.generated.ts` (from `npm -w travelcrm-api run db:bundle-tenant`).

## Conventions

- **IDs are UUIDv7.** In the backend use `generateId()` from `backend/src/utils/uuid.ts`. Never `crypto.randomUUID()`.
- **D1 (SQLite) types:** dates and timestamps are `TEXT` in ISO 8601, money is `REAL`, JSON is `TEXT`, booleans are `INTEGER` (0/1). Use `sqliteTable` from `drizzle-orm/sqlite-core`.
- **API shape:** responses go through `backend/src/utils/response.ts` (`success`, `created`, `paginated`, `error`, `notFound`). Request bodies and queries are validated with zod through `zValidator` from `backend/src/utils/validator.ts`.
- **Every outbound message** (email, WhatsApp, SMS) goes through the Communication Hub (`POST /api/v1/communications/send`). In the desktop app use `SendMessageDialog` (`desktop/src/components/communication/send-message-dialog.tsx`), which handles the template picker and preview. Never `mailto:` or `wa.me` links.
- **Desktop UI follows [desktop/audit/remake/CONTRACT.md](desktop/audit/remake/CONTRACT.md)** (import paths, props, archetypes). The rules that matter most:
  - Lists: `ListPage` (search + `FilterBar`), infinite scroll (`useInfiniteScroll`), row actions, a detail drawer or page, an empty state and skeleton loading.
  - Forms: `EntityForm`. Relations are picked with a searchable `RelationCombobox` / `Combobox`, never a raw ID input. Forms prefill from URL parameters (`prefillFromParams`) and edit forms prefill existing values.
  - Phone fields use `PhoneInput`; address fields use `AddressAutocomplete` and fall back to plain inputs without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
  - Anything that depends on an environment key or a plan feature must degrade (disabled state, manual fallback, explanation), never crash.
- **Plans and limits belong to the backend.** The UI anticipates them (`useFeatureGate`), the server enforces them.

## Adding a feature, end to end

The reference feature is **leads**. Open these files and copy their shape:

| Layer | Leads example |
|---|---|
| Schema | `backend/src/db/tenant-schema.ts` (`leads`) |
| Route | `backend/src/routes/leads.ts`, mounted in `backend/src/index.ts` (`routeMounts`) |
| Backend tests | `backend/test/crud-lifecycle.test.ts` (login, create, read, update, delete through the Worker) |
| API client | `desktop/src/lib/api/leads.ts` + `leads.test.ts`; endpoint paths in `desktop/src/lib/api/config.ts`; exported from `desktop/src/lib/api/index.ts` |
| Pages | `desktop/src/app/(app)/leads/` (`page.tsx` list, `new/page.tsx` form, `[id]/` detail) |
| End to end | `desktop/e2e/leads.spec.ts` |

### 1. Schema and migration

1. Add or change the table in `backend/src/db/tenant-schema.ts` (agency data) or `backend/src/db/master-schema.ts` (platform data: agencies, plans, subscriptions).
2. Create the migration. Agency migrations go in `backend/drizzle/tenant/`, platform ones in `backend/drizzle/master/`, numbered one higher than the last file (check the folder; `drizzle-kit generate` via `npm -w travelcrm-api run db:generate` proposes the SQL and the `meta/` snapshot). Keep it additive and safe to run on a database with data. A short comment at the top says why.
3. **Re-run the bundle after adding a tenant migration:** `npm -w travelcrm-api run db:bundle-tenant`. It rewrites `backend/src/db/tenant-migrations.generated.ts`, which new agency databases are built from, and `backend/test/tenant-migrations-bundle.test.ts` fails if you forget.
4. SQL files must stay LF. `.gitattributes` enforces it for `backend/drizzle/**/*.sql`; do not convert them to CRLF.
5. Apply locally with `node desktop/scripts/fix-stack.mjs up --slot 1 --reset-db` (it migrates and seeds), or `npm run db:migrate`.

### 2. Backend route

In `backend/src/routes/<feature>.ts` (a `Hono<AppContext>` router, as in `leads.ts`):

- **Validate** every body and query with a zod schema through `zValidator`.
- **Permissions:** `requirePermission('<module>', 'view' | 'create' | 'edit' | 'delete')` on each handler. Modules and the role matrix are in `backend/src/constants/permissions.ts`; add a new module there.
- **Plan gating:** `requireFeature('<feature_key>')` (`backend/src/middleware/feature-gate.ts`) for features a plan includes or excludes; plan features live in the plan catalogue (`plan_features`, master migration `0015_plan_catalogue.sql` and later). `checkUsageCap(...)` (`middleware/usage-cap.ts`) caps counted usage.
- **Agency data** is read through the request's tenant database (`c.get('tenantDb')`), never `MASTER_DB`. Use `c.get('tenantId')` and `c.get('userId')`; do not trust ids from the body for isolation.
- Log user-visible changes with `logActivity` (`utils/activity-logger.ts`); for lead-like entities also the entity's own activity log.
- Mount the router in `routeMounts` in `backend/src/index.ts`.

Metered things have their own rules:

- **AI:** call models only through `AIRouter` (`backend/src/services/ai-router.ts`). It checks and charges the agency's monthly **AI credits** (`assertCredits` / `chargeCredits` in `services/ai-credits.ts`). A new AI task needs a credit class in `services/ai-pricing.ts` (`creditClassFor`: read 1, understand 5, scan 15, create 60 credits). When credits run out the API answers 429 `AI_QUOTA_EXCEEDED`, and the UI shows the allowance dialog. If no AI binding is available the route answers 503 `AI_UNAVAILABLE` (`utils/ai-unavailable.ts`).
- **SMS, WhatsApp, login codes, call minutes:** go through the metering service (`services/metering/meter.ts`); an agency over its cap gets 402 `ALLOWANCE_EXHAUSTED` and the provider is not called.

### 3. Automation recipes (optional)

Assistant automations are recipes in `backend/src/services/automation/recipes.ts` (type `Recipe` in `services/automation/types.ts`): a key, trigger events, a default mode (`suggest` or `auto`; `auto` only for low-risk actions), optional settings and an `evaluate` function that returns proposals. Add your recipe to the `RECIPES` array. Emit the domain event from your route with `emitFromRequest` (`services/automation/events.ts`). Add cases to `backend/test/automation-recipes.test.ts`. Recipes that use AI set `usesAi` and must work (without AI) when credits are exhausted.

### 4. Backend tests

Tests run in the Workers runtime with `@cloudflare/vitest-pool-workers` (`import { env, createExecutionContext } from 'cloudflare:test'`). Migrations are applied for you and the test-only secrets are in `backend/vitest.config.ts`; you need no `.dev.vars`. Cover: happy path, validation errors (400), permission denied (403), plan gating, and that another agency cannot read the record. Run:

```bash
cd backend && npx tsc --noEmit && npx vitest run
```

### 5. Desktop API client

Add the endpoints to `desktop/src/lib/api/config.ts`, a typed client in `desktop/src/lib/api/<feature>.ts` using `client` from `./client` (unwrap with `envelope.ts` helpers as `leads.ts` does), export it from `index.ts`, and add a unit test next to it. Shared types go in `packages/shared-ts` (then `npm -w @travelcrm/shared run build`).

### 6. Desktop pages

Under `desktop/src/app/(app)/<feature>/`: a list page (`ListPage` with filters, infinite scroll, export, row actions), a form page (`EntityForm`, `RelationCombobox` for relations, `PhoneInput`, `AddressAutocomplete`), and a detail page (`DetailPage`). Use `SendMessageDialog` for messaging and `useFeatureGate` for plan-gated parts. Add a sidebar entry in `desktop/src/components/layout/sidebar.tsx` and gate it with `usePermissions` (`desktop/src/hooks/use-permission.ts`). Show real values on the detail page that were entered in the form.

### 7. End-to-end spec

Add `desktop/e2e/<feature>.spec.ts` using `./fixtures` and the helpers in `desktop/e2e/helpers/` (`api-seed.ts` seeds data through the API). Cover create from the form, list, detail, edit with prefilled values, and delete. Run against a local stack:

```bash
node desktop/scripts/fix-stack.mjs up --slot 1 --reset-db
cd desktop
E2E_BASE_URL=http://localhost:3110 E2E_API_URL=http://localhost:8797/api/v1 npx playwright test e2e/<feature>.spec.ts
node scripts/fix-stack.mjs down --slot 1
```

### 8. Before you commit

```bash
cd backend && npx tsc --noEmit && npx vitest run
cd ../desktop && npx tsc --noEmit && npx tsc -p electron/tsconfig.json --noEmit && npx vitest run && node scripts/lint-gate.mjs
```

`lint-gate.mjs` is a per-file ratchet against `desktop/audit/fix/lint-baseline.json`: new code must not add lint errors. For a UI change also run `npm run build:desktop` and the e2e specs for the screens you touched. If you change dependencies or scripts, finish with `node scripts/fresh-clone-check.mjs`.

## Other parts

- **Super admin console (`super-admin/`):** Next.js, signs in through `POST /api/v1/admin/auth/login` and talks to the backend's `/api/v1/admin/*` routes (`backend/src/routes/admin*.ts`, protected by `middleware/require-super-admin.ts`). Check it with `cd super-admin && npx tsc --noEmit && npm run lint && npm run build`. See `super-admin/README.md`.
- **Landing page (`landing/`):** static files. Edit `index.html`, `main.js`, `styles.css`; public values go in `config.js` (never secrets). Check with `node landing/scripts/build.mjs && node landing/scripts/check-links.mjs`.
- **Driver app (`packages/driver_app`, `packages/shared`):** Flutter 3.41.1 with Riverpod and GoRouter. On Windows, run Flutter from the x86 PowerShell: `"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd packages/driver_app; flutter analyze; flutter test"`. The backend must keep the response shapes the driver app reads (`backend/test/driver-agency.test.ts` and the driver e2e spec guard them).
- **Tenancy tooling (`backend/scripts/`):** `gen-wrangler.mjs` (Worker config from `wrangler.base.toml`), `migrate-tenants.mjs` (migrations across all agency databases), `backup-tenants.mjs` (see [docs/ops/BACKUPS.md](docs/ops/BACKUPS.md)). Self-test of the generator: `npm -w travelcrm-api run test:gen-wrangler`.

## Environment variables

Add a variable in four places: the code that reads it, the typed `Env` in `backend/src/types.ts` (backend) or the desktop code (`NEXT_PUBLIC_*`), the matching example file (`backend/.dev.vars.example`, `desktop/.env.example`, `super-admin/.dev.vars.example`, or `landing/config.js`) with a one-line purpose and no value, and a graceful fallback when it is missing. Production secrets are set with `wrangler secret put` (see `scripts/push-secrets.sh`), never in a file.

## Commits and pull requests

- Small, focused commits with conventional messages (`feat(leads): ...`, `fix(billing): ...`, `docs: ...`).
- Say what you ran. A change is not done until the checks in step 8 pass.
- Where to look next: [docs/FEATURES.md](docs/FEATURES.md) (what exists), [docs/readiness/](docs/readiness/) (launch plan and scorecard), [docs/COST-MODEL.md](docs/COST-MODEL.md) (what AI and messages cost), [docs/decisions/ADR-001-voip.md](docs/decisions/ADR-001-voip.md) (calling).
