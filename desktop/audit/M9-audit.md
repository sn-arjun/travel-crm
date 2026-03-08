# Milestone 9 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m9.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 4     |
| PARTIAL | 8     |
| MISSING | 2     |
| BUG     | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `SENDGRID_API_KEY` | `backend/src/services/sendgrid.ts`, `backend/src/types.ts:48` | Yes | Email sending fails — should show "Email not configured" in UI and disable email channel |
| `SENDGRID_FROM_EMAIL` | `backend/src/services/sendgrid.ts` (hardcoded as `noreply@travelcrm.pro`) | No (hardcoded) | Falls back to hardcoded default — OK |
| `SENDGRID_FROM_NAME` | `backend/src/services/sendgrid.ts` (hardcoded as `TravelCRM Pro`) | No (hardcoded) | Falls back to hardcoded default — OK |
| `EMAIL_QUEUE` | `backend/wrangler.toml:33`, queue consumer at line 50 | Yes (infra) | Emails won't be queued — should log error and return 503 |
| `CAMPAIGN_QUEUE` | `backend/wrangler.toml` | Yes (infra) | Campaign sends fail — should return clear error |
| `JWT_SECRET` | Not used for unsubscribe tokens (unsubscribe not implemented) | Would be required | N/A — feature missing |
| `NEXT_PUBLIC_API_URL` | `desktop/src/lib/api/config.ts` | Yes | Falls back to `http://localhost:8787/api/v1` — OK for dev |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `/communication/compose` | Raw email input — users type email strings, no contact search Combobox | Replace `RecipientInput` with searchable `Combobox` calling contacts API with search param |
| `/communication/compose` | No auto-populate — navigating from contact/lead doesn't prefill recipient | Read `?contactId=` and `?leadId=` from URL params and prefill To field via API lookup |
| `/communication/compose` | Local hardcoded templates only (6 templates at lines 29-45) | Fetch templates from `templatesApi.list({ channel: 'email' })` instead of hardcoded array |
| `/communication/compose` | Attachment upload simulated — `toast.success('File attached (simulated)')` at line 134 | Implement real file picker and base64 encoding for attachments |
| `/communication/compose` | CC/BCC lost in API call — only `firstRecipient?.id` sent as `contact_id` (line 158) | Send all recipients via proper API params |
| `/communication/page.tsx` | No infinite scroll — uses `useApiQuery` with static pagination | Use `useInfiniteScroll` from `desktop/src/hooks/use-infinite-scroll.ts` |
| `/communication/page.tsx` | No FilterBar — basic search only | Add `FilterBar` with channel, date range, status filters |
| `/communication/page.tsx` | No detail panel — right panel shows static prompt text | Show selected conversation detail/preview on click |
| `/communication/page.tsx` | Hardcoded unread state — `idx < 3` sets unread=true | Compute from actual message data |
| `/communication/[contactId]` | No infinite scroll for message history | Use `useInfiniteScroll` for conversation timeline |
| `/communication/bulk-send` | Hardcoded segments and tags — mock data, no API integration | Fetch real segments/tags from backend API |
| `/communication/bulk-send` | No recipient count validation — shows estimated but no real check | Call segment resolver API to get real count before send |
| `/communication/templates` | No infinite scroll — grid uses static pagination | Use `useInfiniteScroll` for template grid |
| `/campaigns/page.tsx` | No infinite scroll — table uses pagination without `useInfiniteScroll` | Use `useInfiniteScroll` for campaign table |
| `/campaigns/page.tsx` | No FilterBar component — uses inline search + selects | Replace with `FilterBar` for consistency |
| `/campaigns/page.tsx` | Missing pagination controls — no page buttons or Load More | Add pagination UI or infinite scroll |
| `/campaigns/[id]` | Mock recipients data — hardcoded array of 8 recipients | Fetch real recipients from `GET /campaigns/:id` with recipient data |
| `/campaigns/new` | Hardcoded template list — not fetched from API | Fetch from `templatesApi.list()` |
| `/campaigns/new` | Custom filter unimplemented — shows placeholder "Advanced" text | Implement real filter builder or remove option |
| `/communication/templates/new` | Variable syntax `{{name}}` inconsistent with edit page `{customer_name}` | Standardize on one syntax across all template pages |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `/communication/compose` | Plain textarea for body | Rich HTML editor (TipTap/Tiptap) for email body with formatting toolbar | High |
| `/communication/compose` | No draft auto-save | Auto-save draft every 30 seconds to localStorage or API | Medium |
| `/communication/compose` | No keyboard shortcuts | Add Ctrl+Enter to send, Ctrl+Shift+A for attachments | Low |
| `/communication/page.tsx` | No loading skeletons for conversation list | Add `Skeleton` components while fetching | Medium |
| `/communication/page.tsx` | No message search within conversations | Add search-in-conversation functionality | Low |
| `/communication/[contactId]` | No message reply/forward actions | Add reply, forward, and quote buttons on messages | Medium |
| `/communication/[contactId]` | No error details for failed messages | Show error reason on hover/click for failed status | Medium |
| `/communication/bulk-send` | No recipient preview before send | Show list of matched contacts before confirming send | High |
| `/communication/bulk-send` | SMS character counter missing | Add live SMS character counter with segment count | Medium |
| `/communication/templates` | No sorting options | Add sort by name, date created, channel, usage count | Low |
| `/communication/templates` | No bulk operations | Add multi-select for bulk delete/duplicate | Low |
| `/campaigns/page.tsx` | No column sorting | Add sortable table headers for all metric columns | Medium |
| `/campaigns/page.tsx` | No export functionality | Add export campaign list to CSV/Excel | Low |
| `/campaigns/[id]` | No recipient search/filter | Add search/filter on recipients table | Medium |
| `/campaigns/[id]` | No recipient export | Add export recipients with delivery status to CSV | Low |
| `/campaigns/[id]` | Basic delivery funnel bars | Replace with proper chart (recharts) for open/click rates over time | Medium |
| `/campaigns/new` | No audience preview | Show preview of matched contacts before proceeding | High |
| `/campaigns/new` | No auto-save for drafts | Save campaign draft state to prevent data loss | Medium |
| Settings | No email signature settings page | Add `/settings/email-signature` page with rich text editor | High |
| Settings | No unsubscribe management page | Add `/settings/unsubscribes` page showing all unsubscribed contacts | High |

## Ticket Details

### TICKET-149: SendGrid Service Setup — DONE
**Backend:** DONE — `backend/src/services/sendgrid.ts` (304 lines) fully implemented with `sendEmail()`, `sendWithTemplate()`, `sendBulk()`. Supports HTML+text, CC/BCC, attachments, custom from/reply-to. Uses `env.SENDGRID_API_KEY`.
**Frontend:** N/A (backend-only ticket)
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None

---

### TICKET-150: Email Sending API — DONE
**Backend:** DONE — `backend/src/routes/communications.ts` handles `channel: 'email'` (lines 109-114 validate contact email, line 140 routes to queue). `backend/src/queues/email-queue.ts` processes email jobs with SendGrid integration.
**Frontend:** N/A (backend-only ticket)
**API Client:** N/A
**UX Issues:** None — email channel correctly validated and queued.
**Fix Required:** None

---

### TICKET-151: Rich HTML Email Composition — PARTIAL
**Backend:** N/A (frontend ticket)
**Frontend:** PARTIAL — `desktop/src/app/(app)/communication/compose/page.tsx` exists with basic email composer: To/CC/BCC recipients, subject, body textarea, template selector. However:
- Body is plain `<textarea>` — NO rich text editor (Bold, Italic, lists, etc.)
- Attachment upload is **simulated** — `toast.success('File attached (simulated)')` at line 134
- No email signature auto-append
- No draft auto-save
- Template selector uses **local hardcoded templates** (lines 29-45), not API templates
- No preview tab rendering HTML
**API Client:** DONE — `communicationsApi.send()` correctly sends to `/communications/send`
**UX Issues:**
1. `compose/page.tsx:92-98` — Raw email input, no contact search Combobox
2. `compose/page.tsx:155-158` — Only first recipient's ID used as `contact_id`, CC/BCC recipients ignored in API call
3. `compose/page.tsx:130-134` — Attachment upload simulated, not real
4. No URL param reading for `?contactId=` or `?leadId=` auto-population
**Fix Required:**
1. `compose/page.tsx:92` — Replace raw `<input>` with searchable `Combobox` that fetches contacts
2. `compose/page.tsx:29-45` — Replace local `emailTemplates` with API call to `templatesApi.list({ channel: 'email' })`
3. `compose/page.tsx:130-134` — Implement real file upload with base64 encoding
4. `compose/page.tsx:157-158` — Send all recipients (to, cc, bcc) to API, not just first

---

### TICKET-152: Email Templates UI — PARTIAL
**Backend:** DONE — `backend/src/routes/templates.ts` (330 lines) has full CRUD for templates with channel/category filtering, variable extraction, search.
**Frontend:** PARTIAL — Template management pages exist:
- `desktop/src/app/(app)/communication/templates/page.tsx` — Grid view with search + channel + category filters ✓
- `desktop/src/app/(app)/communication/templates/new/page.tsx` — Create template with channel, category, subject, body, variable insertion ✓
- `desktop/src/app/(app)/communication/templates/[id]/edit/page.tsx` — Edit with language selector, delete ✓
- Missing: **No email-specific HTML body editor** — uses plain textarea for body
- Missing: **No template gallery** with pre-designed HTML email templates
- Missing: **No "Duplicate & Customize" button** from gallery
- Missing: **Email-specific variables** ({unsubscribe_link}, {view_in_browser_link}, {company_logo_url}) not shown
- Missing: **Email template preview** with email-like frame (to/from/subject header mockup)
**API Client:** DONE — `desktop/src/lib/api/templates.ts` has `list()`, `create()`, `getById()`, `update()`, `delete()`
**UX Issues:**
1. `templates/new/page.tsx` — Variable syntax uses `{customer_name}` while compose page uses `{{name}}` — inconsistent
2. `templates/page.tsx` — No infinite scroll for template grid
3. `templates/new/page.tsx` — Missing language field (edit page has it, create doesn't)
**Fix Required:**
1. Standardize variable syntax across all template pages
2. Add infinite scroll to templates grid
3. Add language field to create template page

---

### TICKET-153: Bulk Email Campaigns — PARTIAL
**Backend:** DONE — `backend/src/routes/campaigns.ts` has full CRUD: `POST /`, `GET /`, `GET /:id`, `POST /:id/send`, `POST /:id/schedule`, `POST /:id/cancel`, `PUT /:id`, `DELETE /:id`. Schema at `backend/src/db/tenant-schema.ts:980-1004` has `email_campaigns` table with all required fields. `backend/src/services/segment-resolver.ts` implements segment filtering (tags, cities, countries, contact types, birthday month, date ranges, 5000 cap).
**Frontend:** PARTIAL — Campaign pages exist:
- `desktop/src/app/(app)/campaigns/page.tsx` — List with stats dashboard, search, type/status filters, table ✓
- `desktop/src/app/(app)/campaigns/new/page.tsx` — 4-step wizard (Details → Audience → Content → Schedule) ✓
- `desktop/src/app/(app)/campaigns/[id]/page.tsx` — Detail with metrics, delivery funnel, recipients table ✓
- BUT: Wizard uses **hardcoded templates** and **hardcoded segments/tags** — not API-driven
- Recipients on detail page are **mock data** (8 hardcoded recipients)
- No audience preview (can't see who will receive before send)
- Custom filter tab is **unimplemented** ("Advanced" placeholder)
**API Client:** DONE — `desktop/src/lib/api/campaigns.ts` has `list()`, `getById()`, `create()`, `update()`, `delete()`, `send()`, `schedule()`, `cancel()`
**UX Issues:**
1. `campaigns/page.tsx` — No infinite scroll, no FilterBar, no column sorting
2. `campaigns/new/page.tsx` — Hardcoded data instead of API calls for templates, segments, tags
3. `campaigns/[id]/page.tsx` — Mock recipients, no search/filter/pagination on recipients table
**Fix Required:**
1. `campaigns/page.tsx` — Add `useInfiniteScroll` and `FilterBar`
2. `campaigns/new/page.tsx` — Fetch templates from API, fetch segments/tags from API
3. `campaigns/[id]/page.tsx` — Fetch real recipients from API

---

### TICKET-154: Email Tracking — Open & Click Rates — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/webhooks.ts` handles SendGrid events: processed, delivered, open, click, bounce, dropped, spam_report, unsubscribe. Updates `emailMessageLog` entries. Hard bounces nullify contact email. BUT:
- **No dedicated `email_tracking` table** — spec requires separate table with id, message_log_id, event_type, url, user_agent, ip_address, timestamp
- Tracking is stored inline in `emailMessageLog` (openedAt, clickedAt fields) — not per-event granularity
- No open_count tracking (just first openedAt timestamp)
- Missing: webhook signature verification for security
**Frontend:** MISSING — No per-contact tracking display ("Opened 3 times, Last opened: Feb 15") visible in communication hub. No tracking indicators on email messages.
**API Client:** N/A — No tracking-specific API endpoints
**UX Issues:**
1. No tracking badges on email messages in communication timeline
2. No per-contact email engagement data visible
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add dedicated `email_tracking` table per spec
2. `backend/src/routes/webhooks.ts` — Insert into `email_tracking` for each event (not just update log)
3. `desktop/src/app/(app)/communication/[contactId]/page.tsx` — Show tracking badges on email messages

---

### TICKET-155: Unsubscribe Management — MISSING
**Backend:** MISSING —
- **No `unsubscribes` table** in `tenant-schema.ts` (only `unsubscribedCount` on campaigns and `unsubscribed` as a status in `emailMessageLog`)
- **No public unsubscribe endpoint** in `backend/src/routes/public.ts` (only has quotation view)
- No unsubscribe token generation/verification
- No `List-Unsubscribe` email header in SendGrid service
- Segment resolver does NOT exclude unsubscribed contacts
**Frontend:** MISSING —
- No unsubscribe management page in Settings
- No warning when sending to unsubscribed contact
- No re-subscribe functionality
**API Client:** MISSING — No unsubscribe-related endpoints
**UX Issues:** Entire feature missing — GDPR/CAN-SPAM compliance gap
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `unsubscribes` table (id, contact_id, email, channel, reason, unsubscribed_at)
2. `backend/src/routes/public.ts` — Add `GET /unsubscribe?token=xxx` endpoint with token verification
3. `backend/src/services/sendgrid.ts` — Add `List-Unsubscribe` header to bulk/marketing emails
4. `backend/src/services/segment-resolver.ts` — Exclude unsubscribed contacts from segments
5. `desktop/src/app/(app)/settings/` — Add unsubscribe list management page
6. `desktop/src/components/communication/send-message-dialog.tsx` — Warn when contact is unsubscribed

---

### TICKET-156: Email Attachments — CRM Document Integration — PARTIAL
**Backend:** PARTIAL — `backend/src/queues/email-queue.ts` handles attachments in email jobs. `backend/src/services/sendgrid.ts` sends attachments as base64. BUT: No CRM document PDF generation integration (no endpoint to generate itinerary/invoice/voucher PDFs for attachment).
**Frontend:** BUG — `desktop/src/app/(app)/communication/compose/page.tsx:130-134` attachment upload is **simulated** — `toast.success('File attached (simulated)')`. No real file picker, no document picker (itinerary/invoice/voucher), no file size validation.
**API Client:** PARTIAL — `communicationsApi.send()` doesn't pass attachments to API
**UX Issues:**
1. `compose/page.tsx:130-134` — Entire attachment flow is fake/simulated
2. No "Attach Document" dropdown for CRM documents (itinerary, invoice, voucher)
3. No file size validation (spec: 10MB per file, 25MB total, max 5 files)
**Fix Required:**
1. `compose/page.tsx:130-139` — Implement real file picker with `<input type="file">` and base64 encoding
2. `compose/page.tsx` — Add document attachment picker for itineraries/invoices/vouchers
3. `compose/page.tsx:157-162` — Pass attachments array in API call

---

### TICKET-157: Email Log in Communication Hub — PARTIAL
**Backend:** DONE — Communications API returns messages with channel info, message_log has email entries.
**Frontend:** PARTIAL — `desktop/src/app/(app)/communication/[contactId]/page.tsx` shows email messages in timeline with:
- Channel icons and labels ✓
- Subject line display ✓
- Message content ✓
- Timestamps ✓
- Status badges (sent, delivered, read, failed, queued) ✓
- BUT: No expandable full HTML body rendering (just truncated text)
- No tracking indicators ("Opened 3 times", "Clicked 1 link")
- No attachment indicators (paperclip icon with count)
- No reply button that pre-fills "Re: [subject]" with quoted email
**API Client:** DONE — `communicationsApi.getHistory()` fetches conversation
**UX Issues:**
1. No infinite scroll for message history
2. No email expand/collapse for full HTML view
3. No tracking data display
4. No attachment indicator
**Fix Required:**
1. `communication/[contactId]/page.tsx` — Add expandable HTML email view
2. `communication/[contactId]/page.tsx` — Add tracking badges from email_tracking data
3. `communication/[contactId]/page.tsx` — Add attachment indicator
4. `communication/[contactId]/page.tsx` — Add reply button with "Re:" subject prefill

---

### TICKET-158: Email Signature Settings — MISSING
**Backend:** MISSING — `backend/src/routes/users.ts` has no signature endpoints. No `PUT /users/me/signature` or `GET /users/me/signature`. No `email_signature` field in user schema.
**Frontend:** MISSING — No email signature settings page exists in `/settings/`. No signature preview in compose screen.
**API Client:** MISSING — No signature-related API methods
**UX Issues:** Entire feature missing
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `emailSignature` (TEXT) field to users table
2. `backend/src/routes/users.ts` — Add `GET /me/signature` and `PUT /me/signature` endpoints
3. `desktop/src/app/(app)/settings/` — Add email signature settings page with rich text editor
4. `desktop/src/app/(app)/communication/compose/page.tsx` — Auto-append signature below body

---

### TICKET-159: Campaign Analytics Dashboard — PARTIAL
**Backend:** PARTIAL — `GET /campaigns/:id` returns campaign with stats (sentCount, openedCount, clickedCount, bouncedCount, unsubscribedCount). BUT: No per-contact delivery stats endpoint, no open-rate-over-time data, no click heatmap data.
**Frontend:** PARTIAL — `desktop/src/app/(app)/campaigns/[id]/page.tsx` shows:
- Stats cards: Sent, Delivered, Opened, Clicked, Bounced, Failed with rates ✓
- Delivery funnel visualization (progress bars) ✓
- Campaign info card (channel, status, created, segment) ✓
- Content preview card ✓
- Recipients table ✓
- BUT: Recipients are **mock data** (hardcoded 8 entries)
- No open rate chart over time (line chart)
- No click heatmap
- No campaign comparison feature
- No export to Excel
- No summary widget on communications dashboard
**API Client:** DONE — `campaignsApi.getById()` fetches campaign detail
**UX Issues:**
1. `campaigns/[id]/page.tsx` — Mock recipients data instead of API
2. No chart library integration (recharts) for open rate over time
3. No export functionality
**Fix Required:**
1. `campaigns/[id]/page.tsx` — Fetch real recipients from API with delivery status
2. Consider adding time-series tracking data endpoint for charts

---

### TICKET-160: Campaign Scheduling via Queues — PARTIAL
**Backend:** PARTIAL —
- `POST /campaigns/:id/schedule` endpoint exists in `backend/src/routes/campaigns.ts` ✓ (validates future time, sets status to 'scheduled')
- `POST /campaigns/:id/cancel` endpoint exists ✓
- Cron trigger configured in `backend/wrangler.toml:116` (`*/5 * * * *`) ✓
- BUT: **No `backend/src/cron/campaign-scheduler.ts` file** — the cron handler that checks for scheduled campaigns and queues emails does not exist
- Scheduled campaigns stay in 'scheduled' status forever — never auto-trigger
**Frontend:** PARTIAL — Campaign wizard has schedule option with date/time picker. BUT: No countdown display ("Sending in 2 hours 30 minutes") on scheduled campaigns.
**API Client:** DONE — `campaignsApi.schedule()` and `campaignsApi.cancel()` exist
**UX Issues:**
1. `campaigns/[id]/page.tsx` — No countdown timer for scheduled campaigns
**Fix Required:**
1. Create `backend/src/cron/campaign-scheduler.ts` — Cron handler that finds campaigns with `status='scheduled' AND scheduledAt <= now()` and triggers sending
2. Wire cron handler into worker's `scheduled()` export in `backend/src/index.ts`
3. `campaigns/[id]/page.tsx` — Add countdown timer for scheduled campaigns

---

### TICKET-161: Email Navigation & GoRouter Routes — DONE
**Backend:** N/A
**Frontend:** DONE — Sidebar navigation in `desktop/src/components/layout/sidebar.tsx` has Communication section with:
- Inbox (`/communication`) — line 104
- Call Log (`/communication/calls`) — line 105
- Templates (`/communication/templates`) — line 106
- Bulk Send (`/communication/bulk-send`) — line 107
- Campaigns (`/campaigns`) — line 108
All pages exist and are routable via Next.js App Router.
Note: Ticket spec mentions Flutter routes but desktop implementation uses Next.js routes — all equivalent routes present.
**API Client:** N/A
**UX Issues:** None — navigation is complete
**Fix Required:** None

---

### TICKET-162: SendGrid Dynamic Templates Integration — DONE
**Backend:** DONE — `backend/src/services/sendgrid.ts` has `sendWithTemplate()` method that sends via SendGrid Dynamic Template ID with `dynamic_template_data`. Campaign routes support `templateId` field that maps to SendGrid template. Fallback to HTML body if no template linked.
**Frontend:** PARTIAL — Campaign wizard has template selector but uses hardcoded list. No UI to link CRM template to SendGrid Dynamic Template. No `GET /sendgrid/templates` proxy endpoint to list available SendGrid templates.
**API Client:** N/A — No SendGrid templates listing endpoint
**UX Issues:**
1. No way to browse/select SendGrid Dynamic Templates from UI
**Fix Required:**
1. `backend/src/routes/` — Add `GET /sendgrid/templates` proxy endpoint
2. `campaigns/new/page.tsx` — Add option to select SendGrid Dynamic Template

---

## Critical Issues Summary

### Must Fix (Blocking)
1. **TICKET-155 entirely missing** — No unsubscribe management (GDPR/CAN-SPAM compliance gap)
2. **TICKET-158 entirely missing** — No email signature settings
3. **TICKET-160 cron handler missing** — Scheduled campaigns never auto-trigger
4. **TICKET-154 no tracking table** — Email tracking stored inline, no per-event granularity
5. **Compose page raw ID input** — No contact search Combobox in email compose
6. **Simulated attachments** — File attachment in compose is fake
7. **Hardcoded mock data** — Campaigns, bulk send, templates all use hardcoded arrays instead of API

### Should Fix (Important UX)
8. **No infinite scroll** — Communication inbox, templates, campaigns pages all missing `useInfiniteScroll`
9. **No FilterBar** — Communication inbox and campaigns pages don't use `FilterBar`
10. **Variable syntax inconsistency** — `{{name}}` vs `{customer_name}` across pages
11. **No auto-populate from URL params** — Compose page ignores `?contactId=` parameter
12. **Mock recipients in campaign detail** — Hardcoded 8 recipients instead of API data

### Nice to Have
13. Rich HTML editor for email compose (currently plain textarea)
14. Draft auto-save
15. Campaign comparison view
16. Open rate chart over time
17. Keyboard shortcuts
