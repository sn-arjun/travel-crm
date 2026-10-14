# TravelCRM Pro: readiness plan

- Written by the readiness planner, 2026-10-09 to 2026-10-14. Read-only planning; nothing in this plan has been built or run.
- Scorecard: `docs/readiness/SCORECARD.md`. Batches: `docs/readiness/batches/R*.json`. Run order: `docs/readiness/batches/INDEX.json`.
- Inputs: the approved program plan (`~/.claude/plans/magical-tumbling-swan.md`, section W2, whose design choices this plan follows rather than re-decides), the three audits in `docs/launch/findings/`, `docs/features.json`, `docs/decisions/ADR-001-voip.md`, `docs/COST-MODEL.md`, `docs/CALL-AUTOMATION.md`, and my own reading of the code on 2026-10-14.
- Scope: **local builds only.** Every batch is proved on this Windows machine with unit tests, the local stack (`desktop/scripts/fix-stack.mjs`), Playwright, dry runs and mocks. Anything that needs a real Cloudflare account, payment gateway or telephony provider is written behind an interface with a local implementation, tested with mocked `fetch`, and listed under "Verify at go-live".

## 0. How to run a batch (orchestrator)

1. Pick the next entry from `INDEX.json` whose `dependsOn` have all merged and whose `blockedOnOwner` is null or answered. Never run two batches whose `files.edit`/`files.create` overlap; never more than 2 at once (the run order in section 3 already respects this).
2. Give the executor (Sonnet) the batch JSON, `desktop/audit/fix/FIX-PLAN.md` sections 3 and 4 (executor rules, worktree bootstrap with node_modules junctions), `desktop/audit/remake/CONTRACT.md` for any desktop UI work, and this file's design note for the batch's area.
3. Executor rules that differ from FIX-PLAN: migrations go in the folder and with the number the batch names (numbers are pre-assigned below so parallel batches never collide; if a number is already taken because the order changed, take the next free one and say so in the report); `packages/crm_app` no longer exists, so the FIX-PLAN rule about Flutter-compatible responses applies to `packages/shared` and `packages/driver_app` only; new npm dependencies are allowed only where the batch lists them.
4. Gates: run the commands in the batch's `gate` array on the merged tree. The batch also carries a `gates` object in the FIX-PLAN shape; to use `fix-gates.mjs`, copy the batch file to `desktop/audit/fix/batches/` first (`fix-gates.mjs` looks for `<ID>-*.json` there). Baselines on 2026-10-14: backend tsc 0, vitest 57 files / 1,296 tests; desktop tsc 0, vitest 64 files / 1,294 tests, lint 0 errors; full e2e 766 passed / 38 skipped. A batch may only raise the passed counts.
5. Teardown: unlink node_modules junctions before `git worktree remove` (see memory note and FIX-PLAN 4.1).
6. After Tier 1, an Opus review of the tenancy, auth and billing diffs (program plan W3), then R121's isolation e2e is the Tier 1 exit.

Standard gate commands referenced by the batches:

| Name | Commands |
|---|---|
| `BE` | `cd backend && npx tsc --noEmit && npx vitest run` (0 failed files; passed count not below the last merged count) |
| `DT` | `cd desktop && npx tsc --noEmit && npx tsc -p electron/tsconfig.json --noEmit && npx vitest run && node scripts/lint-gate.mjs` |
| `DT-BUILD` | `cd desktop && npm run build` |
| `E2E(spec, slot, flags)` | `node desktop/scripts/fix-stack.mjs up --slot <slot> --reset-db <flags>` then, from `desktop/`, `E2E_BASE_URL=http://localhost:<3100+10*slot> E2E_API_URL=http://localhost:<8787+10*slot>/api/v1 npx playwright test <spec>`, then `fix-stack.mjs down --slot <slot>` |
| `FL` | x86 PowerShell: `"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd C:/Users/Admin/Downloads/pro/CRM/packages/driver_app; flutter analyze; flutter test"` (first check no Gradle/Flutter build is running: `tasklist | findstr /i "java.exe dart.exe flutter"`; the owner may be building the driver app) |
| `SA` | `cd super-admin && npx tsc --noEmit && npm run lint && npm run build` |

## 1. Tiers

### Tier 1: handoff-ready (India)

**Goal.** A super admin can create an agency on a chosen plan; the agency's admin receives a welcome email, logs in on the installed desktop app, is forced to change the password, runs onboarding, invites staff and drivers; agencies are isolated from each other; nothing a tenant does can run up an uncapped bill; the whole thing can be generated, migrated and dry-run deployed from config; CI runs.

**Exit test (all must pass):**
1. `backend/test/tenancy-isolation.test.ts`: with `TENANCY_MODE` unset, a tenant with no binding gets HTTP 503 `TENANT_DB_UNAVAILABLE`, never `MASTER_DB`; three tenants on three pool databases cannot see each other's rows.
2. `desktop/e2e/tenant-isolation.spec.ts` on `fix-stack up --slot 1 --reset-db --multi`: the super admin API creates agencies A (basic), B (pro), C (enterprise); each admin logs in from the local outbox credentials, changes the password, creates a lead, a setting and a file; A gets 404/403 on B's lead id, file key and settings, and A's WebSocket receives none of B's events.
3. `desktop/e2e-electron/smoke.spec.ts`: the NSIS installer from `npm run build:desktop` is installed silently into a temp folder; the packaged exe starts its own Next server on a free port, reads the API URL at runtime, and logs in against the slot-1 API.
4. Driver app release APK (signed with a throwaway local keystore through an untracked `key.properties`) logs in on the emulator with an agency code against the local stack (`integration_test/agency_login_test.dart`).
5. `node scripts/gen-wrangler.mjs --env production --registry scripts/fixtures/registry.sample.json` then `cd backend && npx wrangler deploy --dry-run -c .wrangler.production.toml --outdir .dryrun` exits 0; `node scripts/migrate-tenants.mjs --local --dry-run` lists master then canary then the rest.
6. `node scripts/fresh-clone-check.mjs` (R118) passes: clone to a temp folder, root `npm ci`, build `@travelcrm/shared`, backend tsc + vitest, desktop tsc + vitest + lint gate.
7. Full desktop e2e (`fix-stack up --slot 0 --reset-db`, single-tenant mode) still green: at least 766 passed, 0 failed.
8. Cost guard tests (R105, R110): usage caps reset exactly once per day and month; a tenant over its SMS, WhatsApp, email or OTP allowance is refused with HTTP 402 `ALLOWANCE_EXHAUSTED`; OTP per-number and per-IP limits hold.

**Batches, in run order:** R100 (owner action, any time), R101, R114, R102, R120, R103, R116, R104, R115, R105, R119, R106, R108, R107, R109, R110, R117, R111, R113, R112, R118, R121, R122.

### Tier 2: international-ready

**Goal.** An agency in the UK/EU/US/Australia/Gulf/SE Asia sees its own currency, dates, phone format, language (English everywhere, Arabic with right-to-left as the first added language), issues invoices under its own tax regime, pays its subscription by card, collects from its customers, and can meet GDPR requests; the platform can place an agency's data in a chosen region.

**Exit test:**
1. `backend/test/tax-regimes.test.ts`: golden invoices for GST intra-state, GST inter-state, GST export, UK VAT 20%, EU B2B reverse charge, UAE VAT 5%, US sales tax, none; each invoice row stores its regime and breakdown.
2. `desktop/e2e/locale.spec.ts` on a multi slot: agency UK (GBP, en-GB, Europe/London) and agency UAE (AED, ar-AE, Asia/Dubai) show amounts, dates and phone defaults in their own format; the UAE agency switched to Arabic renders `dir="rtl"` with no layout-probe failures on 10 core routes.
3. `backend/test/billing-webhooks.test.ts`: recorded Stripe and Razorpay webhook fixtures (signed with test secrets) move a subscription trial → active → past_due → expired; replaying any event changes nothing.
4. `backend/test/gdpr.test.ts`: export returns every row tied to a contact; erasure leaves no personal data in any tenant table or R2 object, keeps invoices with an anonymised party, and writes an audit entry.
5. `desktop/e2e/two-factor.spec.ts`: enrol TOTP, log out, log in with a code computed in the test.
6. Tier 1 exit tests still pass.

**Batches, in run order:** R201, R210, R202, R203, R204, R205, R208, R206, R209, R207, R211, R212, R213.

### Tier 3: voice and WordPress

**Goal.** Calling works as ADR-001 describes, provider-agnostic until G1 is signed: every callback signed and processed once, the full call lifecycle feeds the automation engine, recordings live in our storage with retention, minutes are metered from the provider's records against a prepaid balance with fraud limits; agencies can get a WordPress site provisioned from the super admin console.

**Exit test:**
1. `backend/test/call-lifecycle.test.ts` with `MockVoipProvider`: inbound ring → screen-pop broadcast → missed → call-back task; answered → ended → timeline entry and lead moves to contacted; unsigned callback → 403; duplicate callback → no second row.
2. `desktop/e2e/calls-simulator.spec.ts` on a slot with `VOIP_PROVIDER=mock`: the screen pop appears, the in-call panel opens on outbound, an outbound call at zero balance is refused with the top-up prompt.
3. `backend/test/wp-provisioning.test.ts`: a queued job reaches `active` against a local mock provisioner; with Docker present, `oci-provisioner` in a container serves one site (otherwise listed under go-live).
4. G1-dependent batches (R304, R307, R308) have their provider adapter tested against recorded HTTP fixtures only.

**Batches, in run order:** R301, R309, R302, R310, R303, R306, R304 (G1), R305 (G1), R307 (G1), R308 (G1).

## 2. Dependency graph

```
R100 (owner: repo private, token, rotation)  -- independent, do first

R101 tenancy resolver ──┬─► R102 transactional email ──┐
                        ├─► R103 local multi-tenant stack + gen-wrangler + migrate-tenants
                        │          │                    │
                        │          └──────► R104 tenant provisioner ◄──┘
                        │                     ├─► R113 first login + onboarding
                        │                     ├─► R111 super admin backend API ◄── R109 plan catalogue
                        │                     │          └─► R112 super admin console
                        ├─► R105 cron fan-out + cap reset ─► R110 cost caps + OTP ◄── R109
                        ├─► R106 files/login/CORS/TEST_MODE
                        ├─► R107 webhook signatures + public mounts
                        ├─► R108 credential encryption
                        ├─► R115 driver app release (agency code)
                        └─► R119 call schema drift
R114 desktop packaging ─────────────────────────────┐
R116 landing + public enquiries (after R101) ───────┤
R117 ops (after R105) ──────────────────────────────┤
R120 carry-over defects (independent) ──────────────┤
R118 CI + workspaces + terraform (after R112, R114, R115, R116, R117)
R121 isolation e2e (after R104, R106, R107, R108, R113)  ← Tier 1 exit
R122 README + CONTRIBUTING (last)

Tier 2 (after Tier 1 exit + Opus review):
R201 tax engine ─► R207 customer payment links
R210 i18n wiring (desktop) ─► R211 Arabic + RTL
R202 locale core ─► R203 desktop locale sweep ─► R211
R202 ─► R204 phones + driver locale
R109 ─► R205 billing gateways ─► R206 prepaid balance ─► R207
R208 GDPR + legal + unsubscribe
R209 2FA + password policy
R104 ─► R212 data residency
R213 WhatsApp via Meta Cloud API (after R110)

Tier 3:
R301 VoipProvider contract + mock + simulator ─► R302 callbacks signed/once ─► R303 lifecycle events + recipes
R303 ─► R306 recordings + transcription
R301 + R206 ─► R304 sub-accounts + numbers (G1) ─► R305 metering + fraud (G1)
R303 ─► R307 softphone (G1);  R303 ─► R308 India call-bridge (G1)
R309 WordPress provisioning (after R104, R111) ; R310 WordPress infra sizing (independent)
```

## 3. Run order (at most two at once, never sharing files)

| Step | Run together | Why they are safe together |
|---|---|---|
| 1 | R101 + R114 | backend tenancy vs desktop Electron packaging; disjoint folders |
| 2 | R102 + R120 | backend email/auth URLs vs desktop pages (calendar, invoices, palette) and `services/numbering.ts`, which R102 does not touch |
| 3 | R103 + R116 | scripts/wrangler/fix-stack vs `landing/` and `routes/public-enquiries.ts` (new file); R116 mounts its route in `index.ts`, R103 does not touch `index.ts` |
| 4 | R104 + R115 | provisioning (`services/tenancy/*`, `routes/admin-tenants.ts`) vs driver app (`packages/driver_app`, `routes/driver.ts` agency endpoint) |
| 5 | R105 + R119 | cron and queues index vs call routing, extraction queue, call routes |
| 6 | R106 + R108 | files/auth/CORS vs crypto + voip settings + integrations |
| 7 | R107 + R109 | webhook signatures and public mounts vs plan catalogue (`feature-gate.ts`, `admin.ts` plans, `users.ts` seats); R109 must not edit `index.ts` |
| 8 | R110 + R117 | metering in communications/queues/OTP vs health, logging, backups (R110 must not edit `index.ts`) |
| 9 | R111 + R113 | backend admin API vs first-login (`auth.ts`, desktop auth pages, onboarding) |
| 10 | R112 | super admin console alone (large, touches `super-admin/package.json`) |
| 11 | R118 | CI, root `package.json`, lockfiles, terraform alone |
| 12 | R121 | isolation e2e alone (needs a quiet machine) |
| 13 | R122 | docs alone |
| — | Opus review of tenancy, auth and billing diffs; then Tier 2 | |
| 14 | R201 + R210 | backend tax vs desktop i18n wiring (only `lib/i18n*` and shell strings) |
| 15 | R202 | locale core touches backend utils and desktop `lib/utils.ts` |
| 16 | R203 + R205 | desktop page sweep vs backend billing (new files + master migration) |
| 17 | R204 + R208 | phones (backend `utils/phone.ts`, desktop phone input, driver) vs GDPR (contacts routes, public unsubscribe, landing legal pages) |
| 18 | R206 + R209 | wallet (master, new routes) vs 2FA (auth, users, desktop security settings) |
| 19 | R207 + R211 | payment links (invoices/payments backend + invoice page) vs Arabic/RTL (desktop i18n + CSS); R211 must not edit invoice pages |
| 20 | R212 + R213 | data residency (provisioner, gen-wrangler) vs WhatsApp Meta provider |
| — | Tier 3 | |
| 21 | R301 + R309 | VoIP provider contract vs WordPress provisioning |
| 22 | R302 + R310 | VoIP callbacks vs terraform/oci sizing |
| 23 | R303 | lifecycle events touch engine, recipes and desktop call UI |
| 24 | R306 | recordings + transcription |
| 25 | R304 (G1) | sub-accounts and numbers |
| 26 | R305 (G1) | metering and fraud |
| 27 | R307 (G1) + R308 (G1) | only if the owner chose both softphone and India call-bridge; they share `routes/calls.ts`, so run them one after the other unless R307 is desktop-only by then |

## 4. Design notes

### 4.1 Tenancy and provisioning (R101, R103, R104, R105, R212)

**Limits found (fetched 2026-10-09; recheck at go-live):**

| Limit | Value | Source |
|---|---|---|
| D1 databases per account | 10 (Free), **50,000 (Workers Paid)**, raisable on request "to millions" | https://developers.cloudflare.com/d1/platform/limits/ |
| D1 bindings per Worker script | **about 5,000** (footnote: "you can bind up to ~5,000 D1 databases to a single Worker script") | same page |
| D1 maximum database size | 500 MB (Free), **10 GB (Paid)** | same page |
| D1 storage per account | 5 GB (Free), 1 TB (Paid), raisable | same page |
| D1 queries per Worker invocation | 50 (Free), **1,000 (Paid)** | same page |
| D1 Time Travel (point-in-time restore) | 7 days (Free), **30 days (Paid)** | same page |
| D1 bound parameters per query | 100 | same page |
| Workers per account | 100 (Free), 500 (Paid; more via Workers for Platforms) | https://developers.cloudflare.com/workers/platform/limits/ |
| Environment variables per Worker | 64 (Free), 128 (Paid), 5 KB each | same page |
| Subrequests per request | 50 (Free), 10,000 (Paid) | same page |
| CPU per cron invocation | 30 s (interval under 1 hour) | same page |
| Queue consumer wall time | 15 min | same page |
| Cron triggers per account | 5 (Free), 250 (Paid) | same page |
| Bindings per Worker (general) | not stated on the Workers limits page | same page |

**What the design supports.** One API Worker with one D1 binding per agency supports **about 4,500 agencies** (5,000 bindings, keeping 10% headroom for the master DB and future bindings), well under the 50,000-database account limit. This removes both scaling walls in the cost model: the shared database's 10 GB ceiling at roughly 200 agencies, and the 5-minute cron's 1,000-queries-per-invocation ceiling at roughly 500 agencies (R105 fans the cron out to one queue message per agency).

**Beyond 4,500 agencies (written fallback, not built):** shard by deploying a second API Worker (`travelcrm-api-s2`) generated from the same code with the next range of tenants (`tenants.shard`, added in R101 with default `s1`). Clients already call `POST /auth/resolve-tenant` before login; it returns `apiBaseUrl` for the tenant's shard, and the desktop and driver apps use it for that session. No router Worker is needed. A second fallback for very small, inactive agencies is the D1 REST API, which needs no binding but adds latency; not recommended for active tenants.

**Modes.** `TENANCY_MODE=single` means every tenant uses `MASTER_DB` (local dev, vitest default, and a possible one-agency pilot deployment). Any other value, including unset, means `multi`: a tenant's database is `env[tenants.db_binding]`; if the binding is missing the request fails with 503 `TENANT_DB_UNAVAILABLE` and nothing falls back to `MASTER_DB` (fail closed). `ENVIRONMENT=production` together with `TENANCY_MODE=single` refuses to serve unless `ALLOW_SINGLE_TENANT_PRODUCTION=true` (the explicit pilot switch). `ENVIRONMENT=production` with `TEST_MODE=true` refuses to serve, always.

**Binding names.** One scheme: `TENANT_DB_<32 lowercase hex of the tenant UUID without hyphens>` (binding names must be valid identifiers; UUIDs contain hyphens, which is one reason today's `TENANT_DB_${uuid}` lookups can never match). The name is stored in `tenants.db_binding` (master migration 0011), so code never computes it; `tenantDbFor` reads it. Local pool databases are `TENANT_DB_POOL_1..N`.

**One resolver.** `services/tenant-db.ts` exports `resolveTenantDb(env, tenantId)` (status-checked, for webhooks/queues/cron) and the request middleware uses the same function. Every ad-hoc lookup is replaced (verified call sites on 2026-10-14: `routes/auth.ts` five sites, `routes/driver.ts`, `middleware/driver-auth.ts`, `routes/public.ts`, `queues/campaign-queue.ts`, `export-queue.ts`, `import-queue.ts`, `sms-queue.ts` (uses `contactId` as a tenant id, a bug), `ai-extraction-queue.ts`, `whatsapp-campaign-queue.ts`, `push-notification-queue.ts` and the cron files that query a non-existent `workspaces` table: `cron/auto-reminders.ts`, `services/follow-up-reminders.ts`, `cron/fleet-alerts.ts`, `cron/overdue-tasks.ts`, `cron/campaign-scheduler.ts`). `candidateTenantDbs` stops adding `MASTER_DB` when nothing is found, and `voip-callbacks.ts` `callDb` stops returning `MASTER_DB` as a last resort (both fail closed in multi mode).

**Provisioning (`POST /api/v1/admin/tenants`, super admin only, R104).** `TenantProvisioner` interface in `backend/src/services/tenancy/provisioner.ts`:

```ts
interface TenantProvisioner {
  createDatabase(t: { tenantId: string; slug: string; region: Region }): Promise<{ databaseId: string; binding: string }>;
  applyMigrations(target: { databaseId: string; binding: string }): Promise<{ applied: string[] }>;
  execute(target, statements: { sql: string; params: unknown[] }[]): Promise<void>; // seed admin, settings, recipes
  registerBinding(target): Promise<'active' | 'pending_deploy'>;
  dropDatabase(target): Promise<void>; // rollback only
}
```

- `LocalTenantProvisioner` claims the first pool binding (`TENANT_DB_POOL_n`) not used in `tenants.db_binding`, runs migrations and seeds through the binding, returns `active`. Pool exhausted → 409 with a clear message (local only).
- `CloudflareTenantProvisioner` uses the Cloudflare REST API with `CF_ACCOUNT_ID`/`CF_API_TOKEN`: create D1 (`POST /accounts/:a/d1/database`, with `primary_location_hint` or `jurisdiction` from the region), run migrations and seed via `POST .../d1/database/:id/query`, then add the binding to the live Worker via the script settings API; if that is not available or fails, return `pending_deploy` and the super admin console shows "Deploy needed" (operator runs the generated deploy). Unit-tested with mocked `fetch` only.
- The provisioning steps are idempotent and recorded in `tenants.provisioning_status` (`creating_db` → `migrating` → `seeding` → `binding` → `active` / `pending_deploy` / `failed`) with `provisioning_error`; a failed step can be retried from the console.
- Seeding: admin user with the backend's bcrypt (`utils/password.ts`), `must_change_password = 1` (tenant migration 0043), a random 16-character temporary password returned once to the super admin and sent in the welcome email; default settings (company name, country, currency, timezone, tax system from the wizard); automation recipe defaults as `services/automation` installs them today; `tenant_users` row in master.
- Tenant migrations at runtime: `scripts/bundle-tenant-migrations.mjs` writes `backend/src/db/tenant-migrations.generated.ts` (an array of `{ name, queries[] }` split with the same splitter `readD1Migrations` uses); a unit test fails if it is out of date with `drizzle/tenant/`. Applied migrations are recorded in the tenant DB's `d1_migrations` table (same shape wrangler uses) so `wrangler d1 migrations apply` and the runtime path agree.
- `scripts/migrate-tenants.mjs` (R103): master first (`drizzle/master`), then a canary tenant, then the rest in batches of 10; stops on the first failure; `--local` (pool DBs) or `--remote` (wrangler with the generated config), `--dry-run` lists the plan.
- `scripts/gen-wrangler.mjs` (R103): reads `backend/wrangler.base.toml` (today's file minus D1, with full binding lists), the tenant registry (local: the local master DB via `wrangler d1 execute --json`; production: an exported JSON or the D1 REST API), and writes `.wrangler.<env>.toml` with complete `[env.*]` sections (Wrangler does not inherit bindings into named environments), every queue the code uses (including `AI_EXTRACTION_QUEUE`, `AI_EXTRACTION_DLQ`, `TENANT_JOBS_QUEUE`; `NOTIFICATION_QUEUE` is removed from `types.ts` in favour of `PUSH_NOTIFICATION_QUEUE`), `[observability] enabled = true`, `[vars]` (ENVIRONMENT, TENANCY_MODE, APP_URL, API_URL, CORS_ORIGINS, EMAIL_FROM) and one `[[d1_databases]]` per tenant. `MASTER_DB` gets `migrations_dir = "drizzle/master"`. A plain `wrangler deploy` of the checked-in toml is blocked by a `predeploy` script that refuses unless `-c .wrangler.<env>.toml` is used.
- Local dev in single mode keeps one D1 holding both schemas: the tenant schema is applied with a second generated config whose `MASTER_DB` entry has `migrations_dir = "drizzle/tenant"` and `migrations_table = "d1_migrations_tenant"` (both folders start at `0000_initial.sql`, so they must be tracked in different tables). `seed-local.mjs` stops applying master SQL by hand.
- `fix-stack.mjs up --multi [--pool N]` (R103, default pool 4) generates the local config with `TENANT_DB_POOL_1..N`, migrates them, seeds the demo agency into pool 1 with `TENANCY_MODE=multi`. Without `--multi` the stack behaves as today (single mode), so the 766-test e2e baseline is unaffected.
- Vitest: `backend/vitest.config.ts` keeps `TENANCY_MODE: 'single'` as a binding and adds `d1Databases: ['TENANT_DB_POOL_1', 'TENANT_DB_POOL_2', 'TENANT_DB_POOL_3']` to the miniflare options; isolation tests pass `{ ...env, TENANCY_MODE: 'multi' }` to `worker.fetch`.
- Cron fan-out (R105): the `*/5` tick only enqueues one `TENANT_JOBS_QUEUE` message per active tenant (`sendBatch`, 100 per call) plus platform jobs; the consumer (`max_batch_size = 5`) resolves the tenant DB and runs that tenant's jobs; hourly and daily jobs get their own cron expressions instead of running every 5 minutes. Usage caps reset by period key (`2026-10-14` for daily, `2026-10` for monthly) compared with `tenant_usage_caps.period_key`, so a reset runs once per period whatever the tick count.

### 4.2 One plan catalogue (R109)

Master migration 0015 adds four tables; the owner's final numbers become rows, not code:

| Table | Columns (D1 conventions) |
|---|---|
| `plans` | `key` TEXT PK (`trial`, `basic`, `pro`, `enterprise`), `name`, `description`, `sort_order` INTEGER, `is_public` INTEGER, `trial_days` INTEGER (trial only), `is_active` INTEGER |
| `plan_prices` | `id` TEXT PK (UUIDv7), `plan_key`, `market` TEXT (`IN`, `WEST`, `GULF`, `SG`, `MY_TH`, `LK_NP_BD`), `currency` TEXT (ISO 4217), `pricing_model` TEXT (`per_agency` / `per_user`), `amount` REAL, `billing_period` TEXT (`year` / `month`), `min_seats` INTEGER, `included_seats` INTEGER, `max_seats` INTEGER NULL, `is_active` INTEGER, `valid_from` TEXT |
| `plan_features` | `plan_key`, `feature_key`, PK both |
| `plan_allowances` | `plan_key`, `allowance_key` (`ai_credits_per_month`, `sms_per_month`, `whatsapp_marketing_per_month`, `whatsapp_utility_per_month`, `email_per_month`, `otp_per_day`, `voip_minutes_per_month`, `extra_ai_credits_per_seat`), `amount` INTEGER, `period` (`day`/`month`), PK both |

Seed rows: today's decided India prices as `per_agency`, ₹12,000 / ₹18,000 / ₹24,000 per year, 5 / 15 / 100 seats (from `routes/admin.ts`), and the cost model's proposal (`per_user` ₹200 / ₹300 / ₹400 per user per month billed yearly, minimum 5; $12 / $29 / $49 West and Gulf, etc.) inserted with `is_active = 0` so the owner switches by flipping rows. Features seeded from today's `PLAN_DEFAULTS`, except that `voip_calling` is removed from `trial` (ADR fraud rule) and `starter`/`free` disappear (data migration maps `starter` → `basic`, `free` → `trial`). Allowances seeded from `ai-pricing.ts` and the cost model (SMS 0 in India plans, WhatsApp utility 300 / 1,000 / 3,000).

Readers: `feature-gate.ts` (cached in KV for 5 minutes, key `plans:v<n>`), `ai-pricing.ts`, the seat check in `routes/users.ts` invite and reactivate (seats = active users vs `max_seats`/purchased seats), trial expiry (cron sets `expired` after `trial_ends_at`; login returns 402 `TRIAL_EXPIRED` with an upgrade message; read-only grace of 7 days is a setting), `GET /api/v1/public/plans?market=IN` (landing, signup), `GET /api/v1/admin/plans` and `PUT` (super admin edits rows, audited). `super-admin/src/lib/constants.ts` and `tenants/[id]/plan/route.ts` stop defining plans.

### 4.3 Credential encryption at rest (R108)

- Algorithm: AES-256-GCM through WebCrypto (`crypto.subtle`), random 12-byte IV per value, the column name and tenant id as additional authenticated data so a ciphertext cannot be copied to another tenant or column.
- Stored format: `enc:v1:<keyId>:<base64url iv>:<base64url ciphertext+tag>` in the existing TEXT columns (no schema change for secrets).
- Keys: secret `CREDENTIALS_KEYS` = JSON `{ "<keyId>": "<base64 32 bytes>" }` and var `CREDENTIALS_ACTIVE_KEY_ID`. Encrypt with the active key; decrypt with the key named in the value. Missing key in production → refuse to start the request that needs it (503), never write plaintext. Local/test: a fixed test key in `vitest.config.ts` and `fix-stack` vars.
- Rotation: add a new key id, make it active, run `POST /api/v1/admin/maintenance/reencrypt` (super admin, per tenant, idempotent, resumable with a cursor), then remove the old key.
- Existing plaintext rows: reads accept values without the `enc:` prefix (and log a one-line warning with tenant and column, not the value); every write encrypts; the same maintenance endpoint encrypts all remaining plaintext.
- Columns: `voip_settings.provider_auth_token`, `provider_api_key_secret`, `twilio_auth_token`, `twilio_api_key_secret` (tenant schema), and any per-tenant gateway or WhatsApp tokens added later (R207, R213 reuse the helper).
- API keys (`tenant_api_keys.api_key`, master) are not encrypted but **hashed**: SHA-256 of the key stored in `key_hash` with an 8-character `key_prefix` for display; the full key is shown once at creation; master migration 0014 rebuilds the table and hashes existing keys. Lookup is by hash.

### 4.4 Public endpoints and abuse limits (R107, R116, R208)

All public routes are mounted before `authMiddleware` under `/api/v1/public/*` or `/api/v1/webhooks/*`, use `rateLimit` from `middleware/rate-limiter.ts` (KV), cap body size, and never reveal whether a tenant, email or phone exists.

| Endpoint | Purpose | Identity | Limits |
|---|---|---|---|
| `POST /public/enquiries` (R116) | Landing contact, demo and signup-request forms | none | 5 per hour per IP, 3 per day per email, 10 KB body, honeypot field, Cloudflare Turnstile verified when `TURNSTILE_SECRET` is set (skipped locally); stored in master `platform_enquiries`, owner notified through the outbox. **Signup does not auto-provision in v1**: the super admin approves and provisions (prevents trial fraud; owner question Q4). |
| `GET /public/chatbot/:widgetKey/widget.js`, `POST /public/chatbot/:widgetKey/messages` (R107) | Website chat widget | widget key → tenant via `tenant_channel_addresses` (kind `widget`) | 30 messages per 10 min per IP per widget, 2 KB per message, origin allow-list from the agency's chatbot settings, AI credits charged to the agency with a daily ceiling, 404 for an unknown key |
| `POST /webhooks/chatbot/whatsapp` (R107) | Chatbot over WhatsApp | provider signature | provider-signed only |
| `GET /public/q/:token` (exists, hardened in R106) | Quote share links | 128-bit random token | expiry (default 30 days, setting), revocable, 60 per minute per IP, `X-Robots-Tag: noindex`, no data beyond the quote |
| `GET /public/unsubscribe/:token` (R208) | One-click unsubscribe | HMAC-signed token (`UNSUB_SECRET`) carrying tenant id and contact id | 20 per minute per IP; sets `opted_out` and records consent withdrawal |
| `GET /driver/agency/:code` (R115) | Driver app finds its agency | agency code (slug) | 10 per minute per IP; returns name and logo only |

### 4.5 Electron packaging (R114)

- Build: `next build` with `output: 'standalone'`; a `scripts/prepare-standalone.mjs` step copies `.next/static` and `public/` into the standalone folder (Next does not); electron-builder ships it with `extraResources` (`from: .next/standalone`, `to: app-server`) outside the asar, since the server must run from real files.
- Start: `electron/main.ts` finds a free port by listening on `127.0.0.1:0`, spawns `process.execPath` with `ELECTRON_RUN_AS_NODE=1` running `resources/app-server/<path>/server.js` with `PORT`, `HOSTNAME=127.0.0.1`, `NODE_ENV=production`; waits until `GET /login` answers (timeout 30 s, then an error window with the log path); then `loadURL`. Logs go to `app.getPath('logs')/next-server.log`.
- Stop: kill the child (tree kill on Windows with `taskkill /T /F`) on `before-quit`, `window-all-closed` and on crash; a second instance is prevented with `app.requestSingleInstanceLock()`.
- Runtime API URL: main reads `userData/config.json` `{ "apiUrl": ... }`, else the build-time default in `electron/dist/build-config.json` written from `TRAVELCRM_API_URL` at build, else `http://localhost:8787/api/v1`. The preload exposes it synchronously (`ipcRenderer.sendSync('config:get')`) as `window.travelcrmConfig.apiUrl`. `desktop/src/lib/api/config.ts` becomes `getApiBaseUrl()`: `window.travelcrmConfig?.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? default`; the 24 usages of `API_BASE_URL` call it at use time. A "Server address" field on the login page (hidden behind "Advanced") writes `config.json` through IPC, for self-hosted or shard URLs.
- Icons: `desktop/build-resources/icon.svg` (brand mark) rendered to `icon.png` 1024 px by `scripts/make-icons.mjs` using the Playwright Chromium already installed; electron-builder converts PNG to ICO/ICNS; `buildResources: build-resources`; tray uses the PNG.
- Updates: `electron-updater` (new dependency, allowed) with `publish: { provider: generic, url: ${TRAVELCRM_UPDATE_URL} }`; check on start and every 6 hours; download in the background; "Restart to update" toast. Local proof: build version 0.1.0 and 0.1.1 into two folders, serve the 0.1.1 `latest.yml` and installer with a tiny Node static server, and assert in the smoke test that 0.1.0 reports "update available". At go-live the feed is an R2 bucket behind `downloads.<domain>`.
- Signing: not done locally. Microsoft's hosted signing is not open to Indian organisations (cost model), so the runbook needs an OV or EV certificate from a CA; electron-builder reads `CSC_LINK`/`CSC_KEY_PASSWORD`. Unsigned builds trigger SmartScreen; that is a go-live item.

### 4.6 Driver app tenant resolution at login (R115)

- The driver enters an **agency code** (the tenant slug, shown in the agency's Settings > Company and in the welcome pack) on first launch; the app calls `GET /api/v1/driver/agency/:code`, shows the agency name and logo for confirmation, stores `tenantId` in secure storage and sends it with OTP send/verify and refresh as it does today (`X-Tenant-Id`). "Change agency" is in the profile screen.
- `AppConfig.tenantId` compile-time define is removed; `ENVIRONMENT` check compares with `production` (fixes `'prod'`).
- Release signing from `android/key.properties` (untracked, `.gitignore` entry added) following Flutter's documented Gradle pattern; when the file is missing the release build falls back to debug signing and prints a warning (local builds keep working). iOS `Info.plist` gets `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`.

### 4.7 Tax engine (R201)

```ts
type TaxRegime = 'gst' | 'vat' | 'sales_tax' | 'none';
computeInvoiceTax({ regime, seller: { country, state, taxId, rates }, buyer: { country, state, taxId, isBusiness }, lines: [{ amount, taxRate?, hsnSac?, exempt? }] })
  => { lines, taxLines: { code: 'CGST'|'SGST'|'IGST'|'VAT'|'SALES_TAX', rate, base, amount, label }[], totalTax, notes: string[], placeOfSupply }
```

- GST: same state → CGST + SGST; different state → IGST; buyer outside India → zero-rated export of services with the note "Supply meant for export under LUT" (wording for the accountant to confirm). Existing CGST/SGST/IGST columns keep being filled for GST invoices.
- VAT: the agency's standard rate (settings; seed UK 20%, UAE 5%, Saudi 15%, Germany 19%, others entered by the agency); B2B buyer with a VAT id in a different country (EU/UK) → 0% with the note "Reverse charge: the customer accounts for VAT"; B2C → seller's rate (no OSS engine in v1).
- Sales tax: one rate entered by the agency (US state/local), no nexus engine.
- None: no tax lines (Gulf agencies below the VAT threshold, SE Asia without registration).
- Invoices store `tax_regime`, `tax_breakdown` (TEXT JSON of `taxLines`), `seller_tax_id`, `buyer_tax_id`, `place_of_supply`, `tax_notes` (tenant migration 0045), so a later settings change never rewrites history. Contacts get `tax_id` (exists? the executor checks; add in 0045 if missing). The invoice PDF (client-side jspdf) renders labels from `tax_breakdown`, not hardcoded GST labels.

### 4.8 Currency and locale helpers (R202, R203, R204)

- Tenant settings keys (existing `settings` table): `currency`, `locale` (BCP 47, default `en-IN`), `timezone`, `date_format`, `country`, `phone_default_country`; per-user `users.locale` and `users.timezone` (tenant migration 0046) override.
- Backend `utils/money.ts`: `formatMoney(amount, currency, locale)` with `Intl.NumberFormat`; used by invoice/payment emails, `excel-export.ts`, PDFs generated server-side; removes the hardcoded `₹` in `routes/invoices.ts`, `routes/payments.ts`, `services/exports/excel-export.ts`. Exchange rates stored daily in master `exchange_rates` (migration 0019) with the last good rate as fallback instead of INR-only constants.
- Desktop: `lib/locale.ts` holds the active `{ currency, locale, timezone }`, set at login from `tenant-summary` and on settings change; `formatCurrency(amount, currency?)` in `lib/utils.ts` and `formatDisplayDate` in `lib/dates.ts` read it, so the 73 existing call sites change only where they pass a literal `'INR'` or `'en-IN'`. R203 sweeps those literals page by page (the audit counted 178 `en-IN` and 93 `INR` lines in desktop); lakh/crore compact notation only when the locale is `en-IN`.
- Flutter `packages/shared/lib/utils/currency_utils.dart`: `format(amount, currencyCode, locale)` via `intl` `NumberFormat.simpleCurrency`; the driver app takes currency and locale from the login response.
- Phones: backend `utils/phone.ts` `normalizePhone(raw, defaultCountry)` takes the tenant's default country (no more `91` assumption); desktop `PhoneInput` uses the full ISO country list (from a static table in `lib/countries.ts`, no new dependency) defaulting to the tenant country; the driver app gets the same full list.

### 4.9 i18n rollout (R210, R211)

Order: (1) wire the existing context in `desktop/src/lib/i18n.ts` into the app shell, navigation, auth pages and shared components, with English as the complete source catalogue and a lint rule (`no-literal-ui-strings` in warn mode) to stop new literals; (2) leads, contacts, itineraries, invoices, settings pages; (3) Arabic catalogue for those, `dir="rtl"` on `<html>` from the user's language, Tailwind logical utilities (`ms-`/`me-`/`ps-`/`pe-`, `start`/`end`) replacing left/right in the shell and archetypes, mirrored icons where direction matters, numbers kept in Latin digits unless the agency chooses otherwise; (4) Hindi stays at its current partial catalogue; more languages after launch. Machine translation is not used in development (cost rule); Arabic strings are drafted by the executor without AI calls and flagged for a native review (go-live item).

### 4.10 Billing (R205, R206, R207)

- `BillingGateway` interface in `backend/src/services/billing/gateway.ts`: `createCheckout({ tenantId, priceId, seats, successUrl, cancelUrl })`, `verifyWebhook(request, rawBody)`, `parseEvent(rawBody) → BillingEvent`, `cancelSubscription(id)`. Implementations: `RazorpayGateway` (India, INR; Subscriptions or Payment Links), `StripeGateway` (everything else; Checkout Sessions in subscription mode), `MockGateway` (local: checkout returns a local URL that posts a signed mock webhook back). Gateway chosen by the tenant's market (`IN` → Razorpay).
- Webhooks: `POST /api/v1/billing/webhooks/:gateway`, public, signature checked (Stripe `Stripe-Signature` HMAC-SHA256 with timestamp tolerance 5 min; Razorpay `X-Razorpay-Signature` HMAC-SHA256 of the raw body), then `INSERT OR IGNORE INTO billing_events (gateway, event_id, ...)` as the first write; a duplicate returns 200 and does nothing. The super admin app's Razorpay webhook route is deleted (R112).
- Subscription state in master `subscriptions` (exists): `trialing → active → past_due (grace 7 days) → expired`, `cancelled`; tenant status follows. Platform invoices to agencies are numbered and stored in master with the platform's own tax (GST 18% in India; export of services abroad: accountant to confirm).
- Prepaid balance (R206): master `wallet_accounts` and `wallet_entries` (append-only ledger, amounts REAL in the account currency, `idempotency_key` UNIQUE); top-ups through the gateway checkout; debits for SMS, marketing WhatsApp, calls, numbers and AI credit packs; balance check before a paid send; 80% and zero alerts.
- Customer payments (R207): agencies paste their own Razorpay or Stripe keys (encrypted with R108's helper); `POST /invoices/:id/payment-link` creates a link; the gateway webhook to `/api/v1/webhooks/payments/:tenantKey/:gateway` records the payment idempotently and emits `payment.recorded`.

### 4.11 GDPR and DPDP tooling (R208, R209)

Consent records (`contact_consents`: contact, channel, purpose, status granted/withdrawn, source, captured_at, evidence JSON; tenant migration 0048), contact data export (JSON + CSV zip in R2, signed link, 24 h), erasure (hard delete of the contact and dependent personal rows across tenant tables and R2 objects, invoices kept with the party replaced by "Erased contact <short id>" because tax law requires keeping them, audit entry), public unsubscribe link in every marketing email and WhatsApp template footer, cookie notice on the landing page (it sets no tracking cookies today, so a notice rather than a consent wall), privacy policy, terms, DPA and sub-processor list as drafts in `landing/legal/` marked "draft, needs legal review", password policy (12 characters minimum, breached-password check is not offline-possible so it is skipped), TOTP 2FA implemented with WebCrypto HMAC-SHA1 (no new dependency), recovery codes hashed.

### 4.12 Data residency (R212)

Region chosen at agency creation: `in` (D1 location hint `apac`), `eu` (D1 jurisdiction `eu`, R2 bucket `travelcrm-files-eu` created with the EU jurisdiction), `uk` (stored in `eu` unless the owner wants otherwise; UK GDPR accepts EU storage), `us` (`wnam`), `au` (`oc`), `gulf` (`apac` or `eeur`; no Gulf region exists). Stored in `tenants.region` (master migration 0022); the provisioner passes it to D1 creation; file routes pick the R2 binding for the region (`FILE_STORAGE` default, `FILE_STORAGE_EU`). Stated limit: the master DB, KV and logs stay global and hold agency names, user emails and usage; the privacy policy must say so.

### 4.13 VoIP reseller pieces (R301 to R308)

Provider-agnostic until G1: `VoipProvider` gains `createSubAccount`, `closeSubAccount`, `searchNumbers`, `buyNumber`, `releaseNumber`, `placeCall({ mode: 'softphone' | 'bridge' })`, `clientToken`, `fetchUsage(since)`, `validateSignature`; `MockVoipProvider` plus a local call simulator (`POST /test/voip/simulate` under TEST_MODE) drive every flow in tests. Callbacks: signature checked on every route, `provider_events` table with `INSERT OR IGNORE` on provider + call id + status + sequence, `call_logs` unique on provider call id. Lifecycle events and recipes exactly as `docs/CALL-AUTOMATION.md` section 4.2/4.3 (screen pop over the existing realtime Durable Object; timeline entries; `leads.contacted_on_call`; next-step suggestion; suggestion-only for anything customer-facing). Recordings: consent announcement on by default, copy to R2 then delete at the provider, retention job, signed short-lived playback links, role matrix from CALL-AUTOMATION 3.7. Transcription: queue producer added, Workers AI Whisper as the standard engine, Deepgram optional, summary through the metered AI router (never direct Anthropic), new per-minute credit class. Metering: usage pulled per sub-account every 5 minutes into `call_usage`, priced from `call_rates` (owner-editable retail table), debited from the wallet (R206); refuse outbound at zero, never cut a live call, small inbound overdraft; country allow-list, premium/satellite prefix block, per-agent and per-agency rate limits, max call length, daily spend alert; no calling on trial. Country switch: calling features shown only where the ADR says RESELL or CALL-BRIDGE (`call_country_policy` rows).

### 4.14 WordPress provisioning (R309, R310)

Backend `wp-provision-queue.ts` stops being a stub: it calls `POST ${OCI_PROVISIONER_URL}/sites` with `X-Timestamp` and `X-Signature` (HMAC-SHA256 of timestamp + body with `PROVISIONER_SECRET`), records `wordpress_sites.status` (`queued`, `provisioning`, `active`, `failed`, with `last_error`), retries 3 times then dead-letters; the super admin console's WordPress page enqueues (today the send is commented out) and shows status with Retry. `oci-provisioner` refuses to start without `PROVISIONER_SECRET` (no `'change-me'` default), verifies the signature and timestamp (5-minute window), and derives `MAX_SITES` from available memory. To fit the Always Free allowance, which may be 2 OCPU / 12 GB rather than the 4 OCPU / 24 GB terraform asks for (coordinator note; verify on Oracle's page at go-live), R310 sizes the VM from a variable defaulting to the free allowance and switches to one shared MariaDB container with a database per site (about 512 MB per site instead of 768 MB), which gives roughly 20 sites per 12 GB VM; beyond that the cost is written in the runbook. Local proof uses Docker if it is installed, otherwise a mock provisioner.

## 5. Cost model "ten ways to cut cost" mapped to batches

| # | Cost-model item | Code change? | Batch |
|---|---|---|---|
| 1 | Stop paying for SMS out of the plan; domestic route; charge balance | yes | R110 (allowance 0 in India plans, hard cap, metering), R206 (balance), domestic SMS provider (MSG91) **not included in v1**: needs DLT registration by the owner; listed in section 8 |
| 2 | WhatsApp direct through Meta Cloud API; marketing to balance; utility category | yes | R213 (Meta provider behind `MessagingProvider`), R110 (separate utility/marketing allowances), R206 (balance) |
| 3 | Replace Twilio Verify by SMS for login codes; per-number/IP limits; longer driver sessions | yes | R110 (codes generated in the Worker, delivered by email for staff and by WhatsApp authentication template when configured, Twilio Verify kept only as a fallback the owner can switch off; limits per phone, IP and tenant; driver refresh token 30 days) |
| 4 | Fix the usage-cap reset | yes | R105 |
| 5 | Calls on a prepaid balance through Plivo; release numbers | yes | R206, R304, R305 (G1) |
| 6 | One shared website installation; correct machine size | yes | R310 (shared MariaDB, free-tier sizing); a full multisite switch is an owner question (Q9) |
| 7 | Make the live-updates Durable Object hibernate | yes | R117 (hibernation handlers only, `setWebSocketAutoResponse` for pings) |
| 8 | Cheaper AI models and no unmetered AI | partly | R306 routes call summaries through the metered router; model choice is a live-quality test (needs paid calls) and is **not in this plan**: go-live item with a capped 20-call test |
| 9 | Recordings to our storage with retention; cheaper transcription default | yes | R306 |
| 10 | Stop the cron looping over every agency; fewer per-request lookups | yes | R105 (fan-out), R101 (tenant info: the binding name travels in the access token claims `db`, so most requests skip KV) |

## 6. Verify at go-live (only mockable here)

| Item | Mocked locally by | What to check for real |
|---|---|---|
| Cloudflare D1 create/query and Worker binding registration | `CloudflareTenantProvisioner` tests with mocked `fetch` | create a DB with a location hint and with `jurisdiction: eu`; add a binding to the live Worker without a redeploy; a deploy with 50+ D1 bindings; deploy time with many bindings |
| Generated production config | `wrangler deploy --dry-run` | real resource ids, custom domains, queues created, `[observability]` visible in the dashboard |
| Tenant migrations remote | `migrate-tenants.mjs --local` | `--remote` against a staging account with 3 tenants, canary stop on failure |
| Time Travel restore | not testable locally | restore a staging tenant DB to a timestamp |
| SendGrid sending and domain authentication | local outbox in KV | SPF/DKIM, deliverability of welcome and reset mails |
| Stripe, Razorpay checkout and webhooks | `MockGateway`, recorded signed fixtures | test-mode checkout end to end with the owner's test keys, then live keys |
| Meta WhatsApp Cloud API | mocked `fetch`, signed fixtures | business verification, template approval, webhook verify token |
| Twilio Verify / WhatsApp OTP template | mocked | delivery in India, template approval |
| Plivo/Twilio sub-accounts, numbers, softphone, bridge | `MockVoipProvider`, simulator | G1 provider, KYC, India legal opinion, one real call per country |
| Workers AI Whisper and summary quality | not called (cost rule) | the 20-call quality test, capped |
| Turnstile on public forms | skipped when the secret is unset | site key and secret on the landing domain |
| Electron code signing and SmartScreen | unsigned local build | OV/EV certificate, signed installer, update from the real feed |
| macOS DMG, iOS build, notarisation | not possible on this machine | Mac runner or CI |
| Android release signing with the owner's keystore, Play internal track | throwaway keystore | owner-held upload key, Play Console |
| FCM push (legacy key retired) | not in scope (see section 8) | HTTP v1 API with a service account |
| Oracle VM, Docker sites, DNS wildcard | Docker locally if installed, else mock provisioner | free-tier shape availability, Caddy TLS for agency subdomains |
| Landing page hosting and DNS | static serve + link check | Pages project, domain, HTTPS |
| Error tracking endpoint | console reporter | Sentry-compatible DSN if the owner wants one |
| GitHub Actions on the real repo | workflows linted with `actionlint` if available; fresh-clone script locally | first green run after the repo is private |

## 7. Keys and accounts

| Tier | Needed now (local work) | Optional now (turns a mock into a real check) | Needed at go-live |
|---|---|---|---|
| 1 | Nothing. Owner action only: make `sn-arjun/travel-crm` private and revoke the old token (R100). | SendGrid test key with a verified sender (real welcome mail); Cloudflare account with the Workers Paid plan and an API token scoped to a **staging** account (real D1 create via the provisioner) | Cloudflare Workers Paid + API token; domain; fresh `JWT_SECRET`, `CREDENTIALS_KEYS`, `UNSUB_SECRET`, `PROVISIONER_SECRET`, super admin password; SendGrid with domain authentication; Windows OV/EV code-signing certificate; Google Play account and the owner's upload keystore; Apple Developer account (iOS driver app) |
| 2 | Nothing | Stripe test keys, Razorpay test keys (free), Meta WhatsApp test number | Stripe and Razorpay live keys and webhook secrets; Meta WhatsApp Business verification and templates; Turnstile keys; a lawyer's review of the privacy policy, terms and DPA; a native Arabic reviewer |
| 3 | Nothing (provider-agnostic work) | Plivo and Twilio trial accounts (one real call per mode) | G1 decisions; Plivo India + international accounts (India-registered entity with GST, KYC per agency); Twilio for Germany/Malaysia if chosen; Deepgram key if the premium engine is offered; Oracle Cloud keys; telecom lawyer opinion for India |

Secrets to rotate at go-live because they were in public `master` history or tracked files (R100 lists them): every value ever in `backend/.dev.vars` (committed in `c668ebd` and `6d75a0b`), the super admin defaults in `super-admin/wrangler.toml` and its code fallbacks, any token in old remote URLs. Production must use fresh values for all secrets regardless.

## 8. Not included in v1, and why

- **Domestic Indian SMS route (MSG91 or similar).** Needs DLT entity and template registration by the owner; until then SMS allowance is 0 in India plans and WhatsApp or email carries the message.
- **Push notifications.** The code uses the retired FCM legacy key; the driver app has no push package. Moving to FCM HTTP v1 with a service account and adding `firebase_messaging` is a separate piece of work; drivers refresh trips every 60 s today. Recommend after launch.
- **AI model switch (Haiku 5.5 vs Llama 70B).** Needs paid quality tests; out of the no-paid-AI rule. Go-live test, capped at 20 requests.
- **Automatic self-serve signup with instant provisioning.** v1 uses request + operator approval (fraud and cost control). Revisit when billing is live.
- **Custom roles, SSO/SAML.** Six fixed roles cover the target agencies.
- **OSS (EU one-stop-shop) VAT engine and US sales-tax nexus.** Agencies enter their rates; a tax engine service can come later.
- **Router Worker and shards.** Not needed below about 4,500 agencies; the fallback is written down (4.1).
- **Desktop `/super-admin` pages.** Removed in R112 rather than kept in sync with the standalone console (one operator console, as the program plan decided).
- **Super admin pages for SEO** (mock data today) and announcements/support delivery to agencies: announcements and support tickets are hidden from the console until a tenant-side reader exists (owner question Q8).
- **macOS and iOS builds.** Need a Mac; runbook item.
- **Queues, ring groups, warm transfer, presence for calls.** ADR scope is click-to-call, inbound routing, voicemail and recording.
- **Telnyx adapter and self-hosted PBX.** Rejected in ADR-001.

## 9. Risks and the mitigation built into the plan

| Risk | Mitigation in the plan |
|---|---|
| Tenancy change breaks the 766-test e2e baseline | Single mode stays the default for `fix-stack` and vitest; multi mode is opt-in (`--multi`), and R121 adds isolation tests rather than converting the suite |
| A deploy from the checked-in toml ships single mode or no bindings | `predeploy` guard (R103), production refuses `single` without the pilot switch and refuses `TEST_MODE` (R101/R106) |
| Binding registration via API does not work as hoped | Provisioner returns `pending_deploy`; operator deploys from the generated config; documented in the runbook |
| Cron fan-out multiplies queue cost | One message per tenant per 5 minutes is about 8,640 messages per tenant per month; at 1,000 tenants that is within Queues' paid included volume per the cost model; daily jobs move to daily crons |
| Encryption key loss | Keys held as Worker secrets and in the owner's password manager; re-encrypt endpoint supports rotation; missing key is a 503, never silent plaintext |
| Parallel batches collide on migrations | Numbers pre-assigned per batch (section 10) |
| Owner changes prices | Catalogue tables; no code change (R109) |
| G1 delayed | Provider-agnostic VoIP batches (R301–R303, R306) proceed; G1 batches wait |
| Driver app edited while the owner builds it | Batch notes require checking for a running Gradle/Flutter process first |
| A batch grows beyond one sitting | Each batch is sized S/M/L; executor stops and reports after two failed fix attempts (FIX-PLAN rule 10) |
| Public repository | R100 first; nothing pushed until private; rotation list |
| Paid API calls in tests | No batch calls a paid API; all providers mocked; `fix-stack --ai` not used by any gate |

## 10. Pre-assigned migration numbers

| Batch | Master (`backend/drizzle/master`, highest today 0010) | Tenant (`backend/drizzle/tenant`, highest today 0042) |
|---|---|---|
| R101 | 0011_tenant_db_binding.sql | — |
| R104 | 0012_tenant_provisioning.sql | 0043_users_must_change_password.sql |
| R105 | 0013_usage_cap_periods.sql | — |
| R108 | 0014_api_key_hashing.sql | — |
| R109 | 0015_plan_catalogue.sql | — |
| R110 | 0016_otp_requests.sql | — |
| R111 | 0017_impersonation_audit.sql | — |
| R116 | 0018_platform_enquiries.sql | — |
| R119 | — | 0044_call_logs_nullable_creator.sql |
| R201 | — | 0045_invoice_tax_regime.sql |
| R202 | 0019_exchange_rates.sql | 0046_user_locale_timezone.sql |
| R205 | 0020_billing.sql | — |
| R206 | 0021_wallet.sql | — |
| R207 | — | 0047_payment_links.sql |
| R208 | — | 0048_contact_consents.sql |
| R209 | — | 0049_user_two_factor.sql |
| R212 | 0022_tenant_region.sql | — |
| R302 | — | 0050_provider_events.sql |
| R304 | 0023_voip_subaccounts.sql | — |
| R305 | 0024_call_rates_usage.sql | — |
| R309 | 0025_wordpress_status.sql (only the columns that do not exist yet) | — |

## 11. Questions the owner must answer

| # | Question | Blocks |
|---|---|---|
| Q1 | Make the GitHub repository private and revoke the old token (action, not a question). | pushing anything; R118's CI can only run after this |
| Q2 | Pricing structure: keep per-agency yearly (₹12k/18k/24k with 5/15/100 seats) or switch to per-user (₹200/300/400 per user per month, minimum 5)? International prices from the cost model? | only which catalogue rows are active (R109 is data-driven either way) |
| Q3 | Trial length (14 days as on the landing page?) and what a trial includes (cost model: no SMS, no calls, 200 AI credits). | R109 seed values |
| Q4 | Signup: request + approval by you (planned), or instant self-serve trial? | R116 behaviour |
| Q5 | Login codes: OK to send staff login codes by email and drivers' by WhatsApp authentication template, keeping Twilio Verify only as a fallback? | R110 defaults |
| Q6 | G1 items in ADR-001 section 9a (provider, India shape, legal opinion, countries, prepaid, retail prices, trials, recording default, call AI, signing entity). | R304, R305, R307, R308 |
| Q7 | Data regions to offer at launch (India + EU only, or all six)? | R212 scope |
| Q8 | Announcements and support tickets: build the agency-side reader, or hide them from the console for v1 (planned: hide)? | R112 |
| Q9 | WordPress: per-agency containers with a shared database (planned), or one WordPress multisite for all agencies (cheaper, less isolated)? | R309/R310 |
| Q10 | Which legal entity holds provider and gateway accounts and invoices foreign agencies? | R205 platform invoice header, go-live |
| Q11 | Domain names to use (`travelcrm.pro` appears in code; is it owned?). | R102 defaults, R116, go-live |
| Q12 | Remove unverified landing claims (500+ agencies, $2.4M, 99.9% uptime, named agencies, testimonials, 4.9 rating)? Planned: remove until evidenced. | R116 |

## 12. Batch catalogue (run order; generated from batches/INDEX.json)

| # | Id | Tier | Size | Title | Depends on | Owner block |
|---|---|---|---|---|---|---|
| 1 | R100 | 1 | S | Owner action: make the repository private, revoke the old token, list secrets to rotate | — | owner action: GitHub settings and token revocation |
| 2 | R101 | 1 | L | Tenancy resolver: one binding scheme, fail closed, every lookup through resolveTenantDb | — | — |
| 3 | R114 | 1 | L | Desktop installer that works: Next server inside Electron, runtime API URL, icons, auto-update | — | — |
| 4 | R102 | 1 | M | Transactional email with a local outbox; app URLs and sender from config | R101 | — |
| 5 | R120 | 1 | M | Carry-over defects from the walkthrough: command palette, calendar stray 0, credit notes in the invoice list, yearly numbering reset | — | — |
| 6 | R103 | 1 | L | Local multi-tenant stack, generated wrangler config, tenant migration runner | R101 | — |
| 7 | R116 | 1 | M | Landing page that converts honestly: working CTAs and forms, legal page drafts, sitemap, no unverifiable claims | R101, R102 | — |
| 8 | R104 | 1 | L | Tenant provisioner in the backend: POST /admin/tenants creates a working agency | R101, R102, R103 | — |
| 9 | R115 | 1 | M | Driver app release: agency code login, release signing from an untracked keystore, iOS permission strings | R101 | — |
| 10 | R105 | 1 | L | Cron fan-out through a queue, working cron jobs, usage caps reset once per period | R101, R103 | — |
| 11 | R119 | 1 | M | Call code matches the schema: inbound endpoint, routing, missed calls, extraction follow-ups, dial page lead link | R101 | — |
| 12 | R106 | 1 | M | Security: tenant-scoped files, real login limits, CORS and URLs from config, rate limits applied, TEST_MODE fenced | R101 | — |
| 13 | R108 | 1 | M | Credentials encrypted at rest, API keys hashed | R101 | — |
| 14 | R107 | 1 | M | Provider webhooks signed, chatbot widget on a public mount keyed by widget key | R101 | — |
| 15 | R109 | 1 | L | One plan catalogue in the master database: features, prices, seats, allowances, trial expiry | R101, R105 | — |
| 16 | R110 | 1 | L | Cost caps: SMS, WhatsApp, email and login-code allowances enforced; cheaper, abuse-proof login codes | R109, R105 | — |
| 17 | R117 | 1 | M | Operations: real health check, structured logs with an error-reporting hook, backups, hibernating realtime | R105 | — |
| 18 | R111 | 1 | L | Super admin backend API: its own login, tenant lifecycle writes, AI credit top-up, impersonation, full audit | R104, R109 | — |
| 19 | R113 | 1 | M | First login: forced password change, onboarding wizard reachable, change password in settings | R104 | — |
| 20 | R112 | 1 | L | Super admin console uses the backend, OpenNext build, no tracked credentials; desktop super-admin pages removed | R111 | — |
| 21 | R118 | 1 | L | CI on the right branch with one npm workspace model, fresh-clone job, driver and desktop jobs; terraform serves the landing page | R103, R112, R114, R115, R116, R117 | — |
| 22 | R121 | 1 | M | Three-agency isolation end-to-end test (Tier 1 exit) | R104, R106, R107, R108, R113 | — |
| 23 | R122 | 1 | M | README and CONTRIBUTING rewritten for the desktop-first, multi-tenant product | R118, R121 | — |
| 24 | R201 | 2 | L | Tax engine: GST, VAT with reverse charge, sales tax or none, stored on every invoice | R121 | — |
| 25 | R210 | 2 | L | i18n wiring: English catalogue complete for the shell, navigation, auth and shared components; language switch | R121 | — |
| 26 | R202 | 2 | L | Locale core: currency, locale and time zone from tenant and user settings in backend and desktop helpers | R201 | — |
| 27 | R203 | 2 | L | Desktop sweep: remove hardcoded INR, en-IN and Asia/Kolkata from pages and components | R202 | — |
| 28 | R205 | 2 | L | Subscription billing: Razorpay for India, Stripe elsewhere, behind one gateway interface with idempotent webhooks | R109, R111 | — |
| 29 | R204 | 2 | M | Phones by tenant country everywhere; full country list in desktop and driver app; Flutter currency formatting | R202 | — |
| 30 | R208 | 2 | L | GDPR and DPDP tooling: consent records, contact export and erasure, public unsubscribe, cookie notice, legal links | R121 | — |
| 31 | R206 | 2 | M | Prepaid balance: one wallet per agency for messages, numbers, calls and AI top-ups | R205, R110 | — |
| 32 | R209 | 2 | M | Two-factor sign-in (TOTP) and a stronger password policy | R113 | — |
| 33 | R207 | 2 | M | Agencies collect from their customers: payment links on invoices through the agency's own Razorpay or Stripe | R201, R206, R108 | — |
| 34 | R211 | 2 | L | Arabic with right-to-left layout for the core screens | R210, R203 | — |
| 35 | R212 | 2 | M | Data residency: choose the agency's data region at creation | R104, R103 | owner decision Q7 (which regions at launch) |
| 36 | R213 | 2 | L | WhatsApp direct through Meta's Cloud API behind the existing messaging interface | R110, R107, R108 | — |
| 37 | R301 | 3 | M | VoipProvider contract for reselling, a mock provider and a local call simulator | R119, R107 | — |
| 38 | R309 | 3 | M | WordPress site provisioning: backend queue calls the provisioner, signed and retried, status in the super admin console | R111, R112 | — |
| 39 | R302 | 3 | M | Every call callback signed and processed once; inbound and outbound flows correct | R301 | — |
| 40 | R310 | 3 | M | WordPress hosting sized to Oracle's free allowance with a shared database container | R118 | owner decision Q9 (shared database per VM vs multisite) |
| 41 | R303 | 3 | L | Call lifecycle events, call recipes, timeline entries and the screen pop | R302 | — |
| 42 | R306 | 3 | L | Recordings in our storage with consent and retention; transcription and call summary through metered AI | R303 | — |
| 43 | R304 | 3 | L | Sub-account per agency, number purchase and release, number registration, country switch (G1) | R303, R206, R111 | G1 |
| 44 | R305 | 3 | L | Minute metering from provider records, prepaid debits with markup, fraud limits (G1) | R304 | G1 |
| 45 | R307 | 3 | L | Softphone in the desktop app for resell countries (G1) | R303, R304 | G1 |
| 46 | R308 | 3 | M | India call-bridge: the agent's own phone rings first, then the customer (G1) | R303, R304, R305 | G1 |

Counts: Tier 1 23 (S 1, M 12, L 10; R100 is the owner action), Tier 2 13 (M 5, L 8), Tier 3 10 (M 5, L 5).

Every batch file was checked by the planner's generator on 2026-10-14: valid JSON, every `files.edit` path exists today or is created by an earlier batch, no `files.create` path exists yet, every `dependsOn` runs earlier in this order, and no two batches declared `parallelSafeWith` list the same file. Glob entries (for example `desktop/src/app/(app)/**` in R203) are not checked automatically; their `mustNotTouch` lists carve out the partner batch's files.
