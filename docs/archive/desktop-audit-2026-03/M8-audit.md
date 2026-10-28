# Milestone 8 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m8.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 4     |
| PARTIAL | 11    |
| MISSING | 5     |
| BUG     | 6     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| TWILIO_ACCOUNT_SID | backend/src/services/twilio.ts, twilio-messaging.ts | Yes | Send operations fail with clear error |
| TWILIO_AUTH_TOKEN | backend/src/services/twilio.ts, twilio-messaging.ts, middleware/twilio-webhook.ts | Yes | Send operations fail; webhook validation fails |
| TWILIO_VERIFY_SERVICE_SID | backend/src/services/twilio.ts | Yes (OTP) | OTP sending fails |
| TWILIO_SMS_FROM_NUMBER | backend/src/services/twilio-messaging.ts | Yes | SMS sending fails |
| TWILIO_WHATSAPP_FROM_NUMBER | backend/src/services/twilio-messaging.ts | Yes | WhatsApp sending fails |
| SENDGRID_API_KEY | backend/src/services/email.ts | Yes (email) | Email sending fails |
| SMS_QUEUE | backend/src/types.ts (Env) | Yes | Message queuing fails at runtime |
| API_BASE_URL | backend/src/types.ts (Env) | No | Webhook callback URLs may be incorrect |
| NEXT_PUBLIC_API_URL | desktop/src/lib/api/config.ts | No | Falls back to http://localhost:8787/api/v1 |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `/communication` (page.tsx) | **Hardcoded mock messages** in ConversationDetailPanel — shows fake chat instead of real API data | Replace with actual API call to `/communications/history?contact_id=X` |
| `/communication` (page.tsx) | **No infinite scroll** — loads all conversations at once with no pagination | Use `useInfiniteScroll` hook |
| `/communication` (page.tsx) | **No FilterBar** — uses custom Tabs but no reusable FilterBar component | Replace with `FilterBar` from `components/domain/filter-bar.tsx` |
| `/communication` (page.tsx) | **Missing SMS tab** — Tabs have All/Calls/Emails/WhatsApp but no SMS tab | Add SMS tab |
| `/communication` (page.tsx) | **No hover actions** on conversation list items | Add Eye, Trash2 hover icons |
| `/communication/[contactId]` | **Mock contact info** (line 79-83) — hardcodes email/phone instead of fetching from contacts API | Fetch from `contactsApi.getById(contactId)` |
| `/communication/[contactId]` | **No template button** in composer — ticket requires template quick-send button | Add template picker button next to Send |
| `/communication/[contactId]` | **No attach button** — ticket requires media message support | Add Paperclip/attach button |
| `/communication/[contactId]` | **No quick replies** panel — TICKET-140 requires scrollable quick reply chips | Add QuickRepliesBar component above composer |
| `/communication/[contactId]` | **No status indicators** — WhatsApp-style checkmarks (✓ sent, ✓✓ delivered, ✓✓ blue read) not implemented | Status badges exist but not WhatsApp-style checkmarks |
| `/communication/templates` | **Uses hardcoded local templates** (lines 32-140) — NOT calling backend API | Replace with API call to `GET /templates` (backend route exists at `/templates`) |
| `/communication/templates` | **No API client** for templates — `config.ts` has no `templates` endpoint section | Add templates API endpoints to `config.ts` and create `templates` section in communications API or separate file |
| `/communication/templates` | **Placeholder delete** (line 265) — `toast.success('Template deleted')` without API call | Call `DELETE /templates/:id` backend endpoint |
| `/communication/templates` | **Placeholder duplicate** (line 254) — `toast.success('Template duplicated')` without API call | Implement real duplication via API |
| `/communication/templates/new` | **Placeholder save** (lines 119-131) — `setTimeout` simulates save, no real API call | Call `POST /templates` backend endpoint |
| `/communication/templates/new` | **Variable format mismatch** — frontend uses `{{name}}` but backend expects `{customer_name}` | Align variable naming convention between frontend and backend |
| `/communication/templates/[id]/edit` | **Mock template data** (lines 51-86) — loads from hardcoded `mockTemplates` object | Fetch from `GET /templates/:id` API |
| `/communication/templates/[id]/edit` | **Placeholder save** (lines 182-193) — simulates update with setTimeout | Call `PUT /templates/:id` |
| `/communication/templates/[id]/edit` | **Placeholder delete** (lines 195-206) — simulates delete | Call `DELETE /templates/:id` |
| `/communication/bulk-send` | **Hardcoded segments** (lines 28-36) — mock data, not from API | Fetch segments from marketing segments API |
| `/communication/bulk-send` | **Hardcoded templates** (lines 42-55) — mock templates per channel | Fetch from `GET /templates?channel=X` |
| `/communication/bulk-send` | **API contract mismatch** — page sends `BulkSendRequest` with `recipients[]` format but backend expects `{ contact_ids: [], channel, template_id?, message? }` | Align frontend API client with backend schema |
| `/communication/bulk-send` | **No progress tracking UI** — backend has `GET /bulk-send/:batchId/status` but frontend doesn't poll it | Add progress/results screen after send |
| `/communication/compose` | **Uses direct recipients** — types email addresses manually instead of searching contacts | Add searchable contact Combobox |
| Sidebar | **Missing Bulk Send** nav item — sidebar has Inbox/Call Log/Templates/Campaigns but no Bulk Send link | Add "Bulk Send" menu item under Communication section |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `/communication` | Inbox-style two-panel layout | Add summary stats at top (Messages Today, Delivery Rate %, etc.) per TICKET-139 | High |
| `/communication` | No export capability | Add "Export to Excel" button for communication log | Medium |
| `/communication` | Basic message list | Add failed messages highlight in red with error hover tooltip | Medium |
| `/communication/[contactId]` | Single-line Input for compose | Use multi-line textarea for message body, especially for WhatsApp | Medium |
| `/communication/[contactId]` | No keyboard shortcuts | Add Ctrl+Shift+M for quick send dialog (TICKET-148) | Low |
| `/communication/[contactId]` | No real-time updates | Add WebSocket/polling for new incoming messages | Low |
| `/communication/templates` | Card grid layout only | Add list/table view toggle for template management | Low |
| `/communication/templates` | No language selector | Add multilingual template support per TICKET-142 | Medium |
| `/communication/bulk-send` | No batch results screen | Add post-send results page showing sent/failed counts with download | High |
| `/communication/compose` | Email-only compose page | Support SMS/WhatsApp channel switching like `/communication/[contactId]` | Medium |
| All comm pages | No accessibility labels | Add aria-labels to icon buttons and interactive elements | Low |

## Ticket Details

### TICKET-129: Twilio Service Setup & Unified SDK — PARTIAL
**Backend:** PARTIAL — `backend/src/services/twilio.ts` exists but only has OTP (Verify) functions. Actual messaging is in `backend/src/services/twilio-messaging.ts` with `sendWhatsApp()`, `sendSms()`, `sendWhatsAppTemplate()`, `sendMediaMessage()`, and `TwilioMessagingProvider` class. Missing: rate limiting (100/tenant/hr), queue integration is in `sms-queue.ts` not in service class, no status callback URL configuration in send calls.
**Frontend:** N/A (backend-only ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:**
1. `backend/src/services/twilio-messaging.ts` — Add rate limiting logic (100 msg/tenant/hr). Currently no rate check before sending.
2. `backend/src/services/twilio-messaging.ts` — Add `statusCallback` URL parameter in Twilio API calls (lines 60-78, 137-152) for automatic webhook delivery tracking.
3. `backend/src/services/twilio.ts` — Consider refactoring into unified class as specified, or document the split architecture.
---

### TICKET-130: Message Log Schema & Communication History — DONE
**Backend:** DONE — `messageLog` table in `backend/src/db/tenant-schema.ts:628-650` has all required fields: id, contactId, leadId, channel, templateId, subject, content, status, externalId, errorMessage, sentBy, sentAt, deliveredAt, readAt, createdAt. Indexes on contactId, leadId, channel, status, sentAt.
**Frontend:** N/A (schema ticket)
**API Client:** N/A
**UX Issues:**
- Missing `direction` field in `messageLog` — ticket requires `direction (TEXT CHECK outgoing/incoming)` but schema only has it on `callLogs` table (line 1653), not on `messageLog`. The `messageLog` table has no direction column.
- Missing `media_url` field in `messageLog` — ticket requires it but schema doesn't have it.
- Missing `metadata` field in `messageLog` — ticket requires JSON metadata but schema doesn't have it.
**Fix Required:**
1. `backend/src/db/tenant-schema.ts:628-650` — Add `direction`, `mediaUrl`, and `metadata` columns to `messageLog` table.
---

### TICKET-131: WhatsApp Text Messaging API — DONE
**Backend:** DONE — `POST /communications/send` endpoint at `backend/src/routes/communications.ts:80-161`. Validates contact exists, checks phone/email, creates `messageLog` entry with status='queued', queues via `SMS_QUEUE`. Returns `{ message_id, status: 'queued' }`.
**Frontend:** DONE via compose bar on `/communication/[contactId]` page.
**API Client:** DONE — `communicationsApi.send()` at `desktop/src/lib/api/communications.ts:52-53`.
**UX Issues:**
- Frontend API client sends `{ to: [...], body, type }` format but backend expects `{ contact_id, channel, message, media_url? }` — contract mismatch.
- DND compliance check missing from backend send route (TICKET-134 dependency).
**Fix Required:**
1. `desktop/src/lib/api/communications.ts:4-12` — Align `SendCommunicationRequest` interface with backend's `sendMessageSchema` (use `contact_id`, `channel`, `message` fields).
---

### TICKET-132: WhatsApp Template Messages — PARTIAL
**Backend:** DONE — `POST /communications/send-template` at `backend/src/routes/communications.ts:167-267`. Fetches template, resolves variables via `template-engine.ts`, substitutes, queues.
**Frontend:** PARTIAL — Template picker exists but is hardcoded. No template picker dialog in compose bar. No variable auto-fill from contact/lead data on frontend. Preview exists in template creation but not in send flow.
**API Client:** DONE — `communicationsApi.sendTemplate()` at `desktop/src/lib/api/communications.ts:55-56`.
**UX Issues:**
- API client `SendTemplateRequest` uses `recipientIds[]` and `variables` but backend expects `{ contact_id, template_id, variables?, lead_id? }` — contract mismatch.
- No template picker in message composer on `/communication/[contactId]`.
- WhatsApp template approval status tracking missing from schema (`whatsapp_template_sid`, `whatsapp_status` fields absent from `messageTemplates` table).
**Fix Required:**
1. `desktop/src/lib/api/communications.ts:14-19` — Align `SendTemplateRequest` with backend schema.
2. `desktop/src/app/(app)/communication/[contactId]/page.tsx` — Add template picker button in compose bar.
3. `backend/src/db/tenant-schema.ts:612-626` — Add `whatsappTemplateSid` and `whatsappStatus` fields to `messageTemplates`.
---

### TICKET-133: WhatsApp Message Status Webhooks — PARTIAL
**Backend:** PARTIAL — `POST /webhooks/twilio/status` at `backend/src/routes/webhooks.ts:14-81`. Parses Twilio payload (MessageSid, MessageStatus, ErrorCode), maps status, updates `messageLog`. BUT: does NOT use Twilio signature verification middleware (the `twilioWebhookMiddleware` at `backend/src/middleware/twilio-webhook.ts` exists but is NOT applied to this route). Also: tenant DB resolution is broken — `c.get('tenantDb')` won't work on a public webhook route (no auth middleware sets tenant context).
**Frontend:** N/A (backend webhook)
**API Client:** N/A
**UX Issues:**
- Webhook can't find tenant DB because it's a public route without auth middleware that resolves tenant.
- No Twilio signature verification on webhook endpoint (security vulnerability).
**Fix Required:**
1. `backend/src/routes/webhooks.ts:14` — Apply `twilioWebhookMiddleware` to the Twilio status webhook.
2. `backend/src/routes/webhooks.ts:34-36` — Fix tenant DB resolution — need to store tenantId in messageLog or use a lookup table in master DB to resolve which tenant owns a given Twilio SID.
3. `backend/src/index.ts:147` — Verify webhook routes are mounted before auth middleware (they are — line 147 is before routeMounts).
---

### TICKET-134: SMS Sending API — PARTIAL
**Backend:** PARTIAL — SMS sending works through same `POST /communications/send` with `channel: 'sms'`. Queue handler in `sms-queue.ts` handles SMS via `sendSms()`. BUT: no DND compliance check (no `dnd_enabled` field on contacts table), no message length validation, no international SMS warning.
**Frontend:** PARTIAL — Channel selector in composer supports SMS.
**API Client:** Same as TICKET-131.
**UX Issues:**
- Missing `dnd_enabled` column on `contacts` table in schema.
- No character count/SMS segment indicator in frontend composer on `/communication/[contactId]` (only exists on template editor).
**Fix Required:**
1. `backend/src/db/tenant-schema.ts:36-66` — Add `dndEnabled: integer('dnd_enabled').default(0)` to contacts table.
2. `backend/src/routes/communications.ts:80-161` — Add DND check for SMS to India (+91) contacts before queuing.
3. `desktop/src/app/(app)/communication/[contactId]/page.tsx:305-310` — Add character counter when composeChannel is 'sms'.
---

### TICKET-135: Bulk WhatsApp & SMS Sending — PARTIAL
**Backend:** PARTIAL — `POST /communications/bulk-send` at `backend/src/routes/communications.ts:397-510`. Fetches template, resolves variables per contact, creates individual `messageLog` entries, queues each message. BUT: no `bulk_send_batches` table in schema (ticket requires it), `GET /bulk-send/:batchId/status` returns hardcoded stub (lines 520-535 — "In a real implementation, you'd have a batch tracking table"), no throttling (30 msg/sec).
**Frontend:** PARTIAL — Bulk send wizard at `/communication/bulk-send` has 4 steps (channel, recipients, compose, schedule). BUT: uses hardcoded segments/templates, API contract mismatch, no progress/results screen.
**API Client:** PARTIAL — `communicationsApi.bulkSend()` exists but sends wrong request format.
**UX Issues:**
- Missing `bulk_send_batches` schema table.
- Hardcoded segment data instead of API-driven.
- No results/progress tracking screen after send.
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `bulkSendBatches` table with id, channel, templateId, totalCount, sentCount, deliveredCount, failedCount, status, createdBy, createdAt.
2. `backend/src/routes/communications.ts:516-535` — Implement real batch status tracking by querying `bulkSendBatches` + aggregating `messageLog` counts.
3. `desktop/src/app/(app)/communication/bulk-send/page.tsx` — Replace hardcoded segments with API call to marketing segments. Replace hardcoded templates with API call to `GET /templates?channel=X`. Fix API request format alignment.
4. `desktop/src/app/(app)/communication/bulk-send/page.tsx` — Add post-send results screen.
---

### TICKET-136: Message Templates CRUD — PARTIAL
**Backend:** DONE — Full CRUD at `backend/src/routes/templates.ts`. POST create (with variable extraction), GET list (with filters: channel, category, language, is_active, search), GET by ID, PUT update, DELETE (soft delete via isActive=0). Schema has `messageTemplates` table.
**Frontend:** PARTIAL — Templates list page exists at `/communication/templates` but uses **hardcoded local templates** instead of API. Create page exists at `/communication/templates/new` but save is a **placeholder setTimeout**. Edit page exists at `/communication/templates/[id]/edit` but loads **mock data** and save/delete are **placeholders**.
**API Client:** MISSING — No templates API client exists in `desktop/src/lib/api/`. Config.ts has no `templates` endpoint section. Backend mounts routes at both `/message-templates` and `/templates` but frontend has no corresponding client.
**UX Issues:**
- **Schema missing fields**: `whatsapp_template_sid`, `whatsapp_status`, `is_system`, `created_by` (ticket requires all).
- Frontend variable format `{{name}}` doesn't match backend `{customer_name}` convention.
- No seed templates (ticket requires 10-15 pre-built templates).
**Fix Required:**
1. Create `desktop/src/lib/api/templates.ts` — API client with CRUD methods.
2. Add `templates` section to `desktop/src/lib/api/config.ts` — endpoints for list, create, byId, update, delete.
3. `desktop/src/app/(app)/communication/templates/page.tsx` — Replace local templates with API fetch.
4. `desktop/src/app/(app)/communication/templates/new/page.tsx:119-131` — Replace setTimeout with real API call.
5. `desktop/src/app/(app)/communication/templates/[id]/edit/page.tsx:104-124` — Replace mock loading with API fetch.
6. `backend/src/db/tenant-schema.ts:612-626` — Add missing fields: `whatsappTemplateSid`, `whatsappStatus`, `isSystem`, `createdBy`.
---

### TICKET-137: Variable Substitution Engine — DONE
**Backend:** DONE — `backend/src/services/template-engine.ts` implements `substituteVariables()` (regex replace `{variable}` → value, missing vars → empty string) and `resolveVariables()` (fetches contact + lead data, returns record with customer_name, first_name, destination, travel_date, etc.).
**Frontend:** N/A (backend service)
**API Client:** N/A
**UX Issues:**
- `resolveVariables()` doesn't include `invoice_number` or `company_email` despite listing them in the initial variables object (company_email not even declared). Ticket requires `{invoice_number}`.
- Tenant settings are optionally passed but not auto-fetched from DB.
**Fix Required:**
1. `backend/src/services/template-engine.ts:37-41` — Add `company_email` to initial variables object and fetch from tenant settings.
---

### TICKET-138: Communication Hub UI — Per-Contact Chat View — PARTIAL
**Backend:** DONE — `GET /communications/history?contact_id=X` exists with channel filter and pagination.
**Frontend:** PARTIAL — `/communication/[contactId]/page.tsx` has chat timeline UI with channel filter tabs (All/Email/SMS/WhatsApp/Call), message bubbles with direction, compose bar with channel selector. BUT: uses **mock contact info** (line 79-83), no template button, no attach button, no quick replies, status shown as badges not WhatsApp-style checkmarks.
**API Client:** PARTIAL — `getHistory()` and `getLog()` exist but `SendCommunicationRequest` doesn't match backend schema.
**UX Issues:**
- Mock contact info — should fetch real contact data.
- Missing template picker in composer.
- Missing attachment/media support in composer.
- No auto-scroll to bottom on new messages.
- No date grouping of messages.
**Fix Required:**
1. `desktop/src/app/(app)/communication/[contactId]/page.tsx:79-83` — Fetch contact from `contactsApi.getById(contactId)`.
2. `desktop/src/app/(app)/communication/[contactId]/page.tsx:267-327` — Add template picker button and attach file button to compose bar.
3. `desktop/src/app/(app)/communication/[contactId]/page.tsx:180` — Add auto-scroll ref to bottom of message list.
---

### TICKET-139: Communication Log Screen — PARTIAL
**Backend:** DONE — `GET /communications/log` at `backend/src/routes/communications.ts:580-648` with filters: channel, status, sentBy, dateFrom, dateTo, search. Paginated.
**Frontend:** PARTIAL — The main `/communication` page acts as an inbox/log but uses `getHistory()` not `getLog()`. Shows conversations in list panel. BUT: no DataTable with required columns (Date/Time, Channel, Contact, Direction, Message, Status, Sent By), no FilterBar, no infinite scroll, no summary stats, no export.
**API Client:** DONE — `communicationsApi.getLog()` exists.
**UX Issues:**
- Wrong API endpoint used — page calls `getHistory()` instead of `getLog()`.
- No DataTable with required columns.
- No summary stats at top (Messages Today, This Week, Delivery/Read Rate).
- No export to Excel functionality.
- Conversation detail panel shows hardcoded mock messages.
**Fix Required:**
1. `desktop/src/app/(app)/communication/page.tsx` — Restructure to show proper DataTable log view with all required columns.
2. `desktop/src/app/(app)/communication/page.tsx:121-123` — Switch to `communicationsApi.getLog()`.
3. Add FilterBar with channel, status, sentBy, date range filters.
4. Add summary stats cards.
5. Add export functionality.
---

### TICKET-140: WhatsApp Quick Replies — MISSING
**Backend:** MISSING — No quick replies CRUD in `backend/src/routes/settings.ts`. The `ai-assistant.ts` has a reference to quick replies but as AI-generated suggestions, not user-managed quick replies.
**Frontend:** MISSING — No QuickRepliesBar component. No quick replies settings page.
**API Client:** MISSING — No quick replies API endpoints.
**UX Issues:** Entire feature missing.
**Fix Required:**
1. `backend/src/routes/settings.ts` — Add `GET /settings/quick-replies` and `POST /settings/quick-replies` endpoints.
2. Create quick replies UI component for message composer.
3. Create quick replies settings management page.
---

### TICKET-141: WhatsApp Click-to-Chat Link Generation — MISSING
**Backend:** N/A (frontend-only feature)
**Frontend:** MISSING — No "Open in WhatsApp" button on contact detail or communication hub. No `wa.me` link generation utility.
**API Client:** N/A
**UX Issues:** Feature completely absent.
**Fix Required:**
1. Create utility function `generateWhatsAppLink(phone, message?)` in desktop.
2. Add "Open in WhatsApp" button to contact detail page and communication hub header.
---

### TICKET-142: Multilingual Templates — MISSING
**Backend:** PARTIAL — `messageTemplates` schema has `language` field with default 'en'. Template CRUD supports `language` filter. BUT: no auto-selection based on contact's `preferred_language`, no template grouping by name across languages.
**Frontend:** MISSING — No language selector in template editor. No language badges on template list.
**API Client:** N/A (no templates API client exists).
**UX Issues:** Feature not implemented on frontend. Backend has basic schema support only.
**Fix Required:**
1. `backend/src/routes/communications.ts:167-267` — In send-template flow, auto-select template by contact's preferred_language.
2. Frontend template editor — add language dropdown.
3. Frontend template list — add language badge display.
---

### TICKET-143: Communication Integration in Contact & Lead Detail — PARTIAL
**Backend:** N/A (frontend integration ticket)
**Frontend:** PARTIAL — `SendMessageDialog` component exists and is used on contacts list page, contact detail, leads page, lead detail, invoices detail, and itineraries detail. These pages have WhatsApp/SMS/Email quick-send buttons using `SendMessageDialog`. BUT: no embedded "Communications" tab in contact/lead detail pages, no message count badge, no recent messages preview, no "Send Quotation/Invoice" direct buttons.
**API Client:** N/A
**UX Issues:**
- Contact detail has send buttons but no Communications tab with full chat timeline.
- Lead detail same issue.
- No message count badge on tabs.
- No recent messages preview in summary section.
**Fix Required:**
1. `desktop/src/app/(app)/contacts/[id]/page.tsx` — Add "Communications" tab that embeds the contact communication hub timeline.
2. `desktop/src/app/(app)/leads/[id]/page.tsx` — Add "Communications" tab filtered by lead_id.
---

### TICKET-144: Document Sending via WhatsApp — PARTIAL
**Backend:** DONE — `POST /communications/send-document` at `backend/src/routes/communications.ts:273-391`. Validates contact, looks up document (itinerary/invoice/voucher), builds media URL, creates messageLog, queues. BUT: media URL is relative path (`/api/v1/itineraries/:id/pdf`) not absolute URL — Twilio needs a publicly accessible URL. No R2 upload for temporary public hosting.
**Frontend:** MISSING — No "Send via WhatsApp" button on itinerary/invoice/voucher detail screens in the desktop app (Flutter spec only).
**API Client:** DONE — `communicationsApi.sendDocument()` exists.
**UX Issues:**
- API client `SendDocumentRequest` uses `{ to: [...], documentId, message }` but backend expects `{ contact_id, channel, document_type, document_id, caption }` — contract mismatch.
- Media URL must be publicly accessible for Twilio but current implementation uses relative API paths.
**Fix Required:**
1. `backend/src/routes/communications.ts:297-330` — Generate publicly accessible R2 URLs instead of relative API paths.
2. `desktop/src/lib/api/communications.ts:22-26` — Align `SendDocumentRequest` with backend schema.
3. Add "Send via WhatsApp" buttons to itinerary/invoice/voucher detail pages.
---

### TICKET-145: SMS Delivery Log & DND Compliance — MISSING
**Backend:** MISSING — No `dnd_enabled` field on contacts table. No DND check in send route. SMS delivery tracking works via same webhook (TICKET-133) but no DND-specific logic.
**Frontend:** MISSING — No DND toggle on contact edit form. No SMS character counter in communication hub composer.
**API Client:** N/A
**UX Issues:** DND compliance entirely absent. No character counting in composer.
**Fix Required:**
1. `backend/src/db/tenant-schema.ts:36-66` — Add `dndEnabled` to contacts.
2. `backend/src/routes/communications.ts:80-161` — Add DND check when channel='sms' and contact country is India.
3. Desktop contact edit form — add DND toggle.
4. `/communication/[contactId]` composer — add SMS character counter.
---

### TICKET-146: Multi-Channel Template Adaptation — MISSING
**Backend:** MISSING — No multi-channel adaptation logic. Templates have a single `content` field, not per-channel variants (`whatsapp_body`, `sms_body`, `email_body`). No auto-truncation for SMS, no HTML wrapping for email.
**Frontend:** MISSING — No multi-channel tabs in template editor.
**API Client:** N/A
**UX Issues:** Feature completely absent.
**Fix Required:**
1. `backend/src/db/tenant-schema.ts:612-626` — Add `smsBody`, `emailBody` fields to `messageTemplates` (or use JSON `channelBodies`).
2. `backend/src/services/template-engine.ts` — Add channel adaptation logic.
3. Template editor — add multi-channel preview tabs.
---

### TICKET-147: Communication Navigation & GoRouter Routes — DONE (Desktop)
**Backend:** N/A
**Frontend:** DONE (Desktop context) — Sidebar has "Communication" section with Inbox, Call Log, Templates, Campaigns at `desktop/src/components/layout/sidebar.tsx:101-107`. Routes exist: `/communication`, `/communication/[contactId]`, `/communication/templates`, `/communication/templates/new`, `/communication/templates/[id]/edit`, `/communication/bulk-send`, `/communication/compose`.
**API Client:** N/A
**UX Issues:**
- Missing "Bulk Send" in sidebar navigation (page exists but no nav link).
- Missing "Compose" link in sidebar (page exists at `/communication/compose`).
- Ticket mentions `/communications` (plural) but desktop uses `/communication` (singular) — minor inconsistency.
**Fix Required:**
1. `desktop/src/components/layout/sidebar.tsx:101-107` — Add "Bulk Send" and optionally "Compose" to Communication nav section.
---

### TICKET-148: Quick Send from Anywhere — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `SendMessageDialog` component at `desktop/src/components/communication/send-message-dialog.tsx` exists and is integrated into contacts list, contact detail, leads list, lead detail, invoices detail, itineraries detail. These provide channel selection, template picker, compose, preview, and send via Communication Hub API.
**API Client:** N/A
**UX Issues:**
- No keyboard shortcut (Ctrl+Shift+M) for global quick send.
- No recent templates shortcut (last 5 used).
- Quick send from lead/contact list — exists but needs verification of auto-fill from context (contact name, lead destination, etc.).
**Fix Required:**
1. Add global keyboard shortcut listener for Ctrl+Shift+M.
2. Track and display recently used templates in SendMessageDialog.
---

## Critical Issues Summary

### Backend Issues (High Priority)
1. **Webhook tenant resolution broken** — `webhooks.ts:34` uses `c.get('tenantDb')` on a public route where no auth middleware sets tenant context. Messages will never get status updates.
2. **No Twilio signature verification** on webhook — security vulnerability allowing spoofed status updates.
3. **Missing `bulk_send_batches` table** — batch status endpoint returns hardcoded stub data.
4. **Missing `dnd_enabled` on contacts** — DND compliance not implemented.
5. **Missing schema fields on `messageLog`** — no `direction`, `mediaUrl`, `metadata` columns.
6. **Missing schema fields on `messageTemplates`** — no `whatsappTemplateSid`, `whatsappStatus`, `isSystem`, `createdBy`.
7. **No rate limiting** on message sending — could exceed Twilio limits.
8. **Relative media URLs** in document sending — Twilio needs absolute public URLs.

### Frontend Issues (High Priority)
1. **No templates API client** — entire templates UI uses hardcoded data instead of backend API.
2. **API contract mismatches** — `SendCommunicationRequest`, `SendTemplateRequest`, `SendDocumentRequest`, `BulkSendRequest` don't match backend Zod schemas.
3. **Mock data everywhere** — communication page uses mock messages, templates page uses local templates, bulk send uses hardcoded segments/templates, edit template loads mock data.
4. **Missing features** — quick replies, DND toggle, WhatsApp click-to-chat, multi-channel template adaptation, communication tabs on contact/lead detail.
5. **Missing Bulk Send in sidebar** — page exists but no navigation link.

### API Contract Mismatches (must fix for anything to work)
| Frontend Interface | Frontend Fields | Backend Zod Schema | Backend Fields |
|---|---|---|---|
| `SendCommunicationRequest` | `to[], subject?, body, type?` | `sendMessageSchema` | `contact_id, channel, message, media_url?, lead_id?` |
| `SendTemplateRequest` | `recipientIds[], templateId, variables?, type?` | `sendTemplateSchema` | `contact_id, template_id, variables?, lead_id?` |
| `SendDocumentRequest` | `to[], documentId, message?, type?` | `sendDocumentSchema` | `contact_id, channel, document_type, document_id, caption?` |
| `BulkSendRequest` | `recipients[{id,email?,phone?,name?}], subject?, body, type?` | `bulkSendSchema` | `channel, contact_ids[], template_id?, message?` |
