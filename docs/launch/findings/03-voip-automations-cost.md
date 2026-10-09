<!-- Read-only explorer report, 2026-10-09, transcribed by the orchestrator (the explorer's transcript file was empty). Static reading only; nothing was built, run or called. Another session edited `routes/voip-callbacks.ts`, `services/missed-call-handler.ts`, `services/automation/recipes.ts` and added `test/voip-callbacks.test.ts` at about 04:20 on 2026-10-09, AFTER this report was written, so re-verify every VoIP line before relying on it. -->

# TravelCRM Pro: VoIP, call automations and cost drivers — state as read on 2026-10-09

## Findings that change the advice

1. **No media path exists in any client.** No softphone/WebRTC SDK in `desktop/package.json` or any Flutter `pubspec.yaml`. Inbound calls dial a `<Client>` identity that nothing registers; outbound calls have no agent leg.
2. **The provider abstraction is real but thin.** `VoipProvider` in `backend/src/services/voip-provider.ts:102-134` has Twilio and Plivo implementations. Plivo outbound is broken as coded, so switching provider is cheap on the backend today.
3. **Only one call event feeds the automation engine: `call.missed`.** No call started / ringing / answered / ended / recording-ready / transcript-ready event.
4. **Transcription and AI call summary have a consumer but no producer.** Nothing enqueues `transcribe_call` or `transcribe_voicemail`, and `AI_EXTRACTION_QUEUE` is not bound in `wrangler.toml`.
5. **Oracle Cloud is WordPress hosting, not a PBX.** The FreeSWITCH + Whisper design exists only in `product-requirment/PRICING-cost-model-v3-final.md`.
6. **DB-per-tenant is not wired.** `wrangler.toml` binds only `MASTER_DB`; `tenantDbFor` falls back to it (`backend/src/services/tenant-db.ts:43-51`). VoIP callbacks used `MASTER_DB` directly.
7. **VoIP webhooks are unauthenticated.** The signature middleware is applied only to the message webhooks.
8. **Legacy call code references columns that are in no migration** (inbound routing, missed-call handling, AI follow-ups).

## Part A: VoIP as implemented

### A1. Files

- Backend routes: `routes/voip.ts`, `voip-callbacks.ts`, `calls.ts`, `transcripts.ts`, `ai-extractions.ts`, `inbound.ts`, `integrations.ts`, `chatbot.ts`, `driver.ts` (Twilio Verify), `auth.ts` (OTP).
- Backend services: `services/voip-provider.ts`, `twilio-voice.ts`, `plivo-voice.ts`, `twilio-messaging.ts`, `plivo-messaging.ts`, `twilio.ts`, `deepgram.ts`, `call-routing.ts`, `missed-call-handler.ts`, `ai-extraction.ts`.
- Other backend: `middleware/twilio-webhook.ts`, `middleware/feature-gate.ts`, `queues/ai-extraction-queue.ts`, `queues/sms-queue.ts`, `queues/campaign-queue.ts`.
- Migrations: `drizzle/tenant/0017_voip_call_logs.sql`, `0018_voip_enhancements.sql`, `0019_ai_call_intelligence.sql`, `0024_voip_provider_abstraction.sql`, `drizzle/master/0008_tenant_caps_ai_voip.sql`, `0010_tenant_channel_addresses.sql`.
- Desktop: `app/(app)/communication/calls/{page,dial/page,[id]/page,analytics/page,transcripts/page}.tsx`; `app/(app)/settings/{voip,phone-numbers,integrations}/page.tsx`; `components/domain/{call-controls-panel,click-to-call-button,call-transcript-panel}.tsx`; `lib/api/voip.ts`.
- Flutter: `packages/crm_app/lib/features/calls/**`, `packages/shared/lib/models/{call_log,twilio_number,voip_number,voip_settings}_model.dart`.
- Terraform: Twilio/Plivo/Deepgram variables only. `oci-provisioner/`: no VoIP.
- Product docs: `product-requirment/PRD.md`, `milestones.md` (M21, M22), `PRICING-cost-model*.md`, `M17-`/`M19-implementation-plan.md`, Jira ticket files.

### A2. What is coded

**Providers.** Twilio and Plivo, chosen per tenant by `voip_settings.voip_provider`, default `twilio` (`voip-provider.ts:185-202`). No Exotel, Knowlarity, Ozonetel, Telnyx, Vonage, SIP, FreeSWITCH, Asterisk, Jambonz or LiveKit code.

**Credentials.**
- Voice is per-tenant: `voip_settings.provider_*` / `twilio_*` columns, plaintext, masked on read (`routes/voip.ts:102-105`).
- Twilio voice falls back to platform `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` when tenant fields are empty (`twilio-voice.ts:67-71`).
- SMS, WhatsApp and OTP are platform-keyed only (`twilio-messaging.ts:59-76`, `twilio.ts:10-17`).
- The desktop settings form exposes provider, account id, auth token and caller id, but not the API key SID/secret or TwiML App SID that `generateClientToken` requires (`twilio-voice.ts:194-196`).

**Outbound click-to-call.**
1. `ClickToCallButton` navigates to the dial page with `phone`, `contactId`, `leadId` (`click-to-call-button.tsx:40-43`).
2. The dial page reads only `phone` (`dial/page.tsx:45-47`) and never sends `leadId` (`:77`), so calls started from a lead are not linked to it.
3. `POST /calls/outbound` (`routes/calls.ts:446-518`) requires `defaultCallerId`, inserts `call_logs` as `initiated`, then calls `provider.initiateCall`.
4. Twilio: `From` = tenant caller id, `To` = customer, `Url` = `/twiml/outbound` (`twilio-voice.ts:81-90`), which returns `<Dial><Number>{To}</Number></Dial>` with the same `To` (`voip-callbacks.ts:221-231`). The agent is never dialled or bridged.
5. Plivo: `answer_url` is `/xml/outbound` (`plivo-voice.ts:47`), a route that does not exist.
6. The UI only toasts "Calling…". `CallControlsPanel` is not mounted anywhere; its mute/hold buttons are local state (`call-controls-panel.tsx:83-94`).

**Inbound.** `POST /voip/twiml/inbound` (`voip-callbacks.ts:246-327`):
- Settings load from `MASTER_DB` (`:253-254`); the called number is not used to pick a tenant.
- Inserts `call_logs` with `created_by='system'` (`:267-271`), though the column is `NOT NULL REFERENCES users(id)` and nothing creates a `system` user.
- Order: business hours → voicemail; IVR → DTMF `<Gather>`; otherwise `resolveInboundRouting`.
- Agent target is `<Dial><Client>user_{userId}</Client></Dial>`; the token endpoint issues identity `userId` with no `user_` prefix (`twilio-voice.ts:209`, `routes/voip.ts:256`).
- The `<Dial>` has no `action`, so `/twiml/dial-status` (no-answer → voicemail, `:424-453`) is never reached.

**Routing** (`call-routing.ts`):
- Contact match uses `phone`, `mobile`, `work_phone` on the last 10 digits (`:38-47`); `mobile` and `work_phone` are in no migration.
- Lead match uses `leads.phone` (`:57-64`), also in no migration, and runs only when no contact matched, so a known contact's open lead is never attached.
- Fallback handles only `round_robin` and `least_recent` (`:95-123`); the default stored value is `assigned`, so an unknown caller goes to voicemail.

**Screen pop.** None. `GET /voip/caller-info` exists (`routes/voip.ts:270-328`) but the desktop client sends `number` where the backend expects `phone` (`lib/api/voip.ts:242`), nothing calls it, and no call event is broadcast over the realtime socket.

**Call logging.** `call_logs` rows; status and duration from `/status-callback` (`voip-callbacks.ts:84-179`). Calls are not written to `lead_activities`, and contact/lead timeline routes never read `call_logs`.

**Recording.** The callback stores the provider URL plus `.mp3` (`voip-callbacks.ts:183-217`). `recording_r2_key`, `recording_storage_bytes`, `recording_retention_days` are never written or enforced. Recordings stay at the provider.

**Transcription and AI summary.**
- Deepgram `nova-2` batch by URL (`deepgram.ts:46-84`). No Whisper, no Workers AI speech, no live streaming.
- Summary/extraction is one direct Anthropic call with `claude-haiku-4-5-20251001` (`ai-extraction.ts:109-122`), no Workers AI fallback.
- Consumer is `queues/ai-extraction-queue.ts:26-81`; no code sends the first message.
- `GET /calls/:id/actions` advertises `transcribe` (`routes/calls.ts:614`) but no endpoint performs it.

**IVR.** Single-level DTMF menu with actions `extension`, `voicemail`, `queue` (`voip-callbacks.ts:331-420`). `queue` re-runs routing. No real queues, ring groups, simultaneous ring, hold music or position announcements.

**Numbers.**
- Search covers Twilio `Local` numbers only (`twilio-voice.ts:145-161`). Purchase sets VoiceUrl and StatusCallback (`:163-185`).
- `DELETE /voip/numbers/:id` removes only the DB row and never calls `releaseNumber` (`routes/voip.ts:495-523`), so the provider keeps billing.
- Purchase does not register the number in `tenant_channel_addresses`, which maps a called number to a tenant (`voip-callbacks.ts:71-82`).

**Webhook signatures.** `twilioWebhookMiddleware` is used only at `routes/inbound.ts:118,149`. Every `/voip/*` callback is public with `cors({origin:'*'})` (`voip-callbacks.ts:26`). The middleware validates against platform tokens. `validateWebhookSignature` on the providers is never called.

**Usage cap.** `voip_minutes_per_month` is incremented only when an agent saves an outcome (`routes/calls.ts:411-423`) and is never checked.

### A3. Oracle Cloud and `oci-provisioner`

- `terraform/modules/oracle-cloud/main.tf:102-134`: one `VM.Standard.A1.Flex`, 4 OCPU, 24 GB RAM, 200 GB boot volume, `ap-mumbai-1`, named `travelcrm-wordpress`. Security list opens TCP 22/80/443 and ICMP only (`:47-85`).
- `cloud-init.yaml` installs Docker, Caddy, WP-CLI and pulls `wordpress` + `mariadb`.
- `oci-provisioner/src/server.ts`: Express on port 9090, one WordPress + MariaDB pair per tenant (512 MB + 256 MB limits, `MAX_SITES` default 50) behind Caddy.
- Runtime link to the backend: none. `backend/src/queues/wp-provision-queue.ts:25-41` is a logging stub.

### A4. What the product docs say VoIP should be

- `milestones.md:741-785` (M21): Twilio Voice + Twilio Client SDK; click-to-call; IVR; smart routing; caller-ID popup; missed-call lead; voicemail; recordings in R2; calls in the timeline; multi-number.
- `milestones.md:787-830` (M22): Deepgram live streaming plus batch; diarization; Claude extraction; summary within 30 seconds; voicemail transcription.
- `PRICING-cost-model-v3-final.md:6-117, 405-455`: a later decision for self-hosted FreeSWITCH (`mod_verto`) on the Oracle free-tier VM, Twilio Elastic SIP Trunk, Faster-Whisper post-call, Deepgram streaming for Enterprise only. None implemented.
- Markets in the PRD: India first, then UAE / Middle East (`PRD.md:69-74, 109-110`).

## Part B: automations

### Event model

`emitEvent` writes a `domain_events` row, then runs the recipes subscribed to that type (`backend/src/services/automation/events.ts:27-68`).

| Event | Emitted at |
|---|---|
| `message.received` | `services/inbound/ingest.ts:221-227`, `routes/assistant.ts:187` |
| `message.sent` | `routes/communications.ts:153` |
| `lead.created` | `services/domain/leads.ts:120` |
| `lead.status_changed` | `routes/leads.ts:792` |
| `itinerary.sent` | `routes/itineraries.ts:843` |
| `invoice.created` | `routes/invoices.ts:358,1040` |
| `payment.recorded` | `routes/payments.ts:182` |
| `trip.completed` | `routes/driver.ts:601` |
| `call.missed` | `routes/voip-callbacks.ts:165` |
| `schedule.tick` | `services/automation/schedule.ts:25`, `routes/automations.ts:122` |

### Shipped recipes (24, `services/automation/recipes.ts`, list at `:1341-1366`)

"Auto" = default mode runs without a click; only low-risk, non-client actions can ever run that way (`engine.ts:230`).

| Key | Trigger | Action | Default |
|---|---|---|---|
| `inbox.read_messages` (AI) | message.received | create lead / update lead / mark won / record payment / draft reply | click |
| `inbox.reply_after_capture` | lead.created | draft_reply | click |
| `leads.first_follow_up` | lead.created | create_follow_up (+24 h) | auto |
| `itineraries.suggest_template` | lead.created | create_itinerary_from_template | click |
| `leads.quote_sent_status` | message.sent, itinerary.sent | advance to proposal_sent | auto |
| `leads.follow_up_after_quote` | same | create_follow_up (+2 d) | auto |
| `invoices.from_confirmed_booking` | lead won | create_invoice_from_itinerary | click |
| `tasks.booking_checklist` | lead won | 4 × create_task | auto |
| `payments.from_message` | invoice.created | record_payment | click |
| `vouchers.after_payment` | payment.recorded | create_vouchers | click |
| `leads.won_on_payment` | payment.recorded | mark_lead_won | click |
| `leads.stale_quote_nudge` | schedule.tick | draft_reply | click |
| `invoices.overdue_reminder` | schedule.tick | draft_reply | click |
| `calls.missed_callback` | call.missed | create_task (high, due today, routed agent) | auto |
| `fleet.trip_feedback` | trip.completed | draft_reply | click |
| `leads.contacted_on_reply` | message.sent | advance to contacted | auto |
| `inbox.unanswered_message` | schedule.tick | create_task | auto |
| `itineraries.quote_expiring` | schedule.tick | draft_reply | click |
| `payments.thank_you` | payment.recorded | draft_reply | click |
| `payments.balance_before_travel` | schedule.tick | draft_reply | click |
| `travellers.collect_details` | lead won | draft_reply | click |
| `marketing.post_trip_review` | schedule.tick | draft_reply | click |
| `marketing.dormant_win_back` | schedule.tick | draft_reply | click |
| `rate_cards.expiry_task` | schedule.tick | create_task | auto |

`draft_reply` is client-handled (`actions.ts:459-476`), so a person always sends the message.

### What happens on a call today, as coded

**(i) Inbound, unknown number.** One `call_logs` row (inbound, ringing), dependent on a `system` user existing. Routing query references absent columns; with the default `assigned` strategy the caller goes to voicemail. No automation, no AI. Agent sees nothing live. Not wired: tenant resolution from the called number, ringing a client, screen pop, voicemail transcription.

**(ii) Inbound, known contact with an open lead.** `call_logs` gets `contact_id` and `routed_to` (`voip-callbacks.ts:300-311`); `lead_id` stays null. Markup dials `user_{assignedTo}`; no client is registered. No automation, no AI, no pop-up, no timeline entry.

**(iii) Missed call** (status callback `no-answer` / `busy` / `canceled` on an inbound row, `voip-callbacks.ts:138-173`).
- `handleMissedCall` (`services/missed-call-handler.ts`) inserts notifications using columns `body` and `data` (`:40-49, 74-83`) that the `notifications` table does not have; push goes via `NOTIFICATION_QUEUE`, which is unbound (`:52`); for unknown callers it raw-inserts a contact and a lead with a 24 h dedupe (`:96-146`), using `leads.phone` (absent) and emitting no `lead.created`.
- Then `call.missed` is emitted and `calls.missed_callback` auto-creates a "Call back X" task: rows in `tasks`, `assistant_suggestions` (status `auto_applied`), `automation_runs`; broadcast `assistant:suggestion`; the agent sees the task and the run in the Assistant activity list with undo.
- The whole block shares one try/catch (`:128-176`); if `handleMissedCall` throws, `call.missed` is never emitted. No backend test covered any VoIP callback at the time of reading.

**(iv) Call ends; recording available.** `call_logs.status`, `duration_seconds`, `recording_url`, `recording_duration` updated. Nothing else: no event, no R2 copy, no transcript, no summary. When an agent saves an outcome via `PUT /calls/:id` (`routes/calls.ts:355-409`), hard-coded logic runs (new lead → contacted; `not_interested` → lost; `follow_up_needed` → follow-up at 10:00 tomorrow), bypassing the engine and emitting no `lead.status_changed`. Only the creator or an admin may save (`:336-339`), and inbound rows are created by `system`. If the pipeline were fed it would run Deepgram nova-2, then Claude Haiku 4.5, then write `ai_call_extractions` and follow-ups; that insert uses `due_date` and `assigned_to` (`ai-extraction-queue.ts:358-371`), which are not in the schema.

**(v) Outbound call.** `call_logs` (outbound, initiated, then provider id) and `activity_logs`. No automation, no AI. The agent sees a toast, then the row in the list. No in-call panel, no audio.

### Guard rails

- **Pause switch:** `settings.automations_paused` (`engine.ts:145-157`, `routes/automations.ts:65-75`).
- **Per-recipe mode:** off / suggest / auto; only an admin can set auto (`routes/automations.ts:88-92`).
- **Dedupe:** unique `dedupe_key` with `INSERT OR IGNORE` (`engine.ts:212-261`); bursts from one sender merge; inbound messages dedupe on provider `external_id` (`ingest.ts:95-103`, check-then-insert, no unique index); `schedule.tick` once per tenant-local day (`schedule.ts:19-25`); apply claims by status transition (`engine.ts:337-341`). VoIP callbacks have no idempotency handling.
- **Loop prevention:** `MAX_AUTOMATION_DEPTH = 3` (`engine.ts:20`); depth travels in `X-Automation-Depth`, honoured only for the internal host (`events.ts:71-79`).
- **Failure handling:** a failed auto run becomes a pending suggestion (`engine.ts:290-296`); auto runs act as an admin; with no active admin they stay pending (`:271-277`).
- **Rate limits:** auth endpoints via KV (`routes/auth.ts:105,254,300,546`); web form 100/hour per API key (`routes/inbound.ts:301-306`); `apiRateLimit` defined but never applied; provider webhooks unlimited.
- **AI credits** (`services/ai-credits.ts`, `ai-pricing.ts`): weights read 1, understand 5, scan 15, create 60; monthly allowance trial 2000, starter/basic 1000, pro 15000, enterprise 25000; checked before the call, charged on success (`ai-router.ts:142-149`). One inbound message costs up to 6 credits (triage on `llama-3.1-8b-instruct-fp8-fast`, understand on `llama-3.3-70b-instruct-fp8-fast`).
- **Out of credits / AI unavailable:** message analysis falls back to deterministic rules (`message-analysis.ts:344-348, 421-426`); direct AI routes return 429 `AI_QUOTA_EXCEEDED` or 503 `AI_UNAVAILABLE`.
- **Not metered:** call extraction calls Anthropic directly; it logs usage but consumes no credits.
- **Cap-reset bug:** the cron fires every 5 minutes and calls `resetUsageCaps('daily')` on every tick; on the 1st of the month it also resets monthly caps on every tick (`backend/src/index.ts:373-390`).

## Part C: infrastructure and cost drivers

### C1. Cloudflare bindings (`backend/wrangler.toml`)

Worker `travelcrm-api` (`nodejs_compat`); D1 `MASTER_DB` only, with `migrations_dir = "drizzle/tenant"`; R2 `FILE_STORAGE`; KV `CACHE`, `SESSIONS`, `REPORT_CACHE`; 7 consumed queues (email, sms, push, wp-provision, import, export, campaign) + 3 DLQs; cron `*/5 * * * *`; Workers AI `AI`; Durable Object `REALTIME` → `RealtimeRoom`, one per tenant.

- Not present: Vectorize, Analytics Engine, Email, Images, Browser Rendering, Hyperdrive.
- Declared in `types.ts:24-26,60` but not bound: `AI_EXTRACTION_QUEUE`, `AI_EXTRACTION_DLQ`, `NOTIFICATION_QUEUE`, `TENANT_DB_*`.
- `[env.dev|staging|production]` set only `name` (`:137-146`); CI runs `deploy --env production`. Wrangler does not inherit bindings into named environments.
- Workers AI models (`ai-router.ts:77-85`): `llama-3.1-70b-instruct` (default text), `llama-3.2-11b-vision-instruct`, `llama-3.1-8b-instruct-fp8-fast` (triage), `llama-3.3-70b-instruct-fp8-fast` (JSON). Anthropic: `claude-haiku-4-5-20251001`.

### C2. External paid services

| Service | Used for | Where | Keyed |
|---|---|---|---|
| Twilio Voice | calls, numbers, recording | `services/twilio-voice.ts` | tenant, platform fallback |
| Plivo Voice | same | `services/plivo-voice.ts` | tenant |
| Twilio Messaging | SMS, WhatsApp, campaigns, chatbot | `services/twilio-messaging.ts`, `queues/campaign-queue.ts`, `routes/chatbot.ts:490` | platform |
| Twilio Verify | OTP for CRM and driver login | `services/twilio.ts`, `routes/driver.ts` | platform |
| Plivo Messaging | alternative SMS/WhatsApp | `services/plivo-messaging.ts` | platform |
| SendGrid | outbound email, Inbound Parse | `services/sendgrid.ts`, `services/email.ts`, `routes/inbound.ts:195` | platform |
| Deepgram | call transcription (dormant) | `services/deepgram.ts` | platform |
| Anthropic | AI router, call extraction | `services/ai-router.ts:314`, `services/ai-extraction.ts:109` | platform |
| Google Maps | address autocomplete, trip cost | `desktop/src/components/ui/address-autocomplete.tsx`, `services/trip-cost-calculator.ts` | platform |
| FCM (legacy endpoint) | push | `services/fcm.ts:19` | platform |
| Cloudflare REST API | create tenant D1, usage queries | `super-admin/src/app/api/tenants/provision/route.ts:76-103` | platform |
| Razorpay | webhook receiver only | `super-admin/src/app/api/webhooks/razorpay/route.ts` | platform |
| Oracle Cloud | WordPress VM | terraform | platform |

No Meta WhatsApp Cloud API, Stripe, OpenAI or Sentry code. `open.er-api.com` (exchange rates) is free.

### C3. Usage patterns

- **Request hot path:** JWT verify, one KV read for tenant info (5-minute TTL; one master D1 read on a miss) (`tenant-db.ts:16-36`). VoIP/calls routes add 1–2 master D1 reads for the feature gate; `/ai/*` adds 2–3.
- **Desktop polling:** WebSocket is primary. Fallbacks only while disconnected: suggestions every 15 s per mounted panel (`hooks/use-suggestions.ts:54`), sidebar every 90 s, notifications every 5 min. Always on: WS ping every 30 s, active trip page every 10 s, campaign page every 30 s, import/export every 3 s, active call every 3 s.
- **Driver app:** no periodic location pings; GPS at check-in, check-out and status change; trips list refresh every 60 s (`my_trips_screen.dart:49`).
- **Realtime Durable Object:** one DO request per broadcast and one extra per notified user. `RealtimeRoom` calls `state.acceptWebSocket` but keeps sessions in an in-memory map with `addEventListener` handlers (`durable-objects/realtime.ts:82-110`); check whether broadcasts survive hibernation.
- **Cron:** 288 ticks per day. `runScheduledAutomations` loops over every active tenant sequentially, about 2 D1 queries each per tick (linear in tenant count inside one invocation). Several other handlers look like no-ops: they query a `workspaces` table that is in no migration (`services/follow-up-reminders.ts:24`, `cron/auto-reminders.ts:12`) or use `env.DB` (`cron/overdue-tasks.ts:12`, `cron/campaign-scheduler.ts:40`).
- **Per inbound message:** estimated 30–40 D1 statements, 2–4 DO requests, up to 2 Workers AI calls (from reading `ingest.ts` and `recipes.ts:152-336`).
- **Storage growth:** R2 holds documents, visa files, driver photos, flyers, imports, exports. Recordings are not in R2. PDFs are generated client-side with `jspdf`.

### C4. Hosting

- **Desktop:** Next `output: 'standalone'` packaged inside Electron; `electron/main.ts:40-46` loads `.next/server/app/index.html`, falling back to `http://localhost:3000`; nothing starts a Next server.
- **Super admin:** Cloudflare Pages; CI and Terraform use `@cloudflare/next-on-pages`, code and `package.json` use `@opennextjs/cloudflare`.
- **Landing:** static `index.html` / `main.js` / `styles.css`; no deploy workflow or Terraform resource.

### C5. D1 per tenant

- Runtime access is binding-only: `TENANT_DB_<d1DatabaseId>` or `TENANT_DB_<tenantId>`; bindings are static per deploy and none are declared.
- Provisioning creates a D1 over REST and stores its id; it adds no binding, runs no migrations and does not redeploy.
- Lookup conventions disagree: `env[d1_database_id]` (`queues/whatsapp-campaign-queue.ts:31`), `TENANT_DB_${job.contactId}` (`queues/sms-queue.ts:58`), `workspaces.db_binding` (cron), `env.DB` (cron).
- At hundreds of tenants the design needs per-tenant bindings with a redeploy per signup, the D1 REST API, or a shared DB with `tenant_id`. Check the current per-account D1 database limit and per-Worker binding limit before choosing.

## Cost drivers, ranked (billable units only; no vendor prices assumed)

Assumptions from `README.md:630-656`: a small agency has 5 users, about 200 leads, 100 SMS, 200 WhatsApp, 500 emails, 120 call minutes a month.

| Rank | Driver | Billable units | 10 agencies | 100 | 1000 |
|---|---|---|---|---|---|
| 1 | Telephony | PSTN minutes per leg, number rental, recording storage | ~1.2k min | ~12k min, 100+ numbers | ~120k min; CPaaS vs SIP trunk dominates |
| 2 | WhatsApp / SMS | per message plus template/conversation fees, all on the platform account | ~3k msgs | ~30k | ~300k; campaigns multiply this |
| 3 | OTP | per verification (CRM and driver logins) | low | moderate | significant, with pumping risk |
| 4 | LLM | Anthropic tokens; Workers AI neurons (2 calls per inbound message) | within allowance | pro tenants at 15k credits each | needs working caps; the reset bug removes the ceiling |
| 5 | Transcription | audio minutes | 0 today | ~6k min if enabled | ~60k min |
| 6 | Email | plan tier by monthly volume | ~5k | ~50k | ~500k |
| 7 | Workers + D1 | requests, CPU ms, rows read/written, storage | within base plan | cron loop and inbound fan-out show up | cron is O(tenants) per 5 minutes |
| 8 | Durable Objects | requests, connected duration | negligible | small | depends on hibernation working |
| 9 | R2 / KV / Queues | GB-months, operations | negligible | small | grows if recordings move to R2 (~0.5 MB per minute per the v3 doc) |
| 10 | Google Maps | Places and distance requests | negligible | small | moderate |
| 11 | Oracle VM | instance and volume (free tier) | 0 | 0, up to 50 sites per VM | several VMs or paid shapes |

## Gaps against a production-grade call flow

1. No softphone or media path; the token endpoint cannot work from UI-entered settings; client identities do not match.
2. Outbound has no agent leg; Plivo's answer URL has no route.
3. Call webhooks have no signature check and no tenant resolution.
4. Schema drift: `contacts.mobile`, `contacts.work_phone`, `leads.phone`, `leads.pax`, `notifications.body`, `notifications.data`, `follow_ups.due_date`, `follow_ups.assigned_to`, `created_by='system'`.
5. No screen pop: no ringing event, no realtime broadcast, parameter mismatch on caller-info.
6. Calls absent from contact and lead timelines; inbound calls never attach an existing contact's lead.
7. No call lifecycle events for the automation engine; outcome handling is hard-coded and emits nothing.
8. Missed-call detection relies on the parent call status with no `<Dial action>`; check against provider behaviour.
9. Transcription has no producer and no queue binding; extraction is unmetered and Anthropic-only.
10. Recordings are not copied to R2; no retention, access control or consent announcement.
11. No queues, ring groups, simultaneous ring, agent presence, warm transfer or working hold.
12. Number lifecycle: delete does not release, purchase does not register for routing, only local numbers searchable.
13. VoIP minute caps not enforced; usage-cap resets fire every 5 minutes.
14. No tests for VoIP callbacks or `call.missed` (at time of reading).
15. Provider tokens stored in plaintext in D1.
16. Multi-tenant D1 binding not wired, which blocks correct per-tenant call data.
