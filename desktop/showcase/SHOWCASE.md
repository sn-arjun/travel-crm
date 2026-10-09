# TravelCRM Pro — client demo videos

Recorded 2026-10-07 (story, 20:44 IST) and 2026-10-07/08 (walkthrough) · 1920×1080 · 30 fps · H.264 + silent AAC · company: Sahyadri Holidays (demo data).

| Video | File | Duration | Size |
|---|---|---|---|
| Story cut, "A day at Sahyadri Holidays" | [TravelCRM-Demo.mp4](./TravelCRM-Demo.mp4) | 10:20 (620.5 s) | 59.1 MB |
| Full walkthrough, every feature area | [TravelCRM-Full-Walkthrough.mp4](./TravelCRM-Full-Walkthrough.mp4) | 29:53 (1793 s) | 176.7 MB |
| Assistant and automations, "From a WhatsApp message to a booked trip" (recorded 2026-10-08, 22:00 IST) | [TravelCRM-Assistant.mp4](./TravelCRM-Assistant.mp4) | 3:22 (202.6 s) | 32.7 MB |

Both pass the finalize gate (`desktop/e2e/showcase/finalize.ts`: banned strings, console errors, HTTP errors, validation UI, durations, white/black flashes).
The driver-app clip (scene 7 / chapter 21) is a real run of the Flutter driver app on the Android emulator against the same backend, 81 s in the story.

## Story chapters (`story-chapters.txt`)

```
00:00 Introduction
00:05 A new enquiry arrives
00:33 Capture and qualify the lead
02:07 Build the itinerary
03:29 Send the quote
04:12 Priya says yes
06:24 Same day: an airport pickup
07:42 On the road with Ravi
09:06 Back at the office
09:39 The day at a glance
10:14 Thank you
```

## Assistant chapters (`assistant-chapters.txt`)

```
00:00 Introduction
00:05 An enquiry arrives
00:37 One click
00:55 Itinerary and reply
01:25 The quote goes out
01:58 The customer says yes
02:39 You stay in control
03:16 Thank you
```

Nothing in this video is staged. Two WhatsApp messages are delivered through the test-mode simulator (`POST /test/inbound`, the same code path as a provider webhook); the contact, lead, follow-ups, itinerary, quote, status changes, checklist tasks, invoice, payment and vouchers are all created on camera by the assistant's suggestions and the automations.

## Full walkthrough chapters (`chapters.txt`)

```
00:00 Introduction
00:05 Sign in & workspace
00:37 Dashboard
01:10 Contacts
02:24 Leads & pipeline
04:17 Accounts
04:28 Itineraries
05:34 Itinerary templates
06:33 Rate cards
07:26 Suppliers & rate comparison
08:24 Invoices
09:23 Payments
09:55 Credit & debit notes
10:32 Vouchers
11:15 Travellers
11:55 Visa
12:41 Fleet — vehicles
13:41 Fleet — drivers
14:19 Fleet — trips
15:55 Fleet — rate cards
16:27 Fleet — dashboard & alerts
16:44 Driver app
17:52 Tasks
18:55 Calendar
19:28 Follow-ups
20:22 Documents
20:52 Inbox & bulk send
21:28 Message templates
22:08 Calls & VoIP
22:28 Chatbot
22:41 Marketing dashboard
22:50 Campaigns
23:33 Segments
24:08 Flyers & branding
24:48 Festival offers
25:00 Opted-out contacts
25:10 WhatsApp campaigns
25:17 AI assistant
26:28 Reports
27:03 Import & export
27:43 Notifications
28:02 Settings — company
28:34 Settings — team
29:04 Integrations & webhooks
29:14 Super admin
29:30 Help & bookmarks
29:46 Thank you
```

## Regenerate

Stack (production build, never `next dev`): `cd desktop && node scripts/fix-stack.mjs up --slot 2 --reset-db`, then from the repo root:

```bash
# everything except the AI chapter (reuses an existing wtai recording)
SHOWCASE_IGNORE_WINDOW=1 DEMO_PICKUP=14:45 node scripts/record-demo.mjs --slot 2        # window flags only needed outside 08:00-20:30 IST
# the AI chapter (37) separately: it spends REAL Workers AI requests (billed), so it is never run by default and never retried automatically
cd desktop && node scripts/fix-stack.mjs up --slot 2 --reset-db --ai --no-build          # remote [ai] binding; check GET /api/v1/ai/settings/provider -> available:true
cd .. && node --no-warnings backend/scripts/seed-demo.mjs
node scripts/record-demo.mjs --slot 2 --only walkthrough --parts wtai --ai
# then restart the stack without --ai and: node scripts/record-demo.mjs --slot 2 --only compose && node scripts/record-demo.mjs --slot 2 --only finalize
```
Details and one-part retakes: `README-RECORDING.md`.

The assistant video is its own part (`desktop/e2e/showcase/assistant.spec.ts`) and is composed on its own:

```bash
# 1. dry run on the built-in rules, no AI spend (do this after ANY change to the app or the script)
cd desktop && node scripts/fix-stack.mjs up --slot 2 --reset-db
cd .. && E2E_API_URL=http://localhost:8807/api/v1 node --no-warnings backend/scripts/seed-demo.mjs
cd desktop && E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1 SHOWCASE_PACE=0.3 npx playwright test --config=playwright.showcase.config.ts --grep "assistant:"
# 2. the real take: live Workers AI, 4 billed requests (2 per incoming message), never retried automatically
node scripts/fix-stack.mjs up --slot 2 --reset-db --ai --no-build
cd .. && E2E_API_URL=http://localhost:8807/api/v1 node --no-warnings backend/scripts/seed-demo.mjs
cd desktop && E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1 SHOWCASE_AI=1 npx playwright test --config=playwright.showcase.config.ts --grep "assistant:"
# 3. compose and gate
cd .. && E2E_BASE_URL=http://localhost:3120 node --no-warnings scripts/showcase/compose.mjs full --parts assistant --out desktop/showcase/TravelCRM-Assistant.mp4 --chapters desktop/showcase/assistant-chapters.txt --intro-tagline "The assistant: from a WhatsApp message to a booked trip" --outro-line "Automations and AI assistance, built into every screen"
node --no-warnings desktop/e2e/showcase/finalize.ts --name assistant --video desktop/showcase/TravelCRM-Assistant.mp4 --frames-dir desktop/showcase/.work/frames/assistant --duration 150-300 --min-chapter 10 --violations desktop/showcase/.work/violations-assistant.json
cd desktop && node scripts/fix-stack.mjs down --slot 2   # do not leave a stack with the AI binding running
```

## Notes

- **AI chapter (37) uses the live Cloudflare Workers AI binding** (`@cf/meta/llama-3.1-70b-instruct`). `--ai` is required to reproduce it; without it the part still runs (set no `SHOWCASE_AI`) and shows the app's own "AI is not configured yet" notice. It makes 3 AI requests per take: lead extraction, message composer, lead-score recalculation. Opening the lead-score page itself shows the stored score. Total spent for these videos: 7 requests (take 1: extraction, composer, recalculation and the BI team page; take 2: extraction, composer, recalculation). No other part and not the story touches AI.
- **Assistant video: AI use.** Each incoming message is labelled by `@cf/meta/llama-3.1-8b-instruct-fp8-fast` and, when it needs work, understood by `@cf/meta/llama-3.3-70b-instruct-fp8-fast` in JSON mode. The recorded take made 4 requests (about USD 0.0009 in total by the price list) and charged the workspace 12 AI credits, which is the number the Usage tab shows at the end. Getting there took 8 more requests: 6 in four single-message smoke tests that found and fixed three defects in the AI path, and 2 in one aborted take. Without `SHOWCASE_AI=1` the same script runs on the rule-based reader and the cards carry no "AI" tag.
- The story cut was recorded on the base before B31; the walkthrough parts too. Only the AI part was recorded after rebasing onto B31.
- Parts `wt1`-`wt7` are independent takes (one take each, no retakes needed); `wt7` was recorded when it still began with a no-AI version of the AI chapter, which `compose.mjs` trims off (`window_` skips a leading "AI assistant" card for `wt7`).
- Outside the daytime window the airport pickup is pinned to 14:45 (`DEMO_PICKUP`) so the story still reads as an afternoon arrival; the story was recorded that way.
- Times of day: the seed's "live" trip (Dr. Lakshmi Raghavan, started) is created relative to the recording clock, so on the fleet dashboard it shows an evening start next to the afternoon airport pickup. Follow-ups and today's tasks read "Overdue" in the evening for the same reason.

## Application findings (not hidden, not fixed here)

1. **Command palette (Ctrl+K)** only searches commands and navigation, never data (storyboard promised "find any client"). The caption was changed to match. It also logs a Radix `DialogTitle` accessibility warning to the console (allowlisted in the harness).
2. **Calendar event cards** show a stray "0" next to the type tag (`is_all_day = 0` rendered). Visible in the side panel for a moment.
3. **Invoices list** includes credit notes (`SH-CN-…` row, status Draft) among invoices.
4. **Segments list** "Criteria" column renders `logic: OR | rules: 1 values` instead of readable rules (the walkthrough avoids dwelling on it).
5. **Chatbot list** "Last message" is always "—" (the list endpoint does not return messages); the detail page is fine.
6. **Inbox** previews of sent emails start with the raw `[Subject: …]`.
7. **AI > Business Intelligence > Team Performance** shows ₹0.00 revenue per agent although deals are closed, takes about 30 s with the Workers AI model and shows no commentary; Health Score reads 0/100 (stored score absent). Dropped from the AI chapter. Evidence: `desktop/showcase/.work/probe/ai_bi_team.png`, `ai_bi.png`.
8. **Lead-score recalculation** takes about 25 s; the chapter shows the real "Recalculating…" wait.
9. **Assistant video.** The replies the model drafts are plain and run the sign-off into the sentence ("…will proceed with the booking, Sahyadri Holidays Pvt. Ltd."); the person edits them in the send dialog. The lead is titled "Munnar family trip" because the model listed Munnar before Kerala.
10. Sessions, login history and activity-log rows show `Unknown` device / IP on a local stack (those pages are not in the walkthrough).
