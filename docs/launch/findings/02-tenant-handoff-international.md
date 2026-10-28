<!-- Read-only explorer report, 2026-10-09. Static reading only; nothing was built or run. Verify before relying on a line number. -->

# TravelCRM Pro: tenant handoff, international readiness and backend production signals

A tenant created in super-admin today cannot log in, and tenants are not isolated at runtime. Outside India, the product has no way to bill a foreign tenant, invoices always compute GST, and money, dates and language are hardcoded to India across the clients.

Everything below is from reading code; nothing was built or run. Grep counts cover ts/tsx/dart/html/css/js, exclude build directories and include tests.

## Tenant isolation under the MASTER_DB fallback

Two tenants would share rows.

- **Schema:** only 22 of 103 tenant tables carry `tenant_id` (travellers, visa_*, import/export_jobs, marketing tables, vehicles, drivers, trip_assignments, vehicle_rate_cards). `users`, `contacts`, `leads`, `itineraries`, `invoices`, `payments`, `settings` and `voip_settings` do not (`C:/Users/Admin/Downloads/pro/CRM/backend/src/db/tenant-schema.ts`).
- **Login:** selects `users` by email only (`C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/auth.ts:144-148`).
- **Shared keys:** `settings` has `key` as primary key (tenant-schema.ts:964), so company profile, currency, timezone and numbering config are one shared row set. `users_email_idx` (line 28) and `invoices_number_idx` (line 384) are global uniques.
- **Admin counts:** `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/admin.ts:1007-1021` queries `contacts/leads/invoices WHERE tenant_id = ?`. Those columns do not exist, so `safeCount` returns 0.
- **Binding names disagree:** request path uses `TENANT_DB_<d1DatabaseId>`; queues and cron use `TENANT_DB_<tenantId>` (`queues/campaign-queue.ts:33`, `export-queue.ts:35`, `import-queue.ts:34`, `cron/fleet-alerts.ts:15`). `queues/sms-queue.ts:58,93` uses `TENANT_DB_${job.contactId}`.

## Part A: super admin creates a tenant and hands it off

### 1. Super admin auth

There are two separate surfaces.

- **Standalone Next app:** `POST /api/auth` checks `super_admins` with PBKDF2, sets a 24h HS256 cookie `sa_token`, and locks out after 5 failures per IP in 15 minutes (`C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/api/auth/route.ts:13-43`, `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/lib/auth.ts`).
- **API routes rely on middleware only:** no route checks the session itself. `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/middleware.ts:72` passes any pathname containing `.` before the cookie check, so a dynamic id containing a dot would skip auth (not exercised). Line 4 has a hardcoded fallback JWT secret.
- **First account:** `POST /api/auth/seed` is unauthenticated (it falls under the public prefix `/api/auth`) and works only while `super_admins` is empty. Credentials come from env, with literal fallbacks in code (`C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/api/auth/seed/route.ts:12-13`).
- **Backend surface:** `GET /admin/whoami` and `requireSuperAdmin` match the tenant JWT's email against `super_admins` or `SUPER_ADMIN_EMAIL` (`C:/Users/Admin/Downloads/pro/CRM/backend/src/middleware/require-super-admin.ts:17-35`). A super admin therefore needs a tenant user login first.
- **Backend admin is read-only:** `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/admin.ts` has GET handlers only. The desktop `/super-admin/*` pages consume it and have no create, suspend or delete.
- **Master schema in production:** `backend/wrangler.toml:11` points MASTER_DB's `migrations_dir` at `drizzle/tenant`. `drizzle/master/*.sql` is applied only by `C:/Users/Admin/Downloads/pro/CRM/backend/scripts/seed-local.mjs:37-66`, and no CI step applies migrations (`C:/Users/Admin/Downloads/pro/CRM/.github/workflows/deploy-backend.yml`).

### 2. Tenant creation

The UI is a 5-step wizard (`C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/(authenticated)/tenants/new/page.tsx`) posting to `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/api/tenants/provision/route.ts`.

- **Works:** tenant row with slug uniqueness (43-47), `tenant_users` row (109-119), subscription row (127-139), rollback on failure (163-168).
- **Admin password is discarded:** the hash is computed at line 107 and never stored. No `users` row is created in any tenant DB, so login fails at auth.ts:150. The hash is also PBKDF2, while the backend verifies bcrypt (`C:/Users/Admin/Downloads/pro/CRM/backend/src/utils/password.ts`).
- **Simulated DB id:** without `CF_ACCOUNT_ID`/`CF_API_TOKEN` (read from `process.env`, lines 78-79) the id becomes `simulated-db-<slug>`.
- **Owner email not saved:** it is missing from the settings JSON (68-73), but the list reads `settings.ownerEmail` (`tenants/route.ts:53`), so it is always blank.
- **No subdomain routing:** the slug is stored but never used. The tenant comes from the JWT `tenantId` claim (`C:/Users/Admin/Downloads/pro/CRM/backend/src/middleware/auth.ts:59`), then a KV-cached lookup with a 300s TTL (`C:/Users/Admin/Downloads/pro/CRM/backend/src/services/tenant-db.ts:6`).
- **Local dev:** one D1 holds both schemas; the demo tenant has `d1_database_id NULL`.
- **Production deploy (not verified by running):** `[env.production]` declares only `name` (wrangler.toml:145-146). Wrangler does not inherit bindings into named environments, so `deploy --env production` would ship without D1, KV, R2 or queues.

### 3. Plans, subscriptions and billing

Plans are defined in several places that disagree.

| Source | Plan keys | Prices / limits |
|---|---|---|
| `backend/src/middleware/feature-gate.ts:21-71` | trial, starter, basic, pro, enterprise | feature lists only |
| `backend/src/routes/admin.ts:96-127` | basic, pro, enterprise | INR 12,000 / 18,000 / 24,000 per year; 5 / 15 / 100 users |
| `backend/src/services/ai-pricing.ts:81-89` | trial, starter, basic, pro, enterprise | 2000 / 1000 / 1000 / 15000 / 25000 AI credits per month |
| `super-admin/src/lib/constants.ts:3-11` and `tenants/new/steps/plan-selection.tsx:21-54` | free, starter, pro, enterprise | INR 0 / 999 / 2499 / 4999 per month; 2 / 5 / 15 / 50 users |
| `super-admin/src/app/api/tenants/[id]/plan/route.ts:5-10` | trial, starter, pro, enterprise | 5 / 5 / 20 / 999 users |
| `landing/index.html:426-462` | Starter, Professional, Enterprise | $12 / $29 / $49 per user per month (INR 999 / 2,399 / 3,999) |

- **`free` is unknown to the backend:** it falls through to trial defaults (feature-gate.ts:104), which include VoIP and the Pro AI set.
- **Seat limits not enforced:** `max_users` appears only in the schema, admin.ts and test.ts; user invite (`C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/users.ts:242-317`) has no check.
- **Feature gating:** `requireFeature` covers voip, calls, ai/*, chatbot and whatsapp-campaigns only (`C:/Users/Admin/Downloads/pro/CRM/backend/src/index.ts:207-228`). Per-tenant overrides live in `tenant_feature_flags`.
- **Trial and expiry:** `trial_ends_at` exists (master migration 0002:8) but nothing reads it. Nothing ever sets status `expired`.
- **Payment collection:** manual record-payment exists (`super-admin/src/app/api/subscriptions/[id]/record-payment/route.ts`). The only Razorpay code is a webhook handler (`super-admin/src/app/api/webhooks/razorpay/route.ts`). It is not in the middleware's public paths, so it would redirect to `/login`. It also skips signature checking when the secret or header is absent (line 12). No checkout or subscription creation was found in what I read. No Stripe.
- **Invoices to the tenant:** none (admin.ts:285-289 says so).
- **Suspension:** the D1 status is honoured by `middleware/tenant.ts:20-25` after up to 5 minutes of KV lag. Soft delete sets `cancelled` (`tenants/[id]/route.ts:130`), which that middleware does not block. Token refresh never checks tenant status (auth.ts:459-472).

### 4. Handoff artefacts

- **Welcome email:** none; the provision route sends nothing.
- **Forced first-login password change:** none.
- **Forgot/reset password:** exists, with the URL hardcoded to `https://app.travelcrm.pro` (auth.ts:571).
- **User invite:** returns an `inviteUrl` (same hardcoded host) but sends no email (users.ts:263-316). I did not check whether the desktop team page shows the link.
- **Desktop installer:**
  - **Publish target:** `owner: your-org` placeholder (`C:/Users/Admin/Downloads/pro/CRM/desktop/electron-builder.yml:52-55`).
  - **Packaged load path:** loads `.next/server/app/index.html` and falls back to `http://localhost:3000` (`C:/Users/Admin/Downloads/pro/CRM/desktop/electron/main.ts:41-46`). No server is spawned and there is no auto-updater.
  - **API URL:** build-time, defaulting to localhost (`C:/Users/Admin/Downloads/pro/CRM/desktop/src/lib/api/config.ts:1`).
  - **Login:** email, then resolve-tenant, then password; no server URL or tenant code field. `crm_app` does the same.
- **Driver app:** `TENANT_ID` is a compile-time `--dart-define`, defaulting to the demo tenant (`C:/Users/Admin/Downloads/pro/CRM/packages/driver_app/lib/core/constants/app_config.dart:11-14`), so one build serves one tenant. OTP uses the platform's Twilio Verify. No download links exist anywhere; the landing CTAs are `href="#"`.
- **Onboarding wizard:** `C:/Users/Admin/Downloads/pro/CRM/desktop/src/app/(app)/onboarding/page.tsx` covers company, regional and branding. Nothing links to it, and its logo button is a "coming soon" toast (about line 246). Company profile, invoice defaults, numbering and team exist as normal settings pages.
- **Integrations:**
  - **Stored per tenant:** receiving addresses and website-form API keys sit in MASTER_DB (`C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/integrations.ts`); keys are plaintext (master-schema.ts:227-237).
  - **VoIP credentials:** plaintext columns (tenant-schema.ts:1735-1750). No encryption code exists in the backend.
  - **Outbound sending:** SMS, WhatsApp and email use platform-level env credentials; the sender is `noreply@travelcrm.pro` (`backend/src/services/email.ts:25`).
  - **Payment gateway:** no settings exist.

### 5. Roles

- **Six roles:** admin, sales_manager, salesperson, operations, accountant, view_only, in a static matrix over 21 modules and 6 actions (`C:/Users/Admin/Downloads/pro/CRM/backend/src/constants/permissions.ts`). No custom roles.
- **Desktop:** fetches the matrix from `GET /users/me/permissions` and denies by default (`C:/Users/Admin/Downloads/pro/CRM/desktop/src/hooks/use-permission.ts`).
- **crm_app:** uses the same role strings with admin and sales_manager route guards (`packages/crm_app/lib/app/router.dart:835-1056`).
- **Drivers:** not users; they hold a separate `type: 'driver'` JWT (`backend/src/middleware/driver-auth.ts:31`).

### 6. Super-admin pages (standalone app)

| Page | State |
|---|---|
| dashboard, reports | real D1 queries |
| tenants list / detail | real; suspend, reactivate, soft delete, plan change, feature flags, usage caps |
| tenants/new | wizard, incomplete as above |
| subscriptions | real; manual payment, cancel |
| announcements, support | CRUD on master tables, but no backend or client code reads them, so tenants never see announcements or file tickets |
| audit-log | reads the table; only plan and feature changes write to it. Provision, suspend, reactivate and delete do not |
| system-health | real pings |
| wordpress | inserts a row; the queue send is commented out (`api/wordpress/provision/route.ts:47-48`) |
| seo | mock data (`seo/page.tsx:50-113`); not in the sidebar |

Not present: impersonation, AI credit top-up UI, plan editor.

### 7. Data operations

- **Export:** contacts and leads xlsx, bulk invoices, and a "full" export of 7 tables (`backend/src/queues/export-queue.ts:112-131`). `routes/exports.ts` has no role check.
- **Contact delete:** soft only (`routes/contacts.ts:1047`).
- **Tenant delete:** status flip only; no D1 or R2 cleanup.
- **Backup/restore:** no code.
- **Tenant audit log:** `routes/activity-logs.ts`, admin only.

## Part B: international readiness

| Pattern | desktop/src | backend/src | packages | super-admin/src | landing |
|---|---|---|---|---|---|
| `₹` (lines / files) | 39 / 15 | 6 / 5 | 12 / 5 | 16 / 7 | 3 / 1 |
| `INR` | 93 / 55 | 52 / 28 | 73 / 36 | 0 | 0 |
| `en-IN` | 178 / 86 | 8 / 5 | 0 | 12 / 7 | 0 |
| `Asia/Kolkata` | 14 / 6 | 7 / 5 | 4 / 4 | 2 / 2 | 0 |
| `+91` | 62 / 26 | 8 / 5 | 44 / 17 | 1 / 1 | 1 / 1 |

- **Currency:**
  - **Tenant setting:** a `currency` key exists and is returned on login (`backend/src/utils/tenant-summary.ts`).
  - **Documents:** carry a currency column defaulting to INR.
  - **Hardcoded display:** `formatCurrency` defaults to INR and en-IN (`desktop/src/lib/utils.ts:15-19`, 73 call sites). The backend hardcodes `₹` in `routes/invoices.ts:347`, `routes/payments.ts:155` and `services/exports/excel-export.ts:35`.
  - **Flutter:** uses lakh/crore grouping (`packages/shared/lib/utils/currency_utils.dart:35-41`).
  - **Exchange rates:** live lookup with only INR fallbacks (`backend/src/services/exchange-rate.ts:37-42`); rates are not stored.
- **Tax:**
  - **Setting ignored:** `tax_system` accepts gst, vat, sales_tax and none (`backend/src/routes/settings.ts:444-448`), but invoice creation calls `detectTaxType(companyState, contact.state)` with no system argument (`routes/invoices.ts:235, 985`), so every invoice is CGST/SGST or IGST.
  - **`sales_tax`:** not handled by the calculator at all.
  - **Not present:** VAT number, reverse charge, US state tax, Gulf VAT fields.
  - **India-specific pieces:** HSN/SAC, GSTIN, UPI, and a default April financial-year start (configurable in `services/numbering.ts:47`).
- **Locale:**
  - **Desktop:** a custom i18n context with 343 keys (en, hi) and 53 (ar); 0 of 193 pages use it. No RTL. Dates use en-IN.
  - **crm_app:** en and hi only (`packages/crm_app/lib/core/providers/locale_provider.dart:39-42`).
  - **driver_app:** en, hi, ar.
  - **Timezone:** per tenant on the backend, defaulting to Asia/Kolkata (`backend/src/utils/tz.ts:5`). No per-user timezone.
- **Phone and address:**
  - **Normalisation:** E.164 with default `91` and a 10-digit assumption (`backend/src/utils/phone.ts:24`).
  - **Desktop picker:** 30 calling codes.
  - **Driver app:** offers only +91, +971, +966 and +1.
  - **Address:** generic fields; Google Places autocomplete is optional via env key.
- **Payments from the tenant's customers:** no gateway. Manual recording only, plus a `payment_link` column and a UPI id setting.
- **Messaging:** Twilio and Plivo for SMS, WhatsApp and voice; SendGrid for email. No MSG91 or DLT, and no Meta Cloud API. Credentials and the email sender are platform-level, so there are no tenant sender domains.
- **Compliance:**
  - **Not present:** consent records, erasure, cookie banner, 2FA.
  - **Legal pages:** Privacy, Terms and GDPR links are `href="#"` (`landing/index.html`, footer).
  - **Data residency:** R2 is pinned to APAC and D1 has no location hint (`terraform/modules/cloudflare/workers.tf:7-18`).
  - **Passwords:** minimum 8 characters, nothing else.
  - **Sessions:** management exists.
  - **CORS:** allows localhost and any `*.pages.dev` origin with credentials, and no production domain (`backend/src/index.ts:133-146`).
  - **Security headers:** `secureHeaders()` defaults.

### Spot-checks

- **`INTERNATIONAL-FEATURES-SHEET.md`:** a roadmap of 20 proposed features. Its comparison table claims "Multi-language (7+)", "DB-per-tenant isolation" and "existing Razorpay"; none holds. "API key auth already exists" holds for website-form lead intake only.
- **`PRD-AUDIT-REPORT.md`:** claims 299 of 309 features done.

| Claim | Verdict |
|---|---|
| #6 per-user timezone in `locale_provider` | False; the file handles language only |
| #7 tax configurable per tenant | Stored but unused |
| #104 SendGrid open/click tracking | No-op; the public handler never has a tenant DB (`backend/src/routes/webhooks.ts:93-98`) |
| #113 unsubscribe | Authenticated list management only; no public link endpoint |
| #185 full export | Partly; 7 tables |
| #215 / #216 tenant wizard, one-click WordPress | UI only |
| #316 / #317 input-validation, sanitize | Files exist with zero imports |
| #9 OTP login, #16 six-role RBAC | Hold |

## Part C: backend production signals

- **Observability:** `hono/logger` and 219 console calls. No Sentry, Logpush, Analytics Engine or `[observability]` block. `/health` returns a static `database: 'connected'` (index.ts:158-166).
- **Rate limiting:** login allows 1000 attempts per 15 minutes and locks at 50 failures (auth.ts:105, 115). OTP and forgot-password are limited.
- **Validation:** zod is used in 44 route files; 22 have none (including tasks, planner, documents, files, reports, exports).
- **Auth tokens:** 15-minute HS256 access token with no revocation; opaque 7-day rotating refresh token in KV with replay detection. `JWT_REFRESH_SECRET` is unused. Driver tokens last 7 days. The WebSocket token travels in the query string.
- **Files:** R2 with 5-10 MB limits and no signed URLs. `GET` and `DELETE /files/*` take any key with no tenant-prefix or role check (`backend/src/routes/files.ts:50-78`).
- **Queues:** only import, export and campaign have retries and a dead-letter queue. `AI_EXTRACTION_QUEUE`, its DLQ and `NOTIFICATION_QUEUE` are in `types.ts` but not bound in wrangler.toml.
- **Cron:** a single `*/5` trigger runs every job. `cron/fleet-alerts.ts:11` queries `tenants.is_active`, which does not exist.
- **Tenant migrations:** no mechanism to roll a migration across tenant DBs.
- **Test routes:** `routes/test.ts` is guarded only by `TEST_MODE === 'true'`. The same flag bypasses provider signatures, the driver OTP and the inbound-email secret.
- **Chatbot, confirmed:** `/chatbot/webhook/:channel`, `/chatbot/whatsapp/incoming` and `/chatbot/widget.js` are mounted after `authMiddleware` and `requireFeature` (index.ts:216, 283), so the public widget gets 401.
- **Public and unsigned:** `/webhooks/twilio/status`, `/webhooks/sendgrid/events`, and all of `routes/voip-callbacks.ts` (its header says validated, but no check exists).
- **Localhost defaults:** `desktop/src/lib/api/config.ts:1`, `desktop/electron/main.ts:14,45`, the three Flutter `app_config`/`app_constants` files, and the CORS list.

## Blocks a real client handoff today

1. Provisioned admin cannot log in: `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/api/tenants/provision/route.ts`
2. Tenants share rows, settings and unique keys: `C:/Users/Admin/Downloads/pro/CRM/backend/src/db/tenant-schema.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/services/tenant-db.ts`
3. Production deploy has no bindings and no master or tenant migration step: `C:/Users/Admin/Downloads/pro/CRM/backend/wrangler.toml`, `C:/Users/Admin/Downloads/pro/CRM/.github/workflows/deploy-backend.yml`
4. CORS rejects any production web origin: `C:/Users/Admin/Downloads/pro/CRM/backend/src/index.ts`
5. Packaged desktop app has no working load path, publish target or configurable API URL: `C:/Users/Admin/Downloads/pro/CRM/desktop/electron/main.ts`, `C:/Users/Admin/Downloads/pro/CRM/desktop/electron-builder.yml`, `C:/Users/Admin/Downloads/pro/CRM/desktop/src/lib/api/config.ts`
6. Driver app is one build per tenant: `C:/Users/Admin/Downloads/pro/CRM/packages/driver_app/lib/core/constants/app_config.dart`
7. No welcome or invite email, and hardcoded reset/invite host: `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/users.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/auth.ts`
8. Plan names and limits disagree; seat limits unenforced; no trial expiry: `C:/Users/Admin/Downloads/pro/CRM/backend/src/middleware/feature-gate.ts`, `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/lib/constants.ts`
9. Any user can read or delete any tenant's files: `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/files.ts`
10. Super-admin bootstrap and middleware gaps, plus committed credentials: `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/middleware.ts`, `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/api/auth/seed/route.ts`, `C:/Users/Admin/Downloads/pro/CRM/super-admin/wrangler.toml`
11. Chatbot widget and webhook sit behind auth: `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/chatbot.ts`
12. Login brute-force limits are effectively off: `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/auth.ts`

## Blocks selling outside India today

1. No way to bill a non-Indian tenant: `C:/Users/Admin/Downloads/pro/CRM/super-admin/src/app/api/webhooks/razorpay/route.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/admin.ts`
2. Invoices always compute GST: `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/invoices.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/services/tax-calculator.ts`
3. Money display hardcoded to INR and en-IN: `C:/Users/Admin/Downloads/pro/CRM/desktop/src/lib/utils.ts`, `C:/Users/Admin/Downloads/pro/CRM/packages/shared/lib/utils/currency_utils.dart`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/services/exports/excel-export.ts`
4. Desktop is untranslated with no RTL (Gulf): `C:/Users/Admin/Downloads/pro/CRM/desktop/src/lib/i18n.ts`, `C:/Users/Admin/Downloads/pro/CRM/packages/crm_app/lib/core/providers/locale_provider.dart`
5. Phone handling assumes India; driver app offers four codes: `C:/Users/Admin/Downloads/pro/CRM/backend/src/utils/phone.ts`, `C:/Users/Admin/Downloads/pro/CRM/packages/driver_app/lib/features/auth/presentation/screens/phone_input_screen.dart`
6. No customer payment gateway: `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/payments.ts`
7. No GDPR tooling and legal links are dead (UK/EU): `C:/Users/Admin/Downloads/pro/CRM/landing/index.html`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/contacts.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/routes/marketing/opt-out.ts`
8. Data residency fixed to APAC or unspecified: `C:/Users/Admin/Downloads/pro/CRM/terraform/modules/cloudflare/workers.tf`
9. No 2FA and plaintext provider secrets and API keys: `C:/Users/Admin/Downloads/pro/CRM/backend/src/db/tenant-schema.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/db/master-schema.ts`
10. Platform-level sender and no per-user timezone: `C:/Users/Admin/Downloads/pro/CRM/backend/src/services/email.ts`, `C:/Users/Admin/Downloads/pro/CRM/backend/src/utils/tz.ts`

Not read: `oci-provisioner/`, `wp-provision-queue.ts`, invoice PDF templates in detail, `release.yml` beyond its first 80 lines, and most of `crm_app`.
