# TravelCRM Pro: readiness scorecard

- Written 2026-10-09, finished 2026-10-14 by the readiness planner (read-only; nothing was built, run or deployed for this document).
- Companion files: `docs/readiness/READINESS-PLAN.md` (how to fix it) and `docs/readiness/batches/*.json` (the work, one file per batch, run order in `batches/INDEX.json`).
- Owner decisions of 2026-10-14 are reflected: flat yearly price per agency with included users and AI credits plus add-ons; SMS, WhatsApp, login codes and calls included up to monthly caps with top-ups at provider cost + 20%; VoIP not designed around Plivo (provider set by an ADR-001 addendum, gate G1); video voice (G2) approved.
- Sources: my own reading of the code on 2026-10-14 (marked **verified**), the three audits in `docs/launch/findings/` (marked **audit**), `docs/features.json` (312 features: 157 works, 124 partial, 20 stub, 11 broken), `docs/decisions/ADR-001-voip.md`, `docs/COST-MODEL.md`, `docs/CALL-AUTOMATION.md`, and the last recorded gate runs (backend 57 files / 1,296 tests, desktop 64 files / 1,294 tests, lint 0 errors, full e2e 766 passed / 38 skipped, per `desktop/audit/fix/FINAL-E2E.md` and the coordinator; not re-run by me).

## Verdict

**No, not today, in India or abroad.** The part an agency's staff use every day (leads, contacts, itineraries, invoices, inbox, assistant, fleet) is strong and well tested. The platform underneath it has never been deployable: every agency would share one database (so one agency could see another's leads and log in with the same settings), a new agency created in the super admin console cannot log in, any logged-in user can read or delete any agency's files, the packaged desktop app has nothing to serve its screens, nothing takes payment, and as coded every plan loses money because platform-paid SMS, WhatsApp and login codes have no cap. **India** becomes handable after Tier 1 of the plan (22 code batches plus one owner action, all verifiable on this machine). **Abroad** needs Tier 2 as well (13 batches: tax regimes, currency and locale, Stripe, GDPR tooling, Arabic, data region). Calling and agency websites are Tier 3 (10 batches; calling waits on the owner's provider decision, gate G1). **Shortest honest path to a first paying Indian agency:** run Tier 1 in the order in `INDEX.json`; the first five (R101 tenancy resolver, R114 desktop packaging, R102 email, R120 walkthrough defects, R103 local multi-tenant stack) start the critical path; the data-leak and runaway-bill risks are closed by R104 to R110. Nothing ships until the owner makes the GitHub repository private (it is public today) and rotates the secrets listed in the plan.

## Scores

Scale: **0** missing or broken; **1** pieces exist but do not work together; **2** works in a demo with known holes; **3** works on the local stack with tests, gaps a paying customer would hit; **4** ready with small, written-down gaps; **5** ready and checked end to end.
"Production" means a paying Indian agency on our servers; "international" means the same for an agency in the UK/EU/US/Australia/Gulf/SE Asia. n/a = the area does not change by country.

| Area | Production | International | Evidence | Fixed by |
|---|---|---|---|---|
| Tenant isolation | **1** | n/a | `backend/src/services/tenant-db.ts` `tenantDbFor` returns `env.MASTER_DB` when no `TENANT_DB_*` binding exists, and `backend/wrangler.toml` binds only `MASTER_DB`; 81 of 103 tenant tables have no tenant id (audit) | R101, R103, R104, R121 |
| Tenant creation and handoff | **1** | 1 | `super-admin/src/app/api/tenants/provision/route.ts` hashes the admin password (PBKDF2) and never stores it; no user row, no welcome email; backend verifies bcrypt (`backend/src/utils/password.ts`) | R102, R104, R113 |
| Authentication and access control | **2** | 1 | Six-role matrix enforced and tested (`backend/src/constants/permissions.ts`, `test/permissions-endpoint.test.ts`); but `routes/files.ts` GET/DELETE take any key; login allows 1,000 attempts per 15 min (`routes/auth.ts`); no 2FA | R106, R107, R209 |
| Data safety (files, exports, backups) | **1** | 1 | No backup or restore code anywhere; `routes/exports.ts` has no role check (audit); files cross-tenant (above) | R106, R117, R208 |
| Plans, limits and billing | **1** | 0 | Plans defined differently in six places (`middleware/feature-gate.ts`, `routes/admin.ts`, `services/ai-pricing.ts`, `super-admin/src/lib/constants.ts`, `super-admin/.../[id]/plan/route.ts`, `landing/index.html`); no seat check in `routes/users.ts` invite; `trial_ends_at` never read; usage caps refill every 5 minutes (`backend/src/index.ts` scheduled handler); no checkout code; Stripe absent; no add-on (extra users, credit packs) exists | R105, R109, R110, R205, R206 |
| Deploy configuration and CI | **1** | n/a | `[env.production]` in `backend/wrangler.toml` has only `name`; placeholder ids; `MASTER_DB migrations_dir = "drizzle/tenant"`; workflows trigger on `main` (repo uses `master`); nested `backend/package-lock.json` makes `npm ci` in `backend/` wipe the root `node_modules` (coordinator, verified 2026-10-14) | R103, R118 |
| Desktop installer and updates | **1** | n/a | `desktop/electron/main.ts` loads `.next/server/app/index.html` (not produced by a standalone build) with a `localhost:3000` fallback; `desktop/public/` icons missing; no `electron-updater`; API URL fixed at build in `desktop/src/lib/api/config.ts` | R114 |
| Driver app | **2** | 1 | Flows recorded on the emulator (`desktop/showcase`, features.json fleet area 15 works); but `TENANT_ID` is compiled in (`packages/driver_app/lib/core/constants/app_config.dart`), release signed with the debug key, no iOS usage strings, phone picker offers 4 country codes | R115, R204 |
| Super admin console | **1** | n/a | Standalone app writes D1 directly and its wizard is broken (above); seed route public; tracked default credentials in `super-admin/wrangler.toml`; OpenNext in code vs next-on-pages in CI; desktop `/super-admin` pages read-only; features.json super admin area: 0 works, 11 partial, 5 stub, 1 broken | R111, R112 |
| Landing page and signup | **1** | 1 | `landing/index.html`: every CTA `href="#"`, no form, no legal pages, unverified "500+ agencies" and rating JSON-LD, per-user USD prices that disagree with the INR plans; no deploy path (terraform points the root domain at the removed Flutter web project) | R116, R118 |
| Inbound channels and inbox | **3** | 2 | Gateway, dedupe and signatures on message webhooks tested (`test/inbound-gateway.test.ts`, `delivery-callbacks.test.ts`); tenant lookup via `candidateTenantDbs`; platform-keyed Twilio only, no Meta Cloud API, chatbot widget mounted behind auth (`backend/src/index.ts`) | R107, R213 |
| Assistant and automations | **3** | 2 | 26 recipes, engine with dedupe/depth/pause tested (`test/automation-engine.test.ts`, `automation-recipes.test.ts`); AI credits metered (`test/ai-credits.test.ts`); cron loops every tenant in one invocation (wall at ~500 agencies, COST-MODEL); call extraction calls Anthropic unmetered | R105, R110, R306 |
| VoIP and calls | **1** | 0 | Twilio/Plivo adapters exist; no softphone or agent leg; callbacks unsigned; only `call.missed` reaches automations; columns referenced by call code are in no migration (CALL-AUTOMATION.md 1.0, audit 03); the provider is open again (owner could not sign up with Plivo; ADR-001 addendum pending, G1) | R119 (drift), R301–R308 |
| Invoices, tax and currency | **3** | 0 | Indian GST (CGST/SGST/IGST), numbering, credit notes work and are tested (`test/payment-routes.test.ts`, features.json invoices 12 works); `routes/invoices.ts` calls `detectTaxType` without the tenant's `tax_system`, so every invoice is GST; `₹` hardcoded in backend invoices/payments/excel export | R120 (carry-over), R201, R202 |
| Language, dates, phones, time zones | **3** | 1 | India defaults correct; `formatCurrency` defaults INR/en-IN (`desktop/src/lib/utils.ts`), 178 `en-IN` and 93 `INR` literals in desktop (audit), `utils/phone.ts` assumes `91`, 0 of 193 pages use the i18n context, no RTL, no per-user time zone | R202, R203, R204, R210, R211 |
| Privacy and compliance (GDPR-style) | **1** | 0 | Contact delete is soft only (`routes/contacts.ts`); no consent records, erasure, cookie banner, DPA, 2FA; provider credentials and API keys stored in plain text (`db/tenant-schema.ts` voip_settings, `db/master-schema.ts` api keys); India DPDP Act also applies | R108, R208, R209 |
| Observability and operations | **0** | n/a | `/health` returns a static `database: 'connected'` (`backend/src/index.ts`); no `[observability]`, no error tracking, no backups, no runbook | R117 |
| Documentation | **2** | n/a | Current: `docs/FEATURES.md`, ADR-001, COST-MODEL, CALL-AUTOMATION, `desktop/audit/remake/CONTRACT.md`. Stale: `README.md` (deploy commands that do not exist), `CONTRIBUTING.md` (Flutter-first). No go-live runbook (W7) | R122 |
| WordPress sites | **1** | n/a | `oci-provisioner/` service exists (default secret `'change-me'`); `backend/src/queues/wp-provision-queue.ts` is a logging stub; super admin queue send commented out; terraform asks for 4 OCPU / 24 GB, possibly twice the free allowance | R309, R310 |

## What is strong

- The agency-facing product: 157 of 312 features "works" with evidence, most of the CRM core (contacts, leads, itineraries, rate cards, invoices, fleet) is at "works", and the last full e2e was 766 passed with 0 failures, three runs in a row.
- One design system across the desktop app (`CONTRACT.md`), with lint at zero errors.
- The automation engine's guard rails (customer-visible actions are always a suggestion; dedupe keys; depth limit; pause switch) are the right design and tested.
- A repeatable local gate harness already exists (`desktop/scripts/fix-stack.mjs`, `fix-gates.mjs`, `lint-gate.mjs`), so every batch in the plan has a cheap way to prove itself.
- Decisions on the hard commercial questions (calling provider, cost, prices) are researched with sources and waiting only for the owner.

## What blocks a handoff (India), ranked

1. Agencies share one database; isolation does not exist at runtime (R101, R103, R121).
2. A new agency cannot log in; no welcome or invite email; no forced password change (R102, R104, R113).
3. Any user can read or delete any agency's files; login brute force effectively unlimited; webhooks unsigned (R106, R107); provider credentials in plain text (R108).
4. Platform-paid SMS, WhatsApp and login codes are uncapped and the usage-cap reset refills allowances every 5 minutes: every plan loses money as coded and one abusive agency can run up an open-ended bill; the owner keeps these channels included, so caps, alerts and top-ups are the fix (R105, R109, R110).
5. Plans disagree in six places; seats and trial expiry not enforced (R109).
6. Nothing can be deployed: no production bindings, no migration path for master or tenant DBs, CORS rejects any real domain, CI never runs (R103, R106, R118).
7. The packaged desktop app cannot show a screen (R114). The driver app is one build per agency (R115).
8. Super admin console: public seed route, tracked default credentials, provisioning outside the backend (R111, R112).
9. No backups, static health check, no error tracking (R117).
10. Call code references columns that do not exist (R119); four walkthrough defects remain (R120).
11. The landing page has no working signup or contact path and shows claims that cannot be evidenced (R116).
12. Owner action, not code: the GitHub repository is public; make it private, revoke the old token, and treat every secret ever committed to public `master` as exposed (R100).

## What blocks selling abroad, ranked (after Tier 1)

1. Invoices are always Indian GST; no VAT, reverse charge, sales tax or "none" (R201).
2. Money, dates and phones are hardcoded to India in all three clients and in backend exports (R202, R203, R204).
3. No way to bill a foreign agency or let it collect from its customers: Stripe absent (R205, R206, R207). Indian subscriptions are also recorded by hand until R205.
4. No GDPR tooling: consent, export, erasure, unsubscribe link, cookie banner, legal pages, 2FA (R208, R209).
5. Desktop is untranslated and has no right-to-left layout, which the Gulf needs (R210, R211).
6. Data region cannot be chosen (R212).
7. No calling outside India until G1; Gulf calling not offered at launch by design (ADR-001).

## Verified by me / taken from the audit

| Area | Basis |
|---|---|
| Tenant isolation | **Verified**: `tenant-db.ts` fallback, `wrangler.toml` bindings, `candidateTenantDbs` fan-out. Table count (22 of 103 with tenant id) from audit 02. |
| Tenant creation and handoff | **Verified** the provision route and seed route. Welcome email absence from audit 02, spot-checked by grep. |
| Authentication | **Verified** `routes/files.ts` and the login limit constants in `routes/auth.ts`; RBAC test exists (not re-run). |
| Data safety | Audit 02 for exports and backups; **verified** no backup code by grep. |
| Plans and billing | **Verified** `feature-gate.ts`, `admin.ts` plan table, `super-admin/src/lib/constants.ts` and the cron cap reset in `index.ts`. |
| Deploy and CI | **Verified** `wrangler.toml`, workflow branch triggers, root workspaces; the `npm ci` wipe is the coordinator's run on 2026-10-14. |
| Desktop installer | **Verified** `electron/main.ts`, `electron-builder.yml`, `api/config.ts`. |
| Driver app | **Verified** `app_config.dart`; signing and Info.plist from audit 01. |
| Super admin | **Verified** provision and seed routes, `wrangler.toml`; page-by-page state from audit 02 and features.json. |
| Landing | **Verified** by grep: 27 `href="#"` links, the 500+/$2.4M+/99.9% stats and the 4.9/127 aggregateRating JSON-LD in `landing/index.html`. |
| Inbound and inbox | features.json evidence and test file names; not re-run. |
| Assistant | features.json and test names; cron fan-out **verified** in `index.ts`. |
| VoIP | `docs/CALL-AUTOMATION.md` section 1.0 (re-read of code on 2026-10-09) and ADR-001; schema drift columns **verified** by grep against `drizzle/tenant`. |
| Invoices and tax | **Verified** the `detectTaxType` call sites in `routes/invoices.ts`. |
| Locale | Counts from audit 02 (not recounted). |
| Privacy | Audit 02; plaintext columns **verified** in the schema files. |
| Observability | **Verified** `/health` handler. |
| Documentation | **Verified** file list and dates. |
| WordPress | **Verified** `wp-provision-queue.ts` and `oci-provisioner/src/server.ts`; Oracle allowance from the coordinator (cost model), not re-checked. |
