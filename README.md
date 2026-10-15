# TravelCRM Pro

A customer and operations system for tours and travel agencies, sold as a subscription. An agency catches enquiries, turns them into quotes and itineraries, takes payments, issues invoices and vouchers, assigns vehicles and drivers, and keeps its team and customers in step. Every agency gets its own database. The platform owner creates and manages agencies from a separate console.

What works today, feature by feature, is in [docs/FEATURES.md](docs/FEATURES.md).

## The parts

```
Agency staff                           Drivers                  Platform owner           Visitors
Desktop app (desktop/)                 Driver app               Super admin console      Landing page
Electron + Next.js                     (Flutter, Android)       (super-admin/, Next.js   (landing/, static)
        |                              packages/driver_app      on Cloudflare Workers)
        +------------------------------+                              |
                                       v                              v
                     Backend API (backend/): Cloudflare Workers + Hono + Drizzle
                       |-- master D1: agency registry, plans, subscriptions, super admins
                       |-- one D1 per agency: all of that agency's data  (TENANCY_MODE=multi)
                       |-- R2 files, KV caches, Queues, a Durable Object for live updates
                       `-- Workers AI binding (opt-in locally; it is billed)
Terraform (terraform/) builds the cloud side; oci-provisioner/ runs agency WordPress sites.
```

| Folder | What it is |
|---|---|
| `desktop/` | The app agency staff use: Next.js 16 + React 19, packaged with Electron. Tests, e2e and the local stack launcher live here. |
| `backend/` | The API: Cloudflare Workers, Hono, zod, Drizzle, D1. Migrations in `drizzle/master` and `drizzle/tenant`. |
| `super-admin/` | The operator console, built with OpenNext for Cloudflare Workers. It has its own login. |
| `landing/` | Static marketing site. `node landing/scripts/build.mjs` writes `landing/dist`. Settings in `landing/config.js`. |
| `packages/driver_app`, `packages/shared` | Flutter driver app and its shared Dart code. |
| `packages/shared-ts` | Shared TypeScript types (`@travelcrm/shared`). |
| `studio/` | Video studio for demo and marketing films. Separate npm project, not part of the workspace. |
| `terraform/`, `oci-provisioner/` | Cloudflare and Oracle Cloud infrastructure, and the WordPress site provisioner. |

The earlier all-Flutter agency client was removed; it is kept on the branch `archive/flutter-crm`.

## Prerequisites

- Node.js 22 and npm 10. Git.
- Flutter 3.41.1 only if you work on the driver app. On Windows it must run from the **x86** PowerShell: `"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "..."`.
- Terraform only for infrastructure work.

There is **one** npm workspace, at the repository root, with a single `package-lock.json`. Install only from the root. Never run `npm install` or `npm ci` inside `backend/` or `super-admin/`.

## Quick start

Run these from the repository root.

```bash
npm ci                                              # installs desktop, backend, super-admin and shared-ts
npm -w @travelcrm/shared run build                  # builds the shared TypeScript types
cp backend/.dev.vars.example backend/.dev.vars      # local secrets (placeholders; gitignored)
node desktop/scripts/fix-stack.mjs up --slot 1 --reset-db   # API + desktop web app, with a seeded demo agency
```

When it finishes, open http://localhost:3110 and sign in as `admin@demo.com` / `Admin@123`. The API is at http://localhost:8797/api/v1.

```bash
node desktop/scripts/fix-stack.mjs status --slot 1  # is it running, which ports
node desktop/scripts/fix-stack.mjs down --slot 1    # stop it
```

Good to know:

- Slot `N` uses API port `8787 + 10N` and web port `3100 + 10N`. Slot 0 is 8787 / 3100. Different slots can run side by side.
- Add `--multi` to run with one database per agency (`TENANCY_MODE=multi`, a pool of 4 agency databases) instead of the default single database. Add `--no-build` to reuse the last desktop build. A change of mode resets the database.
- Do **not** add `--ai` unless you mean to: it connects the real Cloudflare Workers AI, which is billed per request. Without it AI endpoints answer 503 `AI_UNAVAILABLE`.
- Email, SMS and calls are not sent locally. System emails land in the test outbox: `GET /api/v1/test/outbox`.
- The local database lives in `backend/.wrangler/state`; logs and pids in `desktop/audit/fix/stack/`.

### Run the desktop app in Electron

With the stack above running, `npm run dev:desktop:electron` opens the app in an Electron window (Next dev server on port 3100). `npm run dev:desktop` runs the API and the web app together without Electron.

### Operator console (super admin)

```bash
node backend/scripts/create-super-admin.mjs --local           # once per database; prompts for email, name, password (12+ characters)
printf 'SUPER_ADMIN_JWT_SECRET=<same value as in backend/.dev.vars>\nBACKEND_API_URL=http://localhost:8797/api/v1\n' > super-admin/.env.local
npm run dev:admin                                             # http://localhost:3000
```

The console signs in through `POST /api/v1/admin/auth/login`. New agencies are created through `POST /api/v1/admin/tenants` (the console's onboarding wizard calls it). There is no default super admin anywhere.

## How agencies are separated

Each agency has its own D1 database; the master database only holds the registry, plans, subscriptions and super admins.

- `TENANCY_MODE=single` (local default): one database holds everything. `multi`: one database per agency. A production Worker refuses `single` unless `ALLOW_SINGLE_TENANT_PRODUCTION=true`.
- The Worker configuration is **generated**: `node backend/scripts/gen-wrangler.mjs --env <local|dev|staging|production>` builds `backend/.wrangler.<env>.toml` from `backend/wrangler.base.toml` and the agency registry. Never add D1 bindings by hand.
- Migrations: `npm -w travelcrm-api run migrate:tenants -- --local` (or `--remote --env <name>`) applies master first, then a canary agency, then the rest. `--dry-run` lists the order.
- Backups: `backend/scripts/backup-tenants.mjs`, see [docs/ops/BACKUPS.md](docs/ops/BACKUPS.md).

## Tests and checks

| What | Command |
|---|---|
| Backend types + unit/integration tests | `cd backend && npx tsc --noEmit && npx vitest run` (also `npm run test:api` from the root). Test secrets are built into `backend/vitest.config.ts`; no `.dev.vars` needed. |
| Desktop types, unit tests, lint ratchet | `cd desktop && npx tsc --noEmit && npx tsc -p electron/tsconfig.json --noEmit && npx vitest run && node scripts/lint-gate.mjs` |
| Both types at once | `npm run typecheck` |
| Desktop production build | `npm run build:desktop` (builds shared types, then the app) |
| Super admin | `cd super-admin && npx tsc --noEmit && npm run lint && npm run build` |
| End-to-end (Playwright) | Start a stack, then from `desktop/`: `E2E_BASE_URL=http://localhost:3110 E2E_API_URL=http://localhost:8797/api/v1 npx playwright test e2e/leads.spec.ts` (slot 1; a full run is `npx playwright test`) |
| Packaged installer smoke | `npm -w travelcrm-desktop run build:desktop`, start a stack with `--no-build`, then `cd desktop && E2E_API_URL=http://localhost:8797/api/v1 npm run test:e2e:electron` |
| Landing page | `node landing/scripts/build.mjs && node landing/scripts/check-links.mjs` |
| Driver app (Windows, x86 PowerShell) | `"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd packages/driver_app; flutter analyze; flutter test"` |
| Clean setup works | `node scripts/fresh-clone-check.mjs` clones the last commit to a temporary folder, runs one root `npm ci` and the backend and desktop checks, then deletes it. It takes several minutes; commit first, because only committed files are cloned. |

Never weaken or skip a test to get a green run; fix the cause.

## Releasing

- **Desktop installer:** `npm -w travelcrm-desktop run build:desktop` writes the installer for the machine it runs on (NSIS on Windows) to `desktop/release/`. It is unsigned unless a code-signing certificate is configured. `TRAVELCRM_UPDATE_URL` sets the update feed.
- **Driver app:** `npm run build:android:driver` builds a release APK. It needs an untracked `packages/driver_app/android/key.properties` (copy `key.properties.example`).
- **Backend and console:** generate the Worker config (`gen-wrangler.mjs --env production`), then `npm run deploy:api` and `npm run deploy:admin`. `npm run infra` applies Terraform. The GitHub workflows in `.github/workflows` run the checks on every push; the deploy workflows start only by hand (`workflow_dispatch`).
- **Landing page:** `landing/dist` from `node landing/scripts/build.mjs`, published by the `landing.yml` workflow.

## Environment variables

Each app has its own example file with names and one-line purposes (never real values):

| App | File |
|---|---|
| Backend (Worker secrets and settings) | [backend/.dev.vars.example](backend/.dev.vars.example) |
| Desktop (Next.js and Electron) | [desktop/.env.example](desktop/.env.example) |
| Super admin console | [super-admin/.dev.vars.example](super-admin/.dev.vars.example) |
| Landing page | `landing/config.js` (public values only) |
| Everything else (Flutter, Terraform, CI) | [.env.example](.env.example) |

## Where things are documented

- [CONTRIBUTING.md](CONTRIBUTING.md): how to add a feature, conventions.
- [docs/FEATURES.md](docs/FEATURES.md): what the product does today (`docs/features.json` is the same list for tools).
- [docs/readiness/](docs/readiness/): launch scorecard and plan (`READINESS-PLAN.md`, `SCORECARD.md`); `docs/launch/STATE.json` is the program state.
- [docs/decisions/ADR-001-voip.md](docs/decisions/ADR-001-voip.md): calling provider decision. [docs/CALL-AUTOMATION.md](docs/CALL-AUTOMATION.md): call handling.
- [docs/COST-MODEL.md](docs/COST-MODEL.md): what each message, call and AI request costs, and how plans are priced.
- [docs/ops/BACKUPS.md](docs/ops/BACKUPS.md): backups and restores. [docs/marketing/](docs/marketing/): marketing plan and copy.
- [desktop/audit/remake/CONTRACT.md](desktop/audit/remake/CONTRACT.md): the desktop UI rules and component reference.
- Go-live (deployment) notes are being written as `docs/GO-LIVE.md`; until it exists, use the release commands above and `docs/readiness/READINESS-PLAN.md`.
