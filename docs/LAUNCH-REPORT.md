# TravelCRM Pro: launch-readiness report

Written 2026-10-21 for the owner. Branch `launch-readiness`. Every statement comes from a file in this repository. Where a number was taken from a record and not re-run for this report, it says so.

How to read the evidence: `R###` is a work batch (R1xx = Tier 1, R2xx = Tier 2, R3xx = Tier 3). Each batch has a "merged line" result in `docs/launch/STATE.json`. "Merged line" means the tests were run on the combined branch after the batch was added.

---

## 1. Summary

The product is built and tested on this PC. It has never been deployed, and no real provider account (Twilio, SendGrid, Meta, Stripe, Razorpay, Cloudflare Email) has ever been used with it. On 2026-10-09 the readiness scorecard said "No, not today, in India or abroad". Since then 54 batches have been merged and the last full run passed: 818 end-to-end tests passed, 0 failed (73 skipped on purpose, because they only run on a multi-agency stack). Features that work rose from 157 of 312 to 219 of 358. None are broken now (11 before).

**The single most important thing before taking money from the first agency:** run the go-live runbook on a staging copy first (`docs/GO-LIVE.md`, phase 6), with real accounts. Everything about payments, email delivery, SMS, WhatsApp and phone calls is proven only against mock providers. The first real run will find small surprises. Do not let the first paying agency be the one that finds them. Before that, phase 0 of the runbook: make the repository private and use brand-new secrets in production.

---

## 2. Scorecard: before and after

Before = the score in `docs/readiness/SCORECARD.md` (written 2026-10-09 to 2026-10-14). Scale: 0 missing or broken, 1 pieces exist but do not work together, 2 demo with holes, 3 works locally with tests, 4 ready with small gaps, 5 ready and checked end to end. No second numeric scoring was done after the work. The "Now" column states what the records show. It does not give a new number.

| Area | Before (production / international) | Now, with evidence |
|---|---|---|
| Tenant isolation (each agency's data apart) | 1 / n/a. All agencies could share one database. | One resolver for every lookup, fails closed (R101). Local multi-agency stack (R103). Isolation test `tenant-isolation.spec.ts` 9/9 three runs in a row (R121), and 13/13 with the locale specs on a multi stack (R203, R129). Cloudflare provisioner tested with mocked calls only (R104). |
| Provisioning and handoff (making an agency and giving it to the owner) | 1 / 1. A console-made agency could not log in. | Backend creates a working agency (R104). Welcome mail, forced password change, first-login flow (R102, R113). `handoff.spec.ts` for 3 agencies (India Basic INR GST, UK Pro GBP VAT, UAE Enterprise AED VAT): 41/41, green 3 runs in a row (W5). Two bugs found and fixed there: wrong locale for console-made agencies, and new agencies billed at the India price. Playbook: `docs/HANDOFF-PLAYBOOK.md`. Real inbox, real SMS and real payments cannot be tested locally. |
| Security | 2 / 1. Any user could read any agency's files. No 2FA. | Files scoped to the agency, real login limits, CORS from config, rate limits, test mode fenced (R106). Webhooks signed (R107). Provider credentials sealed with AES-256-GCM, API keys hashed (R108). TOTP two-factor, agency-wide "require 2FA", 12-character passwords (R209). Network guard stops tests from reaching real providers (R132). Super admin has no 2FA yet (section 6). |
| Plans and billing | 1 / 0. Plans defined in six places. No checkout. Caps refilled every 5 minutes. | One plan catalogue in the master database (R109). Caps reset once per period (R105). Stripe, Razorpay and mock gateway, signed idempotent webhooks, grace period then read-only, platform invoices (R205). Add-on packs at cost x 1.2 or more (R206). Agency collects from its own customers (R207). Approved prices loaded: 4 plans, 54 price rows across 9 markets, founder window 2026-11-01 to 2027-03-31 (R129). Never run against a real gateway. |
| Packaging and installers | 1 / n/a. The installer could not show a screen. | Windows installer built, installed silently, logged in, server stops on close, updater sees a local feed: 3/3 smoke tests (BUILD-VERIFICATION). Agency web app and `/q/<token>` pages built (R125, web e2e 9/9). Unsigned. No Mac build. |
| Driver app | 2 / 1. Agency was compiled in. Debug signing. 4 country codes. | Agency-code sign-in, stored agency, full country picker, release signing from an untracked key, icons, iOS strings (R115). Fares in the agency currency (R204). Shared package 88 tests and driver app 114 tests pass, analyze clean. Release APK built (53.5 MB, signed with a throwaway key only). Never installed on a device or emulator on this PC. |
| Super admin console | 1 / n/a. Public seed route, default credentials. | Own login and token, lifecycle writes, usage, impersonation with audit (R111, R112). Founder and list price rows shown (R129). Feature switches per plan and per agency (R127). Calling tab (R304). WordPress page (R309). Email page (R132). Builds clean, including the OpenNext build. Never opened in a browser by an agent. Features: 13 works, 6 partial, 3 stub (hidden pages), 1 removed. |
| Landing page | 1 / 1. Dead buttons, invented numbers. | Working forms and enquiries visible to the operator at `GET /admin/enquiries`, legal page drafts, no unverifiable claims, cookie notice (R116, R208). Founder prices shown (R129). Link check: 63 references on 5 pages, no broken internal links. Domain is still a placeholder. |
| International: currency and tax | 3 / 0. Every invoice was Indian GST. | Tax engine: GST, VAT with reverse charge, sales tax, none, stored per invoice and note (R201). About 110 money sites moved to shared helpers; the "INR / en-IN / Asia/Kolkata" literals are gone outside an allow-list, guarded by `locale-literals.test.ts` (R203). Exchange rates and user time zone (R202). Accountant must confirm defaults (section 6). |
| International: phones | 3 / 1. Assumed +91. | Phones by agency country from a 226-country table, all countries in the desktop picker, routing on the national number (R204). |
| International: languages incl. Arabic RTL | 3 / 1. No translation, no RTL. | `t()` with plurals and English fallback, 753 English keys (R210). Arabic 811/811 keys, enabled, 251 physical CSS classes made direction-neutral, `rtl.spec.ts` 10 tests, Latin digits for Arabic (R211, R130). Hindi 62% of keys, draft. Both Arabic and Hindi are AI drafts and need a native reader (section 5). Page bodies are not all converted. |
| Privacy: GDPR and India DPDP | 1 / 0. Soft delete only. | Consent records checked on every marketing send (WhatsApp campaigns had no opt-out check before), contact export (51-table registry with a completeness test), erasure with a personal-data scan test, signed unsubscribe links with List-Unsubscribe headers, landing cookie notice (R208). Legal pages are drafts. Data regions deferred (R212). |
| Messaging: email split | n/a | Cloudflare Email Routing for inbound, Cloudflare for platform system mail with automatic SendGrid fallback, SendGrid for all agency mail (R131, R132; ADR-002 owner decisions 2026-10-21). Marketing mail never goes through Cloudflare (tested). Console Email page switches routing with an audited reason. Provider message ids saved; bounces flag the contact and refund the send (R128). Cloudflare onboarding not done. |
| Messaging: WhatsApp via Meta | 3 / 2. Twilio only. | Meta Cloud API per agency: text, media, templates, 24-hour window enforced, signed webhook, statuses once and in order (R213). Utility and marketing metered separately (R130). Not connected to a real Meta account. |
| Calling (VoIP) | 1 / 0. | Twilio only, one sub-account per agency (R304), reselling contract and country gating (R301), callbacks once (R302), 7 call events and recipes (R303), recording to R2 with consent modes, retention, transcription credits (R306), minute metering and fraud checks (R305), in-app softphone (R307). Call e2e: calls 16/16 and 52 softphone-group tests passed (R302, R307). No call has been made on a real account. Not offered in India or the Gulf (R308 dropped). |
| WordPress sites | 1 / n/a. | Signed provisioner requests, retries and status model (R309). Shared WordPress Multisite hosting with automatic TLS, sized to the Oracle free machine (R310; about 88 sites on 12 GB is an assumption). Provisioner 24/24 tests. Docker test skipped (engine was not running). No real site built. |
| Operations, monitoring, backups | 0 / n/a. | Real deep health check, error-reporting hook, hibernating realtime (R117). Weekly backup to R2 with `--verify` restore check, Time Travel path (R117, R125, `docs/ops/BACKUPS.md`). Cron fan-out through queues (R105). No monitor or alert exists yet. |

Other areas that moved: feature switches (R127, one resolution order: platform off, then agency override, then plan), CI on `master` and a single root install (R118), documentation rewritten from the code (R122), command palette, calendar, credit notes and numbering fixes (R120).

### Feature counts (recounted from `docs/features.json`)

| | Works | Partial | Stub | Broken | Total |
|---|---|---|---|---|---|
| Before (2026-10-09) | 157 | 124 | 20 | 11 | 312 |
| Now | 219 | 134 | 5 | 0 | 358 |

The JSON holds 359 entries. One is marked "removed" (`sa.desktop-pages`) and is not counted. The five stubs are driver push, driver app distribution (no store listing or real key), and three hidden console pages (announcements, support tickets, SEO).

---

## 3. What was verified by running, and what was not

### Run on this PC

| Check | Result | Source |
|---|---|---|
| Backend tests | 106 files, 2,074 tests passed. Type check clean. Was 57 files / 1,296 at baseline. | `finalVerification`, BUILD-VERIFICATION |
| Desktop unit tests | 95 files, 1,548 tests. Lint 0 errors. Was 64 / 1,294 at baseline. | `finalVerification` |
| Full end-to-end, single-agency stack | 818 passed, 0 failed, 73 skipped, 22.7 minutes (2026-10-21). First full run on 2026-10-15 was 771 / 0 / 38 skipped. | `finalVerification`, `e2eBaseline` |
| Multi-agency runs | `handoff.spec.ts` 41/41. `locale.spec.ts` plus `tenant-isolation.spec.ts` 13/13. Earlier the same day. | `finalVerification` |
| Driver app | Shared 88 passed, driver 114 passed, analyze clean. | R126, BUILD-VERIFICATION |
| Provisioner | 24/24 and type check clean. | R310, BUILD-VERIFICATION |
| Fresh clone | One root `npm ci`, then all checks passed (13/13 at R122, 21/21 at R125). | R118, R122, R125 |
| Terraform | `validate` and `fmt` pass on both roots. No plan, no apply. | BUILD-VERIFICATION |

### Build verification (2026-10-21): 8 of 8 items passed

| Item | Result |
|---|---|
| API Worker | Checks passed. `wrangler deploy --dry-run` bundle 7,000.83 KiB, 1,408.55 KiB gzipped (about 14% of the 10 MB paid limit). |
| Windows installer (unsigned) | 167,871,770 bytes, built in 113 s. Electron smoke test 3/3: installs, shows login, signs in, server closes on exit, updater sees a local feed. |
| Agency web app | Built. Dry-run bundle 1,436.21 KiB gzipped. Not opened in a browser. |
| Super admin console | tsc clean, lint 0 errors and 2 warnings (unused import and variable), builds, OpenNext build. Not opened in a browser. |
| Landing page | Built. 21 files. Link check passed. Still the placeholder domain. |
| Driver app APK | 53.5 MB, signed with a throwaway key. Must never go to Google Play. Not run on a device (none available). |
| Provisioner | Tests and type check pass. |
| Terraform | Both roots valid, formatting clean. |

### Built or read only, never run against real services

- No deploy of any kind. This PC is signed in to the owner's real Cloudflare account, so only `--dry-run` was used.
- No real email, SMS, WhatsApp, payment, call, number purchase or WordPress site. All provider code ran against mocks or recorded shapes.
- No clean-machine install, no Mac or iOS build, no code signing, no Play upload.
- Auto-update was checked against a local feed only.
- The Cloudflare provisioner (D1 create, attach binding) was tested with mocked calls. Whether a new agency works without a redeploy is a go-live check (R104 note).
- Driver demo flow test: the file is fixed and compiles. The latest commit message says it now chooses the agency first. It was not run (no emulator).

---

## 4. Owner decisions and deferred items

Dated from `ownerDecisions` and `ownerGates` in `docs/launch/STATE.json`.

**2026-10-14**
- Price per agency per year, plus paid extra users and AI credit packs. Not per user.
- SMS, WhatsApp, login codes and calls stay included, with caps per plan. At the cap the agency upgrades or buys credits. Add-ons priced at provider cost + 20%.
- VoIP: something easier than Plivo (sign-up failed).
- Video voice: American female (`af_heart`).

**2026-10-15**
- The agency app is also deployed on the web at `app.<domain>`.
- Domain not decided. One placeholder, `YOUR-DOMAIN.example`.
- VoIP: Twilio only. No calling for agencies in India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh. R308 (India call bridge) dropped.
- Repo not private yet. Hold the push.

**2026-10-21 (several decisions that day)**
- Repo stays public for now. Owner will make it private later and says the exposed keys are invalid. A push still needs an explicit "push".
- Owner delegated pricing. `docs/PRICING.md` was approved as proposed. It was loaded as R129 (step A) and R130 (step B).
- Calling is off on trials by default, with a super admin switch.
- Super admin can switch features per plan and per agency (R127).
- Number release: 14 days after cancel, 7 days if rent is unpaid.
- Spend spike: raise a flag and send an email. No automatic block.
- Email: ADR-002 analysed Cloudflare against SendGrid. Decision: Cloudflare Email Routing for inbound, Cloudflare for platform system mail with SendGrid fallback, SendGrid for all agency mail. Routing editable from the console (R131, R132). Login codes stay on SMS unless the owner changes it.
- WordPress: one shared installation for now (R310).

**Deferred**
- **R100, repository privacy and key rotation.** Owner will do it later. Secrets in the repo are dummy values. The runbook's phase 0 still lists the steps, and they must happen before real keys exist.
- **R212, data regions.** Single location for now.
- **R308, India call bridge.** Dropped.
- Push to the remote: waits for an explicit owner "push".

**Numbers still waiting for the owner to confirm** (`ownerToConfirm`): extra-user prices, AI credits per plan, monthly caps and pack prices from R109, email unit cost, login-code (OTP) abuse limits, call-minute plan caps (all 0), per-minute call costs, fraud defaults, tax defaults (VAT rates GB 20, AE 5, SA 15, DE 19, Gulf below threshold, GST 18% and 5%, US single rate, invoice fields per country). Some of these were settled by the approved PRICING.md. The list in STATE was not rewritten afterwards, so check it against PRICING.md.

---

## 5. Before go-live: checklist by account

Steps are in `docs/GO-LIVE.md`. Account details, costs and where each key goes are in `docs/KEYS-AND-ACCOUNTS.md`. Settings per batch are in `docs/launch/STATE.json`, `goLiveConfig`. Do runbook phase 0 first.

- [ ] **GitHub and secrets** (GO-LIVE phase 0; KEYS 3.7). Make the repo private. Revoke the old token. Create new values for every secret. Decide what to do with the old history on the remote (0.5).
- [ ] **Cloudflare** (phases 2 to 4A, 10; KEYS 3.1). Workers Paid plan. Deploy token, runtime provisioning token, backup token. Terraform resources. Generated secrets (KEYS 3.2), especially `CREDENTIALS_KEYS` (keep a copy forever; losing it makes stored provider credentials unrecoverable). `ENVIRONMENT=production`. `TEST_MODE` and `BILLING_GATEWAY=mock` never set on staging or production. Check on a real account that a new agency database attaches without a redeploy (R104).
- [ ] **Domain** (phase 0.8, phase 1). Choose it once. Set it in the seven places the runbook lists. Landing config and canonical tags (R116).
- [ ] **SendGrid** (phase 9.1; KEYS 3.3). Paid plan, domain authenticated (SPF and DKIM), API key, signed event webhook. Welcome mail must reach inboxes.
- [ ] **Cloudflare Email** (phase 9.1a; ADR-002). Email Routing on `in.<domain>` with a catch-all to the API Worker. Email Sending onboarding for the platform domain (beta). Until then platform mail goes through SendGrid automatically. DMARC `p=none` first. Rollback from the console Email page.
- [ ] **Twilio** (phase 9.2, 9.6; KEYS 3.3). Upgrade and fund. Verify service, sending numbers, callback URLs, `API_PUBLIC_URL` equal to the public API address. For calling: written OK from Twilio to resell through sub-accounts, real number prices, `VOIP_CALLING_COUNTRIES` (default GB, US, AU, SG), one real call per country, regulatory bundles submitted by hand at first, emergency-calling wording in the terms.
- [ ] **Meta WhatsApp** (phase 9.3; R213). Business verification, WhatsApp Business account and number, system-user token, app secret, verify token, callback subscribed to messages, templates approved with the same names as the CRM templates (marketing ones with `{{unsubscribe_url}}`). Allow days to weeks.
- [ ] **Stripe and Razorpay** (billing; KEYS 3.5, which is out of date, see section 6). Keys, webhook secrets, webhook URLs, the listed event types. Test-mode purchase of every add-on. Pilot agency connects its own test keys and pays one full and one part-paid invoice (R207). Check card fees against the 20% margin (about 18% after ~2% card fees).
- [ ] **Deepgram and Workers AI** (phase 9.5; R306). `DEEPGRAM_API_KEY` for premium transcription. Workers AI binding. Run the capped 20-call quality test. Decide the recording default and Call AI default. `ANTHROPIC_API_KEY` with a monthly limit at Anthropic.
- [ ] **Oracle VM** (KEYS 3.8; `docs/ops/WORDPRESS-HOSTING.md`; R309, R310). Separate Terraform root. Provisioner with a strong `PROVISIONER_SECRET`, Docker, outbound mail (an SMTP plugin is needed for WordPress password mails). Let's Encrypt allows about 50 certificates a week. Oracle may reclaim an idle free instance. Not needed to sell the CRM.
- [ ] **Windows code signing** (phase 7; KEYS 3.6). Certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`). Build with `DOMAIN` set so the real update feed is baked in. Without it, Windows SmartScreen warns every customer.
- [ ] **Google Play and Apple** (phase 8; KEYS 3.6; R115). Real Android upload key kept outside the repo, Play Console account, internal track first. iOS needs a Mac and an Apple Developer account. Each agency gives its drivers its agency code.
- [ ] **Super admin and monitoring** (phase 4, 10; R111, R117). First operator via `create-super-admin.mjs`. Delete the demo operator. `SUPER_ADMIN_JWT_SECRET`. Uptime monitor on `/health/deep` with `X-Health-Token`. Error DSN. 5xx alert. A Time Travel restore rehearsal. Run `/admin/maintenance/reencrypt` and `/hash-api-keys` once.
- [ ] **Lawyer reviews** (R116, R208, R306; GO-LIVE 0.7). Privacy policy, terms, DPA and sub-processor list (all drafts in `landing/legal/`). Erasure scope. Consent wording. Call-recording consent wording per market. Telecom rules for the call-resale countries.
- [ ] **Native review of translations** (R210, R211). Arabic (811 keys) and Hindi (62%, a draft) are AI drafts. The R211 note lists Gulf terms to check: leads, credit notes, vouchers, rate cards, fleet, weekday abbreviations, sign-in and 2FA wording, placeholder order.
- [ ] **Accountant** (R201). Export and reverse-charge wording, default tax rates, mandatory invoice fields per country.
- [ ] **Pilot agency** (phase 11). Run the go/no-go list in 11.3 and read the rollback plan (11.4).

---

## 6. Known gaps and follow-ups still open

From the batch notes and `notes` in `docs/launch/STATE.json`.

**Security and privacy**
- Super admin has no 2FA (R209 follow-up). The attempt counter on 2FA is soft in KV, rate limits back it up.
- Erasure does not rewrite bulk import and export files in R2. Invoice free-text rewrite is case-sensitive (R208).
- Existing users with short passwords keep signing in. Change seed passwords such as `Admin@123` before go-live (R209).

**Billing and pricing**
- Nothing re-prices the gateway subscription when the 24-month founder lock ends (R129).
- Only India had add-on price rows at R206. R129 loaded markets, so check each market in the console before selling there.
- An expired trial cannot log in to reach `/billing`. The super admin tenant page shows billing fields (R205 follow-up, status not recorded).
- Per-market allowance numbers for EU/DE, MY_TH and LK_NP_BD Enterprise are not set (R130).
- Pricing says the weakest margin is login codes by SMS in India. Moving them to a WhatsApp template is the largest cheap gain (PRICING.md section 1). Owner has kept SMS for now.

**Calling**
- UK and Australia calling stays off until `VOIP_CALLING_COUNTRIES` is widened. NZ and non-German EU call weights fall back to 1 (R129).
- Transcript search index is not maintained, so search misses AI transcripts (R306).
- Inbound legacy `extract_lead` still creates follow-ups on its own (R306).
- Number prices for US, UK and Singapore are drafts until real Twilio prices are entered (R304).

**Messaging**
- Festival campaigns still send WhatsApp through Twilio, not Meta (R213).
- Inbound WhatsApp media is not downloaded. No template sync from Meta (R213).
- The invoice PDF is not attached to emails. The email carries a summary and a "Pay online" link. Only vouchers attach a PDF (R128).
- No Cloudflare delivery-event webhook. System mail status is the "accepted" row and the Cloudflare dashboard (R131, R132).
- Turning off "customer reply addresses" also refuses replies to addresses already sent (R132).

**Languages**
- Page bodies are not all converted to `t()`. API error text is shown as received (R210).
- E2E seeding can hit the API rate limit when many specs run together (R210).

**Tests and stability**
- One unexplained 30-second "Couldn't load invoices" in `locale.spec.ts` on a multi stack. The API log was empty. R133 suggests capturing wrangler request timings in fix-stack. The earlier invoice timeouts were test pollution and are fixed (R133). The latest full run was clean.
- The cron fan-out test "without a bound queue scheduled() runs agencies inline" flaked once. A 30-second timeout was added (R131). Watch it.
- The R201 merged-line run was stopped for low memory and not restarted (not a failure).
- Driver app: `LeadModel.toJson` encodes destinations as a JSON string (unused today, R126).

**Packaging**
- No Mac installer, no iOS build, no signing, no real update feed (BUILD-VERIFICATION).
- After `build:web`, run `build:desktop` again before the next installer (they share `desktop/.next`).
- Two harmless lint warnings in `super-admin/src/app/(authenticated)/seo/page.tsx`.

**Documents**
- `docs/GO-LIVE.md`, `docs/INFRA.md` and `docs/KEYS-AND-ACCOUNTS.md` were brought up to date with the final code on 2026-10-21, and R134 made the deploy tools cover every setting.
- `docs/decisions/ADR-002-email.md` records the owner's Cloudflare + SendGrid decision. `ADR-001-voip.md` recommends Plivo first, and has Addendum A for the change to Twilio.

**Housekeeping**
- Leftover worktree folders under `.claude/worktrees` to delete by hand after closing editors: R103, R106, R107, R112, R115, R120, R123, R133, R306. Unlink their `node_modules` junctions first (`docs/launch/STATE.json` notes). R213 is no longer there.
- Build log files `r114-*.log` sit in the same folder.
- The video tooling and recording specs are committed; the rendered videos stay local in `studio/out/`.
- Bugs found while recording are listed in section 8.

---

## 7. Where everything is

| What | Where |
|---|---|
| Programme state, every batch result, go-live settings | `docs/launch/STATE.json` |
| The "before" picture and the plan | `docs/readiness/SCORECARD.md`, `docs/readiness/READINESS-PLAN.md`, `docs/readiness/batches/` (`INDEX.json` has run order) |
| What the product does, per feature | `docs/FEATURES.md`, `docs/features.json` |
| What was built and tested at the end | `docs/BUILD-VERIFICATION.md` (with commands to repeat it) |
| Step-by-step go-live | `docs/GO-LIVE.md` |
| Accounts, keys, costs | `docs/KEYS-AND-ACCOUNTS.md` |
| How the pieces fit | `docs/INFRA.md` |
| Running costs | `docs/COST-MODEL.md` |
| Prices and margins | `docs/PRICING.md` |
| Calling decision | `docs/decisions/ADR-001-voip.md`, `docs/CALL-AUTOMATION.md` |
| Email decision | `docs/decisions/ADR-002-email.md` |
| Giving a new agency to a customer | `docs/HANDOFF-PLAYBOOK.md` (matches `desktop/e2e/handoff.spec.ts`) |
| Backups and restore | `docs/ops/BACKUPS.md` |
| WordPress hosting | `docs/ops/WORDPRESS-HOSTING.md` |
| Marketing plan, landing copy, email sequences, demo script | `docs/marketing/` |
| What was removed in the cleanup and how to get it back | `docs/launch/CLEANUP-MANIFEST.md` |
| Original audits | `docs/launch/findings/` |
| Backups outside the repo | `C:/Users/Admin/Downloads/pro/CRM-backups/2026-10-09/` |
| Local stack and gates | `desktop/scripts/fix-stack.mjs`, `fix-gates.mjs`, `lint-gate.mjs` |
| Fresh-clone check | `scripts/fresh-clone-check.mjs` |
| Config generator and deploy | `backend/scripts/gen-wrangler.mjs`, `npm run deploy:api`, `scripts/push-secrets.sh`, `scripts/sync-config.sh` |
| First operator | `backend/scripts/create-super-admin.mjs` |
| Terraform | `terraform/` (Cloudflare), `terraform/oracle/` (WordPress VM) |
| Provisioner for WordPress | `oci-provisioner/` |
| Landing page | `landing/` (config in `landing/config.js`, legal drafts in `landing/legal/`) |
| End-to-end tests | `desktop/e2e/` |

---

## 8. Videos

Recorded and rendered on 2026-10-21 on the local stacks (no deploy), following `docs/videos/RECORDING-RUNBOOK.md`. Narration is the local `af_heart` voice. Outputs are in `studio/out/` (gitignored, so they are not in the repo); raw takes are in `desktop/showcase/.work/`.

| Output | Count | Where |
|---|---|---|
| Films (one per role, area and topic) | 25 | `studio/out/<film>.mp4`, each with `.srt`, chapters and timeline |
| Hero film for the landing page | 1 (80 s) | `studio/out/hero.mp4` |
| Master end-to-end cut | 1 (47.4 min, 122 chapters) | `studio/out/master.mp4` |
| Feature shorts | 116 with subtitles | `studio/out/shorts/<film>/` |

- **Films:** 6 roles (admin, sales manager, salesperson, operations, accountant, view-only); 12 areas (leads, contacts, itineraries, bookings, finance, communications, marketing, automations, calls, fleet, reports, settings); automations and calls; driver; platform owner (super admin to client handoff); plans (Basic, Pro, Enterprise with India, UK and US founder prices); international; website; AI session.
- **Coverage:** `node docs/videos/coverage.mjs` passes. All 353 working or partial features are covered: 342 appear in a chapter, and 11 are not filmed, with the reason in `docs/videos/not-filmed.json`.
- **AI cost:** the AI session used about 11 of its 12 allowed requests over 2 takes. The itinerary, lead score and insights scenes were cut to stay in budget; the closing scene names them.
- **Gates:** every film passes its render gate except `role-sales-manager`. It is 56.3 s against a 60 s minimum and was left as it is, not padded.
- **Retakes:** `role-admin` needed 4 attempts (an empty assistant queue on a fresh seed; the spec now seeds two messages), one more than the 2-retake rule. `plans` needed 3.
- **To re-record later:**
  - **website:** shows `YOUR-DOMAIN.example` until the domain is chosen, and does not click "Create website" because there is no provisioner locally.
  - **driver:** uses the 2026-10-04 recording with a title line saying the current app asks for the agency code first. Re-record on an emulator.
  - **platform-owner:** shows the agency code `skyline-holidays-2`.

**Product bugs the recording found (not fixed yet)**
- Team report (`/reports/team`) returns 403 for sales managers: the route requires `manager` but the role is `sales_manager`.
- The inbox list does not refresh when a message arrives (the bell does).
- AI itinerary generation takes about 60 s, so the UI reports "Failed to generate itinerary" even though the server returned the plan.
- Hanging up a simulated inbound call from the call panel returns 500 ("[mock] Call not found").
- The mock checkout URL is built without the API port, so the opened tab cannot load (mock billing only).
- `/voip/token` is requested on every page and returns 403 where calling is off (noise).
- A call with no transcript yet returns 404 on its detail.
- A red "£0" or "AED 0" on the dashboard looks like an error state.
- The landing footer still says "LEGAL (DRAFTS)".
- The landing form limit (5 per hour per IP, 3 per day per email) blocks a retake within the same hour. This is by design; mentioned for anyone recording.
