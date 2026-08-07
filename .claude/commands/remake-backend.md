# Phase 1b: BACKEND — build a missing API surface

Target: **$ARGUMENTS**

This is the **only** phase permitted to add backend code. It exists because the owner decided to build an API surface that the desktop UI already calls but that was never implemented.

## Read first

1. `desktop/audit/remake/slices/super-admin.json` — the `notes` field carries the owner's decision and constraints.
2. `backend/src/index.ts` — the `routeMounts` array and middleware order.
3. `backend/src/db/master-schema.ts` — `tenants`, `subscriptions`, and the feature-flag tables you will read from.
4. `desktop/src/lib/api/config.ts` → the `API_ENDPOINTS.admin.*` block. **These paths are the contract.** The UI already calls them; do not rename them.

## Scope — nothing outside this

You may create or modify **only**:

- `backend/src/routes/admin.ts` (new)
- `backend/src/middleware/require-super-admin.ts` (new, if you need it)
- `backend/src/index.ts` — **one import and one `routeMounts` entry**, nothing else
- `backend/test/admin.test.ts` (new)

Every other file under `backend/` stays frozen. The pipeline enforces this with a git-diff gate; touching anything else fails the job.

## What to build

The desktop pages call these and currently get 404s:

```
GET /admin/dashboard          GET /admin/stats
GET /admin/tenants            GET /admin/tenants/:id
GET /admin/users              GET /admin/users/:id
GET /admin/plans              GET /admin/plans/:id
GET /admin/billing            GET /admin/billing/invoices
GET /admin/billing/payments   GET /admin/billing/revenue
GET /admin/billing/stats      GET /admin/system/health
GET /admin/system/logs        GET /admin/system/metrics
GET /admin/platform/health    GET /admin/config
GET /admin/audit-logs
```

Read the 10 pages under `desktop/src/app/(app)/super-admin/` to see the exact response shape each one expects, and satisfy that shape. The UI is the specification here — it was written first.

## Non-negotiable constraints

**Authorization.** These endpoints expose *platform-wide* data across every tenant. A tenant admin must never reach them. Add a `requireSuperAdmin` middleware and apply it to the whole mount. Decide the super-admin signal from what already exists in the codebase (the `SUPER_ADMIN_*` env vars and the master DB) rather than inventing a new mechanism, and state in your summary exactly what you keyed on.

**Data source.** Platform data lives in `MASTER_DB`, not a tenant DB. Do not use `c.get('tenantDb')` here.

**Follow house style exactly** — the file must look like it was always there:
- `const app = new Hono<AppContext>()`, default export
- raw D1 SQL via `db.prepare(...).bind(...)`, not the Drizzle query builder
- `success` / `error` / `notFound` / `paginated` from `../utils/response`
- `uuidv7()` for any generated id
- ISO-8601 TEXT dates, REAL money, INTEGER booleans

**Read-only.** Every endpoint above is a `GET`. Do not add mutations — no tenant suspension, no plan edits, no billing writes. If a page appears to need one, report it instead of building it.

## Tests

Write `backend/test/admin.test.ts` following the existing files in `backend/test/`. Cover: unauthenticated → 401, authenticated non-super-admin → 403, super-admin → 200 with the shape the UI expects.

The existing suite is **29 files / 901 tests green** and must stay that way.

## Finish

1. `cd backend && npx tsc --noEmit` — introduce no new errors.
2. `cd backend && npx vitest run` — 901+ tests green.
3. Summarize in 10 lines or fewer: endpoints implemented, the super-admin signal you keyed on, anything the UI expects that you refused to build and why.
