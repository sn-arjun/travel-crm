# TravelCRM Pro video catalogue

Status: designed and scripted on 2026-10-21. Nothing in this catalogue is recorded or rendered yet. The recording order, commands and gates are in [RECORDING-RUNBOOK.md](RECORDING-RUNBOOK.md). Which film and chapter shows each feature is in [COVERAGE.md](COVERAGE.md), which `node docs/videos/coverage.mjs --write` regenerates.

The owner asked for every feature, including small ones, with voice-over and motion design, across roles and plans, plus one complete end-to-end video. This catalogue covers that with 25 films and a master cut. Each area is recorded once and then cut into feature shorts, one per chapter, with no extra recording.

## 1. How the films are made

- **One recording per film, many outputs.** Each film is one Playwright take of the real app on a local stack (`desktop/e2e/showcase/films/<film>.spec.ts`). Remotion turns it into a narrated film (`studio/clips/<film>.json`). The film's chapters then become shorts (`studio/src/shorts.mjs`), and the master cut joins the rendered films (`studio/src/master.mjs`). The hero film and the master cut record nothing of their own.
- **Narration sets the pace.** Each screen scene names a `step`. The spec plays that step with `beat(page, '<step>', actions)`, and it holds the screen until that scene's line has finished. Line lengths come from the Kokoro manifest (`studio/out/narration/<film>/narration.json`). The take writes `step:` and `step-end:` marks, and `build.mjs` sets each scene's in and out points from those marks. Nobody picks times by hand. Zoom and callout positions also come from the recording: `focus(page, '<id>', locator)` saves the element's box.
- **Nothing is burned into the recording except the cursor.** Remotion draws the lower-thirds (feature, role and plan badges), the captions, the title cards, the flow diagrams and the plan matrix (kit in `studio/src/kit/`). New films use `cropBottom: 0`.
- **Voice:** `af_heart` (American female). The owner approved it on 2026-10-14, in the pilot style. The tone follows `docs/marketing/LANDING-COPY.md`: plain and friendly, and it never overclaims.
- **Honesty rules.** The narration only claims what `docs/features.json` supports. For a partial feature it says what the feature does today. On camera:
  - customer WhatsApp, SMS and email messages arrive through `POST /test/inbound`, which is the code path a provider webhook takes;
  - phone calls are played by the call simulator on the mock provider, and the calls films say so on a title card;
  - subscription payments run on the mock gateway, and the plans film calls it the test gateway;
  - email is shown from the local outbox, rendered as the email that was sent;
  - the call transcript is a stored sample, and the narration says it was prepared for the demo;
  - no AI request runs outside the gated AI session.
- **Demo data:** the area and role films use Sahyadri Holidays, the demo agency from `desktop/e2e/showcase/demo-data.ts`. For those films `scripts/showcase/film-prep.mjs --demo` moves it to Enterprise, so every screen is unlocked. The limits of each plan are shown in the plans film, on three real agencies:
  - Skyline Holidays, India, Basic;
  - Thames & Tide Travel, UK, Pro;
  - Desert Pearl Tours, UAE, Enterprise.
- **Calling** is only offered in the UK, the US, Australia and Singapore (owner decision G1). Sahyadri is an Indian agency, so both calls films open with a title card. It says where calling is offered and that the calls are simulated. The calls films close calling again after the take. The plans film runs on a stack with `FIX_STACK_CALLING_COUNTRIES=GB,US,AU,SG`, so it shows the real country rule.

## 2. The films

Estimated length is the narration time (5,191 words at 2.55 words a second, plus card times), times about 1.2 for screens where the actions outlast the line. Target length is the budget in `docs/videos/films.json`. The finalize gate allows 0.5 to 2 times the target.

| # | Film (`id`) | Audience | Stack | Signed in as | Chapters | Shorts | Est. length | Target |
|---|---|---|---|---|---|---|---|---|
| 1 | TravelCRM Pro in 90 seconds (`hero`) | Landing page | cut | (from area films) | 5 | - | 1:15-1:30 | 1:30 |
| 2 | Running the platform (`platform-owner`) | Platform owner | multi | console operator, then the new agency owner | 12 | 9 | 4:15-5:00 | 4:30 |
| 3 | Basic, Pro and Enterprise (`plans`) | Prospects | multi | owners of A, B, C | 8 | 4 | 2:20-2:50 | 2:30 |
| 4 | A day as the agency admin (`role-admin`) | Owners | single | Ananya Menon, admin | 6 | 4 | 1:25-1:45 | 2:30 |
| 5 | A day as the sales manager (`role-sales-manager`) | Sales | single | Rahul Nair | 6 | 4 | 1:00-1:20 | 2:00 |
| 6 | A day as a salesperson (`role-salesperson`) | Sales | single | Sneha Iyer | 6 | 4 | 1:05-1:25 | 2:10 |
| 7 | A day in operations (`role-operations`) | Operations | single | Deepa Thomas | 6 | 4 | 0:55-1:15 | 2:00 |
| 8 | A day as the accountant (`role-accountant`) | Accounts | single | Vikram Rao | 5 | 3 | 0:55-1:10 | 1:50 |
| 9 | Read-only access (`role-view-only`) | Owners | single | Leela Fernandes, view only | 3 | - | 0:35-0:50 | 1:00 |
| 10 | The driver app (`driver`) | Drivers, operations | driver (Android emulator) | Ravi Kumar, driver | 7 | 4 | 1:00-1:20 | 1:30 |
| 11 | Leads, follow-ups and tasks (`area-leads`) | Sales | single | admin | 9 | 7 | 2:05-2:40 | 3:30 |
| 12 | Contacts, travellers and documents (`area-contacts`) | Everyone | single | admin | 9 | 7 | 1:50-2:15 | 2:50 |
| 13 | Itineraries, quotes and suppliers (`area-itineraries`) | Sales, operations | single | admin | 8 | 6 | 1:55-2:25 | 3:20 |
| 14 | Bookings, vouchers and visas (`area-bookings`) | Operations | single | operations | 4 | 2 | 1:20-1:40 | 2:20 |
| 15 | Invoices, payments and payment links (`area-finance`) | Accounts | single | admin | 8 | 6 | 2:00-2:30 | 3:10 |
| 16 | Inbox: WhatsApp, email, SMS and chat (`area-comms`) | Sales | single | admin | 7 | 5 | 1:45-2:10 | 3:00 |
| 17 | Campaigns and marketing (`area-marketing`) | Marketing | single | admin | 8 | 6 | 1:45-2:10 | 2:50 |
| 18 | The assistant and automations (`area-automations`) | Everyone | single | admin | 11 | 8 | 2:30-3:10 | 3:30 |
| 19 | Calls that set up the next step (`automations-calls`) | Sales | single | admin | 6 | 3 | 1:50-2:15 | 2:30 |
| 20 | Calls: screen pop, softphone, recordings and minutes (`area-calls`) | Sales, operations | single | admin | 8 | 6 | 2:05-2:35 | 2:50 |
| 21 | Fleet, drivers and trips (`area-fleet`) | Operations | single | admin | 7 | 5 | 1:45-2:10 | 2:50 |
| 22 | Dashboard, reports and your data (`area-reports`) | Owners, managers | single | admin | 6 | 4 | 1:50-2:15 | 2:40 |
| 23 | Settings, team, two-factor and privacy (`area-settings`) | Admins | single | admin | 8 | 6 | 2:20-2:50 | 3:10 |
| 24 | Built for every country (`international`) | Agencies outside India | multi | owners of B, C | 6 | 3 | 1:20-1:40 | 2:20 |
| 25 | Your website and the landing page (`website`) | Prospects, platform owner | multi | visitor, then the console operator | 4 | 2 | 1:25-1:45 | 1:50 |
| G | AI assistance (`ai-session`) | Everyone | ai (gated) | admin | 8 | 5 | 1:45-2:10 | 2:30 |
| M | TravelCRM Pro, end to end (`master`) | Everyone | cut | (all films) | about 175 | - | 45-55 min | - |

Total: **24 recorded films plus the hero, about 44 minutes of narration, about 50 to 55 minutes of film**, and 117 feature shorts. The AI session would add about 2 minutes. The master cut is about 45 to 55 minutes, because it drops the repeated logo sting and end card of every film but the first and last.

### 2.1 What each film shows

Every chapter, with the feature ids it maps, is in COVERAGE.md and in the clip files. In short:

- **hero:** logo, the landing headline, and eight short excerpts from the area films: enquiry, one click, itinerary builder, sending the quote, invoice and payment, vouchers, fleet, dashboard. Then a flow diagram and the "book a demo" end card. It reuses the area recordings, cut to their first 6 to 8 seconds (`maxLen`). It contains no calling and no driver scenes, so it renders even if those takes are missing.
- **platform-owner:** the handoff flow from `docs/HANDOFF-PLAYBOOK.md`, end to end:
  1. console sign-in, dashboard with safety flags, and the plan catalogue (prices, allowances, packs, costs);
  2. creating Skyline Holidays (India, Basic, GST) in the console wizard, and its welcome email from the outbox;
  3. the owner's first sign-in with the temporary password, the 12-character rule, onboarding (country settings already filled in, invoice prefix, logo) and a teammate invitation;
  4. the agency page (subscription, billing state, plan and caps, usage), feature switches per plan and per agency, the calling tab, the Email page, subscriptions;
  5. suspend with a reason, then reactivate; the support session dialog; audit log, system health and reports;
  6. an "Under the hood" diagram for the backend-only platform features.
- **plans:**
  1. the plan matrix from `docs/PRICING.md` section 2.6;
  2. India list prices and the founder-price rule (2.2), and users included (2.3);
  3. Basic: WhatsApp campaigns and website chat show an upgrade prompt, and inviting a sixth user hits the seat limit;
  4. the billing page with allowances (2.5) and the Buy more packs, then a mock checkout that issues a subscription invoice;
  5. Pro in the UK: WhatsApp campaigns open and calling is available, but chat still asks for Enterprise;
  6. Enterprise in the UAE: chat opens, and there is no calling in the Gulf.
- **role films:** one person's morning in their own session. They show what the role sees and does, and repeat a few features from the area films in that role's context. In the view-only film, the narration notes that the server refuses changes; the handoff spec verifies this.
- **driver:** the Flutter driver app on the Android emulator (`scripts/record-driver.ps1`): sign-in with a code, today's jobs, trip detail, accept, status updates, check-in with location, trip complete. A diagram then covers profile, history, languages and the Android build. Scenes are timed from `driver-marks.json` (`markText`).
- **area films:** a whole area each, one chapter per feature or group of small features, in the order a user would meet them. The narration of each scene names the small features it shows, for example duplicate warnings, consent records, lost reasons, bulk PDFs, quiet hours, recovery codes and the sessions list.
- **automations-calls:** the call recipes from `docs/CALL-AUTOMATION.md`, played by the simulator:
  - a missed call creates a call-back task and drafts a "sorry we missed you" message;
  - an unknown missed caller becomes a lead offer, and a voicemail becomes a listen task;
  - an answered call goes on the timeline, moves the lead to Contacted and suggests a follow-up;
  - a first-time caller who talks becomes a contact and lead offer;
  - the retry suggestion is named in the closing diagram.
- **international:** the UK agency (pounds, en-GB dates, VAT, +44 phone picker) and the UAE agency (dirhams), then Arabic right to left on the core screens, switched back to English. A diagram covers markets and exchange rates.
- **website:** the landing page, served locally with its API calls passed to the local stack:
  - hero and features, pricing from the live catalogue, and the no-tracking cookie notice;
  - the demo request form, submitted;
  - the legal pages.
  - It then shows the console's Website tab, where it queues a site, and the WordPress page.

### 2.2 The plan film matches PRICING.md

| Matrix row (PlanMatrix) | Basic | Pro | Enterprise | Source in docs/PRICING.md |
|---|---|---|---|---|
| Leads, contacts, quotes, invoices, fleet, visas | yes | yes | yes | 2.6 first row (fleet_management, visa_management, supplier_management ...) |
| Inbox: WhatsApp, email, SMS | yes | yes | yes | 2.6 bulk_whatsapp added to Basic, bulk_sms, bulk_email |
| Assistant and drafted replies | yes | yes | yes | 2.6 ai_assistant and ai_message_compose added to Basic |
| Calling (UK, US, Australia, Singapore) | yes | yes | yes | 2.6 voip_calling, only where offered; trial off (2.4) |
| AI lead capture, scoring, document scan | no | yes | yes | 2.6 ai_extraction, ai_lead_scoring, ai_ocr (Pro since 0015) |
| Business intelligence and advanced reports | no | yes | yes | 2.6 ai_intelligence moved to Pro; advanced_reports |
| WhatsApp campaigns | no | yes | yes | 2.6 whatsapp_campaigns moved to Pro |
| Website on your own domain | no | yes | yes | 2.6 custom_domain moved to Pro |
| Website chat widget | no | no | yes | 2.6 ai_chatbot Enterprise only |

Prices said in the film: India list prices of INR 14,999, 29,999 and 74,999 a year, with 5, 10 and 25 users. Agencies that sign before 2027-04-01 pay a founder price 20% lower. Other markets are billed in their own currency (2.1, 2.2, 2.3). The owner approved PRICING.md on 2026-10-21 (STATE.json `ownerDecisions.2026-10-21b`). If prices change, edit the `plans` and `title` scenes of `studio/clips/plans.json`. Only those lines are re-synthesised.

## 3. Feature coverage

`node docs/videos/coverage.mjs` (run on 2026-10-21):

- 353 features have status works or partial. **342 are in a film chapter**, **11 are not filmed** (each with a reason in `not-filmed.json`) and **0 are missing**. The check passes.
- 6 stub or removed features are never filmed: `driver.push`, `driver.distribution`, `sa.announcements`, `sa.support`, `sa.seo` and `sa.desktop-pages`.
- Backend-only features are shown through what they do on screen. Examples:
  - inbound webhooks show as a message arriving;
  - the cron jobs show as daily checks and reminders;
  - the seat limit shows as the sixth invite being refused.
- Where nothing can be seen, a feature is named in an "Under the hood" or "More" diagram that says plainly what is built and what is switched on at go-live. Examples are tenant isolation, encryption, rate limits, backups and deploy.

Not filmed, with the reason:

| Feature | Why not |
|---|---|
| `leads.kanban` | The leads page has no pipeline board in the current build; only Tasks uses the board component. features.json says a toggle exists, so the inventory needs correcting. |
| `inbox.plivo-inbound` | Plivo is not a launch provider (Twilio only, 2026-10-15). |
| `inbox.send-document`, `payments.link-invoice`, `ai.suggest-replies`, `ai.invoice-generate`, `ai.bi-forecast`, `marketing.suggestions` | API only: no screen uses them yet. |
| `marketing.legacy-campaigns` | Older duplicate of Marketing > Campaigns; the films show one way to run a campaign. |
| `notifications.push` | No app receives a push yet (the driver app has no push SDK). |
| `landing.reviews` | Written copy, not real customer quotes; not shown until verified. |

## 4. Live AI and real providers

**Owner rule: AI calls kept minimal.** No film except `ai-session` makes an AI request. The assistant film runs on the built-in rule reader, as the pilot did, so it spends nothing. The calls film uses a stored sample transcript.

Features that need **live AI** to show honestly are all in the gated `ai-session` film:

- `assistant.read-messages-ai` (the AI-tagged reading)
- `ai.lead-extraction`, `ai.compose`, `ai.itinerary` and `marketing.social`
- `ai.nl-search`, `ai.lead-score`, `ai.smart-followups`, `ai.insights`, `ai.bi-briefings` and `ai.bi-health-score`
- named in its closing diagram without running: `ai.ocr`, `calls.ai-summary`, `automation.calls.summarise`, `ai.bi-destinations`, `ai.bi-team` and `ai.bi-segments`

Proposal, not scheduled: one session of **at most 12 AI requests**, on a stack started with `fix-stack.mjs up --slot 2 --reset-db --ai` and `SHOWCASE_AI=1`. It needs the owner's yes first.

| Step | Requests |
|---|---|
| One WhatsApp message read (label + understand) | 2 |
| Lead from pasted text | 1 |
| Message composer | 1 |
| Itinerary generator | 1 |
| Social post | 1 |
| Ask your data | 1 |
| Lead-score recalculation | 1 |
| Smart follow-ups, insights, briefing, health score (pages that generate on open, about 1 each) | 4 |
| **Total** | **12** |

The spec counts the 6 POSTs and closes the take after a 7th. It logs every other AI call. The exact total is read from Settings > AI usage after the take. The take is never retried automatically. Earlier sessions cost about USD 0.0009 for 4 requests, so 12 requests cost well under one US cent. They also use AI credits on the demo agency. If the owner says no, the film is left out of the master, its AI-only features (`assistant.read-messages-ai` is also covered by the automations film) are simply not on camera. Coverage still passes, because it checks the clips, not the renders.

Features that need a **real provider** to show end to end. The films show what happens locally and keep the narration within that:

- Twilio for inbound SMS and WhatsApp, delivery receipts, live calls, numbers, sub-accounts, minutes and login codes. On camera these are the test inbound route, the call simulator and the mock voice provider.
- Meta for an agency's own WhatsApp number. The connect form is shown, but no Meta account is connected.
- SendGrid or Cloudflare Email for real delivery. The films show the local outbox.
- The agency's own Razorpay or Stripe account for invoice payment links. The pay-online card is shown, but no link is created, because no agency gateway runs locally.
- Platform Razorpay or Stripe for subscriptions. The films show the mock gateway, called the test gateway on camera.
- Oracle Cloud and WordPress for real agency sites. The site is queued only.
- Cloudflare for provisioning, backups and deploy. These are named in "Under the hood" only.

## 5. Shorts and the master cut

- **Shorts:** `node studio/src/build.mjs <film> --chapters` renders the film and then cuts one short per chapter. You can also run `node studio/src/shorts.mjs <film>` on an existing render.
  - Each short is the film's own logo sting, then the chapter, then the film's end card, re-encoded in one ffmpeg pass. It is about 10 to 40 seconds long.
  - The output goes to `studio/out/shorts/<film>/<nn>-<slug>.mp4` with a matching `.srt`, plus `index.json` listing each short's features.
  - Chapters marked `"short": false` (introductions, how-it-works diagrams, thank-you) are skipped. That gives 117 shorts across 24 films.
  - Use `--only=2,5` to cut some chapters and `--no-sting` to cut the bare chapter.
- **Master:** `node studio/src/master.mjs` joins the rendered films in the order of `studio/clips/master.json` into `studio/out/master.mp4`. It also writes `master.chapters.txt`, with one chapter per film plus each film's own chapters at least 10 seconds apart, and `master.srt`.
  - By default it re-encodes, dropping the repeated stings and end cards. That takes about 0.5 to 1 times the master's length on this CPU.
  - `--copy` joins the films as rendered in seconds.

## 6. Time budget on this PC (one at a time)

| Work | Estimate | Basis |
|---|---|---|
| Narration (Kokoro, CPU) for all 26 clips | about 35-45 min, once (cached by text hash) | about 1x real time, measured on the pilot; about 34 min of speech |
| Stack builds and seeds | single stack about 15 min; multi stack plus console about 20 min | fix-stack build plus seed-demo plus film-prep |
| Dry runs at `SHOWCASE_PACE=0.3` | about 25 min for all films, plus fixing selectors | specs are written against the code and have never run |
| Real takes | about 1.3x film length plus 1-2 min each: about 110 min for 24 takes | |
| Retakes (at most 2 per film) | allow 30-45 min | |
| Driver take (emulator) | about 15 min, plus the first Flutter build (up to 10 min) | record-driver.ps1 |
| Render | about 1.5x film length plus WebM to MP4 transcode: about 90-110 min in total | the pilot rendered 75 s in 115 s warm |
| Shorts | about 25 min for 117 shorts | one ffmpeg pass each |
| Master cut | about 30-45 min re-encode (or seconds with `--copy`) | |
| **Total** | **about 7 to 8 hours of machine time**, best split into 3 sessions: single stack, multi stack plus driver, render | |

## 7. Files

- Films: `studio/clips/<film>.json` (26 clips, plus `master.json`); specs in `desktop/e2e/showcase/films/<film>.spec.ts` (24).
- Recording kit: `desktop/e2e/showcase/films/film-kit.ts` and `desktop/e2e/showcase/films/playwright.films.config.ts`.
- Preparation and orchestration: `scripts/showcase/film-prep.mjs`, `scripts/showcase/console-up.mjs` and `scripts/showcase/record-films.mjs`.
- Studio: `studio/src/resolve.mjs` (new), `studio/src/shorts.mjs` (new), `studio/src/master.mjs` (new), `studio/src/build.mjs` (recordings, marks, `--resolve`, `--chapters`, chapters.json), `studio/src/kit/PhoneClip.tsx` (new `phone` scene) and `studio/src/ff.mjs` (`probeSize`).
- Catalogue data: `docs/videos/films.json`, `docs/videos/not-filmed.json`, `docs/videos/coverage.mjs` and `docs/videos/COVERAGE.md`.

## 8. Open questions

1. **AI session:** yes or no to one session of at most 12 requests (section 4)?
2. **Calling on an Indian demo agency:** the calls films run on Sahyadri Holidays, with a card saying calling is offered in the UK, US, Australia and Singapore and that the calls are simulated. Is that acceptable, or should the calls films be recorded on the UK agency on the multi stack? That would need demo data for Thames & Tide.
3. **Driver app:** `packages/driver_app/integration_test/demo_flow_test.dart` must call `chooseAgency(tester)` (from `integration_test/helpers/agency_login.dart`, agency code `demo`) before it waits for `phone-field`. That fix is outside this step's write area. Until it lands, the `driver` film can be rendered from the 2026-10-04 recording in `desktop/showcase/.work/driver.mp4`. It resolves today, but shows the older app with no agency-code screen.
4. **Landing domain:** the landing page still shows the placeholder domain `YOUR-DOMAIN.example` in a few places. The website film avoids the footer. Re-record it once the domain is decided.
5. **Pricing on screen:** the plans film says India list prices and the founder rule. Should it also show UK and US prices?
