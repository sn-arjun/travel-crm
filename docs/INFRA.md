# TravelCRM Pro: infrastructure as built

Written 2026-10-15 from the code on branch `launch-readiness` and updated the same day for batch R125 (the go-live blockers: terraform, domain placeholder, safe scripts, installer update feed, weekly backup, agency web app) and for R201, R202, R301 and R302. Nothing described here has been deployed yet: every statement is about what the files say, not what a live Cloudflare account does. Where the code and a document disagree, this file says so in sections 10 and 11.

Companion documents: [GO-LIVE.md](GO-LIVE.md) (the step-by-step runbook), [KEYS-AND-ACCOUNTS.md](KEYS-AND-ACCOUNTS.md) (every account and key), [COST-MODEL.md](COST-MODEL.md) (prices and arithmetic), [ops/BACKUPS.md](ops/BACKUPS.md) (backup details).

## 1. Summary

TravelCRM Pro runs almost entirely on Cloudflare. One API program (a Cloudflare Worker named `travelcrm-api`) serves the desktop app, the driver app, the website enquiry form and the operator console. It keeps one small database (Cloudflare D1, which is SQLite) per travel agency plus one "master" database that lists the agencies, their plans and the platform's own operator accounts. Files go to R2 storage, short-lived data to KV key-value stores, background work to Queues, live screen updates to a Durable Object, and three cron triggers wake the system every 5 minutes, hourly and daily. The operator console (`travelcrm-super-admin`) is a second Worker that holds no data of its own and calls the API. The agency web app (`travelcrm-app`) is a third Worker: the desktop app's Next.js code built as a website, which hosts the pages emails link to. The marketing site is a static folder on Cloudflare Pages. Agencies' staff use an Electron desktop app (Windows first) that talks to the API over the internet; drivers use a Flutter Android app. Per-agency WordPress websites on an Oracle Cloud VM are planned for Tier 3 and are not built.

## 2. Topology

```
                                  Internet
 ┌──────────────────────┬─────────────────────────┬───────────────────────────┬──────────────────────┐
 │ Agency staff         │ Drivers                 │ Platform owner            │ Visitors             │
 │ Desktop app          │ Driver app (Android;    │ Super admin console       │ Landing page         │
 │ (Electron + Next.js, │ iOS needs a Mac)        │ admin.<domain>            │ <domain>, www        │
 │ Windows installer)   │                         │ Worker travelcrm-         │ Cloudflare Pages     │
 │                      │                         │ super-admin (OpenNext)    │ project              │
 │                      │                         │                           │ travelcrm-landing    │
 └──────────┬───────────┴────────────┬────────────┴─────────────┬─────────────┴──────────┬───────────┘
            │  https://api.<domain>/api/v1/...                  │ BACKEND_API_URL         │ form posts to
            └────────────────────────┼──────────────────────────┘ (/admin/* with its      │ /api/v1/public/
                                     ▼                             own token)             │ enquiries
                       ┌──────────────────────────────────────────────┐◄───────────────────┘
 Providers ───────────►│ API Worker  travelcrm-api  (Hono)            │──► Workers AI (binding AI)
 (webhooks: Twilio,    │  - cron triggers: */5, hourly, 00:30 UTC     │──► SendGrid, Twilio, Anthropic,
  SendGrid, WhatsApp)  │  - rate-limit bindings (2)                   │    Deepgram, Google Maps (HTTPS)
                       │  - queue consumers (fan-out per agency)      │──► Cloudflare REST API (creates
                       └──┬───────┬────────┬─────────┬────────┬───────┘    each agency's D1 database)
                          │       │        │         │        │
                MASTER_DB │  TENANT_DB_*   │      R2 │   Queues + DLQs     Durable Object REALTIME
                (D1: agency│ (one D1 per   │  FILE_STORAGE   (14 queues)      (class RealtimeRoom,
                 registry, │  agency)      │  travelcrm-files                  live updates, /api/v1/ws)
                 plans,    │               │
                 operators)│          KV: CACHE, SESSIONS, REPORT_CACHE

 Backups: R2 bucket travelcrm-backups (weekly dump) + D1 Time Travel (30 days)
 Desktop updates: R2 bucket travelcrm-desktop-updates, to be served at downloads.<domain>
 Agency web app: Worker travelcrm-app at app.<domain> (reset, invite, /q/<token>, /download, /quick-start; calls the API)
 Later (Tier 3): Oracle Cloud VM (ARM, free allowance) running ONE shared WordPress Multisite for all agency sites; DNS *.sites.<domain> and wp-api.<domain> -> VM (docs/ops/WORDPRESS-HOSTING.md)
```

Two details to keep in mind:

* The desktop app is a normal web app (Next.js) running inside Electron. The installer ships its own small local web server and talks to the API at the address stored in `<app data>/config.json` (set from the app's settings screen), falling back to an address baked in at build time (`TRAVELCRM_API_URL`, or `https://api.<DOMAIN>/api/v1` derived from `DOMAIN`), falling back to `http://localhost:8787/api/v1`. The same code is also built as a website for `app.<domain>` (section 3, `travelcrm-app`).
* The operator console never touches a database. It has its own login (issued by the API at `/api/v1/admin/auth/login`) and its own signing secret.

## 3. Cloudflare bindings

Source of truth: `backend/wrangler.base.toml`. A script (`backend/scripts/gen-wrangler.mjs`) copies it into the generated, git-ignored file `backend/.wrangler.<env>.toml` and adds the databases. See section 7 for the rule about this.

| Binding name | Type | What it is for | Declared in |
|---|---|---|---|
| `MASTER_DB` | D1 database `travelcrm-master` (migrations in `backend/drizzle/master`) | Agency registry (`tenants`), subscriptions, plan catalogue, super admin accounts, impersonation audit, OTP requests, usage alerts, website enquiries | Generated by `gen-wrangler.mjs` (id from `CF_D1_MASTER_ID`); also in `backend/wrangler.toml` with a placeholder id for plain `wrangler dev` |
| `TENANT_DB_<hex>` (one per agency) | D1 database (migrations in `backend/drizzle/tenant`) | All of one agency's data. `<hex>` is the agency id without hyphens, lower case. Locally the names are `TENANT_DB_POOL_1..N` | Generated from the agency registry (`--registry` file or `--from-d1-remote`) |
| `FILE_STORAGE` | R2 bucket `travelcrm-files` | Uploaded documents and generated files | `wrangler.base.toml` |
| `CACHE` | KV namespace | Agency registry cache (5 minutes), health probe, local test outbox | `wrangler.base.toml` (id from `CF_KV_CACHE_ID`) |
| `SESSIONS` | KV namespace | Login sessions and refresh tokens | `wrangler.base.toml` (id from `CF_KV_SESSIONS_ID`) |
| `REPORT_CACHE` | KV namespace | Cached report results | `wrangler.base.toml` (id from `CF_KV_REPORT_CACHE_ID`) |
| `API_RATE_LIMITER` | Rate Limiting binding, namespace 1001, 600 requests per 60 s | General API limit per user (per IP when not signed in) | `wrangler.base.toml` |
| `UPLOAD_RATE_LIMITER` | Rate Limiting binding, namespace 1002, 20 per 60 s | Upload limit per user | `wrangler.base.toml` |
| `EMAIL_QUEUE` | Queue producer, `travelcrm-email-queue` (consumer: this Worker) | Outgoing email | `wrangler.base.toml` |
| `SMS_QUEUE` | Queue, `travelcrm-sms-queue` | Outgoing SMS | same |
| `PUSH_NOTIFICATION_QUEUE` | Queue, `travelcrm-push-queue` | Push notifications (still uses the retired FCM legacy key; see 11) | same |
| `WP_PROVISION_QUEUE` | Queue, `travelcrm-wp-provision-queue` | WordPress site creation (Tier 3; the consumer is a logging stub) | same |
| `IMPORT_QUEUE`, `IMPORT_DL_QUEUE` | Queues `travelcrm-import-queue`, `travelcrm-import-dlq` | Spreadsheet imports in chunks (3 retries, then the dead-letter queue) | same |
| `EXPORT_QUEUE`, `EXPORT_DL_QUEUE` | Queues `travelcrm-export-queue`, `travelcrm-export-dlq` | Large exports | same |
| `CAMPAIGN_QUEUE`, `CAMPAIGN_DL_QUEUE` | Queues `travelcrm-campaign-queue`, `travelcrm-campaign-dlq` | Bulk marketing sends | same |
| `AI_EXTRACTION_QUEUE`, `AI_EXTRACTION_DLQ` | Queues `travelcrm-ai-extraction-queue`, `travelcrm-ai-extraction-dlq` | AI reading of messages and calls | same |
| `TENANT_JOBS_QUEUE` | Queue `travelcrm-tenant-jobs` (dead-letter `travelcrm-tenant-jobs-dlq`) | One message per agency per cron tick; the consumer runs that agency's jobs. When this binding is missing the jobs run inline | same |
| `AI` | Workers AI | Message labelling, extraction, vision, call summaries (billed per use) | `wrangler.base.toml` |
| `REALTIME` | Durable Object, class `RealtimeRoom` (migration tag `v1`) | Live screen updates over WebSocket (`/api/v1/ws`) | `wrangler.base.toml` |
| Cron triggers | `*/5 * * * *`, `0 * * * *`, `30 0 * * *` (UTC) | See section 10 | `wrangler.base.toml` |
| Observability | Logs on, sampling rate 1 (every request) | Worker logs in the dashboard | `wrangler.base.toml` |

Resources that exist but are not bound to the API Worker (used from the command line or the desktop app's update check):

| Resource | Purpose | Created by |
|---|---|---|
| R2 bucket `travelcrm-backups` | Weekly database dumps | terraform (`modules/cloudflare/workers.tf`); the lifecycle rule is by hand |
| R2 bucket `travelcrm-desktop-updates` | Desktop update feed (installer plus `latest.yml`) | terraform; the public address `downloads.<domain>` is by hand |
| R2 bucket `terraform-state` | Terraform's own state file | by hand, before the first `terraform init` |
| Pages project `travelcrm-landing` | Marketing site | terraform (`modules/cloudflare/pages.tf`) |
| Worker `travelcrm-super-admin` | Operator console (OpenNext). Assets binding `ASSETS` from `.open-next/assets`; no database, KV or R2 | `super-admin/wrangler.toml`, deployed with `npm -w super-admin run deploy` |
| Worker `travelcrm-app` | Agency web app (OpenNext build of the desktop Next.js code, `TRAVELCRM_TARGET=web`). Assets binding `ASSETS`; no database, KV, R2 or secrets; variables `PLATFORM_DOMAIN`, optional `TRAVELCRM_API_URL`, `INSTALLER_URL`, `DRIVER_APP_URL`. Serves `/reset-password`, `/setup-account`, `/q/<token>`, `/download`, `/quick-start`, the sign-in pages and the console's support-session landing | `desktop/wrangler.toml`; `npm -w travelcrm-desktop run build:web`, `preview:web`, `deploy:web` (or the manual workflow `deploy-web.yml`) |

Terraform (`terraform/`, Cloudflare only) creates these resources: DNS zone, records for the root domain and `www` (to Pages), the records `*.sites` (agency websites) and `wp-api` (provisioner API), both DNS only, only when `oci_instance_ip` is set (Tier 3), the Pages project and its two domains, master D1, three R2 buckets (files, backups, desktop updates), three KV namespaces, all **14 queues** (the ten older ones plus `travelcrm-ai-extraction-queue`, `travelcrm-ai-extraction-dlq`, `travelcrm-tenant-jobs`, `travelcrm-tenant-jobs-dlq`), and the three Workers custom domains `api.<domain>`, `admin.<domain>` and `app.<domain>` (`cloudflare_workers_domain.api`, `.admin`, `.app`). A Workers domain can only be created after its Worker exists, so each is applied with `-target` after that Worker is deployed (GO-LIVE phases 3.9, 4.3, 4A.4). The Oracle Cloud VM is **not** part of this root: it is `terraform/oracle/` with its own state and its own `oci_*` variables (Tier 3), so the main plan needs only `domain`, `cloudflare_account_id` and `cloudflare_api_token`.

## 4. External services

"Platform key" means one key held by us (as a Worker secret) that serves every agency. "Agency key" means the agency supplies its own account and the key is stored encrypted in that agency's database (AES-256-GCM, key set `CREDENTIALS_KEYS`).

| Service | What it is for | Keyed by | Where it is configured |
|---|---|---|---|
| Cloudflare (Workers Paid, D1, R2, KV, Queues, Pages, Workers AI, DNS) | Everything above | Platform | API token for deploys; separate tokens for runtime provisioning (`CF_API_TOKEN`) and backups; see KEYS-AND-ACCOUNTS |
| SendGrid | System mail (welcome, password reset), agency email through the Communication Hub, delivery event webhook, inbound parse | Platform | `SENDGRID_API_KEY`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `INBOUND_EMAIL_SECRET`, sender settings; domain authentication in the SendGrid console |
| Twilio | SMS, WhatsApp (via Twilio senders), login codes (Verify), voice (the only calling provider: owner decision 2026-10-15; offered only in the countries of `VOIP_CALLING_COUNTRIES`, default GB, US, AU, SG; not offered in India, the Gulf, Thailand, Sri Lanka, Nepal, Bangladesh) | Platform today. Sub-account per agency is Tier 3 work (VoIP, partly built) | `TWILIO_*` secrets; callback URLs in the Twilio console (all under `<API_PUBLIC_URL>/api/v1/...`) |
| Plivo | Alternative SMS/voice adapter. Owner could not open an account; the adapter stays in the code, unused and untested | n/a | `PLIVO_*` (leave empty) |
| Exotel | Dropped by the owner decision of 2026-10-15 (ADR-001): no calling for agencies in India. Not built | n/a | none |
| Meta WhatsApp Business (Cloud API direct) | Not built; WhatsApp today goes through Twilio senders. A direct Meta integration is a later batch | Platform / agency (undecided) | none yet |
| Anthropic (Claude) | AI extraction (model `claude-haiku-4-5-20251001`); metered in AI credits | Platform | `ANTHROPIC_API_KEY` |
| Deepgram | Speech to text for call recordings (optional; uses model `nova-2`) | Platform | `DEEPGRAM_API_KEY` |
| Google Maps (Places) | Address autocomplete in the desktop app and driver app; some backend lookups | Platform | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (desktop build, public), `GOOGLE_MAPS_API_KEY` (Worker) |
| Firebase Cloud Messaging | Push to drivers. The code uses the retired legacy server key and the driver app has no push package, so push is effectively off | Platform | `FCM_SERVER_KEY` (declared; do not rely on it) |
| Cloudflare Turnstile | Bot check on the landing enquiry form (optional) | Platform | site key in `landing/config.js`, secret `TURNSTILE_SECRET` |
| Error reporting (Sentry-compatible endpoint) | Server errors with request and agency ids, no bodies | Platform | `ERROR_REPORTER_DSN` (blank: a structured log line only) |
| Stripe, Razorpay | Subscription billing and agency collections. Tier 2, not built: no code reads a Stripe or Razorpay key today | Platform | none yet |
| Oracle Cloud | WordPress VM (Tier 3). Separate terraform root `terraform/oracle/`, not part of the main apply | Platform | `oci_*` variables of `terraform/oracle` |
| GitHub | Source and Actions (deploy, CI) | Owner | repository secrets and variables |

## 5. Secrets and settings

Names only; values never go in the repository. The authoritative list is `interface Env` in `backend/src/types.ts`; local values are in `backend/.dev.vars.example`. "Where set" for production: **secret** = `npx wrangler secret put NAME -c .wrangler.production.toml --env production` (run in `backend/`); **generated var** = a plain variable the config generator (`backend/scripts/gen-wrangler.mjs`) writes into `[vars]`, derived from `DOMAIN` or from an environment variable of the same name at generation time (never `secret put`); **terraform tfvars** = `terraform/terraform.tfvars` (git-ignored).

### 5.1 API Worker (`travelcrm-api`)

| Name | Purpose | Required? | Where set (production) |
|---|---|---|---|
| `ENVIRONMENT` | `production` switches on safety checks (refuses `TEST_MODE`, refuses single-database mode, strict CORS) | Required | Generated var (set from `--env`) |
| `TENANCY_MODE` | `multi` = one D1 per agency. Anything but exactly `single` means multi | Required (`multi`) | Generated var (`multi` unless `--single`) |
| `ALLOW_SINGLE_TENANT_PRODUCTION` | `true` lets production run in single-database mode (a one-agency pilot only) | Never set | none |
| `TEST_MODE` | Enables `/api/v1/test/*`. Production refuses to serve if it is `true` | Must be unset | never set |
| `APP_URL` | Public address of the web app, used in emails and as a default CORS origin. Default `https://app.<DOMAIN>` | Required | Generated var (derived from `DOMAIN`; env var `APP_URL` overrides) |
| `API_URL` | The API's own address. Default `https://api.<DOMAIN>` | Required | Generated var (derived; `API_URL` overrides) |
| `CORS_ORIGINS` | Comma-separated web origins allowed to call the API. Default: the app address, `https://<DOMAIN>` and `https://www.<DOMAIN>` | Required | Generated var (derived; `CORS_ORIGINS` overrides) |
| `EMAIL_FROM` | Sender address of system mail. Default `noreply@<DOMAIN>` | Required | Generated var (derived; `EMAIL_FROM` overrides) |
| `EMAIL_FROM_NAME` | Sender display name | Optional | Generated var (env var `EMAIL_FROM_NAME` at generation) |
| `PLATFORM_SUPPORT_EMAIL` | Support address shown in mails | Optional | Generated var (env var at generation) |
| `QUOTES_URL` | Base of shared quotation links (default `APP_URL/q`, served by the agency web app) | Optional | Generated var (env var at generation) |
| `API_PUBLIC_URL` | The exact public URL providers call; Twilio signature checks use it. Must equal the real address (for example `https://api.<domain>`). Defaults to `API_URL` | Required | Generated var |
| `ALLOW_LOOPBACK_ORIGINS` | `true` lets the packaged desktop app (which serves itself from `http://127.0.0.1:<random port>`) call the API | Required (`true`, the generated default) | Generated var |
| `JWT_SECRET` | Signs agency login tokens | Required | secret |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | Required | secret |
| `SUPER_ADMIN_JWT_SECRET` | Signs operator tokens. 32+ characters, different from `JWT_SECRET`; the same value goes to the console | Required | secret |
| `SUPER_ADMIN_EMAIL` | Platform owner contact address | Optional | secret |
| `CREDENTIALS_KEYS` | JSON `{"k1":"<base64 of 32 random bytes>"}`; encrypts agency provider keys at rest. Losing it makes stored keys unrecoverable | Required | secret |
| `CREDENTIALS_ACTIVE_KEY_ID` | Which key encrypts new values, for example `k1` | Required | Generated var (default `k1`; env var of the same name at generation) |
| `HEALTH_TOKEN` | Shared secret for `/api/v1/health/deep` (header `X-Health-Token`) | Required for monitoring | secret |
| `ERROR_REPORTER_DSN` | Sentry-compatible DSN; blank means log lines only | Optional | secret |
| `SENDGRID_API_KEY` | Sends email | Required | secret |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | Verifies SendGrid's signed event webhook | Required once the webhook is on | secret |
| `INBOUND_EMAIL_SECRET` | Secret path segment in the SendGrid Inbound Parse URL | Optional | secret |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio login; the auth token also verifies webhook signatures | Required for SMS, WhatsApp, codes | secret |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service for login codes | Required for login codes | secret |
| `TWILIO_SMS_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM_NUMBER` | Sender numbers | Required for those channels | secret |
| `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_SMS_FROM_NUMBER`, `PLIVO_WHATSAPP_FROM_NUMBER` | Alternative provider | Leave empty | none |
| `OTP_DELIVERY` | Declared, read by no code | Leave empty | none |
| `ANTHROPIC_API_KEY` | AI extraction | Optional (feature off when blank) | secret |
| `DEEPGRAM_API_KEY` | Call transcription | Optional | secret |
| `GOOGLE_MAPS_API_KEY` | Backend Google lookups | Optional | secret |
| `FCM_SERVER_KEY` | Retired legacy push key | Leave empty | none |
| `TURNSTILE_SECRET` | When set, the landing form must carry a Turnstile token | Optional | secret |
| `TENANT_PROVISIONER` | `cloudflare` makes "create agency" create a real D1 database through the Cloudflare API | Required (`cloudflare`) | Generated var |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Account and a token (D1 Edit, Workers Scripts Edit) for provisioning | Required | secret |
| `CF_WORKER_SCRIPT_NAME` | Name of this Worker (`travelcrm-api`), so a new agency's binding can be attached without a redeploy | Required | Generated var (`travelcrm-api`, or `travelcrm-api-<env>`) |
| `VOIP_CALLING_COUNTRIES` | Comma-separated two-letter country codes where calling is offered; default `GB,US,AU,SG` when unset. `*` (every country) is honoured only when `ENVIRONMENT` is not `production`. An agency with no country set in its settings gets no calling | Optional | secret (`wrangler secret put`); neither generated nor in `push-secrets.sh` |
| `RATE_LIMIT_MULTIPLIER` | Raises login limits for local/test runs | Never set | none |
| `DAILY_JOB_HOUR` | Agency-local hour for daily jobs (default 9) | Optional | secret |
| `APP_VERSION` | Shown by the health endpoint | Optional | secret |

### 5.2 Operator console (`travelcrm-super-admin`)

| Name | Purpose | Required? | Where set |
|---|---|---|---|
| `SUPER_ADMIN_JWT_SECRET` | Verifies operator tokens; same value as the API's | Required | secret: `cd super-admin && npx wrangler secret put SUPER_ADMIN_JWT_SECRET` |
| `BACKEND_API_URL` | API address including `/api/v1`. In production it defaults to `https://api.<domain>/api/v1`, derived from the console's domain; set it only to point at another API | Optional | `super-admin/wrangler.toml` (commented out) |
| Domain | `PLACEHOLDER_DOMAIN` in `super-admin/src/lib/domain.ts`, or `NEXT_PUBLIC_PLATFORM_DOMAIN` at build. Drives the derived API address, the "log in as" address (`https://app.<domain>`) and example addresses on screen | Required | edit the file, or environment variable when building |
| `ENVIRONMENT` | `production` | Required | `super-admin/wrangler.toml` |
| `NEXT_PUBLIC_DESKTOP_URL` | Link target of "log in as"; default `https://app.<domain>` (the agency web app) | Optional | environment variable at build time |

### 5.3 Desktop app and installer

| Name | Purpose | Required? | Where set |
|---|---|---|---|
| `DOMAIN` | The public domain. The build derives the API address `https://api.<DOMAIN>/api/v1` and the update feed `https://downloads.<DOMAIN>/win/` | Required for a release build (or set the two below) | environment variable when running `build:desktop` |
| `TRAVELCRM_API_URL` | API address (ending `/api/v1`); overrides the derived one; baked into the installer (`electron/dist/build-config.json`) | Optional override | environment variable when running `build:desktop` |
| `TRAVELCRM_UPDATE_URL` | Update feed address; overrides the derived one. Baked into the installer twice: electron-builder's `app-update.yml` and `electron/dist/build-config.json`, which the app reads at start, so customer PCs update with no setting. Also honoured at run time (testing). With neither this nor `DOMAIN` the build uses a placeholder feed and the installer never updates | Required for updates (directly or via `DOMAIN`) | environment variable when building (`desktop/scripts/run-builder.mjs`, `prepare-standalone.mjs`, `build-urls.mjs`) |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Windows code-signing certificate file and its password (read by electron-builder) | Required for a signed installer | environment variables on the build machine |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Address autocomplete; without it address fields are plain text | Optional | environment variable at build; public by nature |
| `NEXT_PUBLIC_API_URL` | Build-time fallback API address of the app (the local stack sets it) | Local work; optional for installers | `desktop/.env.local` |
| `PLATFORM_DOMAIN`, `TRAVELCRM_API_URL`, `INSTALLER_URL`, `DRIVER_APP_URL` | The **agency web app** Worker's variables: domain (derives API and downloads addresses), optional API override, optional download buttons on `/download` | `PLATFORM_DOMAIN` required | `desktop/wrangler.toml` `[vars]` |

### 5.4 Driver app, landing page, CI

| Name or file | Purpose | Where set |
|---|---|---|
| `API_BASE_URL`, `ENVIRONMENT` (`--dart-define`) | API address (no `/api/v1`) and `production` | on the `flutter build` command line |
| `android/key.properties` + the `.jks` keystore | Release signing for the Android app | build machine only, never in git |
| `landing/config.js` | Public site settings; `TRAVELCRM_DOMAIN` is the landing page's one place for the domain (the build script substitutes it; `LANDING_DOMAIN` overrides). See GO-LIVE phase 5 | edited by hand; contains no secrets |
| GitHub Actions secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_MASTER_ID`, `CF_KV_CACHE_ID`, `CF_KV_SESSIONS_ID`, `CF_KV_REPORT_CACHE_ID` (backend deploy; the backup workflow uses the first three); for the terraform workflow also `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. No `OCI_*` or app secrets are needed any more | repository settings |
| GitHub Actions variables | `TRAVELCRM_DOMAIN` (read by the backend deploy, backup and terraform workflows; it becomes `DOMAIN` or `TF_VAR_domain`). Optional overrides for the backend deploy: `APP_URL`, `API_URL`, `CORS_ORIGINS`, `EMAIL_FROM` | repository settings |

## 6. How agencies are isolated

* **One resolver.** Every request, webhook, queue message and cron job finds an agency's database through `backend/src/services/tenant-db.ts`. The agency id comes from the signed login token; the registry row in `MASTER_DB.tenants` stores the binding name (`db_binding`) and the D1 id (`d1_database_id`).
* **Binding scheme.** The Worker has one D1 binding per agency named `TENANT_DB_` plus the agency's id without hyphens, lower case. The name is stored in the registry, never computed at request time.
* **Fail closed.** In `multi` mode, if an agency has no binding the request fails with 503 `TENANT_DB_UNAVAILABLE`. Nothing falls back to the master database. Webhooks and cron skip agencies that are suspended, expired, cancelled or without a binding. Production refuses to serve at all if `TENANCY_MODE=single` (unless the pilot switch is set) or `TEST_MODE=true`.
* **Why this holds a limit.** A Worker can have about 5,000 D1 bindings. With the master database and other bindings that means about 4,500 agencies on one API Worker (about 500 more than the point where the old single-database design broke). The written fallback, not built, is a second API Worker (`travelcrm-api-s2`) generated from the same code for the next range of agencies, using the `tenants.shard` column and the login "resolve agency" call to tell clients which address to use. Cloudflare allows 50,000 databases per account on the paid plan, so the binding limit is the first wall.
* **Other isolation.** File keys start with the agency id and the files route rejects any key that does not (403); the operator console's "view as agency" uses a separate, audited impersonation token (table `impersonation_audit`); a 9-test isolation suite (R121) runs against the multi-agency local stack and passed three runs in a row.

### 6.1 How a new agency is created, end to end

1. The operator signs in to the console and fills the new-agency wizard. The console calls `POST /api/v1/admin/tenants` on the API with the operator's token.
2. The API writes the agency row (`provisioning_status` moves `creating_db`, `migrating`, `seeding`, `binding`).
3. With `TENANT_PROVISIONER=cloudflare` it calls the Cloudflare REST API: create a D1 database named `travelcrm-t-<slug>` in a location that follows the agency's region (India: Asia-Pacific hint; EU and UK: EU jurisdiction; US: western North America; Australia: Oceania; Gulf: Asia-Pacific), apply every tenant migration (bundled into the Worker code in `src/db/tenant-migrations.generated.ts`), seed the admin user with a random 16-character temporary password (forced change at first login), default settings and automation recipes.
4. It then tries to attach the binding to the live Worker through the Workers settings API (needs `CF_WORKER_SCRIPT_NAME`). If that succeeds the status is `active` and the welcome email (temporary password, sign-in address) is sent. If it fails the status is `pending_deploy`: the agency exists but cannot sign in until the operator redeploys from a freshly generated config (the registry now lists the agency) and the welcome mail follows. **Whether the live-binding step works on a real account is unverified** (see 11); plan for the redeploy path.
5. A failed step rolls the new database back; the console shows the step and a Retry button (`POST /api/v1/admin/tenants/:id/retry`).
6. Drivers sign in to the Android app with the agency's slug (the `subdomain` field) as the "agency code".

### 6.2 How migrations roll out

* Master migrations: `backend/drizzle/master` (highest today `0019_exchange_rates`). Agency migrations: `backend/drizzle/tenant` (highest today `0049_provider_events`, which makes voice-provider callbacks run exactly once).
* `node backend/scripts/migrate-tenants.mjs --remote --env production` applies master first, then one canary agency, then the rest in groups of 10 in parallel, and stops at the first failure while printing which databases are done. `--canary <agency id|binding|name>` chooses the canary; `--dry-run` prints the plan.
* The agency list comes from the generated config, so generate it first (section 7).
* After adding an agency migration to the code, run `npm -w travelcrm-api run db:bundle-tenant` so new agencies get it too (a test fails if this is forgotten). New agencies are created from the bundled list, existing ones through `migrate-tenants`.
* Deploy order that never breaks: migrate databases first, then deploy the Worker (the backend deploy workflow does this).

### 6.3 Backups and restores (summary of [ops/BACKUPS.md](ops/BACKUPS.md))

* **First response: D1 Time Travel**, 30 days on the paid plan, per database, in place: `npx wrangler d1 time-travel info <db name> -c .wrangler.production.toml --env production` and `... restore <db name> --timestamp=<time> ...`. The restore prints the bookmark of the state it replaced, so it can be undone.
* **Second layer: weekly logical dump** with `backend/scripts/backup-tenants.mjs --remote --env production --bucket travelcrm-backups`: data-only `INSERT` files, gzipped, plus a manifest with checksums, uploaded to R2 under the UTC date. It does not use `wrangler d1 export` because every agency database contains full-text-search tables, which that command refuses.
* **Restoring one agency from a dump:** create a database, apply the schema, replay the dump, point the registry row at it, regenerate the config and deploy (steps in BACKUPS.md).
* **The weekly dump has a workflow.** `.github/workflows/backup.yml` runs Sundays at 02:00 UTC and on demand (input `dry_run`). It needs the repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_MASTER_ID` and the repository variable `TRAVELCRM_DOMAIN`; it regenerates the config with `--from-d1-remote`, then runs `backup-tenants.mjs --remote --env production --bucket travelcrm-backups`. Like every workflow it only runs once the file is on `master`. The same commands can be run by hand (GO-LIVE phase 10.6). BACKUPS.md is consistent with this.
* Dumps contain personal data; the bucket stays private.
* Database names in the dashboard are `travelcrm-t-<slug>`; the generated config names them `travelcrm-tenant-<hex>` when it is built from the registry. Use the names in the generated config with `-c`, and find the agency from the registry (`SELECT id, subdomain, db_binding FROM tenants`; the `<hex>` is the id without hyphens).

## 7. Environments and the generated-config rule

| Environment | How it runs | Worker name | Notes |
|---|---|---|---|
| Local, single | `plain wrangler dev` or `node desktop/scripts/fix-stack.mjs up`; `backend/.dev.vars` must contain `TENANCY_MODE=single`; one database holds everything | n/a | Default for tests. `backend/wrangler.toml` is only for this mode |
| Local, multi | `fix-stack up --multi`; pool databases `TENANT_DB_POOL_1..4` generated by `gen-wrangler.mjs --env local` | n/a | Used by the isolation tests and by the handoff walkthrough |
| Staging | `gen-wrangler.mjs --env staging`, `npm -w travelcrm-api run deploy:staging` | `travelcrm-api-staging` | **Must be a separate Cloudflare account** (see below) |
| Production | `gen-wrangler.mjs --env production`, `npm -w travelcrm-api run deploy:production` | `travelcrm-api` | Nothing has ever been deployed |

**The rule: never hand-edit and never `wrangler deploy` the plain `wrangler.toml` or `wrangler.base.toml`.** `wrangler.base.toml` is a template. `gen-wrangler.mjs` reads it, adds `MASTER_DB`, one D1 binding per agency and the `[vars]`, and writes `backend/.wrangler.<env>.toml` (git-ignored). Wrangler does not inherit bindings into `[env.*]` sections, so the generator repeats every binding inside a full `[env.<name>]` section. `predeploy-guard.mjs` (run by the deploy scripts) refuses to deploy if the generated file is missing, older than the template, or still contains a placeholder id (`a0000000-...`).

Inputs for generation: environment variables `CF_D1_MASTER_ID`, `CF_KV_CACHE_ID`, `CF_KV_SESSIONS_ID`, `CF_KV_REPORT_CACHE_ID` and `DOMAIN` (the backend's one place for the domain; it derives `APP_URL` = `https://app.<DOMAIN>`, `API_URL` and `API_PUBLIC_URL` = `https://api.<DOMAIN>`, `EMAIL_FROM` = `noreply@<DOMAIN>`, `CORS_ORIGINS` = app, root and `www` addresses; without it the placeholder `YOUR-DOMAIN.example` is used). `APP_URL`, `API_URL`, `CORS_ORIGINS`, `EMAIL_FROM` override the derived values. Plain settings written to `[vars]` for non-local environments: `API_PUBLIC_URL`, `ALLOW_LOOPBACK_ORIGINS` (default `true`), `CREDENTIALS_ACTIVE_KEY_ID` (default `k1`), `TENANT_PROVISIONER` (`cloudflare`), `CF_WORKER_SCRIPT_NAME`, and, when the same-named environment variable is set, `EMAIL_FROM_NAME`, `PLATFORM_SUPPORT_EMAIL`, `QUOTES_URL`. Agencies come from either `--registry <json>` (a file listing agencies; `[]` for none) or `--from-d1-remote`. `--from-d1-remote` needs `CF_D1_MASTER_ID`; it first writes the file with an empty registry, then reads the agencies with `wrangler d1 execute ... -c <that generated file> --env <env>` (never the placeholder id in `wrangler.toml`), then rewrites the file with them. It needs the master migrations applied first (otherwise it says so), and an empty registry is fine (first deploy). Self-test: `npm -w travelcrm-api run test:gen-wrangler`.

**First deploy order:** terraform (resources) -> generate with `--registry` of `[]` -> migrate the master -> generate with `--from-d1-remote` -> deploy -> set secrets. Secrets go on with `bash scripts/push-secrets.sh` (`npm run secrets:push:dry` first): it targets `-c .wrangler.<env>.toml --env <env>`, pushes real secrets only (values from the environment, else `terraform/terraform.tfvars`), and its dry run prints the config path and secret names, never values. `bash scripts/sync-config.sh` only prints the `CF_*` ids from `terraform output`; it writes nothing.

**Why staging needs its own account.** The base config fixes the names of the queues, the R2 bucket and the master database. Two Workers cannot both consume the same queue, and staging would share production's file bucket. The staging environment therefore only works in a separate Cloudflare account (cost: a second $5 Workers Paid plan, per COST-MODEL). The terraform files use `project_name` to name resources, but the Worker config does not follow it, so do not use `environments/staging.tfvars` expecting matching names.

### CI workflows (`.github/workflows`)

| File | Runs when | What it does |
|---|---|---|
| `test.yml` | push and pull request on `master` | Backend typecheck and tests, gen-wrangler and shell-script self-tests; console typecheck, lint, Next build, OpenNext build; agency web OpenNext build; `terraform fmt` and `validate` of both roots |
| `fresh-clone.yml` | push and pull request on `master`, manual | One `npm ci` at the root, then every Node check (`scripts/fresh-clone-check.mjs --here`) |
| `desktop-ci.yml` | push and pull request on `master` (desktop paths), manual | Lint gate, typecheck, unit tests, Next build; manual run with "package" builds **unsigned** installers for Windows, macOS and Linux |
| `driver-app.yml` | push and pull request on `master` (driver paths), manual | Flutter analyze, tests, release APK (debug-signed unless a keystore is configured) |
| `landing.yml` | push and pull request on `master` (landing paths), manual | Link check and build; manual run with "deploy" also publishes to Pages |
| `terraform.yml` | pull request on `master` (plan); manual (apply) | Plan or apply of the main (Cloudflare) root with `environments/prod.tfvars`; the domain comes from the variable `TRAVELCRM_DOMAIN`. **Dispatch-only deploys.** The apply is untargeted, so it fails until the three Workers exist (use `-target` by hand for the first apply), and `terraform init` there passes no `-backend-config` for the state endpoint (see 11) |
| `deploy-backend.yml` | manual only | Generate production config from the registry, migrate (canary first), deploy, health check |
| `deploy-admin.yml` | manual only | Build and deploy the console (the domain must already be in `super-admin/src/lib/domain.ts`; the workflow does not set `NEXT_PUBLIC_PLATFORM_DOMAIN`) |
| `deploy-web.yml` | manual only | Build the agency web app with OpenNext and deploy the Worker `travelcrm-app` (`npm -w travelcrm-desktop run deploy:web`) |
| `backup.yml` | Sundays 02:00 UTC; manual (input `dry_run`) | Weekly dump of the master and every agency database to R2 `travelcrm-backups` |

Only `deploy-backend.yml`, `deploy-admin.yml`, `deploy-web.yml`, `backup.yml` (writes backups to R2), the `deploy` option of `landing.yml` and `terraform.yml` apply can change anything in the cloud; all but the weekly backup are manual. Nothing has run on GitHub yet (the repository is public and must be made private first). The workflows listen to the branch `master`, and workflows can only be started from the Actions tab once the files are on that branch, so `launch-readiness` has to be merged first.

Root `package.json` scripts: `deploy:api` (runs the predeploy guard, then deploys the generated production config), `deploy:admin`, `deploy:web`, `infra:plan`, `infra:sync` (prints the `CF_*` ids), `secrets:push:dry` and `secrets:push`. The old `deploy` and `infra` scripts were removed.

## 8. Limits and cost drivers

Numbers and arithmetic are in [COST-MODEL.md](COST-MODEL.md). In short:

* **Fixed:** Cloudflare Workers Paid $5 a month; a domain; code-signing certificate (about $129 to $439 a year, quotes differ); Apple Developer $99 a year; Google Play $25 once.
* **Cloudflare usage is small** (about 500 rupees a month at 10 agencies, under 2% of cost at any scale). Watch two lines: Durable Object duration (idle connections cost nothing only if hibernation is used) and the observability sampling rate of 1, which logs every request.
* **The real cost drivers are the pass-through channels:** SMS to Indian numbers (8.06 rupees each), login codes (12.90 each), WhatsApp, and AI. That is why plans carry monthly caps (placeholders in the plan catalogue, see STATE `ownerToConfirm`) and top-up packs.
* **Hard limits to remember:** about 5,000 D1 bindings per Worker (about 4,500 agencies), 10 GB per D1 database, 50,000 databases per account, 1,000 queries per Worker invocation, 128 environment variables per Worker on the paid plan (we use about 45), 30 s CPU per cron invocation (why cron work is fanned out per agency).
* **Oracle:** the VM is a separate terraform root (`terraform/oracle`) applied only in Tier 3. It asks for 4 CPUs and 24 GB; the free allowance read in COST-MODEL is 2 CPUs and 12 GB, and the extra could cost about $36 a month. Decide before that apply.

## 9. Operations

* **Health checks.** `GET /api/v1/health` is public and cheap: one query on the master database, returns 200 `ok` or 503 `degraded` with `version`. `GET /api/v1/health/deep` checks master D1, KV (write and read) and R2 and returns latencies; it needs the header `X-Health-Token: <HEALTH_TOKEN>` (or a super admin token). Point the uptime monitor at the deep check.
* **Logs.** Worker logs are on in the Cloudflare dashboard (Workers, `travelcrm-api`, Logs; or `npx wrangler tail`). Every request has a request id and, when known, an agency id in the log line.
* **Error reporting.** Server errors, queue failures and cron failures go through `services/error-reporter.ts`. With `ERROR_REPORTER_DSN` set (a Sentry-style address) they are also posted as envelopes with error text, stack and ids only (no request bodies or personal data). Without it you get structured log lines only.
* **Rate limits.** Edge bindings: 600 requests per minute per user and 20 uploads per minute per user. In the application: sign-in 10 attempts per 15 minutes per address and email, 50 per hour per address; login codes 3 per 10 minutes per number (the plan also states 10 per day per number and 20 per hour per address; confirm those two against the code at go-live); forgot-password 3 per hour; password change 10 per 15 minutes. Add Cloudflare WAF rate-limit rules at the edge as well (not in code or terraform).
* **Cron schedule (UTC).** Every 5 minutes (`*/5 * * * *`): per-agency automation ticks, the campaign scheduler and similar short jobs. Hourly (`0 * * * *`): the hourly job set, which also contains the "daily" agency jobs (birthdays, visa and passport expiry, trip reminders, housekeeping); each of those fires once per agency-local day at the first hourly run at or after `DAILY_JOB_HOUR` (default 9, or the agency's own setting). Daily at 00:30 UTC (`30 0 * * *`): platform-wide work that runs once inside `scheduled()` itself: usage-cap resets and trial expiry. For the per-agency sets, `scheduled()` only queues one message per active agency on `travelcrm-tenant-jobs`; the consumer runs that agency's jobs. Each job claims a row in the agency's `cron_job_runs` table first, so a retried message never repeats a job.
* **Alerts.** There are no alert rules in code or terraform. Set up (a) an uptime monitor on the deep health check, (b) alert rules in the error-reporting tool, (c) a Cloudflare notification or dashboard check on Worker error rate and queue backlog, and (d) a look at the dead-letter queues. GO-LIVE phase 10 lists them.
* **Admin maintenance endpoints** (super admin token): `POST /api/v1/admin/maintenance/reencrypt` and `.../hash-api-keys`, repeated until `nextCursor` is null, after the first deploy and after any key rotation.

## 10. Known gaps: mocked locally, to verify on the real account

Taken from `docs/readiness/READINESS-PLAN.md` section 6 and `docs/launch/STATE.json`; everything on this list has only been tested against mocks or on this machine.

| Item | Tested locally by | What to check for real |
|---|---|---|
| Creating D1 databases through the Cloudflare API (location hint and EU jurisdiction), running migrations and deleting them | Provisioner tests with a fake `fetch` | One real create, migrate, seed, delete cycle per region used |
| Attaching a new agency's binding to the live Worker without a redeploy (`pending_deploy` fallback exists) | Fake `fetch` | Whether the settings call works; if not, every new agency needs a redeploy |
| Deploy with many D1 bindings, and deploy time as agencies grow | `wrangler deploy --dry-run` | 50+ agencies in staging |
| Remote migrations with canary stop | `migrate-tenants.mjs --local` | `--remote` on staging with 3 agencies, force a failure |
| Time Travel restore | Not testable locally | Restore a staging agency database to a timestamp and undo it |
| SendGrid sending, SPF and DKIM, delivery of welcome and reset mail | Local outbox | Real mail to Gmail and Outlook inboxes |
| Twilio SMS, WhatsApp and Verify delivery in India; WhatsApp template approval | Fake `fetch`, signed fixtures | Real messages; sender approval |
| Meta WhatsApp Cloud API | Not built | Decide whether to build it |
| Stripe and Razorpay | Not built (Tier 2) | Test-mode checkout, then live |
| Telephony (Twilio only, owner decision 2026-10-15; country gate `VOIP_CALLING_COUNTRIES`; callbacks processed once) | Mock provider; signed callback fixtures; calls e2e | Real Twilio numbers and callbacks at `<API_PUBLIC_URL>/api/v1/voip/...`; production must run with `ENVIRONMENT=production` |
| Workers AI quality and cost | Not called (cost rule) | The 20-call capped quality test |
| Turnstile on the landing form | Skipped when no secret | Site key and secret on the real domain |
| Electron code signing and SmartScreen; update from the real feed (the feed is baked into the installer) | Unsigned local build; update test from a local feed | Signed installer; `updater.log` says `updater enabled (feed=build-config:...)`; update from `downloads.<domain>` |
| Agency web app on Cloudflare (OpenNext), its email-linked pages and `app.<domain>` | Local e2e of the web build (9 tests) | Deploy `travelcrm-app`, attach the domain, open the pages, follow real invite and reset mails |
| macOS and Linux builds, iOS build, notarisation | Not possible on this machine | A Mac and runners |
| Android release signing and Play internal track | Throwaway key | Owner's keystore |
| Push notifications | Out of scope in v1 | FCM HTTP v1 with a service account, later |
| Oracle VM and WordPress sites | Mock provisioner; `terraform validate` of `terraform/oracle` | Tier 3 |
| Landing hosting, DNS and HTTPS | Static serve and link check | Pages project and domain |
| GitHub Actions on the real repository | Fresh-clone script locally | First green run after the repository is private |
| Plan catalogue values (caps, pack prices, extra-user prices, trial) | Seeded as placeholders | Owner confirms (STATE `ownerToConfirm`) |
| Tax defaults and invoice wording per country (R201 tax engine, tenant 0047); currency and locale (R202, master 0019 exchange rates, tenant 0048) | Tests | Owner and an accountant (STATE `ownerToConfirm.fromR201`); check exchange-rate source and locale defaults on a real agency |
| Legal pages | Drafts | A lawyer's review |

## 11. Things found while writing this that the code or scripts got wrong

The first version of this document (2026-10-15 morning) listed fifteen faults. Batch R125 fixed the ones that blocked a first deploy; the numbers are kept so other documents' references still point at the right item. "Fixed" means the code and scripts were changed and checked locally (self-tests, `terraform validate`, a local web build); none of it has been run against a real account.

1. **Fixed (R125): four queues were not in terraform.** `travelcrm-ai-extraction-queue`, `-dlq`, `travelcrm-tenant-jobs`, `-dlq` are now in `terraform/modules/cloudflare/workers.tf`; all 14 queues are created by terraform. No `wrangler queues create` step remains (except for staging, which is built by hand, GO-LIVE 6.2).
2. **Fixed (R125): `gen-wrangler.mjs --from-d1-remote` read the plain `wrangler.toml`.** It now needs `CF_D1_MASTER_ID`, writes the generated config first with an empty registry and calls wrangler with `-c <generated file> --env <env>`. The first deploy comes after the master migrations; an empty registry is valid.
3. **Fixed (R125): `terraform apply` always created the Oracle VM.** The VM is a separate root, `terraform/oracle/`, with its own state and variables; the main root needs no `oci_*` value. The wildcard DNS record appears only when `oci_instance_ip` is set.
4. **Fixed (R125): the packaged desktop app did not auto-update for real users.** The feed address is baked into the installer at build time (`TRAVELCRM_UPDATE_URL`, or derived from `DOMAIN`) in `electron/dist/build-config.json` and the electron-builder publish url; the app reads it at start. Look for `updater enabled (feed=build-config:...)` in `updater.log`. Still to prove on a real signed installer and a real feed (section 10).
5. **Fixed (R125): `scripts/push-secrets.sh`.** It targets `-c .wrangler.<env>.toml --env <env>`, counts safely, pushes real secrets only (plain settings are generated into `[vars]`, which also covers `TENANT_PROVISIONER` and `CF_WORKER_SCRIPT_NAME`), and `--dry-run` prints the config path and secret names only. Two cautions that remain: it falls back to `terraform/terraform.tfvars` for values, so fake example values left there would be pushed; and its `CF_API_TOKEN` falls back to the deploy token from that file unless `CF_API_TOKEN` is exported (GO-LIVE 3.7).
6. **Fixed (R125): `scripts/sync-config.sh`** only prints the `CF_*` ids from `terraform output`; it no longer touches `backend/.dev.vars` or `backend/wrangler.toml`.
7. **Fixed (R125): root scripts.** `deploy` and `infra` are removed; `deploy:api` runs `deploy:production` (predeploy guard, then the generated config); `secrets:push:dry` and `deploy:web` were added.
8. **Fixed (R125): terraform variable files held example values.** `environments/*.tfvars` now hold only `project_name` and `environment`. `domain` has no default, refuses the placeholder, and comes from `terraform.tfvars` or `TF_VAR_domain`. Required variables are only `domain`, `cloudflare_account_id`, `cloudflare_api_token`.
9. **Fixed (R125): domain names disagreed** (`travelcrm.pro`, `travelcrmpro.com`, `travelcrm.com`). Every toolchain now has one placeholder, `YOUR-DOMAIN.example`, defined once (section 12). **Still open for the owner:** choose the real domain (Q11). Leftovers of the old names remain only in the Tier 3 Caddy file and Oracle cloud-init (`oci-provisioner/caddy/Caddyfile`, `terraform/modules/oracle-cloud/cloud-init.yaml`, a default in `terraform/modules/cloudflare/variables.tf`) and in some product-requirement files.
10. **Fixed (R125): `super_admin_password` (default `SuperAdmin@123`) and `super_admin_email`** are gone from `terraform/variables.tf`. The password stays in public history; do not reuse it.
11. **Fixed (R125): `docs/ops/BACKUPS.md`** commands now include `-c .wrangler.production.toml`, and it describes the weekly workflow.
12. **Terraform provider and resource shapes** are from provider version `~> 4.0`; `terraform validate` passes for both roots (checked in `test.yml`) but no plan or apply has ever run against a real account.
13. **Push notifications** use the retired FCM legacy key and the driver app has no push library, so there are no push notifications at launch.
14. **Terraform workflow:** it no longer needs app secrets, but its apply step is untargeted (it fails until the three Workers exist) and its `terraform init` passes no `-backend-config` for the R2 endpoint, which `providers.tf` says must be supplied. Run terraform from your own machine for the first apply (GO-LIVE phase 2); fix the workflow before relying on it.
15. **Fixed (R125): nothing hosted the web pages that emails link to.** The agency web app (Worker `travelcrm-app`, `app.<domain>`) serves `/reset-password`, `/setup-account`, `/q/<token>`, `/download` and `/quick-start`; `APP_URL` is `https://app.<domain>`. Local end-to-end tests of the web build pass (9); the deployed Worker, the `app.<domain>` attachment and the real emails are still to be checked (GO-LIVE phase 4A).
16. **Calling (R301, R302).** Production must run with `ENVIRONMENT=production`, or the country wildcard `*` in `VOIP_CALLING_COUNTRIES` would be honoured; the generator sets it for `--env production`. `VOIP_CALLING_COUNTRIES` itself is neither generated nor pushed by `push-secrets.sh`: set it with `wrangler secret put` only if the default (GB, US, AU, SG) is not what you want. Twilio voice callbacks must use `<API_PUBLIC_URL>/api/v1/voip/...`, including the `/twiml/dial-status` route that the platform puts in its own answers; signatures are checked against `API_PUBLIC_URL`. Callbacks are recorded in `provider_events` (agency migration 0049) so a repeated callback does nothing twice.

## 12. Where things live

| What | Path |
|---|---|
| API entry, route mounts, cron and queue handlers | `backend/src/index.ts` |
| Env bindings and variables | `backend/src/types.ts` |
| Agency resolver | `backend/src/services/tenant-db.ts` |
| Provisioning | `backend/src/services/tenancy/` |
| Config generator, migration roller, backup, first operator, predeploy guard | `backend/scripts/` |
| Master and agency migrations | `backend/drizzle/master`, `backend/drizzle/tenant` |
| Console | `super-admin/` |
| Landing page | `landing/` |
| Installer config | `desktop/electron-builder.yml`, `desktop/scripts/` |
| Driver app | `packages/driver_app/` |
| Terraform | `terraform/` (main Cloudflare root, `modules/cloudflare`, `environments/`); `terraform/oracle/` (separate root and state for the Tier 3 VM, `modules/oracle-cloud`) |
| Agency web app | `desktop/wrangler.toml`, `desktop/open-next.config.ts`, `desktop/scripts/build-web.mjs`, public pages in `desktop/src/app/(public)/` |
| Installer build addresses | `desktop/scripts/build-urls.mjs`, `run-builder.mjs`, `prepare-standalone.mjs`; feed logic in `desktop/electron/update-feed.ts`, `updater.ts` |
| Domain placeholder | One place per toolchain: `terraform/variables.tf`, `landing/config.js`, `super-admin/src/lib/domain.ts`, `backend/scripts/gen-wrangler.mjs` (`DOMAIN`), `desktop/wrangler.toml`, desktop build `DOMAIN`, GitHub variable `TRAVELCRM_DOMAIN` |
| Decisions and plans | `docs/decisions/`, `docs/readiness/`, `docs/launch/STATE.json` |
