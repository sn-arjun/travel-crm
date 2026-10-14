# How automations behave around a phone call

Status: planning document, written 2026-10-09. Nothing here is deployed.
Companion documents: `docs/decisions/ADR-001-voip.md` (which provider, which countries) and `docs/COST-MODEL.md` (what it costs).

## The short version

- **Today a call cannot actually be held in the product.** There is no softphone (the in-app phone that carries the audio), so an inbound call has nothing to ring and an outbound call rings the customer and then connects them to nobody.
- **One thing around calls does work and is tested:** when the provider reports a missed inbound call, the system notifies the agent, creates a "Call back X" task automatically, and offers a one-click "create contact and lead" for an unknown caller.
- **No AI runs on calls today.** The transcription and summary code exists but nothing ever starts it.
- **The target** below adds eight call events, nine recipes and one background job. Only three low-risk, internal actions run without a click (log the call, create a call-back task, create a voicemail task). Everything that writes to a lead or reaches the customer waits for a person.
- **AI cost of a fully processed 5-minute call:** about 20 credits (about ₹0.40 of provider cost) with the cheap transcription engine, or about 130 credits (about ₹2.60) with the premium one. Details in section 2.6.

### Words used in this document

| Term | Meaning |
|---|---|
| Softphone | A phone inside the desktop app. It uses the computer's microphone and speakers and sends the audio over the internet (WebRTC is the browser technology that does this). |
| Webhook / callback | A message the telephony provider sends to our server when something happens on a call (ringing, ended, recording ready). |
| TwiML | The small instruction file our server returns to Twilio to say what to do with a call ("ring this agent", "play this message", "record"). |
| Event | A record the product writes when something happens, for example `call.missed`. Automations listen for events. |
| Recipe | One automation rule: "when event X happens, propose action Y". |
| Suggest / auto | A recipe in *suggest* mode shows a one-click suggestion. In *auto* mode it runs by itself. The engine only allows auto for actions marked low risk that do not contact the customer (`backend/src/services/automation/engine.ts:258`). |
| AI credit | The unit agencies are metered in. One credit is sized at about ₹0.02 of provider cost. Classes: read 1, understand 5, scan 15, create 60 (`backend/src/services/ai-pricing.ts:48-53`). |
| Screen pop | The panel that appears when the phone rings, showing who is calling and their open lead. |

---

## 1. Today

Read from the code on 2026-10-09 (files: `backend/src/routes/voip-callbacks.ts`, `routes/calls.ts`, `routes/voip.ts`, `services/call-routing.ts`, `services/missed-call-handler.ts`, `services/automation/recipes.ts`, `services/twilio-voice.ts`, `test/voip-callbacks.test.ts`). Nothing was run. Where a statement depends on how Twilio behaves rather than on our code, it says so.

### 1.0 What changed since the audit in `docs/launch/findings/03-voip-automations-cost.md`

The audit was written before another session edited the call code. These points in the audit are now out of date:

| Audit said | Now |
|---|---|
| Callbacks always use the master database and never work out which agency a call belongs to. | Fixed. `callDb()` finds the agency from the called number (table `tenant_channel_addresses`), or from a call it already logged (`voip-callbacks.ts:90-118`). |
| The missed-call handler writes to notification columns that do not exist, and silently creates a contact and lead with raw SQL. | Fixed. It now writes valid notification rows and creates nothing else (`missed-call-handler.ts:37-42`). The lead is offered by a new recipe, `calls.lead_from_missed_call`, as a one-click suggestion (`recipes.ts:910-936`). |
| If the notification step fails, `call.missed` is never emitted. | Fixed. The notification has its own error handling; the event is emitted regardless (`voip-callbacks.ts:190-218`). |
| No tests for call callbacks. | Eight tests now exist in `backend/test/voip-callbacks.test.ts`. They cover the status, recording and voicemail callbacks. They do **not** cover the endpoint that answers an inbound call (`/twiml/inbound`) or the outbound flow. |
| 24 recipes. | 26 (added `calls.lead_from_missed_call` and `fleet.arrival_transfer`; `recipes.ts:1453-1480`). |

Still true, re-checked today:

- No softphone in any client. The inbound call is told to ring `user_<id>`, but the token endpoint issues the identity `<id>` with no prefix (`routes/voip.ts:256`, `services/call-routing.ts:86`), and no client asks for a token anyway.
- Call webhooks are not signature-checked. The file header says "signature-validated", but no check is applied to any route in `voip-callbacks.ts`, so anyone who knows the URL can post fake call events.
- The only call event is `call.missed`.
- Recordings stay at the provider; only the URL is saved.
- Call minutes are not capped. The counter is only increased when an agent saves a call outcome (`routes/calls.ts:411-423`) and is never checked.
- The number an agency buys is not registered in `tenant_channel_addresses`, so the new agency lookup only works if someone also adds the number by hand under Integrations.
- Notifications are not deduplicated. If the provider repeats a missed-call callback, the task is created once (tested) but each repeat adds another notification row.

### 1.1 Inbound call from an unknown number

| Step | What the system does now |
|---|---|
| 1 | Provider posts to `/api/v1/voip/twiml/inbound`. No signature check. |
| 2 | Finds the agency by the called number. If the number was never registered and there is more than one agency, it falls back to the master database. |
| 3 | Loads the agency's call settings. If there are none, the caller hears "this service is not currently available" and the call ends. |
| 4 | Inserts a call record with `created_by = 'system'`. That column must point at a real user and no `system` user is created anywhere, so **this insert is expected to fail and the caller would hear the provider's error message.** (By reading; not run.) |
| 5 | If it got past step 4: outside business hours goes to voicemail; if the phone menu is on, the menu plays. |
| 6 | Otherwise it looks up the caller. The lookup uses `contacts.mobile`, `contacts.work_phone` and `leads.phone`, none of which exist in the schema, so **the lookup is expected to fail as well.** |
| 7 | If the lookup worked: an unknown caller is routed by the agency's routing setting. The default value (`assigned`) is not handled, so the caller goes to voicemail. |

- **What the agent sees:** nothing while the phone rings. No screen pop, no sound.
- **Automations that fire:** none during the call. If the provider later reports the call as `no-answer`, `busy` or `canceled`, the missed-call flow in 1.3 runs.
- **AI:** none. 0 credits.

### 1.2 Inbound call from a known contact with an open lead

Same as 1.1 up to the lookup. If the lookup worked:

- The call record gets the contact and the agent the contact is assigned to.
- **The open lead is not attached.** The lead lookup only runs when no contact matched (`call-routing.ts:55-69`), so a known customer's call is never linked to their lead.
- The system tells the provider to ring `user_<agent id>`. Nothing is registered under that name, so nothing rings.
- The ring instruction has no "what to do if nobody answers" address, so the fallback to voicemail (`/twiml/dial-status`) is never reached. The call just ends.

- **What the agent sees:** nothing live. Afterwards, a row in the call list. Nothing on the contact or lead timeline.
- **Automations:** none. **AI:** none. 0 credits.

### 1.3 Missed call

This is the part that works, given a call record exists.

1. Provider posts a status of `no-answer`, `busy` or `canceled` to `/voip/status-callback`.
2. The call record's status is updated.
3. `handleMissedCall` writes a "Missed call from X" notification for the agent the call was routed to and for every admin. It also tries to queue a phone push notification, but that queue is not connected in `wrangler.toml`, so no push is sent.
4. The event `call.missed` is emitted.
5. Recipe `calls.missed_callback` (rule-based, **auto**): creates a high-priority task "Call back X", due today, assigned to the routed agent. One task per call, even if the provider repeats the callback (tested).
6. Recipe `calls.lead_from_missed_call` (rule-based, **suggest**): for a number that is not in contacts, offers "Create contact and lead for missed caller". One suggestion per number per day. Follows the agency's "lead from missed call" switch (tested).

- **What the agent sees:** a notification, the task in their task list, and the task (with Undo) plus the lead suggestion in the Assistant panel.
- **AI:** none. 0 credits.

**Caveat about Twilio.** By default Twilio answers an inbound call the moment it is told to ring someone (Twilio's `<Dial>` documentation, `answerOnBridge`). A call that rings an agent who does not pick up therefore normally ends with status `completed`, not `no-answer`. So in production this flow would fire only when the caller hangs up very early. The correct signal is the "dial result" Twilio sends to the address our ring instruction currently leaves out. This needs one live test call to confirm.

### 1.4 Call ended, recording available

1. Status callback: status and duration are saved on the call record.
2. Recording callback: the provider's recording address (with `.mp3` added) and its length are saved (tested).
3. Nothing else. No event, no copy to our storage, no transcript, no summary, no timeline entry.

- If the agent opens the call and saves an outcome, fixed code runs outside the automation engine (`routes/calls.ts:354-409`): a new lead becomes "contacted", "not interested" marks the lead lost, "follow-up needed" creates a follow-up for 10:00 tomorrow. No event is emitted, so no recipe reacts and there is no Undo. Only the person who created the call record or an admin can save an outcome, and inbound records are created by `system`, so in practice only admins can.
- **AI:** none runs. The dormant pipeline (`queues/ai-extraction-queue.ts`) would transcribe with Deepgram and summarise with Claude Haiku 4.5 called directly, which bypasses the credit meter. Its queue is not connected and nothing ever sends it a job. 0 credits today.
- **Cost that does accrue:** the recording sits at the provider forever. Twilio charges $0.0005 per recorded minute per month for storage (source in the cost model).

### 1.5 Outbound call

1. Agent clicks call. The dial page sends the phone number but drops the lead (`desktop/src/app/(app)/communication/calls/dial/page.tsx`, per the audit; not re-read), so the call is not linked to the lead it was started from.
2. `POST /calls/outbound` requires a caller ID in settings, writes a call record, and asks the provider to call the customer from the agency's number.
3. When the customer answers, the provider asks us what to do. We answer "dial this same customer number" (`voip-callbacks.ts:268-288`). **The agent is never connected.** The customer hears silence or a busy tone, and the call is billed.
4. With Plivo selected, step 3 asks for an address that does not exist (`/xml/outbound`), so the call fails outright.

- **What the agent sees:** a "Calling…" message, then a row in the call list. No audio, no in-call panel.
- **Automations:** none. **AI:** none. 0 credits.

### 1.6 Summary of today

| Scenario | Works? | Automations | AI credits |
|---|---|---|---|
| Inbound, unknown number | No. Expected to fail at the call record insert. | none | 0 |
| Inbound, known contact with lead | No. Nothing rings; lead not attached. | none | 0 |
| Missed call | Yes, once a call record and a "missed" status exist. Tested. | `calls.missed_callback` (auto), `calls.lead_from_missed_call` (suggest) | 0 |
| Ended with recording | Record updated only. | none | 0 |
| Outbound | No. Customer rings, agent never joined. | none | 0 |

---

## 2. Target

This is how the same five scenarios should behave once the softphone and the events exist. The provider and country rules are in the ADR; this section assumes a working softphone.

**India at launch is call-bridge, not softphone** (ADR, section 4). The timelines below still apply, with two differences. On an inbound call the agent's mobile rings and the screen pop appears on the desktop at the same moment, so the agent sees who is calling before answering the mobile. On an outbound call the agent clicks Call, their own mobile rings first, and the customer is dialled when they pick up. Hold and transfer are done on the mobile and are not tracked. Every event and recipe is the same.

### 2.1 Rules that apply to every step

1. **Anything the customer would see or hear is suggest-only.** A person presses send. This is already enforced: `draft_reply` is marked "client handled" and the engine never auto-runs such actions.
2. **Auto is reserved for low-risk internal actions.** In the action list today those are `create_task`, `create_follow_up`, `advance_lead_status` and `link_message_to_lead` (`services/automation/actions.ts`).
3. **Anything AI-derived defaults to suggest**, even when the action itself is low risk. A wrong AI task is noise; a wrong AI lead update is damage.
4. **Rule-based recipes cost no credits.** AI recipes check the credit balance first and are charged only on success (existing behaviour of `ai-router.ts:142-149`).
5. **Every callback is processed once** (section 3.2).

### 2.2 Timeline: inbound call (known contact or unknown number)

| # | Moment | Event to add | Recipe or job | Kind | Default | Credits | What the agent sees |
|---|---|---|---|---|---|---|---|
| 1 | Call reaches our number | `call.ringing` | System: match caller to contact and their newest open lead; pick the agent; write the call record; push to the agent's app. | rule | always on | 0 | Screen pop: caller name (or "Unknown number" and the number), open lead with stage and value, last message or last call note, buttons Answer / Decline. Other agents see "Ringing for <agent>". |
| 2 | Agent answers | `call.answered` | System: mark record in progress, start recording after the consent announcement (3.5). | rule | always on | 0 | In-call panel: timer, mute, hold, transfer, note box, link to the lead. |
| 3 | Hold | none (state only) | Saved on the call record, not an automation event. | — | — | 0 | "On hold" badge and hold timer. |
| 4 | Transfer | `call.transferred` | System: change the call's owner; the new agent gets the screen pop with the first agent's note. | rule | always on | 0 | New agent: screen pop plus "Transferred from <agent>: <note>". |
| 5 | Call ends | `call.ended` | `calls.log_to_timeline` | rule | **auto** | 0 | One entry on the contact and lead timeline: direction, duration, agent, note. |
| 5a | | | `leads.contacted_on_call`: a lead in stage "new" moves to "contacted" after a connected call of 30 seconds or more. | rule | **auto** | 0 | Stage change with Undo in the Assistant panel. |
| 5b | | | `calls.next_step_prompt`: suggests a follow-up for tomorrow, pre-filled; the agent can change the date or dismiss. Replaces the fixed outcome code in `routes/calls.ts`. | rule | suggest | 0 | "Schedule follow-up with X?" one click. |
| 5c | | | `calls.lead_from_unknown_caller`: for an answered call from a number not in contacts, offers "Create contact and lead". | rule | suggest | 0 | One-click suggestion, phone pre-filled. |

### 2.3 Timeline: missed call and voicemail

| # | Moment | Event | Recipe or job | Kind | Default | Credits | What the agent sees |
|---|---|---|---|---|---|---|---|
| 1 | Nobody answered in the ring time, or caller hung up | `call.missed` (exists) | `calls.missed_callback` (exists) | rule | **auto** | 0 | Task "Call back X", high priority, due today. |
| 1a | | | `calls.lead_from_missed_call` (exists) | rule | suggest | 0 | "Create contact and lead for missed caller". |
| 1b | | | `calls.missed_acknowledgement` (new): drafts a short WhatsApp or SMS, "Sorry we missed your call, we will ring you back by <time>". Skipped when the contact has opted out, during quiet hours, or when the number is not a mobile. | rule (fixed template) | suggest | 0 | Draft message with Send. **A person sends it.** |
| 2 | Caller leaves a voicemail | `call.voicemail_left` | `calls.voicemail_task` (new): task "Listen to voicemail from X" with a play button. Replaces the call-back task for the same call so there is one task, not two. | rule | **auto** | 0 | Task with the recording attached. |
| 2a | | | Voicemail transcript (optional, if the agency turned on call AI). | AI | on when call AI is on | 3 per minute, minimum 3 | The text of the voicemail under the task. |

### 2.4 Timeline: after the call (recording and transcript)

| # | Moment | Event | Recipe or job | Kind | Default | Credits | What the agent sees |
|---|---|---|---|---|---|---|---|
| 1 | Provider says the recording is ready | `call.recording_ready` | System job `calls.store_recording`: copy the file to our storage (R2), save its size and an expiry date from the agency's retention setting, then delete it at the provider. | rule | always on | 0 | Play button on the call. |
| 2 | Recording stored, call AI is on, credits available | (same event) | System job `calls.transcribe`: send the audio for transcription. Skipped for calls under 20 seconds. | AI | on when call AI is on | 3 per minute (standard engine) or 25 per minute (premium engine) | "Transcribing…" then the transcript. |
| 3 | Transcript saved | `call.transcript_ready` | `calls.summarise` (new): one AI call that returns a summary plus proposed actions. | AI | suggest | 5 per started 5 minutes of call ("understand" class) | A card on the call and in the Assistant panel: 3-line summary and the suggestions below. |
| 3a | | | from the same AI call: update the lead (destination, dates, travellers, budget) | AI | suggest | included | "Update lead: 4 adults, Bali, 12–19 Dec". One click, with Undo. |
| 3b | | | from the same AI call: tasks the agent promised ("send hotel options") | AI | suggest | included | One-click tasks. |
| 3c | | | from the same AI call: follow-up date | AI | suggest | included | One-click follow-up. |
| 3d | | | from the same AI call: follow-up message draft | AI | suggest, a person sends | included | Draft with Send. |

One AI call produces 3 to 3d. The agent can accept them one at a time or all together.

### 2.5 Timeline: outbound call

| # | Moment | Event | Recipe or job | Kind | Default | Credits | What the agent sees |
|---|---|---|---|---|---|---|---|
| 1 | Agent clicks call on a contact, lead or task | `call.started` | System: check the minutes balance and the country allow-list (3.6); write the call record **with the lead**; the softphone places the call. | rule | always on | 0 | In-call panel opens straight away with the lead beside it. |
| 2 | Customer answers | `call.answered` | As inbound step 2. | rule | always on | 0 | Timer starts. |
| 3 | Customer does not answer | `call.ended` with result `no_answer` | `calls.retry_task` (new): task "Try X again" for later the same day. One per lead per day. | rule | suggest | 0 | One-click task. |
| 4 | Call ends | `call.ended` | As inbound step 5, 5a, 5b. | rule | as above | 0 | Timeline entry, next step. |
| 5 | Recording, transcript | as 2.4 | as 2.4 | | | as 2.4 | as 2.4 |

### 2.6 What the AI on a call costs

Figures from sources (retrieved 2026-10-09):

| Item | List price | Source |
|---|---|---|
| Workers AI `@cf/openai/whisper-large-v3-turbo` (speech to text) | $0.0005 per audio minute | https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| Deepgram Nova-3, pre-recorded, one language | $0.0043 per minute (pay as you go) | https://deepgram.com/pricing |
| Deepgram Nova-3, pre-recorded, multilingual | $0.0052 per minute (pay as you go) | https://deepgram.com/pricing |
| Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293 per million input tokens, $2.253 per million output tokens | https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| Anthropic Claude Haiku 4.5 (what the dormant code calls) | $1 per million input tokens, $5 per million output | https://platform.claude.com/docs/en/about-claude/pricing |
| Exchange rate | 1 USD = ₹96.83 (rate dated 2026-10-08) | https://open.er-api.com/v6/latest/USD |

My assumptions: a 5-minute call is about 700 spoken words; with the instructions that is about 2,000 tokens in and 350 tokens out. Hindi and mixed-language calls use more tokens than English.

My arithmetic:

| Step | Provider cost for a 5-minute call | In credits at ₹0.02 | Proposed charge |
|---|---|---|---|
| Transcribe, standard engine (Workers AI Whisper) | 5 × $0.0005 = $0.0025 = ₹0.24 | 12 | 3 per minute = 15 |
| Transcribe, premium engine (Deepgram multilingual) | 5 × $0.0052 = $0.026 = ₹2.52 | 126 | 25 per minute = 125 |
| Summary and suggestions (Llama 3.3 70B) | 2,000 × $0.293/M + 350 × $2.253/M = $0.00137 = ₹0.13 | 7 | 5 (existing "understand" class) |
| **Whole call, standard** | **₹0.37** | 19 | **20** |
| **Whole call, premium** | **₹2.65** | 133 | **130** |

What that means per plan (my arithmetic, monthly allowance divided by 20 or 130):

| Plan | Credits a month | 5-minute calls fully processed, standard | Same, premium |
|---|---|---|---|
| Basic | 1,000 | 50 | 7 |
| Pro | 15,000 | 750 | 115 |
| Enterprise | 25,000 | 1,250 | 192 |

These use the whole allowance on calls; in practice messages share it.

Recommendations:

1. **Default to the standard engine.** Calls are recorded with the agent and the customer on separate channels (`twilio-voice.ts:94`), so each side can be transcribed separately and the transcript knows who spoke without paying for speaker detection.
2. **Test before committing.** Run 20 real calls (Hindi, Hinglish, Tamil, Arabic, Indian English) through both engines and compare. Whisper on phone-quality audio with mixed languages may be noticeably worse. This is not sourced; it needs the test.
3. **Add a credit class for transcription** charged per minute. Today the weights are per call (`ai-pricing.ts:48-53`), which does not fit audio.
4. **Route the summary through the metered router.** The dormant code calls Anthropic directly (`services/ai-extraction.ts:109-122`) and would spend money without spending credits. At Haiku 4.5 list prices one 5-minute call would cost about 2,500 × $1/M + 500 × $5/M = $0.005 = ₹0.48, roughly four times the Llama figure, unmetered.
5. **Try the newer small Claude model for the summary.** Anthropic's price list shows Claude Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output (same source as above), which is below the Llama 70B price even after allowing for its roughly 30% higher token count. Not tested here; compare quality on the same 20 calls.

---

## 3. Guard rails

### 3.1 Pause switch

- Exists: the agency-wide setting `automations_paused` stops every recipe (`engine.ts:146-159`).
- Add: the call jobs (`calls.store_recording`, `calls.transcribe`) must **not** be paused by it. Storing a recording is record-keeping, not an automation. Transcription has its own switch, "Call AI", off by default.
- Add: a platform-level kill switch for call AI across all agencies, for a runaway cost day.

### 3.2 Process every provider callback once

Providers repeat callbacks when our server is slow or returns an error.

- Today: suggestions are protected by a unique key (`dedupe_key`, tested for the call-back task). Notifications are not. A repeated "call started" callback would write a second call record.
- Add a table `provider_events` with a unique key of provider + call ID + status + sequence number, written with "insert or ignore" as the first step of every callback. If the row already exists, return success and do nothing. Twilio sends a sequence number with call status callbacks; confirm the field name in the provider's documentation when building.
- Make the call record unique on the provider's call ID so a repeated "inbound" callback updates the same row.
- Check the provider's signature on every callback and reject anything unsigned. The check function already exists on both adapters (`validateWebhookSignature`) and is never called.
- Events carry the call ID in their dedupe key (`callback:<call id>`, `summary:<call id>`), so a recipe that runs twice still proposes once.

### 3.3 Loop depth

- Exists: a chain of automations stops at depth 3 (`engine.ts:21, 155`).
- Call rule: call events are always depth 0 because they start from the provider, not from an automation. No call recipe may start a call. Placing a call is never an automation action.

### 3.4 Quiet hours and opt-out for messages

- Exists: recipes skip contacts with `opted_out` set (`recipes.ts`, for example line 351). Per-user quiet hours exist for staff notifications (`services/notification-service.ts:170-195`).
- Missing: quiet hours for the **customer**. Add an agency setting (default 21:00 to 09:00 in the agency's time zone). During quiet hours a message suggestion is still created but its Send button says "Send at 09:00" and schedules it, or the agent can override with a second click.
- `calls.missed_acknowledgement` also honours the contact's do-not-disturb flag (`dnd_enabled`, already read at `recipes.ts:40`).
- Because every customer message is suggest-only, a person is always the last check.

### 3.5 Consent before recording

- Today: no announcement. Recording starts silently when the policy says "record" (`voip-callbacks.ts:367`).
- Add: when recording is on, inbound calls hear a short announcement before the agent is rung ("This call may be recorded for quality and training"). Outbound calls play it when the customer answers, or the agent reads a line shown in the in-call panel and ticks "consent given". Agency-level setting: announcement on (default), recording off, or recording on request by the agent.
- The announcement text and language are per agency.
- Whether an announcement alone is enough differs by country. **Needs legal confirmation for each launch market**; nothing here is legal advice. Until confirmed, ship with the announcement switched on and not removable outside India.

### 3.6 When minutes or credits run out

| Situation | Behaviour |
|---|---|
| Call minutes at 80% of the balance | Banner for admins, email to the owner, top-up button. |
| Call minutes at zero | New outbound calls are refused with a clear message and a top-up button. A call in progress is never cut. |
| Inbound call at zero balance | Still rings (a customer must not hit a dead line) up to a small overdraft the platform sets per agency. Past the overdraft the caller hears "please contact us on WhatsApp or email" and the agency gets a missed-call task. |
| Destination not on the agency's allowed-country list | Refused before dialling (fraud control; see the ADR). |
| AI credits at zero | Recording is still stored. Transcription and summary are skipped and the call shows "Not summarised: AI credits used up" with a "Summarise now" button that works after a top-up. Rule-based recipes carry on, as they do today for messages. |
| AI provider down | Same as zero credits, with "Try again". No credits are charged for a failed call (existing behaviour). |

### 3.7 Who can hear and read what

The six roles are fixed in `backend/src/constants/permissions.ts`. Proposed access:

| Role | Call list | Play recording | Read transcript | Read AI summary |
|---|---|---|---|---|
| admin | all | all | all | all |
| sales_manager | all | all | all | all |
| salesperson | own calls and calls on leads assigned to them | same | same | same |
| operations | calls on confirmed bookings | no | no | yes |
| accountant | no | no | no | no |
| view_only | sees that a call happened | no | no | no |

Also:

- Recordings are served through short-lived signed links, never a public address. Every play is written to the activity log.
- Retention is per agency (the column `recording_retention_days` exists, default 90, and is not enforced). A daily job deletes expired audio and keeps the call record and summary.
- Deleting a contact on request deletes their recordings and transcripts.
- Transcripts sent to an AI model contain personal data. List the AI vendors in the privacy policy and the data-processing terms. Flag for the lawyer.

---

## 4. Flow diagram and build list

### 4.1 Flow

```
 INBOUND                                                   OUTBOUND
 customer dials agency number                              agent clicks Call
            |                                                     |
   provider webhook (signature checked, processed once)    check minutes + country
            |                                                     |
      call.ringing ------------------> screen pop           call.started
            |                          (caller, lead,             |
            |                           last conversation)        |
   +--------+-----------+                                          |
   |                    |                                          |
 answered           not answered                                   |
   |                    |                                          |
 call.answered      call.missed --> task "Call back X" (auto)      |
   |                    |       --> offer lead (suggest)           |
 consent                |       --> draft "sorry we missed you"    |
 announcement           |           (suggest, person sends)        |
 then recording     voicemail left?                                |
   |                    |                                          |
 hold / transfer    call.voicemail_left --> task with audio (auto) |
 (call.transferred)                                                |
   |                                                               |
   +------------------------------+--------------------------------+
                                  |
                              call.ended
                                  |
           +----------------------+-----------------------+
           |                      |                       |
   timeline entry (auto)   new lead -> contacted   next-step suggestion
                           (auto, with Undo)       (suggest)
                                  |
                        call.recording_ready
                                  |
              copy to our storage, set expiry, delete at provider
                                  |
              Call AI on?  credits left?  longer than 20 s?
                    | yes                         | no
               transcribe (AI)            stop; "Summarise now" button
                    |
           call.transcript_ready
                    |
           one AI call: summary + lead update + tasks + follow-up + draft
                    |
           all shown as one-click suggestions; a person decides
```

### 4.2 Events to add

Naming follows the existing `call.missed`.

| Event | Emitted when | Main payload |
|---|---|---|
| `call.ringing` | An inbound call is accepted and an agent is chosen | from, to, contactId, leadId, routedTo |
| `call.started` | An agent starts an outbound call | to, contactId, leadId, agentId |
| `call.answered` | Either side picks up | callId, agentId, answeredAt |
| `call.transferred` | The call moves to another agent | fromAgent, toAgent, note |
| `call.ended` | A connected call finishes, or an outbound call is not answered | direction, result, durationSeconds, contactId, leadId, agentId |
| `call.missed` | Exists. Move its trigger to the dial result (see the Twilio caveat in 1.3). | from, contactId, leadId, routedTo, offerLead |
| `call.voicemail_left` | A voicemail recording is saved | from, contactId, leadId, durationSeconds |
| `call.recording_ready` | The provider reports the recording file | callId, durationSeconds, channels |
| `call.transcript_ready` | A transcript is saved | callId, language, wordCount |

Holds are saved on the call record and are not automation events.

### 4.3 Recipes and jobs to build

| Key | Trigger | Action | Kind | Default | Can ever be auto? | Credits |
|---|---|---|---|---|---|---|
| `calls.missed_callback` | `call.missed` | create_task | rule | auto | yes | 0 (exists) |
| `calls.lead_from_missed_call` | `call.missed` | create_lead_from_enquiry | rule | suggest | no | 0 (exists) |
| `calls.missed_acknowledgement` | `call.missed` | draft_reply | rule | suggest | no, a person sends | 0 |
| `calls.voicemail_task` | `call.voicemail_left` | create_task | rule | auto | yes | 0 |
| `calls.log_to_timeline` | `call.ended` | new low-risk action `log_call_activity` | rule | auto | yes | 0 |
| `leads.contacted_on_call` | `call.ended` | advance_lead_status | rule | auto | yes | 0 |
| `calls.next_step_prompt` | `call.ended` | create_follow_up | rule | suggest | yes, if the agency wants | 0 |
| `calls.lead_from_unknown_caller` | `call.ended` | create_lead_from_enquiry | rule | suggest | no | 0 |
| `calls.retry_task` | `call.ended` (outbound, not answered) | create_task | rule | suggest | yes | 0 |
| `calls.summarise` | `call.transcript_ready` | update_lead, create_task, create_follow_up, draft_reply | AI | suggest | no | 5 per started 5 minutes |
| job `calls.store_recording` | `call.recording_ready` | copy to storage, set expiry, delete at provider | system | always on | n/a | 0 |
| job `calls.transcribe` | after the recording is stored | speech to text | AI | off until the agency turns on Call AI | n/a | 3 per minute standard, 25 premium |

### 4.4 Things to fix before any of this can work

In order:

1. A softphone in the desktop app, and one naming rule for the agent's identity used by both the token and the ring instruction.
2. The inbound endpoint: a real `system` user (or allow an empty creator), the caller lookup rewritten against columns that exist, the open lead attached when a contact matches, and a "nobody answered" address on the ring instruction.
3. The outbound flow: connect the agent, then the customer; pass the lead through from the dial page.
4. Signature check and once-only processing on every callback.
5. Register a purchased number so calls to it find the agency; release the number at the provider when it is deleted.
6. Minutes metering from the provider's own call records, with the cap enforced before dialling.
7. Connect the transcription queue in `wrangler.toml`, or run transcription from the existing background mechanism.
8. Tests for the inbound and outbound endpoints. Today's eight tests insert the call record by hand and so never exercise the broken parts.
