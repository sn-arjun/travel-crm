# TravelCRM Pro: what the product does today

_Refreshed from the code on 2026-10-20 (first written 2026-10-09, before the launch-readiness program). It describes branch `launch-readiness` after batches R101 to R126, R201, R202, R204 to R210, R213, R301 to R307 and R309 and the W5 hand-over scenario were merged. "Works" means the screen and the server side both exist and are connected and an automated test covers it. Features that depend on an outside account (Twilio, SendGrid, Meta, Stripe, Razorpay, Cloudflare, Deepgram) are "Partly works" until they have run against the real account, because no agent can do that; the go-live item is named in the last column. Where something was not checked, it says so._

## What this is

TravelCRM Pro is a customer and operations system for tours and travel agencies. An agency uses it to catch enquiries, turn them into quotes, take payments, issue vouchers, assign vehicles and drivers, call and message customers, and keep its team and customers in step. Five things ship:

1. **The desktop app** (Windows installer; the same app also builds for the web) that the agency team uses all day.
2. **The server** behind it: the API, background jobs, message intake, billing and the Assistant that prepares next steps.
3. **The driver mobile app** for drivers to accept trips, check in and out and send photos and location.
4. **The super admin console** where the platform owner creates and manages agencies, plans, calling accounts and websites.
5. **The landing page**, plus **per-agency WordPress websites** that the platform can host for each agency.

Important context for every feature below: each agency now has its own database and the server refuses to fall back to a shared one, but this has been proven on a local multi-agency stack only; creating real databases on Cloudflare has been tested with mocks (see Tenant database provisioning on Cloudflare). Nothing has been deployed: the domain is a single placeholder and every external account (Twilio, SendGrid, Meta, Stripe, Razorpay, Deepgram, Cloudflare) is unconfigured, so screens work and tests pass but nothing real is delivered until go-live.

**Status words:** Works / Partly works (wired, with the missing piece named) / Placeholder (a screen or endpoint that does nothing real) / Broken (cannot succeed as written) / Removed (taken out on purpose).

**Who can use it** lists the roles that can perform the feature. The six roles are Admin, Sales manager, Salesperson, Operations, Accountant and View only; drivers use only the driver app and the platform owner uses only the console.

## Summary

Counts before (2026-10-09) and after (2026-10-20):

| Status | 2026-10-09 | 2026-10-20 | Change |
|---|---:|---:|---:|
| Works | 157 | 219 | +62 |
| Partly works | 124 | 134 | +10 |
| Placeholder | 20 | 5 | -15 |
| Broken | 11 | 0 | -11 |
| Removed | 0 | 1 | +1 |
| **Total (excluding removed)** | **312** | **358** | **+46** |

By area:

| Area | Features | Works | Partly works | Placeholder | Broken | Works on 2026-10-09 |
|---|---:|---:|---:|---:|---:|---:|
| Enquiries and inbox | 20 | 11 | 9 | 0 | 0 | 8 |
| Contacts | 13 | 11 | 2 | 0 | 0 | 11 |
| Leads and pipeline | 14 | 11 | 3 | 0 | 0 | 11 |
| Follow-ups and tasks | 15 | 13 | 2 | 0 | 0 | 11 |
| Itineraries and templates | 13 | 11 | 2 | 0 | 0 | 10 |
| Rate cards and suppliers | 11 | 8 | 3 | 0 | 0 | 8 |
| Invoices and payments | 22 | 14 | 8 | 0 | 0 | 12 |
| Vouchers | 6 | 3 | 3 | 0 | 0 | 3 |
| Travellers and visa | 9 | 6 | 3 | 0 | 0 | 6 |
| Fleet and driver app | 26 | 17 | 7 | 2 | 0 | 15 |
| Calls | 19 | 6 | 13 | 0 | 0 | 3 |
| Assistant and automations | 68 | 37 | 31 | 0 | 0 | 25 |
| Marketing | 15 | 7 | 8 | 0 | 0 | 7 |
| Documents | 3 | 3 | 0 | 0 | 0 | 2 |
| Reports and dashboard | 10 | 9 | 1 | 0 | 0 | 7 |
| Import and export | 7 | 6 | 1 | 0 | 0 | 6 |
| Settings and team | 25 | 16 | 9 | 0 | 0 | 10 |
| Super admin console | 22 | 13 | 6 | 3 | 0 | 0 |
| Landing page | 7 | 2 | 5 | 0 | 0 | 2 |
| Agency websites (WordPress) | 5 | 1 | 4 | 0 | 0 | 0 |
| Platform services | 18 | 7 | 11 | 0 | 0 | 0 |
| Billing and plans | 6 | 4 | 2 | 0 | 0 | 0 |
| Privacy and consent | 4 | 3 | 1 | 0 | 0 | 0 |
| **Total** | **358** | **219** | **134** | **5** | **0** | **157** |

Evidence for "Works" is strongest where an end-to-end test exists. The last recorded full desktop run (2026-10-15, after the Tier 1 batches) passed 771 tests with 0 failed and 38 skipped (plan-gated pages); later batches each ran the specs for their own area (see "What changed"), and the W5 hand-over scenario passed three runs in a row. The counts of backend and desktop tests in docs/launch/STATE.json (backend 100 files / 1,967 tests, desktop 89 files / 1,510 tests at R307, up from 57 / 1,296 and 64 / 1,294 at the baseline) were not re-run for this document.

## What changed since 2026-10-09

Net +46 features: 47 added, 1 removed, 49 changed status, and 47 more kept their status but had their reason, evidence or go-live note rewritten. Features that move to Works are the ones the code now carries end to end with a test; many others moved from Broken or Placeholder to Partly works because they now run in tests but have never touched the real outside account.

Merged batches by theme:

- **Foundation (Tier 1, R101 to R126):** one tenant database resolver that fails closed, transactional email, local multi-agency stack and migration runner, Cloudflare provisioner (mocked), cron fan-out with per-agency, once-per-period jobs (this fixed the scheduled jobs that were broken: follow-up reminders, overdue tasks, invoice reminders, visa and passport alerts, fleet alerts and the campaign scheduler), signed provider webhooks, public chatbot routes, sealed credentials and hashed API keys, plan catalogue, communication caps and login-code limits, super admin API and its own console login, first-login and onboarding, desktop installer, driver app agency code and release signing, landing enquiries, backups and observability, CI and terraform, README and env examples, reminder de-duplication per recipient.
- **Tier 2 (R201, R202, R204 to R210, R213):** tax engine, locale core, phones by country, two-factor sign-in, subscription billing with Stripe, Razorpay and a mock, add-on packs, agency payment links, privacy export, erasure, consent and unsubscribe, language switch (shell only), Meta WhatsApp. R203 (desktop currency and date sweep) is in progress; R211 (Arabic, right to left) and R212 (data residency) are not started.
- **Tier 3 (R301 to R307, R309):** calling provider contract and mock, callbacks processed once, call lifecycle events and recipes with screen pop, calling sub-accounts and numbers, minute metering and fraud limits, recordings, transcription and call summaries, softphone, WordPress provisioning. R308 (India call bridge) was dropped by the owner and R310 (WordPress sizing) is blocked on an owner decision.
- **W5:** a hand-over rehearsal for three agencies (India, UK, UAE), which also fixed two bugs it found: console-created agencies started with Indian settings, and new agencies were billed at the India price in INR.

### Status changes

| Feature | Area | Before | After | Why |
|---|---|---|---|---|
| Scheduled fleet alerts | Fleet and driver app | Broken | Works | cron/fleet-alerts.ts now runs per agency from the job runner. |
| Follow-up reminders | Follow-ups and tasks | Broken | Works | The reminder job now runs once per agency through the tenant-jobs queue, against that agency's own database, and is claimed once per period. |
| Overdue task notifications | Follow-ups and tasks | Broken | Works | cron/overdue-tasks.ts now takes the agency database from the job runner and runs once per agency-local day. |
| Separate database per agency | Platform services | Broken | Works | One binding scheme (TENANT_DB_<id>) and a resolver that never falls back to the registry database (R101); local stacks run several agencies (R103). |
| Website chat widget and WhatsApp bot | Assistant and automations | Broken | Partly works | Widget side works without a login for a known key: allow-list per agency, plan gate, rate limit, 2 KB message cap (public-chatbot.test.ts). |
| Place a call from the CRM | Calls | Broken | Partly works | Outbound calls now ring the agent first and then the customer (R302), with the lead id kept, and agents can answer in the app through the softphone (R307). |
| Public unsubscribe link | Enquiries and inbox | Placeholder | Works | Signed public link /public/unsubscribe/:token (no login, rate-limited), List-Unsubscribe headers on marketing email, and every marketing send checks consent first. |
| Automatic invoice due reminders | Invoices and payments | Broken | Partly works | The job now runs per agency at the agency's local send hour and builds queue jobs in the shape the SMS and email consumers read, metered once per recipient (b37-tenant-local-today.test.ts, cron-recipient-idempotency.test.ts). |
| Schedule a campaign for later | Marketing | Broken | Partly works | The scheduler job now runs per agency every 5 minutes and turns a due campaign into pending recipients plus one campaign-queue message, once (cron-fanout.test.ts). |
| Production deployment | Platform services | Broken | Partly works | A deploy path now exists: gen-wrangler builds the production config from the agency registry, a predeploy guard blocks unsafe config, tenant migrations run canary-first, workflows are manual (workflow_dispatch), and terraform (Cloudflare and a separate Oracle root) validates. |
| Seat limit per plan | Settings and team | Placeholder | Works | Inviting or reactivating a user returns 402 SEAT_LIMIT when included users plus extra-user add-ons are used up (services/plans/seats.ts). |
| Change password while signed in | Settings and team | Placeholder | Works | A signed-in user can change the password (POST /auth/change-password, 12-character policy) and a first-login user is sent to the change-password page (R113, R209). |
| Create a new agency | Super admin console | Broken | Partly works | A created agency now gets its own database, migrations, an admin user with a temporary password and a welcome email, and the admin can sign in (handoff.spec.ts steps 1 and 2 for three agencies; tenant-provisioning.test.ts). |
| Sign in as an agency to help them | Super admin console | Placeholder | Works | Built (R111, R112): 30-minute marked token with no refresh, reason required, cannot act as a super admin, ends on expiry or on deactivation. |
| Passport and visa expiry alerts | Travellers and visa | Broken | Partly works | The passport and visa expiry jobs now run per agency at the local send hour and are covered by cron-fanout.test.ts and cron-recipient-idempotency.test.ts. |
| Websites page in the console | Agency websites (WordPress) | Partly works | Works | The console WordPress page lists sites with status (queued, provisioning, active, failed), attempts and history and has Retry; the agency page has a Website tab. |
| One-click site creation | Agency websites (WordPress) | Placeholder | Partly works | Real queue now: the console creates a queued site, the queue consumer calls the provisioner with a signed request, retries with backoff (60 s, 300 s, 3 attempts, 30-minute build timeout), a cron sweep recovers lost messages, one site per agency, and a website_ready email goes out without credentials (wp-provisioning.test.ts). |
| Daily scheduled automations | Assistant and automations | Partly works | Works | Time-based automations run as a per-agency job in the 5-minute set, claimed once per agency-local day, and the bug that reset usage caps on every tick is gone (the daily platform job resets them once). |
| Create a call-back task for every missed call | Assistant and automations | Partly works | Works | Recipe is tested (call-lifecycle.test.ts) and exercised end to end through the call simulator (calls-simulator.spec.ts). |
| AI credits and usage | Assistant and automations | Partly works | Works | Credits are metered for router calls and call transcription and summaries (R306), the monthly allowance comes from the plan catalogue plus add-on packs, and caps reset once per period (usage-cap-reset.test.ts, ai-credits.test.ts, metering-caps.test.ts). |
| Chatbot conversations | Assistant and automations | Partly works | Works | The public widget and conversation routes no longer sit behind login (R107), the website channel is canonical (R123), and the admin screens are covered by chatbot.spec.ts and public-chatbot.test.ts. |
| Chatbot settings and analytics | Assistant and automations | Partly works | Works | Settings, install tab with the real embed snippet, and analytics are covered by chatbot.spec.ts and public-chatbot.test.ts. |
| Call transcripts and search | Calls | Placeholder | Partly works | Transcription is now produced: Workers AI Whisper (standard, 3 credits a minute) or Deepgram Nova-3 (premium, 25 a minute), charged to the AI allowance. |
| AI call summary and extracted leads | Calls | Placeholder | Partly works | After a recorded call the call AI writes a summary (5 credits per 5 minutes) and the calls.summarise recipe turns it into suggestions only. |
| Caller pop-up on incoming call | Calls | Placeholder | Partly works | An incoming call now broadcasts call:status to the agent's app, which shows a screen pop with caller, contact and lead and Answer/Decline (R303, R307). |
| File storage | Documents | Partly works | Works | File keys must start with the caller's agency id; other agencies' keys answer 403, path tricks 400 (R106; security-hardening.test.ts). |
| Website-form API keys | Enquiries and inbox | Partly works | Works | Keys are stored as a SHA-256 hash plus a visible prefix (R108), shown once on creation, and revocable. |
| Map agency numbers and mailboxes to the workspace | Enquiries and inbox | Partly works | Works | UI and API work; buying a number in VoIP settings now registers it for inbound voice automatically (services/voip/numbers.ts), and POST /integrations/channels refuses a number the agency does not own (R305). |
| GST on invoices | Invoices and payments | Partly works | Works | The tax engine (R201) replaced the GST-only calculation: the agency's tax system now decides the maths, and the GST path is covered by tax-regimes.test.ts and the invoices e2e spec. |
| Online payment collection from customers | Invoices and payments | Placeholder | Partly works | Built (R207): gateway secrets sealed with the last four characters shown, per-agency signed webhook, exactly-once recording shared with manual payments. |
| Customer share link | Itineraries and templates | Partly works | Works | The customer view is now served: the agency web build has a public /q/<token> page and the public quotation route resolves the agency database through the tenant resolver. |
| Start free trial buttons | Landing page | Placeholder | Partly works | Every call to action now opens the enquiry form (demo, sign-up or contact) which posts to /public/enquiries (rate-limited, optional Turnstile); the operator sees it at GET /admin/enquiries and the handoff spec marks one converted. |
| Privacy, Terms and legal pages | Landing page | Placeholder | Partly works | Privacy policy, terms, data-processing agreement and sub-processor list pages exist (landing/legal/*.html) and the link check passes, but they are drafts. |
| Browser access (CORS) | Platform services | Partly works | Works | CORS allows only exact origins from CORS_ORIGINS plus loopback origins for the packaged desktop app; the chatbot public mount reflects the origin and enforces each agency's allow-list. |
| Scheduled jobs | Platform services | Partly works | Works | Three crons (every 5 minutes, hourly, daily 00:30 UTC) fan out one queue message per active agency; each job is claimed once per agency per period, daily jobs fire at the agency's local send hour, one failing job never stops the others, and platform-wide work (usage-cap resets, trial expiry, exchange rates, billing, number lifecycle) runs once. |
| Monitoring and logging | Platform services | Placeholder | Partly works | Structured JSON logs with a request id, an error-reporter hook (ERROR_REPORTER_DSN), a real health check and a deep health check are in place and tested (health.test.ts). |
| Privacy and data-protection tools | Platform services | Placeholder | Partly works | Consent records, contact export, erasure, signed unsubscribe, two-factor sign-in and sealed provider secrets now exist (see the Privacy and consent area, Two-factor sign-in, and Provider secrets encrypted at rest). |
| Command palette and search | Reports and dashboard | Partly works | Works | The palette searches contacts, leads and invoices through their list endpoints as well as listing screens and quick-create actions (R120; command-palette.test.tsx). |
| Export a report to Excel or PDF | Reports and dashboard | Partly works | Works | Downloads are verified in e2e and the hardcoded rupee sign is gone from the report and export code. |
| Interface language | Settings and team | Placeholder | Partly works | t() with plurals and English fallback is wired through the shell, navigation, command palette, sign-in (including two-factor) and shared archetypes: en.json has 791 keys, Hindi is a draft (468 keys, needs native review) and Arabic is registered but disabled. |
| Onboarding wizard | Settings and team | Partly works | Works | First sign-in walks the owner through a temporary-password change and the onboarding wizard, and the answers become the agency's settings (R113; first-login.spec.ts, handoff.spec.ts step 2 and 3). |
| Platform dashboard | Super admin console | Partly works | Works | Dashboard, stats, billing figures and calling safety flags come from tested admin endpoints (admin.test.ts); the console builds clean. |
| Agencies list and detail | Super admin console | Partly works | Works | Real queries with search, filters and counts (admin.test.ts); the owner email is now saved at creation. |
| Suspend, reactivate and delete an agency | Super admin console | Partly works | Works | Suspend takes effect on the next request (cache entry deleted), reactivate restores, cancel blocks but keeps data, each with before/after audit (super-admin-api.test.ts). |
| Change an agency plan | Super admin console | Partly works | Works | Plan changes use the catalogue's plan keys (trial, basic, pro, enterprise); the agency's plan, subscription amount and seats follow, with audit (super-admin-api.test.ts). |
| Per-agency feature switches and usage caps | Super admin console | Partly works | Works | Feature overrides and usage-cap overrides are honoured by the server gate and audited; usage caps now reset once per period, and an AI credit top-up raises the allowance (super-admin-api.test.ts, usage-cap-reset.test.ts). |
| Online billing for agencies | Super admin console | Placeholder | Partly works | Built (R205): Stripe, Razorpay and a mock gateway behind one interface, signed idempotent ordered webhooks, platform invoices with tax, grace period then read-only. |
| Platform audit log | Super admin console | Partly works | Works | Every write under /admin creates an audit row with before and after (super-admin-api.test.ts), and the log can be filtered by agency, admin, action and date (admin.test.ts). |
| System health | Super admin console | Partly works | Works | The public health check now runs a real query on the registry database and answers 503 when it fails; the deep check (registry, KV, storage with latencies) needs a super admin or HEALTH_TOKEN (health.test.ts, admin.test.ts). |

### Removed

| Feature | Reason |
|---|---|
| Read-only platform pages inside the desktop app (sa.desktop-pages) | The read-only platform pages inside the agency app were removed; /super-admin now redirects to the dashboard and the sidebar has no entry. The platform owner uses the separate console (super-admin/). |

### Added (47)

| Feature | Area | Status |
|---|---|---|
| Two-factor sign-in | Settings and team | Works |
| Require two-factor for the whole agency | Settings and team | Works |
| 12-character password rule | Settings and team | Works |
| Connect the agency's own WhatsApp number (Meta) | Settings and team | Partly works |
| Agency app in the browser | Settings and team | Partly works |
| WhatsApp through the agency's own Meta number | Enquiries and inbox | Partly works |
| Tax on invoices: VAT, sales tax or none | Invoices and payments | Works |
| Payment link on an invoice | Invoices and payments | Partly works |
| Driver app finds its agency by code | Fleet and driver app | Works |
| Driver app release build | Fleet and driver app | Partly works |
| Answer and place calls in the app (softphone) | Calls | Partly works |
| Calling offered only in resell countries | Calls | Works |
| Calling account per agency | Calls | Partly works |
| Call minutes metered and capped | Calls | Partly works |
| Toll-fraud protection on outbound calls | Calls | Works |
| Recording consent and retention | Calls | Works |
| Draft a sorry-we-missed-your-call message | Assistant and automations | Works |
| Create a task to listen to every voicemail | Assistant and automations | Works |
| Put every finished call on the contact and lead timeline | Assistant and automations | Works |
| Mark a new lead Contacted after a real conversation | Assistant and automations | Works |
| Suggest a follow-up after a connected call | Assistant and automations | Works |
| Offer a contact and lead after a call with an unknown number | Assistant and automations | Works |
| Suggest trying again when an outbound call is not answered | Assistant and automations | Works |
| Turn a summarised call into suggested next steps | Assistant and automations | Partly works |
| One plan catalogue | Billing and plans | Works |
| Subscribe, upgrade and cancel online | Billing and plans | Partly works |
| Grace period, then read-only | Billing and plans | Works |
| Subscription invoices to agencies | Billing and plans | Works |
| Buy more: extra users and add-on packs | Billing and plans | Partly works |
| Monthly caps on SMS, WhatsApp, login codes and email | Billing and plans | Works |
| Consent records for marketing | Privacy and consent | Works |
| Export everything about one contact | Privacy and consent | Works |
| Erase a contact | Privacy and consent | Works |
| Cookie notice on the landing page | Privacy and consent | Partly works |
| Edit plans, prices and packs | Super admin console | Works |
| Calling tab for each agency | Super admin console | Partly works |
| Calling safety flags | Super admin console | Works |
| Billing state on the agency page | Super admin console | Works |
| Landing enquiries inbox for the operator | Super admin console | Works |
| One-off maintenance endpoints | Super admin console | Works |
| Tenant database provisioning on Cloudflare | Platform services | Partly works |
| Provider secrets encrypted at rest | Platform services | Works |
| Request rate limits | Platform services | Works |
| Agency database backups | Platform services | Partly works |
| Phone numbers follow the agency's country | Platform services | Works |
| Agency locale, currency and time zone (backend) | Platform services | Partly works |
| Hand-over rehearsal for three agencies | Platform services | Works |

## Enquiries and inbox

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Customer WhatsApp and SMS arrive in the inbox | Messages a customer sends to the agency number are matched to a contact and lead and appear in the inbox. | Admin, Sales manager, Salesperson | All plans | Partly works | API_PUBLIC_URL, TWILIO_AUTH_TOKEN, Twilio console callback URLs; register each agency's WhatsApp number in the channel registry (R107). |
| Plivo WhatsApp and SMS inbound | Same inbound pipeline for agencies that use Plivo instead of Twilio. | Admin, Sales manager, Salesperson | All plans | Partly works | None planned: Plivo is not part of the launch. |
| Customer emails arrive in the inbox | Emails sent to the agency enquiry address are parsed and filed against the right contact and lead. | Admin, Sales manager, Salesperson | All plans | Partly works | SendGrid Inbound Parse pointed at the agency enquiry address; SendGrid domain authentication (SPF/DKIM). |
| Website enquiry form creates a lead | A form on the agency website posts an enquiry with an API key and a contact and lead are created. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Lead capture webhook (older) | Older API-key webhook that creates a lead from an external form or ad platform. | Admin only | All plans | Works |  |
| Website-form API keys | Admin creates and revokes keys; a key is shown once and used by the website form and webhook. | Admin only | All plans | Works | After deploy run POST /admin/maintenance/hash-api-keys until nextCursor is null (R108). |
| Map agency numbers and mailboxes to the workspace | Admin registers which WhatsApp, SMS, email or voice address belongs to the workspace so inbound messages find their owner. | Admin only | All plans | Works |  |
| Unified inbox | One searchable list of messages across email, WhatsApp and SMS with channel filter, hover actions, detail drawer and CSV export. | Everyone | All plans | Works |  |
| Conversation thread per contact | All messages with one contact in one thread, filterable by channel, with a Send message action. | Everyone | All plans | Works |  |
| Compose a message | Pick a recipient from a searchable list, choose a channel and template, write and send. | Admin, Sales manager, Salesperson | All plans | Partly works | SENDGRID_API_KEY, platform Twilio credentials, EMAIL_FROM and domain authentication (R102). |
| Send-message dialog on every record | One dialog on contacts, leads, invoices, vouchers and more: choose channel and template, preview, send through the Communication Hub. No raw mailto or wa.me links anywhere. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Bulk send to many contacts | Three-step wizard to send one message to a chosen list on email, SMS or WhatsApp. | Admin, Sales manager | All plans | Partly works |  |
| Message history and log | Per-contact message history and a log of every message sent. | Everyone | All plans | Works |  |
| Send a stored document by message | Attach a stored document to an outbound message. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Message templates | Reusable email, SMS and WhatsApp templates with placeholders, live preview using a real contact, SMS character counter and duplicate. | Admin, Sales manager | All plans | Works |  |
| Email signature | Each user sets a signature that is appended to outbound emails. | Everyone | All plans | Works |  |
| Delivery and open tracking | Twilio status callbacks and SendGrid events update message status to delivered, opened or clicked. | Runs automatically | All plans | Partly works | SENDGRID_WEBHOOK_PUBLIC_KEY (Signed Event Webhook), Twilio message status callback /api/v1/webhooks/twilio/status (R107). |
| Public unsubscribe link | Recipients can opt out from a link inside marketing messages. | Runs automatically | All plans | Works | Set UNSUB_SECRET (otherwise derived from JWT_SECRET and rotating it breaks sent links); lawyer review of consent wording (R208). |
| Live updates | New messages, suggestions and notifications appear without refreshing, over a websocket. | Everyone | All plans | Partly works |  |
| WhatsApp through the agency's own Meta number **(new)** | Send text, media and templates and receive customer messages on the agency's Meta WhatsApp Cloud API number; the 24-hour window is enforced before sending. | Admin, Sales manager, Salesperson | All plans | Partly works | Callback URL <API_PUBLIC_URL>/api/v1/webhooks/inbound/meta/whatsapp subscribed to messages; templates approved with the same names as the CRM templates (marketing ones with {{unsubscribe_url}}); secrets WHATSAPP_META_TOKEN, _PHONE_NUMBER_ID, _APP_SECRET, _VERIFY_TOKEN (R213). |

## Contacts

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Contact list | Searchable, filterable list of customers with infinite scroll, hover actions, detail drawer and CSV export. | Everyone | All plans | Works |  |
| Add and edit a contact | Create or edit a customer with phone picker, address autocomplete and typed relations; edit forms pre-fill every stored value. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Contact profile with related records | One page with the contact, related leads, invoices and itineraries, and a timeline of activity. | Everyone | All plans | Works |  |
| Contact activity timeline | Chronological history of everything that happened with a contact. | Everyone | All plans | Works |  |
| Duplicate warning | Entering an email or phone that already exists shows a warning before saving. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Merge two contacts | Pick two contacts, preview the combined record, merge and remove the duplicate. | Admin, Sales manager | All plans | Works |  |
| Tags and bulk tag | Tag contacts and apply a tag to many at once. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Custom fields | Admin adds extra fields to contacts; values save with each contact. | Admin only | All plans | Works |  |
| Share a contact with a teammate | Share a contact so it shows up under Shared with me for the recipient. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Birthdays and anniversaries | Store birthday and anniversary and list upcoming occasions. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Import contacts from a spreadsheet | Upload, map columns, preview, handle duplicates (skip or update) and import contacts. | Admin only | All plans | Works |  |
| Export contacts | Download the filtered list as CSV or Excel. | Admin, Sales manager | All plans | Works |  |
| Delete a contact | Contacts are soft-deleted so history is kept. | Admin, Sales manager | All plans | Works |  |

## Leads and pipeline

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Lead list | Searchable list with status and priority filters, infinite scroll, hover actions and export. | Everyone | All plans | Works |  |
| Pipeline board | Switch between table and a board of pipeline columns and drag leads between stages. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Add and edit a lead | Create a lead with contact and owner chosen from searchable lists; opening from a contact pre-fills the contact. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Lead detail with timeline | Lead page with status, notes, follow-ups, activities, itineraries, invoices and payments. | Everyone | All plans | Works |  |
| Change lead status | Move a lead through new, contacted, proposal sent, won, lost and so on; changes persist and fire automations. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Record why a lead was lost | Marking a lead lost asks for a reason that feeds the lost-deal report. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Lead notes | Add, edit and delete notes on a lead. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Unassigned leads and bulk assign | See leads with no owner and assign many to a teammate at once. | Admin, Sales manager | All plans | Works |  |
| Bulk status change and bulk delete | Select many leads to change status or delete together. | Admin, Sales manager | All plans | Partly works |  |
| Auto-assign new leads | Admin sets weighted rules so new leads go to the right salesperson. | Admin only | All plans | Works |  |
| Lead routing by source | Admin routes leads from a given source to a given teammate. | Admin only | All plans | Works |  |
| Follow-up sequences | Admin defines follow-up steps that are created automatically when a lead reaches a status. | Admin only | All plans | Works |  |
| Export leads | Download leads as CSV or Excel. | Admin, Sales manager | All plans | Works |  |
| Import leads | Bring leads in from a spreadsheet with contact matching. | Admin only | All plans | Works |  |

## Follow-ups and tasks

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Follow-ups list | Everything due to be chased, with type and status filters, reschedule, complete with outcome and cancel. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Schedule a follow-up | Create a follow-up against a lead chosen from a searchable list. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Follow-up reminders | Reminder notifications when a follow-up is due. | Admin, Sales manager, Salesperson | All plans | Works | TENANT_JOBS_QUEUE and cron triggers present in the generated Worker config (inline when unbound); push devices are a separate gap (see Push notifications). |
| Task list | Tasks with status, priority and category filters, bulk complete, infinite scroll and export. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Task detail, subtasks and comments | Open a task to change status, add subtasks and discuss in comments. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Task linked to a lead | Create a task from a lead; the lead is pre-filled and the task shows on the lead. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Overdue task notifications | Daily notification to the assignee about overdue tasks. | Runs automatically | All plans | Works |  |
| Calendar | Month and week calendar of events with drag-and-drop rescheduling and CSV export. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Create and edit events | Add meetings and reminders to the calendar. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Notification centre | Bell and full list of notifications with unread filter, mark all read, bulk actions and export; badges in the sidebar. | Everyone | All plans | Works |  |
| Team announcements | Admin broadcasts a notice to chosen roles; it appears in each person notification list. | Admin only | All plans | Works |  |
| Notification preferences and quiet hours | Each user chooses channels and quiet hours. | Everyone | All plans | Partly works |  |
| Push notifications | Push alerts to the phone or desktop. | Runs automatically | All plans | Partly works | Firebase project and an FCM key, plus a push SDK in the driver app (not started). |
| Sticky notes | Coloured notes on the dashboard: create, edit, recolour and delete. | Everyone | All plans | Works |  |
| Bookmarks | Star a record and find it later in one list with search, open and remove. | Everyone | All plans | Works |  |

## Itineraries and templates

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Itinerary list | Searchable list of quotes with status filter, infinite scroll and CSV export. | Everyone | All plans | Works |  |
| Build an itinerary day by day | Create an itinerary with days, items, prices and a lead picked from a searchable list; apply a rate card price from a picker. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Itinerary detail | View the quote with days, items and costs (cost tab only for roles allowed to see cost). | Everyone | All plans | Works |  |
| Clone an itinerary | Copy an itinerary to start a similar quote. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Quote versions | Create a new version of a quote and look back at earlier versions. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Quotation PDF | Preview and download a branded quotation PDF. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Send the quote to the customer | Email or WhatsApp the quote through the send dialog; marks the lead Proposal Sent via automation. | Admin, Sales manager, Salesperson, Operations | All plans | Partly works |  |
| Customer share link | Generate a link to the quote and revoke it again. | Admin, Sales manager, Salesperson, Operations | All plans | Works | Deploy the agency web build (deploy-web workflow) and set APP_URL / QUOTES_URL to the real domain (R125). |
| Itinerary templates | Library of reusable itineraries with preview of the day outline; create a template or save one from an existing itinerary. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Create an itinerary from a template | Pick a template and a lead and get a ready itinerary. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Itinerary defaults | Admin sets default terms, inclusions and validity for new quotes. | Admin only | All plans | Works |  |
| Cost and margin on a quote | Costs tab compares supplier cost with selling price. | Admin, Sales manager | All plans | Partly works |  |
| Pick prices from rate cards while quoting | The itinerary editor looks up matching supplier rate cards and fills prices. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |

## Rate cards and suppliers

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Supplier rate cards | Searchable list of rates by supplier and category with validity dates, bulk delete and export. | Everyone | All plans | Works |  |
| Add and edit a rate card | Form with supplier picker, currency inputs and date validation. | Admin, Operations | All plans | Works |  |
| Renewal task before a rate card expires | Automation creates a task a set number of days before validity ends. | Admin only | All plans | Works |  |
| Supplier directory | Suppliers with category, status and preferred filters, hover actions, bulk delete and export. | Everyone | All plans | Works |  |
| Add and edit a supplier | Form with phone picker, category and preferred switch. | Admin, Operations | All plans | Works |  |
| Supplier profile, rates and ledger | Supplier page with rate cards, payments made and a running ledger. | Everyone | All plans | Partly works |  |
| Rate comparison | Compare rates from several suppliers side by side. | Everyone | All plans | Partly works |  |
| Record payments to suppliers | Log what has been paid to each supplier and see outstanding amounts. | Admin, Accountant | All plans | Partly works |  |
| Rate and mark preferred suppliers | Give a supplier a star rating and flag it as preferred. | Admin, Operations | All plans | Works |  |
| Accounts (suppliers view) | Accounts page that frames the supplier list as payables, with category filter and export. | Everyone | All plans | Works |  |
| HSN and SAC code library | Pre-loaded searchable tax code list; admin can add custom codes; used on invoice lines. | Admin, Accountant | All plans | Works |  |

## Invoices and payments

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Invoice list | Searchable list with status filter, hover send action, bulk PDF download and export. | Everyone | All plans | Works |  |
| Create and edit an invoice | Invoice form with contact and lead pickers, line items, HSN codes and GST; non-draft invoices are locked from editing. | Admin, Sales manager, Accountant | All plans | Works |  |
| GST on invoices | Indian invoices compute CGST/SGST or IGST (or the export/LUT zero rate), stored on the invoice so later settings changes never alter it. | Admin, Sales manager, Accountant | All plans | Works | Owner to confirm GST defaults (18% itinerary invoices, 5% trip invoices) and the export/LUT wording (R201). |
| Create an invoice from an itinerary | One action turns an accepted quote into an invoice. | Admin, Sales manager, Accountant | All plans | Partly works |  |
| Invoice detail with payment history | Totals, balance due, payments applied and notes. | Everyone | All plans | Works |  |
| Download invoice as PDF or CSV | Generate a PDF or CSV of one invoice in the browser. | Admin, Sales manager, Accountant | All plans | Works |  |
| Bulk invoice PDFs | Select invoices and download a zip of PDFs prepared by a background job. | Admin, Sales manager, Accountant | All plans | Works |  |
| Void or duplicate an invoice | Cancel an invoice while keeping the record, or duplicate it. | Admin, Sales manager, Accountant | All plans | Works |  |
| Send an invoice | Email or WhatsApp the invoice via the send dialog. | Admin, Sales manager, Accountant | All plans | Partly works |  |
| Invoice defaults and numbering | Admin sets bank details, terms and the numbering pattern and financial-year start. | Admin only | All plans | Works |  |
| Credit notes | Issue a credit note against an invoice and apply it to reduce the balance. | Admin, Sales manager, Accountant | All plans | Works |  |
| Debit notes | Issue a debit note that increases the balance due. | Admin, Sales manager, Accountant | All plans | Works |  |
| Draft a reminder for overdue invoices | Assistant drafts a reminder message for each overdue invoice for a person to send. | Admin, Sales manager, Accountant | All plans | Works |  |
| Automatic invoice due reminders | Hourly job that reminds about invoices coming due. | Runs automatically | All plans | Partly works | SMS and email provider keys; communication caps and pack prices to be confirmed by the owner (R110). |
| Record a payment | Record a payment against an invoice or as an advance against a lead; validates amount against balance due. | Admin, Accountant | All plans | Works |  |
| Payments list and receipts | Searchable payment list with method filter, receipt view, delete (reverses the invoice) and export. | Everyone | All plans | Works |  |
| Link an advance payment to an invoice | Attach an advance received earlier to an invoice created later. | Admin, Accountant | All plans | Partly works |  |
| Online payment collection from customers | An agency connects its own Razorpay or Stripe account; invoices get a payment link and a paid link records the payment. | Runs automatically | All plans | Partly works | CREDENTIALS_KEYS must be set (sealing fails closed); pilot agency connects test-mode Razorpay and Stripe, pastes the webhook URL shown in Settings > Integrations, pays one full and one part-paid invoice (R207). |
| Exchange rates | Look up live currency rates for multi-currency quotes. | Everyone | All plans | Partly works |  |
| Multi-currency display | Show money in the agency currency. | Everyone | All plans | Partly works | R203 (desktop currency and date sweep) is in progress. |
| Tax on invoices: VAT, sales tax or none **(new)** | The agency's tax system decides the maths: GST (CGST/SGST/IGST, export with LUT note), VAT with a default rate per country and reverse charge for EU business buyers, US sales tax, or no tax. The result is stored on the invoice, credit note and debit note. | Admin, Sales manager, Accountant | All plans | Works | Owner to confirm export (LUT) and reverse-charge wording, default VAT rates (GB 20, AE 5, SA 15, DE 19), whether Gulf agencies below the VAT threshold use none, US single rate without nexus, and mandatory invoice fields per country with an accountant (R201). |
| Payment link on an invoice **(new)** | An invoice can carry a payment link for the balance due in the invoice's own currency; the link goes out through the Communication Hub templates and a replaced link cancels the old one. | Admin, Sales manager, Accountant | All plans | Partly works | Per-agency webhook URL pasted into each gateway dashboard (Razorpay payment_link.* events, Stripe checkout.session.completed) (R207). |

## Vouchers

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Voucher list | Hotel, transport, flight and activity vouchers with filters, bulk send and export. | Everyone | All plans | Works |  |
| Create and edit a voucher | Typed vouchers (hotel, transport, flight, activity) with lead and supplier pickers; title auto-generated when blank. | Admin, Sales manager, Operations | All plans | Works |  |
| Voucher status flow | Move draft to sent to confirmed; only drafts can be edited. | Admin, Sales manager, Operations | All plans | Works |  |
| Voucher in English, Hindi or Arabic | Choose the voucher language. | Admin, Sales manager, Operations | All plans | Partly works |  |
| Voucher PDF and send | Generate a PDF and send a voucher or several in one go. | Admin, Sales manager, Operations | All plans | Partly works |  |
| Vouchers from itinerary items | Create a voucher straight from an itinerary item. | Admin, Sales manager, Operations | All plans | Partly works |  |

## Travellers and visa

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Traveller records | Passport holders linked to contacts with passport expiry tags, search, bulk delete and export. | Everyone | All plans | Works |  |
| Add and edit a traveller | Form with nationality picker, phone picker and contact link. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Link a traveller to a contact | Connect or disconnect a traveller and a customer contact. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Ask for traveller details after booking | Assistant drafts a message asking the customer for passport details once a booking is confirmed. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Visa applications | Track each application with status, destination, search, filters, bulk delete and export. | Everyone | All plans | Works |  |
| Create and edit a visa application | Traveller and destination pickers; new applications start as Not Started. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Visa dashboard | Counts of applications by status and a view of missing documents. | Everyone | All plans | Partly works |  |
| Visa checklist and documents | Tick off checklist items and upload, download and delete visa documents. | Admin, Sales manager, Salesperson, Operations | All plans | Partly works |  |
| Passport and visa expiry alerts | Daily alerts for passports and visas about to expire and for missing visa documents. | Runs automatically | All plans | Partly works |  |

## Fleet and driver app

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Fleet dashboard | Tiles for vehicles and drivers, weekly vehicle availability calendar. | Admin, Sales manager, Operations | All plans | Works |  |
| Vehicles | Vehicle list and detail with search, filters, status change, odometer, bulk delete and export. | Admin, Sales manager, Operations | All plans | Works |  |
| Vehicle documents with expiry | Upload RC, insurance and permits with expiry dates; expiry tags show days left. | Admin, Operations | All plans | Works |  |
| Maintenance records | Log service work against a vehicle and see what is due. | Admin, Operations | All plans | Works |  |
| Drivers | Driver list and detail with licence-expiry badge, status, rating, schedule calendar and trip history. | Admin, Sales manager, Operations | All plans | Works |  |
| Driver documents with expiry | Upload licence and ID documents with expiry. | Admin, Operations | All plans | Works |  |
| Rate a driver | Rate a driver after a completed trip; blocked when there is no completed trip. | Admin, Operations | All plans | Works |  |
| Trip assignments | Create trips with vehicle and driver pickers, double-booking check, status lifecycle with timeline, bulk delete and export. | Admin, Operations | All plans | Works |  |
| Trip costs | Add fuel, toll and other costs to a trip and see a cost summary. | Admin, Operations | All plans | Partly works |  |
| Invoice or voucher from a trip | Generate an invoice or a transport voucher straight from a completed trip. | Admin, Operations | All plans | Partly works |  |
| Fleet rate cards | Per-vehicle-type rates (per km, per day, waiting) with validity dates; used to estimate trip cost. | Admin, Operations | All plans | Works |  |
| Distance and cost estimate | Estimate distance and cost for a trip from addresses. | Admin, Operations | All plans | Partly works |  |
| Fleet alerts screen | Expiring vehicle and driver documents and due maintenance, linking to the vehicle or driver. | Admin, Operations | All plans | Works |  |
| Scheduled fleet alerts | Background job that raises fleet alert notifications every five minutes. | Runs automatically | All plans | Works |  |
| Suggest a vehicle and driver for arrivals | For confirmed bookings travelling soon with no transfer, the Assistant picks a free vehicle that fits the group and a free driver and opens the trip form pre-filled. | Admin, Operations | All plans | Works |  |
| Driver sign-in by phone code | Driver enters a phone number and a one-time code sent by SMS. | Drivers only | All plans | Partly works | Give each agency its slug as the drivers' agency code; Twilio SMS for the login code (R115). |
| My trips and trip history | Driver sees assigned trips, opens details with pickup and drop, call and map shortcuts, and past trips. | Drivers only | All plans | Works |  |
| Accept or reject a trip | Driver accepts or rejects an assigned trip; later steps are blocked until accepted. | Drivers only | All plans | Works |  |
| Update trip status | Driver moves the trip through en route, started and completed; the office sees the timeline. | Drivers only | All plans | Works |  |
| Check in and check out with photo and location | Driver checks in at pickup and out at drop with GPS and an optional photo. | Drivers only | All plans | Partly works |  |
| Driver profile and documents | Driver edits their profile, photo and uploads documents with expiry. | Drivers only | All plans | Works |  |
| Driver app in English, Hindi and Arabic | App text can be switched between three languages. | Drivers only | All plans | Partly works |  |
| Driver push notifications | Phone alert when a trip is assigned. | Drivers only | All plans | Placeholder |  |
| Driver app installation | Download the app from a store or link. | Drivers only | All plans | Placeholder | Create the Android upload keystore outside the repo; Play Console app com.travelcrm.driver_app (internal track first); iOS signing on a Mac with an Apple Developer account (R115). |
| Driver app finds its agency by code **(new)** | The driver app asks for the agency code once (the agency slug), remembers it, and then signs the driver in by phone and code; one app build serves every agency. | Drivers only | All plans | Works |  |
| Driver app release build **(new)** | The Android release build signs with the owner's upload key when present and falls back to debug signing otherwise. | Drivers only | All plans | Partly works | Real Android upload keystore and android/key.properties on the build machine; Play Console internal track; iOS signing on a Mac with an Apple Developer account (R115). |

## Calls

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Call log | List of calls with direction filter, search, outcome, delete and CSV export. | Admin, Sales manager, Salesperson, Operations | Basic and up | Works |  |
| Call detail and outcome | Open a call and record the outcome; certain outcomes create a follow-up or close the lead. | Admin, Sales manager, Salesperson, Operations | Basic and up | Works |  |
| Place a call from the CRM | Dial pad and click-to-call buttons that start an outbound call. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works | Real sub-account token and a device ring; one real call per resell country; emergency-calling disclaimer in the terms (R307). |
| Inbound call routing and voicemail | Incoming calls follow business hours, a one-level keypad menu or the assigned agent, with voicemail when nobody answers. | Admin only | Basic and up | Partly works |  |
| Missed-call handling | A missed inbound call raises a notification, can create a lead for an unknown number, and creates a call-back task through the Assistant. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works |  |
| Call analytics | Totals, durations and top callers for a date range. | Admin, Sales manager | Basic and up | Works |  |
| Call recordings | Listen to a recording of a call from the call detail. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works | Owner decides the recording default and Call AI default; lawyer-approved consent wording per market (R306). |
| Call transcripts and search | Search the text of transcribed calls. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works | DEEPGRAM_API_KEY for premium; Workers AI binding; a 20-call transcription quality test (R306). |
| AI call summary and extracted leads (uses AI) | After a call, AI writes a summary and pulls out lead details and follow-ups for confirmation. | Admin, Sales manager, Salesperson, Operations | Pro and up | Partly works |  |
| VoIP settings | Admin enters provider (Twilio or Plivo) credentials, caller id, recording policy, hours and voicemail, with a connection test. | Admin only | Basic and up | Partly works |  |
| Phone numbers | Search, buy, set primary and release business numbers. | Admin only | Basic and up | Partly works | Platform Twilio credentials and written OK from Twilio for reselling; real monthly number prices replace the drafts; per-country regulatory bundles are submitted to Twilio by hand at first (R304). |
| Caller pop-up on incoming call | Show who is calling when a call arrives. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works |  |
| Click-to-call buttons | Phone buttons on contacts and leads open the dial page with the number filled in. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works |  |
| Answer and place calls in the app (softphone) **(new)** | Agents take calls inside the desktop app: a short-lived token from the agency's calling account, Answer and Decline on the screen pop, and an in-call panel with timer, mute, hold, a note, the lead link, a consent tick and a microphone check. | Admin, Sales manager, Salesperson, Operations | Basic and up | Partly works | Real sub-account token and device ring; microphone permission prompt in the packaged app and the browser; one real call per resell country; emergency-calling disclaimer in the terms (R307). |
| Calling offered only in resell countries **(new)** | Calling screens appear only for agencies in countries the platform resells calling in; the server enforces the same rule. India, the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh are not offered at launch. | Admin only | Basic and up | Works | Set VOIP_CALLING_COUNTRIES; set ENVIRONMENT=production or the * wildcard would be honoured; each agency needs its country set (R301). |
| Calling account per agency **(new)** | Each agency calling gets its own Twilio sub-account, suspended, resumed or closed with the agency; admins submit identity documents where a country needs them; calling is off during the trial by default. | Admin only | Basic and up | Partly works | Platform Twilio credentials with written OK for reselling; live check that sub-account webhook signatures verify; owner confirms trial calling off, the 14/7-day release grace and the document-required countries (GB, AU, SG, DE, MY; US not) (R304). |
| Call minutes metered and capped **(new)** | Call minutes are charged from the provider's usage records, once per call, against the plan's allowance and minute packs; at the cap new calls get a 402 (calls in progress are not cut and inbound still rings). | Admin only | Basic and up | Partly works | Owner confirms plan call-minute caps (all 0 today), per-minute costs and whether a spend spike only flags or also blocks; minute packs priced at cost x 1.2 or more from draft costs (R305). |
| Toll-fraud protection on outbound calls **(new)** | Before dialling, the server refuses premium and satellite prefixes, destinations outside the allow-list, more than 10 calls a minute or 3 at once per agent, and agencies over 600 outbound minutes a day; calls end after the time limit. Spend spikes email the operator. | Admin only | Basic and up | Works | Owner confirms fraud defaults (R305). |
| Recording consent and retention **(new)** | Per agency, recording either announces itself to the caller, is off, or is recorded only when the agent ticks that the caller consented; audio is deleted after the retention period (90 days by default) while the call record and summary stay. | Admin only | Basic and up | Works | Lawyer-approved consent wording per market; owner decides the recording default (R306). |

## Assistant and automations

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Suggestions queue | A list of ready-made next steps the assistant has prepared. Each shows what it will do and the person clicks Apply or Dismiss; suggestions also appear on the lead, contact or invoice itself. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Activity log with undo | Every automatic or applied step is recorded, and anything that supports it can be undone with one click. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Per-automation mode: off, suggest or automatic | Choose for each automation whether it is off, waits for a click, or runs by itself. Only an admin can switch one to automatic, and only low-risk steps that do not message a customer are allowed to. | Admin, Sales manager | All plans | Works |  |
| Pause all automations | One switch stops every automation for the workspace. | Admin only | All plans | Works |  |
| Build your own rules | Admin builds up to 50 rules: when something happens, if conditions hold, do these steps. Built from fixed lists so a rule can only do what the assistant is allowed to do; can be edited, switched off and deleted. | Admin only | All plans | Works |  |
| Safety rails | Duplicate suppression, loop limit (depth 3), failed automatic steps fall back to a suggestion, customers who opted out are never drafted a message. | Runs automatically | All plans | Works |  |
| Needs-attention box on the dashboard | Dashboard tile that lists the suggestions waiting for a person. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Suggestion count in the sidebar | The Assistant menu entry shows how many suggestions are waiting. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Read an incoming message on demand | Run the message reader again on any message to get fresh suggestions. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Daily scheduled automations | Time-based automations (quiet quotes, overdue invoices, expiring rate cards...) run once per workspace per local day from the background timer. | Runs automatically | All plans | Works |  |
| AI reads every incoming message (uses AI) | Classifies each inbound message (new enquiry, payment news, question) and proposes the right step: create lead, update lead, mark won, record payment or draft a reply. Falls back to plain rules when AI is off or out of credits. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Read every incoming message (uses AI) | The assistant reads each message from a customer and prepares the next step. Trigger: a message arrives. Does: create or update a lead, mark won, record a payment or draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |  |
| Draft the first reply to a new enquiry | Once an unknown sender becomes a contact and lead, offers the drafted acknowledgement. Trigger: a lead is created. Does: draft a reply for a person to send. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Schedule the first follow-up on every new lead | Adds a follow-up a set number of hours after a lead is created. Trigger: a lead is created. Does: create a follow-up about 24 hours later. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Suggest the best-matching itinerary template | Compares a new lead with your templates and offers to build the itinerary from the closest one. Trigger: a lead is created. Does: create an itinerary from a template. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Move the lead to Proposal Sent when the quote goes out | When a message with the itinerary link is sent, the lead moves forward. Trigger: a message or quote is sent. Does: set status to Proposal Sent. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Follow up after sending a quote | Schedules a follow-up a few days after the quote is sent. Trigger: a message or quote is sent. Does: create a follow-up about 2 days later. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Offer the invoice when a booking is confirmed | When a lead is won and has an itinerary but no invoice, offers to create the invoice. Trigger: a lead changes status to won. Does: create an invoice from the itinerary. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |  |
| Create the booking checklist when a lead is won | Adds the standard tasks for a confirmed booking: vouchers, traveller documents, transfers and balance payment. Trigger: a lead changes status to won. Does: create four tasks. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Match a payment the customer already told you about | When an invoice is created and the customer recently wrote that they paid, offers to record it. Trigger: an invoice is created. Does: record a payment. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |  |
| Draft hotel vouchers once the advance is in | Drafts one voucher per hotel stay in the itinerary after a payment. Trigger: a payment is recorded. Does: create vouchers. Default: asks first (suggest). | Admin, Sales manager, Operations | All plans | Partly works |  |
| Offer to mark the lead won when the advance arrives | A payment on an open lead is a strong sign the booking is confirmed. Trigger: a payment is recorded. Does: mark the lead won. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Nudge customers who have gone quiet on a quote | For leads in Proposal Sent with no messages for some days, drafts a polite check-in. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |  |
| Draft a reminder for overdue invoices | Drafts a payment reminder for each invoice past its due date with a balance. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |  |
| Create a call-back task for every missed call | A missed call becomes a high-priority task for the person the call was routed to. Trigger: a call is missed. Does: create a high-priority task due today. Default: automatic. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Offer a lead when an unknown number calls and nobody answers | A missed call from an unknown number becomes a one-click suggestion to create the contact and lead. Trigger: a call is missed. Does: create a lead from the enquiry. Default: asks first (suggest). | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Ask for feedback when a trip is completed | Drafts a thank-you and feedback request for the passenger when the driver completes the trip. Trigger: a trip is completed. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Mark a new lead Contacted when you first reply | The first message sent on a new lead moves it from New to Contacted. Trigger: a message is sent. Does: set status to Contacted. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Flag customer messages left without a reply | A message nobody answered within the set time becomes a high-priority task for the lead owner. Trigger: daily timer. Does: create a high-priority task. Default: automatic. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Remind the customer before a quote expires | For quotes close to their validity date with the lead still open, drafts a reminder. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Partly works |  |
| Draft a thank-you when a payment is recorded | Drafts a message confirming the amount received and the balance due. Trigger: a payment is recorded. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Works |  |
| Chase the balance before departure | For bookings travelling soon with a balance outstanding, drafts a payment reminder. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Accountant | All plans | Partly works |  |
| Ask for traveller details when a booking is confirmed | Drafts a message asking for full names as on ID and the documents needed. Trigger: a lead changes status to won. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |  |
| Ask for a review after the trip | In the days after a booked trip ends, drafts a welcome-back message asking for a review. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |  |
| Win back customers who have not travelled for a while | Drafts a check-in for past customers whose last trip was long ago and who have no enquiry open. Trigger: daily timer. Does: draft a reply. Default: asks first (suggest). | Admin, Sales manager, Salesperson | All plans | Works |  |
| Create a renewal task before a rate card expires | Rate cards that stop being valid soon become a task. Trigger: daily timer. Does: create a task. Default: automatic. | Admin, Sales manager, Operations | All plans | Works |  |
| Line up a vehicle and driver for arrivals | For confirmed bookings travelling soon with no transfer, picks a free vehicle and driver and opens the trip form filled in. Trigger: a lead is won, or daily timer. Does: open a pre-filled trip form. Default: asks first (suggest). | Admin, Sales manager, Operations | All plans | Works |  |
| Drafted replies open in the send dialog (uses AI) | A drafted reply is never sent by itself: it opens in the send dialog so a person reviews and sends it. AI drafting there falls back cleanly when AI is off. | Admin, Sales manager, Salesperson | All plans | Works |  |
| AI credits and usage | Plans include monthly AI credits (read 1, understand 5, scan 15, create 60); a Usage tab shows what was used. Out of credits, the assistant falls back to plain rules. | Admin, Sales manager | All plans | Works | Owner to confirm the AI credit allowances per plan (trial 2,000 / Basic 1,000 / Pro 15,000 / Enterprise 25,000) and the 5,000-credit pack price (R109). |
| Create a lead from pasted text (uses AI) | Paste a WhatsApp chat, email or note and get a lead filled in; also bulk-parse several enquiries and scan a business card. | Admin, Sales manager, Salesperson | Pro and up | Partly works |  |
| AI itinerary generator (uses AI) | Describe the trip and get a day-by-day plan that can be saved as a real itinerary; can also enrich an existing one. | Admin, Sales manager, Salesperson, Operations | Pro and up | Partly works |  |
| AI message composer (uses AI) | Draft an email, SMS or WhatsApp message, then send it only through the Communication Hub. | Admin, Sales manager, Salesperson | Pro and up | Partly works |  |
| Suggested replies (uses AI) | Offers short reply options to a customer message. | Admin, Sales manager, Salesperson | Pro and up | Partly works |  |
| AI invoice draft (uses AI) | Draft an invoice from a description. | Admin, Sales manager, Accountant | Pro and up | Partly works |  |
| Ask your data in plain English (uses AI) | Type a question about the CRM and get an answer drawn from your records. | Admin, Sales manager | Enterprise | Partly works |  |
| AI insights and recommendations (uses AI) | Trend detection, customer insights and recommended actions with dismiss or act. | Admin, Sales manager | Enterprise | Partly works |  |
| Lead scoring (uses AI) | A 0 to 100 score for each lead with the reasons, history and recalculate. | Admin, Sales manager, Salesperson | Enterprise | Partly works |  |
| Scan passports, visas and supplier invoices (uses AI) | Upload a document image and have AI read the fields, then review and apply them to the traveller or supplier. | Admin, Sales manager, Salesperson, Operations | Enterprise | Partly works |  |
| Smart follow-up suggestions (uses AI) | AI suggests the best time, channel and wording to chase a lead; send or dismiss. | Admin, Sales manager, Salesperson | Enterprise | Partly works |  |
| Business briefings (uses AI) | Daily, weekly and monthly written briefings about the business. | Admin, Sales manager | Pro and up | Partly works |  |
| Business health score (uses AI) | A score with category breakdown and trend. | Admin, Sales manager | Pro and up | Partly works |  |
| Destination profitability and demand (uses AI) | Profitability by destination, trending destinations and seasonal demand. | Admin, Sales manager | Pro and up | Partly works |  |
| Team performance and workload (uses AI) | Per-person results, workload balance and lead-source return. | Admin, Sales manager | Pro and up | Partly works |  |
| Customer segments and lifetime value (uses AI) | Recalculate customer segments and look up a customer lifetime value. | Admin, Sales manager | Pro and up | Partly works |  |
| Cash-flow forecast and revenue pulse (uses AI) | Projected cash flow and revenue for the coming period. | Admin, Sales manager | Pro and up | Partly works |  |
| AI feature switches and provider status | Admin turns individual AI features on or off within the plan and sees which provider is active. | Admin only | Pro and up | Partly works |  |
| AI usage page | See AI requests and spend per feature. | Admin only | Pro and up | Works |  |
| Chatbot conversations (uses AI) | See chatbot conversations, read the transcript, reply, hand off to a person, close and create a lead. | Admin, Sales manager, Salesperson | Enterprise | Works | Per-agency widget snippet and allowed website origins; tenant migration 0043 on every agency database (R107). |
| Website chat widget and WhatsApp bot (uses AI) | A script tag for the website and a WhatsApp number that the bot answers. | Admin only | Enterprise | Partly works | Twilio WhatsApp sender registered per agency; /api/v1/webhooks/chatbot/whatsapp set in the Twilio console (R107). |
| Chatbot settings and analytics | Configure the bot per channel and see conversation analytics. | Admin only | Enterprise | Works |  |
| Draft a sorry-we-missed-your-call message **(new)** | After a missed call from a known contact, drafts a short WhatsApp or SMS for the person to send; skipped for opted-out contacts and held during the customer's quiet hours. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Create a task to listen to every voicemail **(new)** | A voicemail becomes a task for the person the call was routed to and replaces the call-back task for the same call. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| Put every finished call on the contact and lead timeline **(new)** | One entry with direction, duration, agent and note on the contact and on the lead; a recording gets a Play button. | Everyone | All plans | Works |  |
| Mark a new lead Contacted after a real conversation **(new)** | A lead still marked New moves to Contacted after a connected call of at least 30 seconds (adjustable); undo is one click. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Suggest a follow-up after a connected call **(new)** | After a call that connected, suggests a follow-up call tomorrow at 10:00 on the open lead. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Offer a contact and lead after a call with an unknown number **(new)** | After a connected call with a number not in the contacts, suggests creating the contact and a lead with the number filled in. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Suggest trying again when an outbound call is not answered **(new)** | Suggests a task to try again later today; one suggestion per lead per day. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Turn a summarised call into suggested next steps (uses AI) **(new)** | When the call AI has summarised a call, suggests updating the lead with what was said, tasks for the action items and a drafted message; nothing changes until a person clicks. | Admin, Sales manager, Salesperson | Pro and up | Partly works | Workers AI binding; a 20-call quality test (R306). |

## Marketing

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Marketing dashboard | Hub with campaign counts, shortcuts to campaigns, segments, flyers and festivals. | Admin, Sales manager | All plans | Works |  |
| Campaigns | Create a campaign with channel, template and audience; list with filters, detail with recipients and stats, edit, schedule, cancel, delete and export. | Admin, Sales manager | All plans | Works |  |
| Send a campaign now | Queue a campaign to its audience by email, SMS or WhatsApp. | Admin, Sales manager | All plans | Partly works |  |
| Schedule a campaign for later | Pick a date and time; the campaign is sent when due. | Admin, Sales manager | All plans | Partly works |  |
| Earlier campaigns screens (/campaigns) | An older campaign list and wizard that still exists next to the newer marketing campaigns. | Admin, Sales manager | All plans | Partly works |  |
| Audience segments | Save rules that pick contacts (for example by city or tag), preview matching contacts and refresh the count. | Admin, Sales manager | All plans | Works |  |
| Flyers | Make a promotional flyer from a template, edit it, upload the artwork and share it to a segment. | Admin, Sales manager | All plans | Works |  |
| Flyer templates | Template library with assets for flyers. | Admin, Sales manager | All plans | Partly works |  |
| Brand colours, font and logo | Save the agency brand used on flyers and documents. | Admin, Sales manager | All plans | Works |  |
| Festival offers | Create a seasonal offer, activate or deactivate it. | Admin, Sales manager | All plans | Partly works |  |
| Opted-out contacts | List of customers who asked not to be messaged; re-subscribe them; they are excluded from drafts and sends. | Admin, Sales manager | All plans | Works |  |
| Social post generator (uses AI) | AI writes social posts for a platform, batch-generates a set, and saves them for editing. | Admin, Sales manager | All plans | Partly works |  |
| AI marketing suggestions (uses AI) | AI proposes campaign ideas that can be accepted or dismissed. | Admin, Sales manager | All plans | Partly works |  |
| WhatsApp campaigns | Create, send, pause and cancel WhatsApp broadcast campaigns with recipients and analytics. | Admin, Sales manager | Enterprise | Partly works | See Meta WhatsApp: Business verification, approved templates named like the CRM templates (R213). |
| Ask for a review after the trip | Assistant drafts a review request after a trip ends. | Admin, Sales manager | All plans | Works |  |

## Documents

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Document library | Upload files with a category and a link to a lead or itinerary; search, filter, rename, download, delete and export. | Everyone | All plans | Works |  |
| Upload from a lead | Opening Documents from a lead pre-fills the lead. | Admin, Sales manager, Salesperson, Operations | All plans | Works |  |
| File storage | Uploaded files are kept in cloud storage with size limits. | Runs automatically | All plans | Works |  |

## Reports and dashboard

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Dashboard | Landing page with live KPI tiles linking to their source pages, date range selector, Quick Add menu and the needs-attention box. | Everyone | All plans | Works |  |
| Quick Add menu | Create a lead, contact, invoice or other record from anywhere. | Admin, Sales manager, Salesperson | All plans | Works |  |
| Command palette and search | Press the shortcut to jump to any screen or create something new by typing. | Everyone | All plans | Works |  |
| Keyboard shortcuts | Press N to create a new item for the current section and other shortcuts listed in Help. | Everyone | All plans | Partly works |  |
| Reports hub | Nine report categories (sales, leads, financial, team, customer, visa, supplier, fleet, marketing) with search, favourites and recently viewed. | Admin, Sales manager, Accountant, View only | All plans | Works |  |
| About 50 built-in reports | Revenue summary, collections, ageing, P&L by lead, pipeline, lead velocity, win/loss, sales by destination or salesperson, forecast, supplier usage, visa success rate, fleet utilisation and more. | Admin, Sales manager, Accountant, View only | All plans | Works |  |
| Date range and compare | Change the period and compare with the previous one. | Admin, Sales manager, Accountant, View only | All plans | Works |  |
| Export a report to Excel or PDF | Download any report as a spreadsheet; financial reports also as PDF. | Admin, Sales manager, Accountant | All plans | Works |  |
| Outstanding and ageing receivables | What customers owe, bucketed by age. | Admin, Accountant | All plans | Works |  |
| Report caching | Reports are cached briefly and can be refreshed. | Runs automatically | All plans | Works |  |

## Import and export

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Import wizard | Choose what to import (contacts, leads, suppliers, rate cards, travellers), upload, map columns, preview, handle duplicates and run. | Admin only | All plans | Works |  |
| Download an import template | Get an Excel template for each import type. | Admin only | All plans | Works |  |
| Skip or update duplicates on import | Re-importing the same file can skip existing records or update them. | Admin only | All plans | Works |  |
| Import history and error report | List past imports with status, download the error file, cancel a pending one. | Admin only | All plans | Works |  |
| Export any list to CSV | Almost every list screen has an Export button that downloads a CSV of what is shown. | Everyone | All plans | Works |  |
| Export contacts and leads to Excel | Choose CSV or Excel for contacts and leads. | Admin, Sales manager | All plans | Works |  |
| Full data export | Download a zip of the main tables (contacts, leads, invoices and more) prepared by a background job. | Admin only | All plans | Partly works |  |

## Settings and team

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Sign in with email and password | Two-step sign in: email resolves the workspace, then password. Sessions refresh automatically. | Everyone | All plans | Partly works |  |
| Sign in with a phone code | Alternative login with an SMS code. | Everyone | All plans | Partly works | Owner to confirm the OTP abuse limits and the login-code allowance per plan (R110). |
| Forgot and reset password | Email link to reset a password. | Everyone | All plans | Partly works | SENDGRID_API_KEY, EMAIL_FROM, APP_URL and domain authentication (R102). |
| Active sessions and login history | See devices signed in, sign one out, see recent logins. | Everyone | All plans | Works |  |
| Team members | Admin invites people, edits roles, deactivates, reactivates and unlocks accounts. | Admin only | All plans | Works |  |
| Invite email and first-time setup | The invited person receives a link to set a password. | Admin only | All plans | Partly works | SendGrid domain authentication (SPF/DKIM) and a real inbox check (R102). |
| Six roles with fixed permissions | Admin, sales manager, salesperson, operations, accountant and view-only, each with set rights per area. No custom roles. | Admin only | All plans | Works |  |
| Seat limit per plan | Block invites past the plan user limit. | Admin only | All plans | Works | Owner to confirm included users (Basic 5 / Pro 15 / Enterprise 100) and extra-user prices. |
| Settings hub | One page linking every configuration area. | Admin only | All plans | Works |  |
| Company profile and logo | Agency name, address, tax ids, regional settings and logo. | Admin only | All plans | Works |  |
| My profile | Edit your own details and photo. | Everyone | All plans | Works |  |
| Change password while signed in | Change your password from your profile. | Everyone | All plans | Works |  |
| Custom fields | Admin defines extra contact fields. | Admin only | All plans | Works |  |
| Activity log (audit trail) | Admin sees who changed what. | Admin only | All plans | Partly works |  |
| Document numbering | Prefixes, financial-year start and format for invoices, vouchers and so on. | Admin only | All plans | Works |  |
| Integrations page | Connect channels and keys: website-form API keys, receiving addresses, the agency's own Razorpay or Stripe, and WhatsApp through Twilio or the agency's Meta number. | Admin only | All plans | Works |  |
| Interface language | Switch the desktop interface language. | Everyone | All plans | Partly works | Native review of the Hindi draft; Arabic and right-to-left layout are R211 (not started). |
| Onboarding wizard | First-run wizard for company, regional settings and branding. | Admin only | All plans | Works |  |
| Help centre | Searchable FAQ and shortcut list inside the app. | Everyone | All plans | Works |  |
| Desktop application | Install the product as an Electron app on Windows, Mac or Linux. | Everyone | All plans | Partly works | Windows code-signing certificate (CSC_LINK, CSC_KEY_PASSWORD); TRAVELCRM_UPDATE_URL host; macOS and Linux builds need their own runners (R114). |
| Two-factor sign-in **(new)** | Each user can turn on a code from an authenticator app (QR set-up) with single-use recovery codes; sign-in asks for the code as a second step. | Everyone | All plans | Works | Optional per agency: Settings > Security > require two-factor. Follow-ups: super admin 2FA; the KV attempt counter is soft (rate limits back it). |
| Require two-factor for the whole agency **(new)** | An admin can require every user to use two-factor and can reset one user's two-factor if they lose their device. | Admin only | All plans | Works |  |
| 12-character password rule **(new)** | New passwords on change, reset and invite must be at least 12 characters. | Everyone | All plans | Works | Change Admin@123-style seed passwords before go-live (R209). |
| Connect the agency's own WhatsApp number (Meta) **(new)** | In Settings > Integrations an admin chooses Twilio or Meta for WhatsApp and connects the agency's Meta Business number with a test button. | Admin only | All plans | Partly works | Meta Business verification, WABA and registered number, system-user token, app secret and verify token (R213). |
| Agency app in the browser **(new)** | The agency app also runs on the web, with the public pages emails link to: quotation link, invitation set-up, password reset, quick start and download. | Everyone | All plans | Partly works | Deploy to app.<domain> with the deploy-web workflow; set APP_URL (R125). |

## Super admin console

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Super admin sign-in | Platform owner signs in with email and password; five failures per address lock it out for 15 minutes. | Platform owner only | All plans | Partly works | SUPER_ADMIN_JWT_SECRET (32+ chars, different from JWT_SECRET); create the first super admin with backend/scripts/create-super-admin.mjs (R111). |
| Platform dashboard | Tenant counts, revenue, growth charts, top tenants and recent activity from live queries. | Platform owner only | All plans | Works |  |
| Agencies list and detail | Search, filter and open each agency; see plan, status, usage and users. | Platform owner only | All plans | Works |  |
| Create a new agency | Five-step wizard that creates the agency record, its admin entry, a subscription and (with Cloudflare keys) a database. | Platform owner only | All plans | Partly works | Verify on a real Cloudflare account that D1 create, query and delete work and whether the Workers settings PATCH adds a binding without a redeploy (R104). |
| Suspend, reactivate and delete an agency | Block or restore an agency; delete is a soft flag. | Platform owner only | All plans | Works |  |
| Change an agency plan | Move an agency to another plan. | Platform owner only | All plans | Works |  |
| Per-agency feature switches and usage caps | Turn individual features on or off for one agency and set usage caps. | Platform owner only | All plans | Works |  |
| Subscriptions and manual payments | List subscriptions, record a payment received and cancel. | Platform owner only | All plans | Partly works |  |
| Online billing for agencies | Agencies pay for their plan by card or UPI and renew automatically. | Platform owner only | All plans | Partly works | STRIPE_* and RAZORPAY_* secrets, webhooks at /api/v1/billing/webhooks/stripe and /razorpay, never BILLING_GATEWAY=mock or TEST_MODE in staging or production (R205). |
| Announcements to agencies | Create platform announcements. | Platform owner only | All plans | Placeholder | Owner question Q8: build the agency-side reader, or keep hidden for v1. |
| Support tickets | View and reply to support tickets. | Platform owner only | All plans | Placeholder | Owner question Q8: build ticket filing in the agency app, or keep hidden for v1. |
| Platform audit log | See changes made by the platform owner. | Platform owner only | All plans | Works |  |
| System health | Pings of the platform services. | Platform owner only | All plans | Works | HEALTH_TOKEN secret and an uptime monitor on /api/v1/health/deep (R117). |
| Platform reports | Feature usage, geographic distribution and platform summary. | Platform owner only | All plans | Partly works |  |
| SEO page | SEO tools page. | Platform owner only | All plans | Placeholder | Owner question Q8. |
| Sign in as an agency to help them | Support staff start a time-boxed support session with a stated reason; the agency app shows a banner and every request is logged in the agency's activity log. | Platform owner only | All plans | Works |  |
| Edit plans, prices and packs **(new)** | The platform owner edits plans, yearly prices per market, allowances, provider unit costs and add-on products, and can grant an add-on to one agency. | Platform owner only | All plans | Works | Owner fills real values (see Plan catalogue). |
| Calling tab for each agency **(new)** | On the agency page the operator turns calling on, sees the sub-account, suspends, resumes or closes it, reviews identity documents, releases numbers, sets country and limit overrides, and edits the country policy and platform limits. | Platform owner only | All plans | Partly works | Platform Twilio credentials (R304). |
| Calling safety flags **(new)** | Fraud and spend-spike flags appear on the console dashboard and by email; the operator can lift or dismiss each one. | Platform owner only | All plans | Works |  |
| Billing state on the agency page **(new)** | The agency page shows the billing gateway, period end, past-due state and extra users, and the operator can grant an add-on. | Platform owner only | All plans | Works |  |
| Landing enquiries inbox for the operator **(new)** | Demo, sign-up and contact enquiries from the landing page are stored and listed for the operator, who can mark one converted. | Platform owner only | All plans | Works |  |
| One-off maintenance endpoints **(new)** | After a key change the operator runs re-encryption of stored provider credentials and API-key hashing, page by page. | Platform owner only | All plans | Works | Run both until nextCursor is null after the first deploy (R108). |

## Landing page

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Marketing page | Single static page with hero, pipeline and proposal showcases, call/message section, AI section, pricing, reviews, FAQ and footer. | Runs automatically | All plans | Works |  |
| Pricing section | Three plans shown per user per month (USD 12 / 29 / 49). | Runs automatically | All plans | Partly works | Owner confirms prices; add price rows for every market before agencies there can pay (409 PRICE_NOT_CONFIGURED otherwise); real domain. |
| Start free trial buttons | Call-to-action buttons to start a trial. | Runs automatically | All plans | Partly works | Fill landing/config.js (apiBase, siteUrl, contactEmail, whatsappNumber, demoVideoUrl, appDownloadUrl, turnstileSiteKey) and add the landing origin to CORS_ORIGINS (R116). |
| Privacy, Terms and legal pages | Footer links to legal pages. | Runs automatically | All plans | Partly works | Lawyer review of privacy policy, terms, DPA, erasure scope and consent wording (R116, R208). |
| Customer reviews section | Reviews from agencies. | Runs automatically | All plans | Partly works |  |
| Contact email | Contact link to hello@travelcrm.pro. | Runs automatically | All plans | Works |  |
| Landing page hosting | Publishing the page at a public address. | Runs automatically | All plans | Partly works | Decide the domain; publish landing/public at the site root; replace the canonical, og, sitemap and robots placeholders (R116, R118). |

## Agency websites (WordPress)

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Site host service | A small server that creates, stops, starts, destroys and checks one WordPress plus database pair per agency behind a reverse proxy. | Runs automatically | All plans | Partly works | On the Oracle VM: PROVISIONER_SECRET (24+ chars), docker compose plugin, wp-network network, outbound internet and mail; no path-rewriting proxy in front; one real site end to end (R309). |
| WordPress hosting server | One Oracle Cloud ARM virtual machine with Docker and Caddy. | Runs automatically | All plans | Partly works | Owner decision Q9 (shared vs container-per-agency sizing); then R310. |
| Websites page in the console | Platform owner lists sites and asks for one to be provisioned. | Platform owner only | All plans | Works |  |
| One-click site creation | Creating the row builds the live site and emails the login. | Platform owner only | All plans | Partly works | Worker secrets OCI_PROVISIONER_URL, PROVISIONER_SECRET, WP_SITES_DOMAIN (add to push-secrets.sh); one real site end to end (R309). |
| Travel site template | A ready travel theme and demo content for each new site. | Platform owner only | All plans | Partly works |  |

## Platform services

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Separate database per agency | Each agency's data lives in its own database; the server fails closed if an agency has none. | Runs automatically | All plans | Works | ENVIRONMENT=production so the single-tenant fallback is refused; each agency needs a bound database (see Tenant provisioning). |
| Production deployment | Deploy the server to Cloudflare. | Runs automatically | All plans | Partly works | GitHub secrets and vars per workflow, Workers travelcrm-api and travelcrm-super-admin created before the first terraform apply, terraform state backend by hand, CORS_ORIGINS (R118, R125). |
| Browser access (CORS) | Allow the web apps to call the server. | Runs automatically | All plans | Works | CORS_ORIGINS set to the exact web origins; ALLOW_LOOPBACK_ORIGINS=true for the desktop app (R106). |
| Server API (about 60 route groups) | Versioned REST API under /api/v1 and /api with consistent responses, validation on most routes and role checks per area. | Runs automatically | All plans | Partly works |  |
| Role permission checks | Every route checks the six-role matrix; the desktop reads it to hide what a role cannot do. | Runs automatically | All plans | Partly works |  |
| Background queues | Email, SMS, push, import, export, campaign and site-provision queues. | Runs automatically | All plans | Partly works |  |
| Scheduled jobs | A five-minute timer runs reminders, alerts, campaign scheduler, overdue tasks, assistant schedule and cap resets. | Runs automatically | All plans | Works | TENANT_JOBS_QUEUE bound in the generated Worker config (jobs run inline when unbound). |
| Monitoring and logging | Error tracking and metrics. | Runs automatically | All plans | Partly works | ERROR_REPORTER_DSN and HEALTH_TOKEN secrets; uptime monitor on /api/v1/health/deep; 5xx alert (R117). |
| Test-mode routes | Routes for seeding and simulating inbound messages in tests. | Runs automatically | All plans | Partly works |  |
| Privacy and data-protection tools | Consent records, erasure, two-factor sign-in and data residency choice. | Runs automatically | All plans | Partly works | Lawyer review of privacy policy, DPA and erasure scope; data-residency (R212) is not started. |
| Selling outside India | Tax types, currencies, languages and phone formats for other countries. | Runs automatically | All plans | Partly works | Owner to confirm default VAT rates (GB 20, AE 5, SA 15, DE 19) and mandatory invoice fields per country (R201). |
| Tenant database provisioning on Cloudflare **(new)** | Creating an agency creates its own D1 database, applies the tenant migrations, seeds the admin and registers the binding; failures roll back and can be retried. | Platform owner only | All plans | Partly works | Verify on a real Cloudflare account that D1 create (location hint or jurisdiction), query and delete work and whether the Workers settings PATCH adds a binding without a redeploy (R104). Never run from an agent. |
| Provider secrets encrypted at rest **(new)** | Provider credentials an agency enters are sealed with AES-256-GCM using versioned keys; API keys are hashed. | Runs automatically | All plans | Works | Worker secret CREDENTIALS_KEYS={"k1":"<base64 32 bytes>"} and var CREDENTIALS_ACTIVE_KEY_ID=k1; keep a copy in the owner's password manager, because losing it makes stored credentials unrecoverable (R108). |
| Request rate limits **(new)** | Per-user API limit (600 a minute), upload limit, login, code and password-reset limits. | Runs automatically | All plans | Works | Bindings API_RATE_LIMITER (1001, 600/60 s) and UPLOAD_RATE_LIMITER (1002, 20/60 s) in wrangler.base.toml; Cloudflare WAF rate-limit rules at the edge (R106, R117). |
| Agency database backups **(new)** | A script exports every agency database to storage with a verify mode that restores a copy and compares it; a weekly workflow runs it. | Runs automatically | All plans | Partly works | R2 bucket travelcrm-backups with a lifecycle rule; CLOUDFLARE_API_TOKEN (D1 read, R2 write) in CI; Time Travel restore rehearsal on staging; 5xx alert (R117). |
| Phone numbers follow the agency's country **(new)** | Numbers are stored in international format by the agency's country from one 226-country table; the desktop and driver app pickers list every country and default to the agency's; call routing matches on the national number. | Runs automatically | All plans | Works |  |
| Agency locale, currency and time zone (backend) **(new)** | The server formats money and dates from the agency's locale, currency and time zone, a user can have their own language and time zone, and exchange rates are stored; new agencies start with their country's values. | Runs automatically | All plans | Partly works | R203 desktop sweep in progress. |
| Hand-over rehearsal for three agencies **(new)** | One automated scenario creates three agencies (India Basic INR GST, UK Pro GBP VAT, UAE Enterprise AED VAT) and runs the operator and client steps end to end; docs/HANDOFF-PLAYBOOK.md is the operator checklist. | Platform owner only | All plans | Works | The manual staging checks listed in docs/HANDOFF-PLAYBOOK.md. |

## Billing and plans

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| One plan catalogue **(new)** | Plans (trial, basic, pro, enterprise), yearly prices per market, included users, monthly allowances, provider unit costs and add-on products live in one place the platform owner edits without a code change. | Platform owner only | All plans | Works | Owner confirms: extra user per year (Basic 2,400 / Pro 1,800 / Enterprise 1,200 INR), AI credits per month (trial 2,000 / Basic 1,000 / Pro 15,000 / Enterprise 25,000), caps for SMS, WhatsApp, login codes and email, pack sizes and prices, provider unit costs, 20% margin (card fees leave about 18%), trial of 14 days with 3 users and no calling; no international market prices are seeded (R109). |
| Subscribe, upgrade and cancel online **(new)** | An agency admin pays for a plan, upgrades or adds users, and cancels from Settings > Billing; the price follows the agency's own market and currency. | Admin only | All plans | Partly works | Secrets STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET; vars PLATFORM_TAX_COUNTRY/STATE/ID, PLATFORM_GST_RATE (18), PLATFORM_VAT_COUNTRIES/RATE, BILLING_GRACE_DAYS (7); webhooks at /api/v1/billing/webhooks/stripe and /razorpay; non-India markets need price rows (409 PRICE_NOT_CONFIGURED otherwise) (R205). |
| Grace period, then read-only **(new)** | When a payment fails or a plan lapses the agency keeps a grace period; after it the agency becomes read-only (writes answer 402, nothing is deleted) until it pays. | Runs automatically | All plans | Works | BILLING_GRACE_DAYS (default 7) confirmed by the owner (R205). |
| Subscription invoices to agencies **(new)** | Each paid subscription creates a numbered platform invoice (PINV-YYYY-n) with the platform's own tax applied, downloadable in Settings > Billing. | Admin only | All plans | Works | PLATFORM_TAX_* variables; accountant review of the invoice fields. |
| Buy more: extra users and add-on packs **(new)** | From Settings > Billing, usage rows or the limit dialog an admin buys extra users (pro rata to the paid year) or packs of AI credits, SMS, WhatsApp, login codes or email; packs are priced at provider cost plus margin with a hard floor of cost x 1.2 and apply to the month paid. | Admin only | All plans | Partly works | Razorpay events payment_link.paid, payment_link.expired, payment.failed; Stripe events checkout.session.completed, async_payment_succeeded, async_payment_failed, expired; test-mode purchase of every pack. Card fees (about 2%) bring the 20% margin to about 18%: owner decides margin_pct (R206). |
| Monthly caps on SMS, WhatsApp, login codes and email **(new)** | Each plan includes a monthly amount of messages and login codes; sending is metered once per recipient and at the cap the agency is told to upgrade or buy a pack. | Runs automatically | All plans | Works | Owner confirms monthly caps (SMS 0/10/15/20, WhatsApp 50/250/400/600, login codes 5/9/12/14, email 100/500/2,000/8,000 for trial/Basic/Pro/Enterprise), pack prices and unit costs (SMS 8.06, WhatsApp 0.595, login code 12.90 INR) (R109, R110). |

## Privacy and consent

| Feature | What it does | Who can use it | Plan | Status | Owner or go-live item |
|---|---|---|---|---|---|
| Consent records for marketing **(new)** | Each contact has an append-only history of who agreed or withdrew marketing on which channel, from where and when; every marketing send checks it. | Admin, Sales manager, Salesperson | All plans | Works | Lawyer review of consent wording (R208). |
| Export everything about one contact **(new)** | An admin downloads all data held about one person, as a file behind a signed 15-minute link. | Admin only | All plans | Works | Bulk import and export files in storage are not rewritten (R208 follow-up). |
| Erase a contact **(new)** | An admin erases a person after typing a confirmation: personal data is hard-deleted or anonymised, stored files are deleted, and invoices are kept without the personal details. | Admin only | All plans | Works | Invoice free-text rewrite is case-sensitive; lawyer review of erasure scope (R208). |
| Cookie notice on the landing page **(new)** | A dismissible notice links visitors to the privacy policy. | Runs automatically | All plans | Partly works | Lawyer review of the cookie text. |

## Plan comparison

Plans now come from one catalogue in the platform database (trial, basic, pro, enterprise); the old starter and free plans were migrated to basic and trial. The landing page reads the same catalogue. Owner-decided numbers are the India yearly prices (INR 12,000 / 18,000 / 24,000) and included users (5 / 15 / 100); everything else listed here is a draft the owner has to confirm (see the go-live column of Plan catalogue). Pricing is a flat yearly price per agency plus paid extra users and add-on packs, not per user.

Only these groups are blocked by plan in the server code today; everything else in the plan lists is open to every plan even where the catalogue names it.

| Feature group | Trial | Basic | Pro | Enterprise | Enforced? |
|---|:-:|:-:|:-:|:-:|---|
| Core CRM (contacts, leads, itineraries, invoices, payments, vouchers, tasks, reports, import and export, fleet, visa, suppliers, flyers, bulk email and SMS) | Yes | Yes | Yes | Yes | Not gated (listed in the catalogue, not enforced) |
| Bulk WhatsApp, advanced reports | Trial: WhatsApp only | No | Yes | Yes | Listed, not enforced |
| Calls and VoIP settings (also needs the agency's country in the resell list, and calling switched on for trial agencies) | No | Yes | Yes | Yes | Enforced |
| Assistant AI routes (/ai/*), call transcription and summaries, call extractions | Yes | No | Yes | Yes | Enforced (ai_assistant, ai_extraction) |
| AI intelligence: ask your data, insights, lead scoring, document OCR, smart follow-ups | No | No | No | Yes | Enforced |
| Chatbot | No | No | No | Yes | Enforced |
| WhatsApp campaigns | No | No | No | Yes | Enforced |
| The AI feature switches (copilot, call summary, lead scoring, compose, itinerary, cost estimate, OCR, search and the Enterprise set), API access, custom domain, white label, priority support | Pro set | No | Pro set | All | Switches or listed only, not checked by routes |
| Monthly AI credits | 2,000 | 1,000 | 15,000 | 25,000 | Enforced; add-on packs extend it |
| Monthly caps: SMS / WhatsApp / login codes / email | 0 / 50 / 5 / 100 | 10 / 250 / 9 / 500 | 15 / 400 / 12 / 2,000 | 20 / 600 / 14 / 8,000 | Enforced; packs extend it |
| Call minutes per month | 0 | 0 | 0 | 0 | Enforced; all plans are 0 until the owner sets caps, minute packs extend it |
| Included users | 3 | 5 | 15 | 100 | Enforced (extra users are an add-on) |

## Owner decisions still pending

From docs/launch/STATE.json (not re-derived from code): repository is not private yet and the push is held (R100); the domain is undecided (one placeholder per toolchain); plan allowances, pack prices, provider unit costs, margin and international market prices are drafts (R109, R110); tax defaults and invoice wording per country (R201); call-minute caps, per-minute costs, fraud defaults and spike block-or-flag (R305); recording and Call AI defaults and consent wording (R306); lawyer review of privacy policy, terms, DPA and erasure scope (R208, R116); Hindi translation review (R210); WordPress hosting model, question Q9 (R309, R310); a real Windows signing certificate, Android keystore and Apple developer account (R114, R115).

## Not finished yet

139 features are not fully working: 0 broken, 5 placeholders, 134 partly working. Broken first, then placeholders, then partial. The last column is what the owner or go-live needs, taken from the batch notes.

### Broken (0)

None.

### Placeholders (5)

| Area | Feature | Why | Needed at go-live |
|---|---|---|---|
| Fleet and driver app | Driver push notifications | Backend stores push tokens (tested), but the app has no push SDK and no code registers a token or receives a message. |  |
| Fleet and driver app | Driver app installation | Release signing from key.properties, icons and iOS strings are in place (R115) and the /download page lists the driver app, but there is no store listing or real keystore. | Create the Android upload keystore outside the repo; Play Console app com.travelcrm.driver_app (internal track first); iOS signing on a Mac with an Apple Developer account (R115). |
| Super admin console | Announcements to agencies | Hidden: the console sidebar entry was removed and /announcements redirects to the dashboard (R112, owner question Q8, planned to stay hidden for v1). The page has no backend API behind it and no agency app code reads platform announcements. | Owner question Q8: build the agency-side reader, or keep hidden for v1. |
| Super admin console | Support tickets | Hidden: sidebar entry removed and /support redirects to the dashboard (R112, owner question Q8). No backend API behind the page, and the agency apps have no way to file a ticket. | Owner question Q8: build ticket filing in the agency app, or keep hidden for v1. |
| Super admin console | SEO page | Hidden: mock data only, sidebar entry removed and /seo redirects to the dashboard (R112, owner question Q8). | Owner question Q8. |

### Partly working (134)

| Area | Feature | Why | Needed at go-live |
|---|---|---|---|
| Enquiries and inbox | Customer WhatsApp and SMS arrive in the inbox | Committed. Twilio signature check, de-duplication and agency lookup by registered number are tested (inbound-gateway.test.ts, webhook-signatures.test.ts) and the e2e suite checks the receivers reject bad payloads. Never run against a live Twilio number. | API_PUBLIC_URL, TWILIO_AUTH_TOKEN, Twilio console callback URLs; register each agency's WhatsApp number in the channel registry (R107). |
| Enquiries and inbox | Plivo WhatsApp and SMS inbound | Route shares the ingest code; no spec exercises the Plivo signature path. The owner chose Twilio only (2026-10-15), so Plivo is not a launch provider. | None planned: Plivo is not part of the launch. |
| Enquiries and inbox | Customer emails arrive in the inbox | Uses SendGrid Inbound Parse with a secret in the URL. Unit-tested only; not verified against live SendGrid. | SendGrid Inbound Parse pointed at the agency enquiry address; SendGrid domain authentication (SPF/DKIM). |
| Enquiries and inbox | Compose a message | Screen and API verified in e2e; each send is now metered against the plan's monthly allowance. Real delivery needs the platform Twilio and SendGrid keys, which have not been exercised. | SENDGRID_API_KEY, platform Twilio credentials, EMAIL_FROM and domain authentication (R102). |
| Enquiries and inbox | Bulk send to many contacts | Sending is wired, but the progress endpoint is a stub: GET /communications/bulk-send/:batchId/status always returns total 0 (seen in code and flagged in the e2e spec). |  |
| Enquiries and inbox | Send a stored document by message | Endpoint exists (POST /communications/send-document); no spec covers it. Not verified. |  |
| Enquiries and inbox | Delivery and open tracking | Twilio status callbacks and the SendGrid signed event webhook are now signature-checked and tested (webhook-signatures.test.ts, delivery-callbacks.test.ts). Not verified against live providers. | SENDGRID_WEBHOOK_PUBLIC_KEY (Signed Event Webhook), Twilio message status callback /api/v1/webhooks/twilio/status (R107). |
| Enquiries and inbox | Live updates | Works in tests, but the websocket token is passed in the query string and behaviour after Durable Object hibernation is not verified. Incoming calls now also push a call:status event over it (R303). |  |
| Contacts | Tags and bulk tag | Tag list and bulk-tag endpoints exist; no spec covers bulk tagging itself. Not verified end to end. |  |
| Contacts | Birthdays and anniversaries | Dates and the upcoming-occasions list work (e2e). The daily reminder job now runs per agency at the agency's local send hour with per-recipient de-duplication (cron-daily-hour.test.ts, cron-recipient-idempotency.test.ts); delivery of the birthday message is not verified against live providers. |  |
| Leads and pipeline | Pipeline board | Board component and toggle exist in the page; the e2e spec covers the table view and status change from the detail page, not dragging on the board. Not verified. |  |
| Leads and pipeline | Record why a lead was lost | Dialog and reason field are wired; no spec specifically exercises it. Not verified. |  |
| Leads and pipeline | Bulk status change and bulk delete | Endpoints are tested through the API in e2e ("client-only actions"); the list screen exposes bulk selection for delete/assign but a visible bulk status control was not verified. |  |
| Follow-ups and tasks | Notification preferences and quiet hours | Page and API exist; no spec covers preferences. Not verified. |  |
| Follow-ups and tasks | Push notifications | The push queue is bound in wrangler.base.toml and token registration is tested, but the driver app has no push SDK (no firebase_messaging in pubspec.yaml), so no device receives a push. | Firebase project and an FCM key, plus a push SDK in the driver app (not started). |
| Itineraries and templates | Send the quote to the customer | Flow verified in e2e (placeholders resolved, company name filled); the quote link now points at the served /q page. Delivery needs the platform provider keys. |  |
| Itineraries and templates | Cost and margin on a quote | Tab is gated by a role check in the page; margin maths not covered by a spec. Not verified. |  |
| Rate cards and suppliers | Supplier profile, rates and ledger | Detail and edit are covered by e2e; the payments and ledger endpoints have no spec. |  |
| Rate cards and suppliers | Rate comparison | Filmed in the walkthrough but no dedicated e2e spec; not verified in this audit. |  |
| Rate cards and suppliers | Record payments to suppliers | Supplier page records payments and shows the ledger and the API is wired, but no spec covers it. Not verified end to end. |  |
| Invoices and payments | Create an invoice from an itinerary | Endpoint is wired and the Assistant uses it; no e2e spec drives the button. Not verified in the UI. |  |
| Invoices and payments | Send an invoice | Dialog verified in e2e; real delivery needs platform keys. |  |
| Invoices and payments | Automatic invoice due reminders | The job now runs per agency at the agency's local send hour and builds queue jobs in the shape the SMS and email consumers read, metered once per recipient (b37-tenant-local-today.test.ts, cron-recipient-idempotency.test.ts). Delivery is not verified against live providers. | SMS and email provider keys; communication caps and pack prices to be confirmed by the owner (R110). |
| Invoices and payments | Link an advance payment to an invoice | Backend tested; no UI control found for it in the payments screens. Not verified. |  |
| Invoices and payments | Online payment collection from customers | Built (R207): gateway secrets sealed with the last four characters shown, per-agency signed webhook, exactly-once recording shared with manual payments. Tested with signed fixtures (payment-links.test.ts) and the invoices, payments and webhooks e2e specs on the mock. Never run against a real Razorpay or Stripe account. | CREDENTIALS_KEYS must be set (sealing fails closed); pilot agency connects test-mode Razorpay and Stripe, pastes the webhook URL shown in Settings > Integrations, pays one full and one part-paid invoice (R207). |
| Invoices and payments | Exchange rates | Rates are now stored in the master database (migration 0019) and refreshed by the daily platform job. No desktop screen uses them yet. |  |
| Invoices and payments | Multi-currency display | Backend money formatting now follows the agency locale (R202; locale-money.test.ts) and new agencies start with their country's currency. The desktop sweep (R203) is not merged: 81 desktop files still mention en-IN and 18 still contain the rupee sign. | R203 (desktop currency and date sweep) is in progress. |
| Vouchers | Voucher in English, Hindi or Arabic | Language selector is verified; whether Hindi/Arabic output renders correctly in the PDF was not verified. |  |
| Vouchers | Voucher PDF and send | Endpoints (pdf, send, bulk-send) are tested in the backend suite; real delivery not exercised. |  |
| Vouchers | Vouchers from itinerary items | Backend-tested; no UI spec. Not verified in the UI. |  |
| Travellers and visa | Visa dashboard | Page and API exist; no spec covers the dashboard. Not verified. |  |
| Travellers and visa | Visa checklist and documents | Backend-tested; the e2e spec focuses on application CRUD. Document files are served without a per-tenant check (finding 02). |  |
| Travellers and visa | Passport and visa expiry alerts | The passport and visa expiry jobs now run per agency at the local send hour and are covered by cron-fanout.test.ts and cron-recipient-idempotency.test.ts. Delivery of the alert message is not verified against live providers. |  |
| Fleet and driver app | Trip costs | Add-cost dialog exists on the trip page and the e2e suite fixed a focus bug in it, but no spec asserts saved costs. Not verified. |  |
| Fleet and driver app | Invoice or voucher from a trip | Button and endpoint exist; no spec covers them. Not verified. |  |
| Fleet and driver app | Distance and cost estimate | Calculator uses straight-line distance and an optional Google Maps call; accuracy against real roads not verified. |  |
| Fleet and driver app | Driver sign-in by phone code | Drivers now sign in with the agency code (the agency slug), then phone and code; the stored agency is remembered and the full country picker follows the phone table (driver-agency.test.ts, agency_code_test.dart, handoff step 6). A real code needs Twilio SMS; on-device sign-in was run on an emulator (agency_login_test). | Give each agency its slug as the drivers' agency code; Twilio SMS for the login code (R115). |
| Fleet and driver app | Check in and check out with photo and location | API flow tested end to end; on-device GPS and camera were not run (the smoke integration test was not run, no emulator). |  |
| Fleet and driver app | Driver app in English, Hindi and Arabic | Translation files exist; right-to-left layout was not verified. Arabic for the agency app is registered but disabled (R211 not started). |  |
| Calls | Place a call from the CRM | Outbound calls now ring the agent first and then the customer (R302), with the lead id kept, and agents can answer in the app through the softphone (R307). Tested on the mock provider and call simulator (calls.spec.ts, calls-simulator.spec.ts, softphone.spec.ts, voip-once.test.ts). Not run with a real Twilio sub-account. | Real sub-account token and a device ring; one real call per resell country; emergency-calling disclaimer in the terms (R307). |
| Calls | Inbound call routing and voicemail | Business hours, keypad menu, assigned agent and voicemail are wired; the Dial action now falls through to voicemail and records the missed call exactly once (R302; voip-inbound.test.ts, voip-once.test.ts). The agent leg is now a registered softphone client. Not run against live Twilio. |  |
| Calls | Missed-call handling | Missed calls raise a notification, a call-back task (or a voicemail task) and a lead offer for unknown numbers, each created once (call-lifecycle.test.ts, calls-simulator.spec.ts). Driven by the call simulator; not run against live Twilio. |  |
| Calls | Call recordings | Recordings are copied once to the agency's storage, the provider copy is deleted, playback uses a 5-minute signed link with role rules, and a retention job deletes audio after 90 days by default (R306; call-recordings.test.ts, calls.spec.ts). Not run against a live Twilio recording callback. | Owner decides the recording default and Call AI default; lawyer-approved consent wording per market (R306). |
| Calls | Call transcripts and search | Transcription is now produced: Workers AI Whisper (standard, 3 credits a minute) or Deepgram Nova-3 (premium, 25 a minute), charged to the AI allowance. Search works over stored transcripts, but the transcript FTS index is not maintained for AI transcripts, so search misses them. | DEEPGRAM_API_KEY for premium; Workers AI binding; a 20-call transcription quality test (R306). |
| Calls | AI call summary and extracted leads | After a recorded call the call AI writes a summary (5 credits per 5 minutes) and the calls.summarise recipe turns it into suggestions only. The direct Anthropic call was removed, so it goes through the credit router. Tested on the mock AI (call-recordings.test.ts, call-lifecycle.test.ts). Quality with a real model not verified. |  |
| Calls | VoIP settings | Form, masking and test-connection are verified; provider credentials are now sealed (AES-256-GCM, R108) and per-agency calling sits on a Twilio sub-account. Test connection against a real account has not been run. |  |
| Calls | Phone numbers | Search, purchase (with an Idempotency-Key and registry claim) and release (routing removed first) are wired for Twilio on a per-agency sub-account, and a bought number is registered for inbound. Number rental is an add-on at cost plus 20%, renewed monthly (7-day release if unpaid). Tested on the mock provider (voip-numbers.test.ts); real Twilio numbers and regulatory bundles not exercised. | Platform Twilio credentials and written OK from Twilio for reselling; real monthly number prices replace the drafts; per-country regulatory bundles are submitted to Twilio by hand at first (R304). |
| Calls | Caller pop-up on incoming call | An incoming call now broadcasts call:status to the agent's app, which shows a screen pop with caller, contact and lead and Answer/Decline (R303, R307). Covered by calls-simulator.spec.ts and component tests; not run with a real inbound call. |  |
| Calls | Click-to-call buttons | Phone buttons on contacts and leads open the dial page with the number and lead filled in; calling is hidden for agencies outside the calling countries. Same live-Twilio caveat as Place a call. |  |
| Assistant and automations | Read an incoming message on demand | Endpoint exists and shares the tested analyser; no spec drives it directly. |  |
| Assistant and automations | Draft the first reply to a new enquiry | Shown in the assistant video; no dedicated test names this recipe. Not verified in isolation. |  |
| Assistant and automations | Suggest the best-matching itinerary template | Shown in the assistant video; matching quality is not covered by a named test. |  |
| Assistant and automations | Offer the invoice when a booking is confirmed | Shown in the assistant video; no named test for the recipe itself. |  |
| Assistant and automations | Create the booking checklist when a lead is won | Shown in the assistant video; no named test for the recipe itself. |  |
| Assistant and automations | Match a payment the customer already told you about | Shown in the assistant video; no named test for the recipe itself. |  |
| Assistant and automations | Draft hotel vouchers once the advance is in | Shown in the assistant video; no named test for the recipe itself. |  |
| Assistant and automations | Offer to mark the lead won when the advance arrives | No named test and not on camera; logic read, not verified. |  |
| Assistant and automations | Draft a reminder for overdue invoices | No named test; logic read, not verified. |  |
| Assistant and automations | Ask for feedback when a trip is completed | No named test; logic read, not verified. |  |
| Assistant and automations | Remind the customer before a quote expires | No named test; logic read, not verified. |  |
| Assistant and automations | Chase the balance before departure | No named test; logic read, not verified. |  |
| Assistant and automations | Create a lead from pasted text | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | AI itinerary generator | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | AI message composer | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | Suggested replies | Endpoint exists (POST /ai/suggest-replies); no spec drives it. Not verified. |  |
| Assistant and automations | AI invoice draft | Endpoint exists (POST /ai/generate-invoice); no UI page found and no spec. Not verified. |  |
| Assistant and automations | Ask your data in plain English | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. Backend route sits under /ai/intelligence, so it needs the Enterprise-only ai_intelligence gate even though the desktop gate checks differently. |  |
| Assistant and automations | AI insights and recommendations | Page and API exist; e2e skipped 14 tests because the demo plan lacks ai_intelligence, so only the gate state was verified. |  |
| Assistant and automations | Lead scoring | Page and API exist; e2e skipped because the demo plan lacks ai_intelligence. |  |
| Assistant and automations | Scan passports, visas and supplier invoices | Page and API exist; e2e skipped because the demo plan lacks ai_intelligence. |  |
| Assistant and automations | Smart follow-up suggestions | Page and API exist; e2e skipped because the demo plan lacks ai_intelligence. |  |
| Assistant and automations | Business briefings | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | Business health score | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | Destination profitability and demand | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | Team performance and workload | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | Customer segments and lifetime value | Output quality with a real model not verified: the e2e specs accept either a result or the "AI is not configured" notice. |  |
| Assistant and automations | Cash-flow forecast and revenue pulse | Endpoints exist (cash-flow-forecast, revenue-pulse); no screen link or spec found. Not verified. |  |
| Assistant and automations | AI feature switches and provider status | Switches save and are limited to the plan, but the 22 per-feature keys are only stored toggles: no route checks them. Only four coarse gates (ai_assistant, ai_extraction, ai_intelligence, ai_chatbot) are enforced. |  |
| Assistant and automations | Website chat widget and WhatsApp bot | Widget side works without a login for a known key: allow-list per agency, plan gate, rate limit, 2 KB message cap (public-chatbot.test.ts). The WhatsApp bot webhook is Twilio-signed and unit-tested but never run against a real WhatsApp number. | Twilio WhatsApp sender registered per agency; /api/v1/webhooks/chatbot/whatsapp set in the Twilio console (R107). |
| Marketing | Send a campaign now | The queue worker now resolves the agency database through the tenant resolver and checks consent on every marketing send (R101, R208; cron-fanout.test.ts, gdpr.test.ts). Real delivery not verified. |  |
| Marketing | Schedule a campaign for later | The scheduler job now runs per agency every 5 minutes and turns a due campaign into pending recipients plus one campaign-queue message, once (cron-fanout.test.ts). Delivery itself is not verified live. |  |
| Marketing | Earlier campaigns screens (/campaigns) | Duplicate of the marketing campaigns feature. Search and type filters are sent to the API but the backend ignores them (flagged in the e2e spec). |  |
| Marketing | Flyer templates | Pages and API exist and the flyer spec uses templates; template create/edit has no dedicated spec. |  |
| Marketing | Festival offers | Filmed and wired, but no e2e spec. The festival campaign queue still sends its WhatsApp messages through Twilio, not the agency's Meta number (R213 follow-up). |  |
| Marketing | Social post generator | Posts can only be created by AI; e2e skipped 8 tests because the test stack has no AI provider (503), so only the honest failure state was verified. |  |
| Marketing | AI marketing suggestions | Endpoints exist; no desktop page links to them and no spec covers them. Not verified. |  |
| Marketing | WhatsApp campaigns | Screens, API and a full lifecycle spec exist (whatsapp-campaigns.spec.ts). Sending can now go through the agency's own Meta number (R213); campaigns must include {{unsubscribe_url}} and skip contacts without consent. Never run against a live Meta or Twilio account. | See Meta WhatsApp: Business verification, approved templates named like the CRM templates (R213). |
| Reports and dashboard | Keyboard shortcuts | Provider mounted; no spec verifies the shortcuts. |  |
| Import and export | Full data export | Works (e2e) but covers only 7 tables, not everything. The route is now role-checked: salesperson, operations and view-only roles cannot run exports. For one contact's full data see Privacy export. |  |
| Settings and team | Sign in with email and password | Sign-in works with limits of 10 tries per 15 minutes per address and IP, an account lockout, session list and revoke, and optional two-factor (R209). Whether an access token can be revoked within its lifetime was not re-audited. |  |
| Settings and team | Sign in with a phone code | Screen reaches the verify step (e2e). Abuse limits are now enforced (3 per 10 minutes and 10 a day per number, 20 an hour per IP) and unknown phones get a generic 200 (otp-limits.test.ts). A real code needs Twilio SMS. | Owner to confirm the OTP abuse limits and the login-code allowance per plan (R110). |
| Settings and team | Forgot and reset password | Form and pages work and the link is built from APP_URL, not a hardcoded host; the reset mail goes through the transactional email service and the reset page is served by the web build (web-pages.spec.ts). Delivery needs live SendGrid. | SENDGRID_API_KEY, EMAIL_FROM, APP_URL and domain authentication (R102). |
| Settings and team | Invite email and first-time setup | Invites now send an email through the transactional email service (local outbox in dev), with a link built from APP_URL; accepting through the browser setup page is covered by handoff.spec.ts steps 4 and 4b and web-pages.spec.ts. Real delivery needs SendGrid with SPF/DKIM. | SendGrid domain authentication (SPF/DKIM) and a real inbox check (R102). |
| Settings and team | Activity log (audit trail) | Page and API exist; not covered by a spec. Not verified. |  |
| Settings and team | Interface language | t() with plurals and English fallback is wired through the shell, navigation, command palette, sign-in (including two-factor) and shared archetypes: en.json has 791 keys, Hindi is a draft (468 keys, needs native review) and Arabic is registered but disabled. The language is saved per device and on the user. Page bodies are not converted, so most screens stay English. | Native review of the Hindi draft; Arabic and right-to-left layout are R211 (not started). |
| Settings and team | Desktop application | A Windows installer now builds (0.1.0, unsigned) and was smoke-tested: it installs, signs in against a local API, runs the app's own server and stops it on close, and reports update-available from a local feed. The API address is read at runtime and the update feed is baked in. Not signed, not run on a clean machine, no real update host. | Windows code-signing certificate (CSC_LINK, CSC_KEY_PASSWORD); TRAVELCRM_UPDATE_URL host; macOS and Linux builds need their own runners (R114). |
| Super admin console | Super admin sign-in | The console has its own login and token (separate secret and audience), a lockout after 5 failures and logout that revokes the token; the fallback secret and unauthenticated seed route are gone (super-admin-api.test.ts). The console login page itself is not driven by a browser test. | SUPER_ADMIN_JWT_SECRET (32+ chars, different from JWT_SECRET); create the first super admin with backend/scripts/create-super-admin.mjs (R111). |
| Super admin console | Create a new agency | A created agency now gets its own database, migrations, an admin user with a temporary password and a welcome email, and the admin can sign in (handoff.spec.ts steps 1 and 2 for three agencies; tenant-provisioning.test.ts). Proven on the local provisioner only: the Cloudflare provisioner is tested with mocked fetch, and binding registration may leave the agency in pending_deploy until the generated deploy runs. | Verify on a real Cloudflare account that D1 create, query and delete work and whether the Workers settings PATCH adds a binding without a redeploy (R104). |
| Super admin console | Subscriptions and manual payments | Console lists subscriptions, cancels and records manual payments (admin-reports.ts); agencies now pay online through the billing gateway and the tenant page shows the billing state. The subscriptions page and manual payment record are not covered by a named test. |  |
| Super admin console | Online billing for agencies | Built (R205): Stripe, Razorpay and a mock gateway behind one interface, signed idempotent ordered webhooks, platform invoices with tax, grace period then read-only. Covered with signed fixtures (billing-webhooks.test.ts) and handoff step 9 on the mock. Never run with real gateway keys. See Billing and plans. | STRIPE_* and RAZORPAY_* secrets, webhooks at /api/v1/billing/webhooks/stripe and /razorpay, never BILLING_GATEWAY=mock or TEST_MODE in staging or production (R205). |
| Super admin console | Platform reports | Platform summary, feature usage and geographic distribution come from admin-reports.ts through the console's API proxy. No named test covers these three report endpoints. |  |
| Landing page | Pricing section | Plans and prices are fetched from GET /public/plans?market=IN (the plan catalogue) with a static fallback, so names no longer disagree with the server. Only India prices are seeded and the domain is a placeholder. | Owner confirms prices; add price rows for every market before agencies there can pay (409 PRICE_NOT_CONFIGURED otherwise); real domain. |
| Landing page | Start free trial buttons | Every call to action now opens the enquiry form (demo, sign-up or contact) which posts to /public/enquiries (rate-limited, optional Turnstile); the operator sees it at GET /admin/enquiries and the handoff spec marks one converted. There is still no self-serve sign-up: the operator creates the agency. | Fill landing/config.js (apiBase, siteUrl, contactEmail, whatsappNumber, demoVideoUrl, appDownloadUrl, turnstileSiteKey) and add the landing origin to CORS_ORIGINS (R116). |
| Landing page | Privacy, Terms and legal pages | Privacy policy, terms, data-processing agreement and sub-processor list pages exist (landing/legal/*.html) and the link check passes, but they are drafts. | Lawyer review of privacy policy, terms, DPA, erasure scope and consent wording (R116, R208). |
| Landing page | Customer reviews section | Content is written copy, not verified customer quotes; confirm before publishing. |  |
| Landing page | Landing page hosting | Terraform now defines the landing host and domain, and a landing workflow builds and link-checks the site; nothing has been deployed because the domain is a single placeholder (YOUR-DOMAIN.example). | Decide the domain; publish landing/public at the site root; replace the canonical, og, sitemap and robots placeholders (R116, R118). |
| Agency websites (WordPress) | Site host service | Rewritten (R309) on node:http: signed requests (HMAC over timestamp, method, path and body, 300 s window), refuses to start without a strong PROVISIONER_SECRET, idempotent site API, container-per-agency driver, memory-derived site limit. 13 provisioner tests pass; the Docker test was skipped (engine not running) and it has never run on the VM. | On the Oracle VM: PROVISIONER_SECRET (24+ chars), docker compose plugin, wp-network network, outbound internet and mail; no path-rewriting proxy in front; one real site end to end (R309). |
| Agency websites (WordPress) | WordPress hosting server | Terraform for the Oracle VM now lives in its own root (terraform/oracle) and validates; not applied. Wildcard DNS and Caddy TLS (R310) and shared-mode sizing are blocked on an undecided owner question (Q9). | Owner decision Q9 (shared vs container-per-agency sizing); then R310. |
| Agency websites (WordPress) | One-click site creation | Real queue now: the console creates a queued site, the queue consumer calls the provisioner with a signed request, retries with backoff (60 s, 300 s, 3 attempts, 30-minute build timeout), a cron sweep recovers lost messages, one site per agency, and a website_ready email goes out without credentials (wp-provisioning.test.ts). Never run against a real provisioner. | Worker secrets OCI_PROVISIONER_URL, PROVISIONER_SECRET, WP_SITES_DOMAIN (add to push-secrets.sh); one real site end to end (R309). |
| Agency websites (WordPress) | Travel site template | Template name travel-starter is passed; WP-CLI setup exists in the provisioner but what theme and plugins it installs was not verified. |  |
| Platform services | Production deployment | A deploy path now exists: gen-wrangler builds the production config from the agency registry, a predeploy guard blocks unsafe config, tenant migrations run canary-first, workflows are manual (workflow_dispatch), and terraform (Cloudflare and a separate Oracle root) validates. Nothing has ever been deployed, and the domain is a placeholder. | GitHub secrets and vars per workflow, Workers travelcrm-api and travelcrm-super-admin created before the first terraform apply, terraform state backend by hand, CORS_ORIGINS (R118, R125). |
| Platform services | Server API (about 60 route groups) | Not re-audited since 2026-10-09: Zod validation was missing on 22 route files then. New routes from the readiness batches (billing, two-factor, voip, admin, integrations) validate their input. |  |
| Platform services | Role permission checks | The exports and files routes now have checks (role permission for exports, agency-prefix for files). Other routes were not re-audited. |  |
| Platform services | Background queues | Email, SMS, push, import, export, campaign, AI extraction, WhatsApp campaign, tenant-jobs and WordPress queues are declared in wrangler.base.toml, import, export and campaign have dead-letter queues, and queue consumers resolve the agency database through the resolver. Consumers are tested with mocks; no real Cloudflare queue has run. |  |
| Platform services | Monitoring and logging | Structured JSON logs with a request id, an error-reporter hook (ERROR_REPORTER_DSN), a real health check and a deep health check are in place and tested (health.test.ts). No monitor, alert or DSN is configured. | ERROR_REPORTER_DSN and HEALTH_TOKEN secrets; uptime monitor on /api/v1/health/deep; 5xx alert (R117). |
| Platform services | Test-mode routes | Production now refuses to serve at all (503) when TEST_MODE is true, and refuses single-tenant mode unless explicitly allowed (index.ts guard, security-hardening.test.ts). The routes still bypass signature and OTP checks when the flag is on, so it must stay off. |  |
| Platform services | Privacy and data-protection tools | Consent records, contact export, erasure, signed unsubscribe, two-factor sign-in and sealed provider secrets now exist (see the Privacy and consent area, Two-factor sign-in, and Provider secrets encrypted at rest). Missing: bulk import/export files in storage are not rewritten on erasure, invoice free-text rewrite is case-sensitive, and the legal texts are drafts. | Lawyer review of privacy policy, DPA and erasure scope; data-residency (R212) is not started. |
| Platform services | Selling outside India | Done: tax engine (GST, VAT with reverse charge, sales tax, none), locale core, phone numbers by country (226-country table), agency currency on driver fares, provisioning seeds locale and phone default country. Open: the desktop currency and date sweep (R203), Arabic and right-to-left (R211), data residency (R212), and price rows for markets other than India. | Owner to confirm default VAT rates (GB 20, AE 5, SA 15, DE 19) and mandatory invoice fields per country (R201). |
| Settings and team | Connect the agency's own WhatsApp number (Meta) | UI and endpoints built (R213): token and app secret sealed, number ownership recorded in the channel registry. Tested with Meta-shaped fixtures (meta-whatsapp.test.ts) and the integrations e2e; never connected to a real Meta account. | Meta Business verification, WABA and registered number, system-user token, app secret and verify token (R213). |
| Settings and team | Agency app in the browser | OpenNext web build with runtime API address and public pages (R125); web-pages.spec.ts passes against it. The build is not deployed anywhere. | Deploy to app.<domain> with the deploy-web workflow; set APP_URL (R125). |
| Enquiries and inbox | WhatsApp through the agency's own Meta number | Built (R213): provider per agency, window enforced before send with a refund, signed webhook (X-Hub-Signature-256 over the raw body), agency found by phone_number_id, inbound de-duplicated, statuses once and monotonic, utility and marketing ledger rows. Tested with fixtures only. Inbound media is not downloaded and templates are not synced from Meta. | Callback URL <API_PUBLIC_URL>/api/v1/webhooks/inbound/meta/whatsapp subscribed to messages; templates approved with the same names as the CRM templates (marketing ones with {{unsubscribe_url}}); secrets WHATSAPP_META_TOKEN, _PHONE_NUMBER_ID, _APP_SECRET, _VERIFY_TOKEN (R213). |
| Invoices and payments | Payment link on an invoice | Built (R207) and tested on the mock (payment-links.test.ts, invoices.spec.ts, payments.spec.ts). A paid link records the payment once (payment_events claim plus a unique payments.reference). Never run with real gateways. | Per-agency webhook URL pasted into each gateway dashboard (Razorpay payment_link.* events, Stripe checkout.session.completed) (R207). |
| Fleet and driver app | Driver app release build | A release APK (53.5 MB) was built with a throwaway key; the real keystore, store listing and iOS signing do not exist. | Real Android upload keystore and android/key.properties on the build machine; Play Console internal track; iOS signing on a Mac with an Apple Developer account (R115). |
| Calls | Answer and place calls in the app (softphone) | R307: Twilio Voice SDK loaded lazily plus a mock implementation, state machine and controller, GET /voip/token (900 s, 20 a minute, refused for setup-only tokens), Electron microphone permission for the app's own loopback origin only. Covered by softphone.spec.ts, controller and UI tests on the mock. Not run with a real sub-account token or device. | Real sub-account token and device ring; microphone permission prompt in the packaged app and the browser; one real call per resell country; emergency-calling disclaimer in the terms (R307). |
| Calls | Calling account per agency | R304: sub-account claimed before the provider call, token sealed and mirrored for webhook checks, lifecycle wired to suspend, cancel and reactivate (14-day release after cancel), document review links in the console. Tested on the mock provider; no real Twilio sub-account created. | Platform Twilio credentials with written OK for reselling; live check that sub-account webhook signatures verify; owner confirms trial calling off, the 14/7-day release grace and the document-required countries (GB, AU, SG, DE, MY; US not) (R304). |
| Calls | Call minutes metered and capped | R305: voip.usage-import runs every 5 minutes from the sub-account (cursor, 3-hour overlap, customer leg only, weighting by destination cost). Covered by voip-metering.test.ts; real provider usage records not seen. | Owner confirms plan call-minute caps (all 0 today), per-minute costs and whether a spend spike only flags or also blocks; minute packs priced at cost x 1.2 or more from draft costs (R305). |
| Assistant and automations | Turn a summarised call into suggested next steps | R306 recipe covered by call-lifecycle.test.ts and call-recordings.test.ts on the mock AI; real model output not checked. | Workers AI binding; a 20-call quality test (R306). |
| Billing and plans | Subscribe, upgrade and cancel online | R205: BillingGateway for Stripe, Razorpay and a mock, over fetch and WebCrypto; signed, idempotent, ordered webhooks. New agencies are billed in their own market and currency (fix 3a7cc5e). billing-webhooks.test.ts and handoff step 9 (mock checkout completes, invoice in the agency currency). Never run with real keys. An expired trial cannot log in to reach /billing. | Secrets STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET; vars PLATFORM_TAX_COUNTRY/STATE/ID, PLATFORM_GST_RATE (18), PLATFORM_VAT_COUNTRIES/RATE, BILLING_GRACE_DAYS (7); webhooks at /api/v1/billing/webhooks/stripe and /razorpay; non-India markets need price rows (409 PRICE_NOT_CONFIGURED otherwise) (R205). |
| Billing and plans | Buy more: extra users and add-on packs | R206: one-off Stripe Checkout, Razorpay payment link or mock, exactly-once crediting (billing_events, order claim and a unique reference). addon-purchases.test.ts and the Buy more dialog test. Not run with real gateway keys. Only India has add-on price rows. | Razorpay events payment_link.paid, payment_link.expired, payment.failed; Stripe events checkout.session.completed, async_payment_succeeded, async_payment_failed, expired; test-mode purchase of every pack. Card fees (about 2%) bring the 20% margin to about 18%: owner decides margin_pct (R206). |
| Privacy and consent | Cookie notice on the landing page | Shipped in the landing build (R208); the landing build and link check pass but no browser test covers the notice. | Lawyer review of the cookie text. |
| Super admin console | Calling tab for each agency | R304/R305: admin-voip endpoints covered on the mock provider (voip-numbers.test.ts, voip-metering.test.ts); console panel builds. Not driven by a browser test or a real Twilio account. | Platform Twilio credentials (R304). |
| Platform services | Tenant database provisioning on Cloudflare | R104: the Cloudflare provisioner is tested with mocked fetch only (cloudflare-provisioner.test.ts); binding registration may leave an agency in pending_deploy until the generated deploy runs. The local provisioner is proven end to end. | Verify on a real Cloudflare account that D1 create (location hint or jurisdiction), query and delete work and whether the Workers settings PATCH adds a binding without a redeploy (R104). Never run from an agent. |
| Platform services | Agency database backups | R117/R125: backup-tenants.mjs with a self-test and --verify against a restored copy, weekly backup workflow, runbook docs/ops/BACKUPS.md. Never run against real databases. | R2 bucket travelcrm-backups with a lifecycle rule; CLOUDFLARE_API_TOKEN (D1 read, R2 write) in CI; Time Travel restore rehearsal on staging; 5xx alert (R117). |
| Platform services | Agency locale, currency and time zone (backend) | R202 (tenant migration 0048, master 0019) is merged and tested (locale-money.test.ts), and provisioning seeds locale and phone default country (fix 7d9550c). Desktop screens still pass India literals until R203 merges. | R203 desktop sweep in progress. |

## Appendix: where each feature lives in the code

| Feature id | Evidence | Route |
|---|---|---|
| inbox.whatsapp-sms-inbound | backend/src/routes/inbound.ts; backend/src/services/inbound/ingest.ts; backend/test/inbound-gateway.test.ts; desktop/e2e/webhooks-integrations.spec.ts; backend/test/webhook-signatures.test.ts | /api/webhooks/inbound/twilio/message |
| inbox.plivo-inbound | backend/src/routes/inbound.ts | /api/webhooks/inbound/plivo/message |
| inbox.email-inbound | backend/src/routes/inbound.ts; backend/src/services/inbound/ingest.ts | /api/webhooks/inbound/email/:secret |
| inbox.web-form | backend/src/routes/inbound.ts; backend/src/routes/webhook.ts; desktop/e2e/webhooks-integrations.spec.ts; backend/test/inbound-gateway.test.ts | /api/webhooks/inbound/web-form |
| inbox.lead-webhook | backend/src/routes/webhook.ts; desktop/e2e/webhooks-integrations.spec.ts | /api/leads/webhook |
| inbox.api-keys | desktop/src/app/(app)/settings/integrations/page.tsx; backend/src/routes/integrations.ts; desktop/e2e/webhooks-integrations.spec.ts; backend/test/credential-encryption.test.ts | /settings/integrations |
| inbox.receiving-addresses | desktop/src/app/(app)/settings/integrations/page.tsx; backend/src/routes/integrations.ts; backend/test/integrations-settings.test.ts; backend/src/services/voip/numbers.ts; backend/test/voip-numbers.test.ts | /settings/integrations |
| inbox.list | desktop/src/app/(app)/communication/page.tsx; backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /communication |
| inbox.thread | desktop/src/app/(app)/communication/[contactId]/page.tsx; desktop/e2e/communication-inbox.spec.ts | /communication/:contactId |
| inbox.compose | desktop/src/app/(app)/communication/compose/page.tsx; backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /communication/compose |
| inbox.send-dialog | desktop/src/components/communication/send-message-dialog.tsx; backend/src/routes/communications.ts; desktop/e2e/contacts.spec.ts; desktop/e2e/leads.spec.ts; desktop/e2e/invoices.spec.ts |  |
| inbox.bulk-send | desktop/src/app/(app)/communication/bulk-send/page.tsx; backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /communication/bulk-send |
| inbox.history-log | backend/src/routes/communications.ts; desktop/e2e/communication-inbox.spec.ts | /api/communications/history |
| inbox.send-document | backend/src/routes/communications.ts | /api/communications/send-document |
| inbox.templates | desktop/src/app/(app)/communication/templates/page.tsx; backend/src/routes/templates.ts; desktop/e2e/message-templates.spec.ts | /communication/templates |
| inbox.email-signature | desktop/src/app/(app)/settings/email-signature/page.tsx; backend/src/routes/users.ts; desktop/e2e/settings-team.spec.ts | /settings/email-signature |
| inbox.delivery-tracking | backend/src/routes/webhooks.ts; backend/test/delivery-callbacks.test.ts; backend/test/webhook-signatures.test.ts | /api/webhooks/sendgrid/events |
| inbox.unsubscribe | backend/src/routes/public.ts; backend/src/services/privacy/consent.ts; backend/src/utils/unsubscribe-token.ts; backend/test/gdpr.test.ts; desktop/e2e/marketing-opt-out.spec.ts | /api/public/unsubscribe/:token |
| inbox.realtime | backend/src/durable-objects/realtime.ts; backend/test/realtime-socket.test.ts; desktop/src/stores/realtime-store.ts |  |
| contacts.list | desktop/src/app/(app)/contacts/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /contacts |
| contacts.create-edit | desktop/src/app/(app)/contacts/new/page.tsx; desktop/src/app/(app)/contacts/[id]/edit/page.tsx; desktop/e2e/contacts.spec.ts | /contacts/new |
| contacts.detail | desktop/src/app/(app)/contacts/[id]/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /contacts/:id |
| contacts.timeline | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/:id/timeline |
| contacts.duplicates | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/check-duplicate |
| contacts.merge | desktop/src/app/(app)/contacts/merge/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /contacts/merge |
| contacts.tags-bulk | backend/src/routes/contacts.ts; desktop/src/app/(app)/contacts/page.tsx | /api/contacts/bulk-tag |
| contacts.custom-fields | desktop/src/app/(app)/settings/custom-fields/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /settings/custom-fields |
| contacts.share | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/:id/share |
| contacts.occasions | backend/src/routes/contacts.ts; backend/src/cron/auto-reminders.ts; desktop/e2e/contacts.spec.ts; backend/src/cron/dispatch.ts; backend/test/cron-daily-hour.test.ts | /api/contacts/upcoming-occasions |
| contacts.import | desktop/src/app/(app)/contacts/import/page.tsx; backend/src/routes/imports.ts; desktop/e2e/import-export.spec.ts | /contacts/import |
| contacts.export | backend/src/routes/contacts.ts; backend/src/routes/exports.ts; desktop/e2e/contacts.spec.ts; desktop/e2e/import-export.spec.ts | /api/contacts/export |
| contacts.soft-delete | backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /api/contacts/:id |
| leads.list | desktop/src/app/(app)/leads/page.tsx; backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /leads |
| leads.kanban | desktop/src/app/(app)/leads/page.tsx; desktop/src/components/domain/kanban-board.tsx | /leads |
| leads.create-edit | desktop/src/app/(app)/leads/new/page.tsx; desktop/src/app/(app)/leads/[id]/edit/page.tsx; desktop/e2e/leads.spec.ts | /leads/new |
| leads.detail | desktop/src/app/(app)/leads/[id]/page.tsx; backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /leads/:id |
| leads.status | desktop/src/app/(app)/leads/[id]/page.tsx; backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /api/leads/:id/status |
| leads.lost-reason | desktop/src/components/domain/lead-lost-dialog.tsx; backend/src/routes/leads.ts | /leads/:id |
| leads.notes | backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /api/leads/:id/notes |
| leads.unassigned | desktop/src/app/(app)/leads/unassigned/page.tsx; desktop/e2e/leads.spec.ts | /leads/unassigned |
| leads.bulk-actions | backend/src/routes/leads.ts; desktop/e2e/leads.spec.ts | /api/leads/bulk-status |
| leads.assignment-rules | desktop/src/app/(app)/settings/assignment-rules/page.tsx; backend/src/services/lead-assignment.ts; desktop/e2e/settings-company.spec.ts | /settings/assignment-rules |
| leads.routing-rules | desktop/src/app/(app)/settings/routing-rules/page.tsx; backend/src/routes/settings.ts; desktop/e2e/settings-company.spec.ts | /settings/routing-rules |
| leads.followup-sequences | desktop/src/app/(app)/settings/followup-sequences/page.tsx; backend/src/routes/settings.ts; backend/src/routes/leads.ts; desktop/e2e/settings-company.spec.ts | /settings/followup-sequences |
| leads.export | backend/src/routes/exports.ts; desktop/e2e/leads.spec.ts; desktop/e2e/import-export.spec.ts | /api/exports/leads |
| leads.import | backend/src/services/imports/row-inserter.ts; desktop/e2e/import-export.spec.ts | /import |
| followups.list | desktop/src/app/(app)/follow-ups/page.tsx; backend/src/routes/follow-ups.ts; desktop/e2e/follow-ups.spec.ts | /follow-ups |
| followups.schedule | desktop/src/app/(app)/follow-ups/page.tsx; desktop/e2e/follow-ups.spec.ts | /follow-ups |
| followups.reminders | backend/src/services/follow-up-reminders.ts; backend/src/cron/dispatch.ts; backend/src/queues/tenant-jobs-queue.ts; backend/test/cron-fanout.test.ts; backend/test/cron-recipient-idempotency.test.ts |  |
| tasks.list | desktop/src/app/(app)/tasks/page.tsx; backend/src/routes/tasks.ts; desktop/e2e/tasks.spec.ts | /tasks |
| tasks.detail | desktop/src/app/(app)/tasks/[id]/page.tsx; backend/src/routes/tasks.ts; desktop/e2e/tasks.spec.ts | /tasks/:id |
| tasks.link-lead | backend/src/routes/tasks.ts; desktop/e2e/tasks.spec.ts | /tasks?leadId= |
| tasks.overdue-alerts | backend/src/cron/overdue-tasks.ts; backend/src/cron/dispatch.ts; backend/test/b37-tenant-local-today.test.ts; backend/test/cron-fanout.test.ts |  |
| calendar.view | desktop/src/app/(app)/calendar/page.tsx; backend/src/routes/planner.ts; desktop/e2e/calendar.spec.ts | /calendar |
| calendar.events | backend/src/routes/planner.ts; desktop/e2e/calendar.spec.ts | /api/events |
| notifications.center | desktop/src/app/(app)/notifications/page.tsx; backend/src/routes/notifications.ts; desktop/e2e/notifications.spec.ts | /notifications |
| notifications.announce | desktop/src/app/(app)/settings/announcements/page.tsx; backend/src/routes/notifications.ts; desktop/e2e/notifications.spec.ts | /settings/announcements |
| notifications.preferences | desktop/src/app/(app)/settings/notifications/page.tsx; backend/src/routes/notification-preferences.ts | /settings/notifications |
| notifications.push | backend/src/routes/push-tokens.ts; backend/src/services/fcm.ts; backend/src/queues/push-notification-queue.ts |  |
| sticky-notes | desktop/src/components/domain/dashboard/sticky-notes-widget.tsx; backend/src/routes/sticky-notes.ts; desktop/e2e/dashboard.spec.ts | /dashboard |
| bookmarks | desktop/src/app/(app)/bookmarks/page.tsx; backend/src/routes/bookmarks.ts; desktop/e2e/dashboard.spec.ts | /bookmarks |
| itineraries.list | desktop/src/app/(app)/itineraries/page.tsx; backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /itineraries |
| itineraries.builder | desktop/src/app/(app)/itineraries/new/page.tsx; desktop/src/app/(app)/itineraries/[id]/edit/page.tsx; backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /itineraries/new |
| itineraries.detail | desktop/src/app/(app)/itineraries/[id]/page.tsx; desktop/e2e/itineraries.spec.ts | /itineraries/:id |
| itineraries.clone | backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /api/itineraries/:id/clone |
| itineraries.versions | backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /api/itineraries/:id/versions |
| itineraries.pdf | desktop/src/app/(app)/itineraries/[id]/pdf/page.tsx; backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /itineraries/:id/pdf |
| itineraries.send | backend/src/routes/itineraries.ts; desktop/e2e/itineraries.spec.ts | /api/itineraries/:id/send |
| itineraries.share-link | desktop/src/app/(public)/q/[token]/page.tsx; backend/src/routes/public.ts; backend/src/utils/app-urls.ts; desktop/e2e/web-pages.spec.ts; desktop/e2e/itineraries.spec.ts | /q/:token |
| itineraries.templates | desktop/src/app/(app)/itineraries/templates/page.tsx; backend/src/routes/itinerary-templates.ts; desktop/e2e/itinerary-templates.spec.ts | /itineraries/templates |
| itineraries.use-template | backend/src/routes/itinerary-templates.ts; desktop/e2e/itinerary-templates.spec.ts | /api/itinerary-templates/create-from |
| itineraries.defaults | desktop/src/app/(app)/settings/itinerary-defaults/page.tsx; backend/src/routes/settings.ts; desktop/e2e/settings-company.spec.ts | /settings/itinerary-defaults |
| itineraries.cost-estimate | desktop/src/app/(app)/itineraries/[id]/page.tsx |  |
| itineraries.pricing-lookup | backend/src/routes/rate-cards.ts; desktop/e2e/itineraries.spec.ts | /api/rate-cards/lookup |
| ratecards.list | desktop/src/app/(app)/rate-cards/page.tsx; backend/src/routes/rate-cards.ts; desktop/e2e/rate-cards.spec.ts | /rate-cards |
| ratecards.edit | desktop/src/app/(app)/rate-cards/new/page.tsx; desktop/src/app/(app)/rate-cards/[id]/edit/page.tsx; desktop/e2e/rate-cards.spec.ts | /rate-cards/new |
| ratecards.expiry-task | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| suppliers.list | desktop/src/app/(app)/suppliers/page.tsx; backend/src/routes/suppliers.ts; desktop/e2e/suppliers.spec.ts | /suppliers |
| suppliers.edit | desktop/src/app/(app)/suppliers/new/page.tsx; desktop/src/app/(app)/suppliers/[id]/edit/page.tsx; desktop/e2e/suppliers.spec.ts | /suppliers/new |
| suppliers.detail | desktop/src/app/(app)/suppliers/[id]/page.tsx; backend/src/routes/suppliers.ts | /suppliers/:id |
| suppliers.compare | desktop/src/app/(app)/suppliers/compare/page.tsx; backend/src/routes/suppliers.ts | /suppliers/compare |
| suppliers.payments | desktop/src/app/(app)/suppliers/[id]/page.tsx; backend/src/routes/suppliers.ts; backend/src/services/reports/supplier-reports.ts | /api/suppliers/:id/payments |
| suppliers.rate-preferred | backend/src/routes/suppliers.ts; desktop/e2e/suppliers.spec.ts | /api/suppliers/:id/rate |
| accounts.view | desktop/src/app/(app)/accounts/page.tsx; desktop/e2e/accounts.spec.ts | /accounts |
| hsn.codes | backend/src/routes/hsn-codes.ts; desktop/src/components/domain/hsn-code-picker.tsx; desktop/e2e/reports.spec.ts | /api/hsn-codes |
| invoices.list | desktop/src/app/(app)/invoices/page.tsx; backend/src/routes/invoices.ts; desktop/e2e/invoices.spec.ts | /invoices |
| invoices.create-edit | desktop/src/app/(app)/invoices/new/page.tsx; desktop/src/app/(app)/invoices/[id]/edit/page.tsx; desktop/e2e/invoices.spec.ts | /invoices/new |
| invoices.gst | backend/src/services/tax-calculator.ts; backend/src/routes/invoices.ts; backend/test/tax-regimes.test.ts |  |
| invoices.from-itinerary | backend/src/routes/invoices.ts; backend/test/crud-lifecycle.test.ts | /api/invoices/from-itinerary |
| invoices.detail | desktop/src/app/(app)/invoices/[id]/page.tsx; desktop/e2e/invoices.spec.ts | /invoices/:id |
| invoices.pdf-csv | desktop/src/app/(app)/invoices/[id]/_documents.ts; desktop/e2e/invoices.spec.ts | /invoices/:id |
| invoices.bulk-pdf | backend/src/routes/exports.ts; backend/src/queues/export-queue.ts; desktop/e2e/invoices.spec.ts; desktop/e2e/import-export.spec.ts | /api/exports/invoices/bulk-pdf |
| invoices.void-duplicate | backend/src/routes/invoices.ts; desktop/e2e/invoices.spec.ts | /api/invoices/:id/void |
| invoices.send | backend/src/routes/invoices.ts; desktop/e2e/invoices.spec.ts | /api/invoices/:id/send |
| invoices.defaults-numbering | desktop/src/app/(app)/settings/invoice-defaults/page.tsx; desktop/src/app/(app)/settings/numbering/page.tsx; backend/src/services/numbering.ts; desktop/e2e/reports.spec.ts; desktop/e2e/settings-company.spec.ts | /settings/invoice-defaults |
| invoices.credit-notes | desktop/src/app/(app)/credit-notes/page.tsx; backend/src/routes/credit-notes.ts; desktop/e2e/credit-debit-notes.spec.ts | /credit-notes |
| invoices.debit-notes | desktop/src/app/(app)/debit-notes/page.tsx; backend/src/routes/credit-notes.ts; desktop/e2e/credit-debit-notes.spec.ts | /debit-notes |
| invoices.overdue-reminder-draft | backend/src/services/automation/recipes.ts | /assistant |
| invoices.reminders-cron | backend/src/cron/auto-reminders.ts; backend/src/cron/dispatch.ts; backend/test/cron-recipient-idempotency.test.ts; backend/test/b37-tenant-local-today.test.ts |  |
| payments.record | desktop/src/app/(app)/payments/new/page.tsx; backend/src/routes/payments.ts; desktop/e2e/payments.spec.ts | /payments/new |
| payments.list | desktop/src/app/(app)/payments/page.tsx; desktop/src/app/(app)/payments/[id]/page.tsx; desktop/e2e/payments.spec.ts | /payments |
| payments.link-invoice | backend/src/routes/payments.ts; backend/test/payment-routes.test.ts | /api/payments/:id/link-invoice |
| payments.gateway | backend/src/services/payments/agency-gateway.ts; backend/src/services/payments/record.ts; backend/src/routes/payment-webhooks.ts; backend/src/routes/integrations.ts; backend/test/payment-links.test.ts; desktop/e2e/payments.spec.ts; desktop/e2e/invoices.spec.ts | /settings/integrations |
| finance.exchange-rates | backend/src/routes/exchange-rates.ts; backend/src/services/exchange-rate.ts | /api/exchange-rates |
| finance.currency | desktop/src/lib/utils.ts; backend/src/routes/invoices.ts |  |
| vouchers.list | desktop/src/app/(app)/vouchers/page.tsx; backend/src/routes/vouchers.ts; desktop/e2e/vouchers.spec.ts | /vouchers |
| vouchers.create-edit | desktop/src/app/(app)/vouchers/new/page.tsx; desktop/src/app/(app)/vouchers/[id]/edit/page.tsx; desktop/e2e/vouchers.spec.ts | /vouchers/new |
| vouchers.status | backend/src/routes/vouchers.ts; desktop/e2e/vouchers.spec.ts | /vouchers/:id |
| vouchers.languages | desktop/e2e/vouchers.spec.ts |  |
| vouchers.pdf-send | backend/src/routes/vouchers.ts; backend/test/voucher-routes.test.ts | /api/vouchers/:id/send |
| vouchers.from-itinerary | backend/src/routes/vouchers.ts; backend/test/voucher-routes.test.ts | /api/vouchers/from-itinerary-item |
| travellers.list | desktop/src/app/(app)/travellers/page.tsx; backend/src/routes/travellers.ts; desktop/e2e/travellers.spec.ts | /travellers |
| travellers.edit | desktop/src/app/(app)/travellers/new/page.tsx; desktop/src/app/(app)/travellers/[id]/edit/page.tsx; desktop/e2e/travellers.spec.ts | /travellers/new |
| travellers.link-contact | backend/src/routes/travellers.ts; desktop/e2e/travellers.spec.ts | /api/travellers/:id/link-contact |
| travellers.collect-details | backend/src/services/automation/recipes.ts | /assistant |
| visa.list | desktop/src/app/(app)/visa/page.tsx; backend/src/routes/visa.ts; desktop/e2e/visa.spec.ts | /visa |
| visa.edit | desktop/src/app/(app)/visa/new/page.tsx; desktop/src/app/(app)/visa/[id]/edit/page.tsx; desktop/e2e/visa.spec.ts | /visa/new |
| visa.dashboard | desktop/src/app/(app)/visa/dashboard/page.tsx; backend/src/routes/visa.ts | /visa/dashboard |
| visa.checklist-docs | backend/src/routes/visa.ts; backend/test/visa-traveller.test.ts | /api/visa/:id/documents |
| visa.expiry-alerts | backend/src/cron/auto-reminders.ts; backend/src/cron/dispatch.ts; backend/test/cron-fanout.test.ts; backend/test/cron-recipient-idempotency.test.ts |  |
| fleet.dashboard | desktop/src/app/(app)/fleet/page.tsx; backend/src/routes/fleet.ts; desktop/e2e/fleet-dashboard.spec.ts | /fleet |
| fleet.vehicles | desktop/src/app/(app)/fleet/vehicles/page.tsx; desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx; desktop/e2e/fleet-vehicles.spec.ts | /fleet/vehicles |
| fleet.vehicle-docs | backend/src/routes/fleet.ts; desktop/e2e/fleet-vehicles.spec.ts | /fleet/vehicles/:id |
| fleet.maintenance | backend/src/routes/fleet.ts; desktop/e2e/fleet-vehicles.spec.ts | /api/fleet/vehicles/:id/maintenance |
| fleet.drivers | desktop/src/app/(app)/fleet/drivers/page.tsx; desktop/src/app/(app)/fleet/drivers/[id]/page.tsx; desktop/e2e/fleet-drivers.spec.ts | /fleet/drivers |
| fleet.driver-docs | backend/src/routes/fleet.ts; desktop/e2e/fleet-drivers.spec.ts | /fleet/drivers/:id |
| fleet.driver-rating | backend/src/routes/fleet.ts; desktop/e2e/fleet-drivers.spec.ts | /fleet/drivers/:id |
| fleet.trips | desktop/src/app/(app)/fleet/trips/page.tsx; desktop/src/app/(app)/fleet/trips/new/page.tsx; desktop/src/app/(app)/fleet/trips/[id]/page.tsx; desktop/e2e/fleet-trips.spec.ts | /fleet/trips |
| fleet.trip-costs | desktop/src/app/(app)/fleet/trips/[id]/page.tsx; backend/src/routes/fleet.ts | /api/fleet/trips/:id/costs |
| fleet.trip-invoice | backend/src/routes/fleet.ts; backend/src/services/trip-invoice-generator.ts; desktop/src/app/(app)/fleet/trips/[id]/page.tsx | /api/fleet/trips/:id/generate-invoice |
| fleet.rate-cards | desktop/src/app/(app)/fleet/rate-cards/page.tsx; backend/src/routes/fleet.ts; backend/src/services/trip-cost-calculator.ts; desktop/e2e/fleet-rate-cards.spec.ts | /fleet/rate-cards |
| fleet.distance-cost | backend/src/services/trip-cost-calculator.ts |  |
| fleet.alerts | desktop/src/app/(app)/fleet/alerts/page.tsx; backend/src/routes/fleet.ts; desktop/e2e/fleet-dashboard.spec.ts | /fleet/alerts |
| fleet.alerts-cron | backend/src/cron/fleet-alerts.ts; backend/src/cron/dispatch.ts; backend/test/b37-tenant-local-today.test.ts; backend/test/cron-fanout.test.ts |  |
| fleet.arrival-transfer | backend/src/services/automation/recipes.ts; desktop/e2e/assistant-transfer-draft.spec.ts | /assistant |
| driver.login | packages/driver_app/lib/features/auth/presentation/screens/phone_input_screen.dart; backend/src/routes/driver.ts; desktop/e2e/driver-app-api.spec.ts; backend/test/driver-agency.test.ts; packages/driver_app/test/agency_code_test.dart; packages/driver_app/integration_test/agency_login_test.dart |  |
| driver.my-trips | packages/driver_app/lib/features/trips/presentation/screens/my_trips_screen.dart; packages/driver_app/lib/features/trips/presentation/screens/trip_history_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.accept-reject | packages/driver_app/lib/features/trips/presentation/screens/trip_detail_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.status-updates | backend/src/routes/driver.ts; desktop/e2e/driver-app-api.spec.ts |  |
| driver.check-in-out | packages/driver_app/lib/features/trips/presentation/screens/check_in_screen.dart; packages/driver_app/lib/features/trips/presentation/screens/check_out_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.profile-docs | packages/driver_app/lib/features/profile/presentation/screens/profile_screen.dart; desktop/e2e/driver-app-api.spec.ts |  |
| driver.languages | packages/driver_app/lib/l10n/intl_en.arb; packages/driver_app/lib/l10n/intl_hi.arb; packages/driver_app/lib/l10n/intl_ar.arb |  |
| driver.push | backend/src/routes/driver.ts; packages/driver_app/pubspec.yaml |  |
| driver.distribution | packages/driver_app/pubspec.yaml |  |
| calls.log | desktop/src/app/(app)/communication/calls/page.tsx; backend/src/routes/calls.ts; desktop/e2e/calls.spec.ts | /communication/calls |
| calls.detail-outcome | desktop/src/app/(app)/communication/calls/[id]/page.tsx; backend/src/routes/calls.ts; desktop/e2e/calls.spec.ts | /communication/calls/:id |
| calls.dial | desktop/src/app/(app)/communication/calls/dial/page.tsx; backend/src/routes/calls.ts; backend/src/services/voip/contract.ts; backend/test/voip-once.test.ts; desktop/e2e/calls.spec.ts; desktop/e2e/softphone.spec.ts | /communication/calls/dial |
| calls.inbound-routing | backend/src/routes/voip-callbacks.ts; backend/src/services/call-routing.ts; backend/test/voip-callbacks.test.ts; backend/test/voip-inbound.test.ts; backend/test/voip-once.test.ts |  |
| calls.missed | backend/src/services/missed-call-handler.ts; backend/src/services/automation/recipes.ts; backend/test/voip-callbacks.test.ts; backend/test/call-lifecycle.test.ts; desktop/e2e/calls-simulator.spec.ts | /api/calls/missed |
| calls.analytics | desktop/src/app/(app)/communication/calls/analytics/page.tsx; backend/src/routes/calls.ts; desktop/e2e/calls.spec.ts | /communication/calls/analytics |
| calls.recording | backend/src/services/voip/recordings.ts; backend/src/routes/calls.ts; backend/src/routes/files.ts; backend/test/call-recordings.test.ts; desktop/e2e/calls.spec.ts |  |
| calls.transcripts | backend/src/services/voip/call-ai.ts; backend/src/routes/transcripts.ts; backend/src/services/ai-pricing.ts; backend/test/call-recordings.test.ts; backend/test/transcript-search.test.ts | /communication/calls/transcripts |
| calls.ai-summary | backend/src/services/voip/call-ai.ts; backend/src/services/automation/recipes.ts; backend/test/call-recordings.test.ts; backend/test/call-lifecycle.test.ts; desktop/e2e/calls.spec.ts | /ai/extractions |
| calls.voip-settings | desktop/src/app/(app)/settings/voip/page.tsx; backend/src/routes/voip.ts; desktop/e2e/voip-settings.spec.ts; backend/test/credential-encryption.test.ts | /settings/voip |
| calls.numbers | desktop/src/app/(app)/settings/phone-numbers/page.tsx; backend/src/routes/voip.ts; backend/src/services/voip/numbers.ts; backend/test/voip-numbers.test.ts; desktop/e2e/voip-settings.spec.ts | /settings/phone-numbers |
| calls.screen-pop | desktop/src/components/domain/call-screen-pop.tsx; desktop/src/components/providers/softphone-host.tsx; backend/src/routes/voip.ts; desktop/e2e/calls-simulator.spec.ts; desktop/src/components/domain/call-screen-pop.test.tsx |  |
| calls.click-to-call | desktop/src/components/domain/click-to-call-button.tsx; desktop/e2e/calls.spec.ts |  |
| assistant.suggestions | desktop/src/app/(app)/assistant/page.tsx; desktop/src/components/domain/assistant/suggestion-card.tsx; backend/src/routes/assistant.ts; backend/test/automation-engine.test.ts | /assistant |
| assistant.activity-undo | desktop/src/app/(app)/assistant/page.tsx; backend/src/routes/assistant.ts; backend/test/automation-engine.test.ts | /assistant?tab=activity |
| assistant.modes | desktop/src/app/(app)/assistant/page.tsx; backend/src/routes/automations.ts; backend/test/automation-engine.test.ts; desktop/e2e/assistant-rules.spec.ts | /assistant?tab=automations |
| assistant.pause | backend/src/routes/automations.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| assistant.custom-rules | desktop/src/components/domain/assistant/rule-builder-dialog.tsx; backend/src/services/automation/custom-rules.ts; backend/test/custom-rules.test.ts; desktop/e2e/assistant-rules.spec.ts | /assistant?tab=automations |
| assistant.guards | backend/src/services/automation/engine.ts; backend/test/automation-engine.test.ts; backend/test/automation-recipes.test.ts |  |
| assistant.attention-widget | desktop/src/components/domain/assistant/attention-widget.tsx; desktop/src/app/(app)/dashboard/page.tsx; desktop/e2e/dashboard.spec.ts | /dashboard |
| assistant.sidebar-badge | desktop/src/components/layout/nav-config.ts; backend/src/routes/assistant.ts | /assistant |
| assistant.analyze-message | backend/src/routes/assistant.ts | /api/assistant/analyze |
| assistant.scheduler | backend/src/services/automation/schedule.ts; backend/src/index.ts; backend/test/automation-engine.test.ts; backend/src/cron/dispatch.ts; backend/test/cron-fanout.test.ts; backend/test/usage-cap-reset.test.ts |  |
| assistant.read-messages-ai | backend/src/services/automation/message-analysis.ts; backend/test/message-analysis-ai.test.ts; backend/src/services/automation/recipes.ts; desktop/e2e/assistant-transfer-draft.spec.ts | /assistant |
| automation.inbox.read_messages | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.inbox.reply_after_capture | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.first_follow_up | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.itineraries.suggest_template | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.quote_sent_status | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.leads.follow_up_after_quote | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.invoices.from_confirmed_booking | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.tasks.booking_checklist | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.payments.from_message | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.vouchers.after_payment | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.won_on_payment | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.stale_quote_nudge | backend/src/services/automation/recipes.ts; backend/test/automation-engine.test.ts | /assistant?tab=automations |
| automation.invoices.overdue_reminder | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.calls.missed_callback | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts; backend/test/call-lifecycle.test.ts; desktop/e2e/calls-simulator.spec.ts | /assistant?tab=automations |
| automation.calls.lead_from_missed_call | backend/src/services/automation/recipes.ts; backend/test/voip-callbacks.test.ts | /assistant?tab=automations |
| automation.fleet.trip_feedback | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.leads.contacted_on_reply | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.inbox.unanswered_message | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.itineraries.quote_expiring | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.payments.thank_you | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.payments.balance_before_travel | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.travellers.collect_details | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.marketing.post_trip_review | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.marketing.dormant_win_back | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.rate_cards.expiry_task | backend/src/services/automation/recipes.ts; backend/test/automation-recipes.test.ts | /assistant?tab=automations |
| automation.fleet.arrival_transfer | backend/src/services/automation/recipes.ts; desktop/e2e/assistant-transfer-draft.spec.ts | /assistant?tab=automations |
| assistant.draft-reply-send | desktop/e2e/assistant-transfer-draft.spec.ts; desktop/src/components/communication/send-message-dialog.tsx | /assistant |
| assistant.usage-credits | backend/src/services/ai-credits.ts; backend/src/services/ai-pricing.ts; backend/test/ai-credits.test.ts; desktop/src/app/(app)/assistant/page.tsx; desktop/src/app/(app)/settings/ai-usage/page.tsx; backend/test/usage-cap-reset.test.ts; backend/test/metering-caps.test.ts | /assistant?tab=usage |
| ai.lead-extraction | desktop/src/app/(app)/ai/lead-creation/page.tsx; backend/src/routes/ai-assistant.ts; desktop/e2e/ai-assistant.spec.ts | /ai/lead-creation |
| ai.itinerary | desktop/src/app/(app)/ai/itinerary/page.tsx; backend/src/routes/ai-assistant.ts; desktop/e2e/ai-assistant.spec.ts | /ai/itinerary |
| ai.compose | desktop/src/app/(app)/ai/compose/page.tsx; backend/src/routes/ai-assistant.ts; desktop/e2e/ai-assistant.spec.ts | /ai/compose |
| ai.suggest-replies | backend/src/routes/ai-assistant.ts | /api/ai/suggest-replies |
| ai.invoice-generate | backend/src/routes/ai-assistant.ts | /api/ai/generate-invoice |
| ai.nl-search | desktop/src/app/(app)/ai/search/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-assistant.spec.ts | /ai/search |
| ai.insights | desktop/src/app/(app)/ai/insights/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/insights |
| ai.lead-score | desktop/src/app/(app)/ai/lead-score/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/lead-score |
| ai.ocr | desktop/src/app/(app)/ai/ocr/page.tsx; desktop/src/app/(app)/ai/document-scans/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/ocr |
| ai.smart-followups | desktop/src/app/(app)/ai/smart-followups/page.tsx; backend/src/routes/ai-intelligence.ts; desktop/e2e/ai-intelligence.spec.ts | /ai/smart-followups |
| ai.bi-briefings | desktop/src/app/(app)/ai/bi/briefings/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/briefings |
| ai.bi-health-score | desktop/src/app/(app)/ai/bi/health-score/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/health-score |
| ai.bi-destinations | desktop/src/app/(app)/ai/bi/destinations/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/destinations |
| ai.bi-team | desktop/src/app/(app)/ai/bi/team/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/team |
| ai.bi-segments | desktop/src/app/(app)/ai/bi/segments/page.tsx; backend/src/routes/business-intelligence.ts; desktop/e2e/ai-business-intelligence.spec.ts | /ai/bi/segments |
| ai.bi-forecast | backend/src/routes/business-intelligence.ts | /api/ai/bi/cash-flow-forecast |
| ai.settings | desktop/src/app/(app)/settings/ai/page.tsx; backend/src/routes/ai-settings.ts; desktop/e2e/ai-settings.spec.ts | /settings/ai |
| ai.usage-page | desktop/src/app/(app)/settings/ai-usage/page.tsx; desktop/src/app/(app)/ai/bi/usage/page.tsx; desktop/e2e/ai-business-intelligence.spec.ts | /settings/ai-usage |
| chatbot.conversations | desktop/src/app/(app)/chatbot/page.tsx; backend/src/routes/chatbot.ts; backend/src/routes/public-chatbot.ts; backend/test/public-chatbot.test.ts; backend/test/chatbot-create-lead.test.ts; desktop/e2e/chatbot.spec.ts | /chatbot |
| chatbot.widget-channels | backend/src/routes/public-chatbot.ts; backend/src/index.ts; backend/test/public-chatbot.test.ts; desktop/e2e/chatbot.spec.ts | /api/chatbot/widget.js |
| chatbot.settings | desktop/src/app/(app)/settings/chatbot/page.tsx; desktop/src/app/(app)/chatbot/analytics/page.tsx; backend/src/routes/chatbot.ts; backend/test/public-chatbot.test.ts | /settings/chatbot |
| marketing.dashboard | desktop/src/app/(app)/marketing/page.tsx; desktop/e2e/marketing-campaigns.spec.ts | /marketing |
| marketing.campaigns | desktop/src/app/(app)/marketing/campaigns/page.tsx; backend/src/routes/marketing/campaigns.ts; desktop/e2e/marketing-campaigns.spec.ts; desktop/e2e/campaigns.spec.ts | /marketing/campaigns |
| marketing.campaign-send | backend/src/routes/marketing/campaigns.ts; backend/src/queues/campaign-queue.ts; backend/test/gdpr.test.ts | /marketing/campaigns/:id |
| marketing.campaign-schedule | backend/src/cron/campaign-scheduler.ts; backend/src/cron/dispatch.ts; backend/test/cron-fanout.test.ts; desktop/e2e/marketing-campaigns.spec.ts | /marketing/campaigns/:id |
| marketing.legacy-campaigns | desktop/src/app/(app)/campaigns/page.tsx; backend/src/routes/campaigns.ts; desktop/e2e/campaigns.spec.ts | /campaigns |
| marketing.segments | desktop/src/app/(app)/marketing/segments/page.tsx; backend/src/routes/marketing/segments.ts; backend/src/services/segmentation-engine.ts; desktop/e2e/marketing-segments.spec.ts | /marketing/segments |
| marketing.flyers | desktop/src/app/(app)/marketing/flyers/page.tsx; backend/src/routes/marketing/flyers.ts; desktop/e2e/marketing-flyers.spec.ts | /marketing/flyers |
| marketing.flyer-templates | desktop/src/app/(app)/marketing/flyers/templates/page.tsx; backend/src/routes/marketing/flyer-templates.ts; desktop/e2e/marketing-flyers.spec.ts | /marketing/flyers/templates |
| marketing.branding | desktop/src/app/(app)/marketing/branding/page.tsx; backend/src/routes/marketing/branding.ts; desktop/e2e/marketing-flyers.spec.ts | /marketing/branding |
| marketing.festivals | desktop/src/app/(app)/marketing/festivals/page.tsx; backend/src/routes/festival-campaigns.ts; desktop/src/lib/api/marketing.ts | /marketing/festivals |
| marketing.opt-out | desktop/src/app/(app)/marketing/opted-out/page.tsx; backend/src/routes/marketing/opt-out.ts; desktop/e2e/marketing-opt-out.spec.ts; backend/test/gdpr.test.ts | /marketing/opted-out |
| marketing.social | desktop/src/app/(app)/marketing/social/page.tsx; backend/src/routes/social-content.ts; desktop/e2e/marketing-social.spec.ts | /marketing/social |
| marketing.suggestions | backend/src/routes/marketing-suggestions.ts | /api/marketing/suggestions |
| marketing.whatsapp-campaigns | desktop/src/app/(app)/marketing/whatsapp/page.tsx; backend/src/routes/whatsapp-campaigns.ts; desktop/e2e/whatsapp-campaigns.spec.ts; backend/src/queues/whatsapp-campaign-queue.ts; backend/test/meta-whatsapp.test.ts; backend/src/services/messaging/meta-whatsapp.ts | /marketing/whatsapp |
| marketing.post-trip-review | backend/src/services/automation/recipes.ts | /assistant?tab=automations |
| documents.library | desktop/src/app/(app)/documents/page.tsx; backend/src/routes/documents.ts; desktop/e2e/documents.spec.ts | /documents |
| documents.link-prefill | desktop/e2e/documents.spec.ts | /documents?leadId= |
| documents.file-store | backend/src/routes/files.ts; backend/test/security-hardening.test.ts; desktop/e2e/documents.spec.ts | /api/files |
| dashboard.kpis | desktop/src/app/(app)/dashboard/page.tsx; backend/src/routes/reports.ts; desktop/e2e/dashboard.spec.ts | /dashboard |
| dashboard.quick-add | desktop/e2e/dashboard.spec.ts | /dashboard |
| dashboard.command-palette | desktop/src/components/domain/command-palette.tsx; desktop/src/components/domain/command-palette.test.tsx; desktop/e2e/auth-shell.spec.ts |  |
| dashboard.shortcuts | desktop/src/components/domain/keyboard-shortcuts-provider.tsx; desktop/src/app/(app)/help/page.tsx |  |
| reports.hub | desktop/src/app/(app)/reports/page.tsx; backend/src/routes/reports.ts; desktop/e2e/reports.spec.ts | /reports |
| reports.library | backend/src/services/reports/sales-reports.ts; backend/src/services/reports/financial-reports.ts; backend/src/services/reports/lead-reports.ts; desktop/e2e/reports.spec.ts | /api/reports/:id |
| reports.date-compare | desktop/e2e/reports.spec.ts | /reports/sales |
| reports.export | backend/src/routes/reports.ts; backend/src/services/exports/excel-export.ts; desktop/e2e/reports.spec.ts; desktop/e2e/import-export.spec.ts | /api/reports/:id/export |
| reports.outstanding-ageing | backend/src/routes/reports.ts; desktop/e2e/reports.spec.ts | /api/reports/outstanding |
| reports.cache | backend/src/services/report-cache.ts; backend/src/routes/reports.ts | /api/reports/cache |
| import.wizard | desktop/src/app/(app)/import/page.tsx; desktop/src/app/(app)/settings/import/page.tsx; backend/src/routes/imports.ts; desktop/e2e/import-export.spec.ts | /import |
| import.templates | backend/src/services/imports/template-generator.ts; desktop/e2e/import-export.spec.ts | /api/imports/templates/:type |
| import.duplicates | backend/src/services/imports/duplicate-detector.ts; desktop/e2e/import-export.spec.ts | /import |
| import.history | desktop/src/app/(app)/settings/import/page.tsx; backend/src/routes/imports.ts; desktop/e2e/import-export.spec.ts | /settings/import |
| export.lists | desktop/e2e/contacts.spec.ts; desktop/e2e/leads.spec.ts; desktop/e2e/invoices.spec.ts; desktop/e2e/payments.spec.ts; desktop/e2e/tasks.spec.ts; desktop/e2e/suppliers.spec.ts |  |
| export.xlsx | desktop/src/app/(app)/settings/export/page.tsx; backend/src/routes/exports.ts; desktop/e2e/import-export.spec.ts | /settings/export |
| export.full | backend/src/routes/exports.ts; backend/src/queues/export-queue.ts; desktop/e2e/import-export.spec.ts | /settings/export |
| auth.login | desktop/src/app/(auth)/login/page.tsx; backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts; desktop/e2e/token-refresh.spec.ts; backend/test/auth-e2e.test.ts | /login |
| auth.otp | backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts; backend/test/otp-limits.test.ts | /login |
| auth.password-reset | backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts; backend/test/transactional-email.test.ts; desktop/e2e/web-pages.spec.ts | /forgot-password |
| auth.sessions | desktop/src/app/(app)/settings/sessions/page.tsx; desktop/src/app/(app)/settings/login-history/page.tsx; backend/src/routes/auth.ts; desktop/e2e/auth-shell.spec.ts; desktop/e2e/settings-team.spec.ts | /settings/sessions |
| team.members | desktop/src/app/(app)/settings/team/page.tsx; backend/src/routes/users.ts; desktop/e2e/settings-team.spec.ts | /settings/team |
| team.invite-email | backend/src/routes/users.ts; desktop/src/app/(auth)/setup-account/page.tsx; backend/test/transactional-email.test.ts; desktop/e2e/handoff.spec.ts; desktop/e2e/web-pages.spec.ts |  |
| team.roles | backend/src/constants/permissions.ts; desktop/src/hooks/use-permission.ts; backend/test/permissions-endpoint.test.ts |  |
| team.seat-limit | backend/src/services/plans/seats.ts; backend/src/routes/users.ts; backend/test/plan-catalogue.test.ts; backend/test/addon-purchases.test.ts; desktop/e2e/handoff.spec.ts |  |
| settings.hub | desktop/src/app/(app)/settings/page.tsx; desktop/e2e/settings-company.spec.ts | /settings |
| settings.company | desktop/src/app/(app)/settings/company/page.tsx; backend/src/routes/settings.ts; desktop/e2e/settings-company.spec.ts | /settings/company |
| settings.profile | desktop/src/app/(app)/settings/profile/page.tsx; backend/src/routes/users.ts; desktop/e2e/settings-team.spec.ts | /settings/profile |
| settings.change-password | desktop/src/app/(auth)/change-password/page.tsx; backend/src/routes/auth.ts; backend/test/first-login.test.ts; desktop/e2e/first-login.spec.ts | /change-password |
| settings.custom-fields | desktop/src/app/(app)/settings/custom-fields/page.tsx; backend/src/routes/contacts.ts; desktop/e2e/contacts.spec.ts | /settings/custom-fields |
| settings.activity-log | desktop/src/app/(app)/settings/activity-log/page.tsx; backend/src/routes/activity-logs.ts | /settings/activity-log |
| settings.numbering | desktop/src/app/(app)/settings/numbering/page.tsx; backend/src/services/numbering.ts; desktop/e2e/settings-company.spec.ts | /settings/numbering |
| settings.integrations | desktop/src/app/(app)/settings/integrations/page.tsx; desktop/e2e/webhooks-integrations.spec.ts; backend/src/routes/integrations.ts | /settings/integrations |
| settings.language | desktop/src/lib/i18n.ts; desktop/src/components/domain/language-switcher.tsx; desktop/src/messages/en.json; desktop/src/messages/hi.json; desktop/scripts/i18n-check.mjs; desktop/src/lib/i18n.test.ts |  |
| settings.onboarding | desktop/src/app/(app)/onboarding/page.tsx; backend/test/first-login.test.ts; desktop/e2e/first-login.spec.ts; desktop/e2e/handoff.spec.ts | /onboarding |
| help.center | desktop/src/app/(app)/help/page.tsx; desktop/e2e/auth-shell.spec.ts | /help |
| desktop.app | desktop/electron/main.ts; desktop/electron/next-server.ts; desktop/electron/updater.ts; desktop/electron-builder.yml; desktop/e2e-electron/; docs/launch/STATE.json |  |
| sa.login | super-admin/src/app/login/page.tsx; backend/src/routes/admin-auth.ts; backend/src/middleware/require-super-admin.ts; backend/test/super-admin-api.test.ts | /login |
| sa.dashboard | super-admin/src/app/(authenticated)/dashboard/page.tsx; super-admin/src/components/dashboard/calling-flags.tsx; backend/src/routes/admin.ts; backend/src/routes/admin-reports.ts; backend/test/admin.test.ts | /dashboard |
| sa.tenants-list | super-admin/src/app/(authenticated)/tenants/page.tsx; super-admin/src/app/(authenticated)/tenants/[id]/page.tsx; super-admin/src/app/api/[...path]/route.ts; backend/src/routes/admin.ts; backend/src/routes/admin-tenants.ts; backend/test/admin.test.ts | /tenants |
| sa.tenant-provision | super-admin/src/app/(authenticated)/tenants/new/page.tsx; backend/src/routes/admin-tenants.ts; backend/src/services/tenancy/run-provisioning.ts; backend/src/services/tenancy/cloudflare-provisioner.ts; backend/test/tenant-provisioning.test.ts; backend/test/cloudflare-provisioner.test.ts; desktop/e2e/handoff.spec.ts | /tenants/new |
| sa.tenant-lifecycle | backend/src/routes/admin-tenant-ops.ts; super-admin/src/components/tenants/tenant-actions.tsx; backend/test/super-admin-api.test.ts; desktop/e2e/handoff.spec.ts |  |
| sa.plan-change | backend/src/routes/admin-tenant-ops.ts; backend/src/routes/admin-catalogue.ts; backend/test/super-admin-api.test.ts; backend/test/plan-catalogue.test.ts |  |
| sa.feature-flags | backend/src/routes/admin-tenant-ops.ts; backend/src/middleware/feature-gate.ts; super-admin/src/components/tenants/feature-flags-panel.tsx; backend/test/super-admin-api.test.ts; backend/test/usage-cap-reset.test.ts |  |
| sa.subscriptions | super-admin/src/app/(authenticated)/subscriptions/page.tsx; super-admin/src/app/api/[...path]/route.ts; backend/src/routes/admin-reports.ts; backend/test/billing-webhooks.test.ts | /subscriptions |
| sa.billing-online | backend/src/services/billing/gateway.ts; backend/src/services/billing/stripe.ts; backend/src/services/billing/razorpay.ts; backend/src/routes/billing.ts; backend/test/billing-webhooks.test.ts |  |
| sa.announcements | super-admin/src/app/(authenticated)/announcements/page.tsx; super-admin/next.config.ts; backend/src/db/master-schema.ts | /announcements |
| sa.support | super-admin/src/app/(authenticated)/support/page.tsx; super-admin/next.config.ts; backend/src/db/master-schema.ts | /support |
| sa.audit-log | super-admin/src/app/(authenticated)/audit-log/page.tsx; backend/src/routes/admin-tenant-ops.ts; backend/src/services/admin/audit.ts; backend/test/super-admin-api.test.ts; backend/test/admin.test.ts | /audit-log |
| sa.system-health | super-admin/src/app/(authenticated)/system-health/page.tsx; backend/src/services/health.ts; backend/test/health.test.ts; backend/test/admin.test.ts | /system-health |
| sa.reports | super-admin/src/app/(authenticated)/reports/page.tsx; super-admin/src/app/api/[...path]/route.ts; backend/src/routes/admin-reports.ts | /reports |
| sa.seo | super-admin/src/app/(authenticated)/seo/page.tsx; super-admin/next.config.ts |  |
| sa.impersonation | backend/src/routes/admin-tenant-ops.ts; backend/src/services/admin/impersonation.ts; super-admin/src/components/impersonation-dialog.tsx; desktop/src/components/layout/support-session-banner.tsx; backend/test/super-admin-api.test.ts; desktop/e2e/super-admin.spec.ts | /support-session |
| sa.desktop-pages (removed) | desktop/e2e/super-admin.spec.ts | /super-admin |
| landing.page | landing/index.html | landing/index.html |
| landing.pricing | landing/index.html; backend/src/routes/public.ts; landing/main.js |  |
| landing.signup | landing/index.html; landing/main.js; backend/src/routes/public-enquiries.ts; backend/test/public-enquiries.test.ts; desktop/e2e/handoff.spec.ts |  |
| landing.legal | landing/legal/privacy.html; landing/legal/terms.html; landing/legal/dpa.html; landing/legal/subprocessors.html; landing/scripts/check-links.mjs |  |
| landing.reviews | landing/index.html |  |
| landing.contact | landing/index.html |  |
| landing.hosting | landing/index.html; .github/workflows/landing.yml; landing/scripts/build.mjs |  |
| wp.provisioner | oci-provisioner/src/server.ts; oci-provisioner/src/wp-setup.ts; oci-provisioner/Dockerfile; oci-provisioner/test/ |  |
| wp.server-infra | terraform/modules/oracle-cloud/main.tf; terraform/oracle/main.tf; docs/INFRA.md |  |
| wp.console-page | super-admin/src/app/(authenticated)/wordpress/page.tsx; super-admin/src/components/wordpress/site-status.tsx; super-admin/src/components/tenants/website-panel.tsx; backend/src/routes/admin-wordpress.ts; backend/test/wp-provisioning.test.ts | /wordpress |
| wp.provision-queue | backend/src/queues/wp-provision-queue.ts; backend/src/services/wordpress/sites.ts; backend/src/services/wordpress/provisioner-client.ts; backend/test/wp-provisioning.test.ts |  |
| wp.template | oci-provisioner/src/wp-setup.ts |  |
| platform.tenant-isolation | backend/src/services/tenant-db.ts; backend/src/middleware/tenant.ts; backend/test/tenancy-isolation.test.ts; backend/test/tenant-db.test.ts; desktop/e2e/tenant-isolation.spec.ts; desktop/e2e/handoff.spec.ts |  |
| platform.deploy | backend/scripts/gen-wrangler.mjs; backend/scripts/predeploy-guard.mjs; backend/scripts/migrate-tenants.mjs; .github/workflows/deploy-backend.yml; terraform/main.tf; docs/GO-LIVE.md |  |
| platform.cors | backend/src/utils/cors.ts; backend/src/index.ts; backend/test/security-hardening.test.ts |  |
| platform.api | backend/src/index.ts; backend/test/api.test.ts; backend/test/crud-lifecycle.test.ts | /api/v1 |
| platform.permissions | backend/src/constants/permissions.ts; backend/src/middleware/rbac.ts; backend/test/permissions-endpoint.test.ts; backend/src/routes/exports.ts |  |
| platform.queues | backend/src/queues/index.ts; backend/wrangler.toml; backend/wrangler.base.toml; backend/src/queues/tenant-jobs-queue.ts |  |
| platform.cron | backend/src/cron/dispatch.ts; backend/src/index.ts; backend/src/queues/tenant-jobs-queue.ts; backend/test/cron-fanout.test.ts; backend/test/cron-daily-hour.test.ts; backend/test/cron-recipient-idempotency.test.ts |  |
| platform.observability | backend/src/services/error-reporter.ts; backend/src/services/health.ts; backend/src/utils/logger.ts; backend/test/health.test.ts |  |
| platform.test-mode | backend/src/routes/test.ts; backend/test/security-hardening.test.ts; backend/src/index.ts |  |
| platform.compliance | backend/src/services/privacy/registry.ts; backend/src/services/privacy/erase-contact.ts; backend/test/gdpr.test.ts; docs/launch/STATE.json |  |
| platform.international | backend/src/services/tax-calculator.ts; backend/src/utils/phone.ts; desktop/src/lib/utils.ts; backend/src/utils/money.ts; backend/test/tax-regimes.test.ts; backend/test/locale-money.test.ts |  |
| auth.two-factor | backend/src/routes/two-factor.ts; backend/src/services/two-factor.ts; desktop/src/app/(app)/settings/security/page.tsx; backend/test/two-factor.test.ts; desktop/e2e/two-factor.spec.ts | /settings/security |
| auth.require-2fa | backend/src/routes/two-factor.ts; backend/src/services/two-factor.ts; backend/test/two-factor.test.ts; desktop/e2e/two-factor.spec.ts | /settings/security |
| auth.password-policy | backend/src/utils/password.ts; backend/src/routes/auth.ts; backend/test/first-login.test.ts; backend/test/utils/password.test.ts |  |
| settings.meta-whatsapp-connect | desktop/src/app/(app)/settings/integrations/page.tsx; backend/src/routes/integrations.ts; backend/test/meta-whatsapp.test.ts; desktop/e2e/webhooks-integrations.spec.ts | /settings/integrations |
| desktop.web-app | desktop/open-next.config.ts; desktop/scripts/build-web.mjs; desktop/src/app/(public)/q/[token]/page.tsx; desktop/src/app/(public)/download/page.tsx; desktop/e2e/web-pages.spec.ts; .github/workflows/deploy-web.yml | /quick-start |
| inbox.meta-whatsapp | backend/src/services/messaging/meta-whatsapp.ts; backend/src/services/messaging/meta-webhook.ts; backend/src/routes/inbound.ts; backend/test/meta-whatsapp.test.ts; desktop/e2e/whatsapp-campaigns.spec.ts; desktop/e2e/webhooks-integrations.spec.ts | /api/webhooks/inbound/meta/whatsapp |
| invoices.tax-engine | backend/src/services/tax-calculator.ts; backend/src/routes/invoices.ts; backend/src/routes/credit-notes.ts; backend/test/tax-regimes.test.ts; desktop/e2e/invoices.spec.ts; desktop/e2e/credit-debit-notes.spec.ts | /settings/invoice-defaults |
| payments.invoice-link | backend/src/services/payments/agency-gateway.ts; backend/src/services/payments/record.ts; backend/src/routes/invoices.ts; backend/test/payment-links.test.ts; desktop/e2e/invoices.spec.ts | /invoices/:id |
| driver.agency-code | backend/src/routes/driver.ts; backend/test/driver-agency.test.ts; packages/driver_app/test/agency_code_test.dart; packages/driver_app/integration_test/agency_login_test.dart; desktop/e2e/handoff.spec.ts |  |
| driver.release-signing | packages/driver_app/android/app/build.gradle.kts; .github/workflows/driver-app.yml |  |
| calls.softphone | desktop/src/lib/softphone/controller.ts; desktop/src/lib/softphone/factory.ts; desktop/src/components/providers/softphone-host.tsx; desktop/src/components/domain/call-controls-panel.tsx; desktop/electron/permissions.ts; backend/src/routes/voip.ts; backend/test/voip-token.test.ts; desktop/e2e/softphone.spec.ts | /communication/calls/dial |
| calls.country-gating | backend/src/services/voip/country-gate.ts; backend/src/services/voip/country-policy.ts; backend/test/voip-provider-contract.test.ts; desktop/e2e/voip-settings.spec.ts |  |
| calls.subaccounts | backend/src/services/voip/subaccounts.ts; backend/src/routes/voip.ts; backend/src/routes/admin-voip.ts; backend/test/voip-numbers.test.ts; desktop/e2e/voip-settings.spec.ts | /settings/voip |
| calls.minute-metering | backend/src/services/voip/metering.ts; backend/src/cron/dispatch.ts; backend/test/voip-metering.test.ts |  |
| calls.fraud-limits | backend/src/services/voip/fraud.ts; backend/src/services/voip/destinations.ts; backend/src/routes/admin-voip.ts; backend/test/voip-metering.test.ts |  |
| calls.recording-consent | backend/src/routes/calls.ts; backend/src/services/voip/recordings.ts; backend/test/call-recordings.test.ts; desktop/e2e/calls.spec.ts | /settings/voip |
| automation.calls.missed_acknowledgement | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts | /assistant |
| automation.calls.voicemail_task | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts | /assistant |
| automation.calls.log_to_timeline | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts; desktop/e2e/calls-simulator.spec.ts; desktop/e2e/calls.spec.ts | /assistant |
| automation.leads.contacted_on_call | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts | /assistant |
| automation.calls.next_step_prompt | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts | /assistant |
| automation.calls.lead_from_unknown_caller | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts; desktop/e2e/calls-simulator.spec.ts | /assistant |
| automation.calls.retry_task | backend/src/services/automation/recipes.ts; backend/test/call-lifecycle.test.ts | /assistant |
| automation.calls.summarise | backend/src/services/automation/recipes.ts; backend/src/services/voip/call-ai.ts; backend/test/call-lifecycle.test.ts; backend/test/call-recordings.test.ts | /assistant |
| billing.plan-catalogue | backend/src/services/plans/catalogue.ts; backend/src/routes/admin-catalogue.ts; super-admin/src/app/(authenticated)/catalogue/page.tsx; backend/test/plan-catalogue.test.ts | /catalogue |
| billing.checkout | backend/src/routes/billing.ts; backend/src/services/billing/gateway.ts; backend/src/services/billing/subscriptions.ts; desktop/src/app/(app)/settings/billing/page.tsx; backend/test/billing-webhooks.test.ts; desktop/e2e/handoff.spec.ts | /settings/billing |
| billing.grace-read-only | backend/src/services/billing/subscriptions.ts; backend/src/services/plans/trial.ts; backend/test/billing-webhooks.test.ts |  |
| billing.platform-invoices | backend/src/routes/billing.ts; backend/src/services/billing/subscriptions.ts; backend/test/billing-webhooks.test.ts; desktop/e2e/handoff.spec.ts | /settings/billing |
| billing.addons | backend/src/services/billing/addons.ts; backend/src/routes/billing.ts; desktop/src/components/domain/buy-more-dialog.tsx; desktop/src/components/domain/allowance-exhausted-dialog.tsx; backend/test/addon-purchases.test.ts | /settings/billing |
| billing.communication-caps | backend/src/services/metering/meter.ts; backend/src/services/metering/usage-alerts.ts; backend/src/middleware/usage-cap.ts; backend/test/metering-caps.test.ts; backend/test/otp-limits.test.ts |  |
| privacy.consent-records | backend/src/services/privacy/consent.ts; backend/src/routes/contacts.ts; desktop/src/app/(app)/contacts/_lib/privacy-section.tsx; backend/test/gdpr.test.ts; desktop/e2e/marketing-opt-out.spec.ts | /contacts/:id |
| privacy.contact-export | backend/src/services/privacy/export-contact.ts; backend/src/services/privacy/registry.ts; backend/src/routes/files.ts; backend/test/gdpr.test.ts | /api/contacts/:id/privacy-export |
| privacy.contact-erasure | backend/src/services/privacy/erase-contact.ts; desktop/src/app/(app)/contacts/_lib/privacy-section.tsx; backend/test/gdpr.test.ts | /contacts/:id |
| privacy.cookie-notice | landing/index.html; landing/main.js; landing/scripts/check-links.mjs | / |
| sa.catalogue | super-admin/src/app/(authenticated)/catalogue/page.tsx; super-admin/src/components/grant-addon-dialog.tsx; backend/src/routes/admin-catalogue.ts; backend/test/plan-catalogue.test.ts | /catalogue |
| sa.calling-console | super-admin/src/components/tenants/calling-panel.tsx; backend/src/routes/admin-voip.ts; backend/test/voip-numbers.test.ts; backend/test/voip-metering.test.ts | /tenants/:id |
| sa.safety-flags | super-admin/src/components/dashboard/calling-flags.tsx; backend/src/routes/admin-voip.ts; backend/test/voip-metering.test.ts | /dashboard |
| sa.billing-state | super-admin/src/app/(authenticated)/tenants/[id]/page.tsx; backend/src/routes/admin-tenants.ts; backend/src/routes/admin.ts; backend/test/billing-webhooks.test.ts | /tenants/:id |
| sa.enquiries | backend/src/routes/public-enquiries.ts; backend/test/public-enquiries.test.ts; desktop/e2e/handoff.spec.ts | /admin/enquiries |
| sa.maintenance | backend/src/routes/admin.ts; backend/test/credential-encryption.test.ts | /admin/maintenance/reencrypt |
| platform.tenant-provisioning | backend/src/services/tenancy/cloudflare-provisioner.ts; backend/src/services/tenancy/run-provisioning.ts; backend/scripts/gen-wrangler.mjs; backend/test/cloudflare-provisioner.test.ts; backend/test/tenant-provisioning.test.ts | /api/admin/tenants |
| platform.credential-encryption | backend/src/utils/crypto-box.ts; backend/test/crypto-box.test.ts; backend/test/credential-encryption.test.ts |  |
| platform.rate-limits | backend/src/middleware/rate-limit.ts; backend/src/middleware/rate-limiter.ts; backend/test/rate-limit-binding.test.ts |  |
| platform.backups | backend/scripts/backup-tenants.mjs; backend/scripts/backup-tenants.selftest.mjs; .github/workflows/backup.yml; docs/ops/BACKUPS.md |  |
| platform.phone-by-country | backend/src/utils/phone.ts; scripts/gen-countries.mjs; desktop/src/components/ui/phone-input.tsx; packages/driver_app/test/locale_phone_test.dart; backend/test/utils/phone.test.ts |  |
| platform.agency-locale | backend/src/utils/money.ts; backend/src/utils/tz.ts; backend/src/services/tenancy/seed-tenant.ts; backend/test/locale-money.test.ts |  |
| platform.handoff-scenario | desktop/e2e/handoff.spec.ts; docs/HANDOFF-PLAYBOOK.md; desktop/scripts/fix-stack.mjs |  |
