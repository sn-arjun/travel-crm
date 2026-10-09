# Milestone 17 Audit Report — Marketing & Promotions
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m17.md

## Summary
| Status   | Count |
|----------|-------|
| DONE     | 2     |
| PARTIAL  | 10    |
| MISSING  | 5     |
| BUG      | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `TWILIO_ACCOUNT_SID` | `backend/src/queues/campaign-queue.ts`, `backend/src/types.ts` | Yes (for WhatsApp/SMS campaigns) | Campaign send fails — show "SMS/WhatsApp not configured" in UI |
| `TWILIO_AUTH_TOKEN` | `backend/src/queues/campaign-queue.ts`, `backend/src/types.ts` | Yes (for WhatsApp/SMS campaigns) | Campaign send fails — show "SMS/WhatsApp not configured" in UI |
| `TWILIO_WHATSAPP_FROM_NUMBER` | `backend/src/queues/campaign-queue.ts` | Yes (for WhatsApp campaigns) | Skip WhatsApp channel — disable WhatsApp campaign type selector |
| `TWILIO_SMS_FROM_NUMBER` | `backend/src/queues/campaign-queue.ts` | Yes (for SMS campaigns) | Skip SMS channel — disable SMS campaign type selector |
| `SENDGRID_API_KEY` | `backend/src/queues/campaign-queue.ts`, `backend/src/services/sendgrid.ts` | Yes (for email campaigns) | Email send fails — disable email campaign type selector |
| `CAMPAIGN_QUEUE` | `backend/src/routes/marketing/campaigns.ts`, `backend/src/types.ts` | Yes (Cloudflare Queue binding) | Campaign send cannot be enqueued — show error "Queue not configured" |
| `NEXT_PUBLIC_API_URL` | `desktop/src/lib/api/config.ts` | No | Falls back to `http://localhost:8787/api/v1` |
| `R2_BUCKET` | Not referenced in marketing routes (MISSING) | Yes (for image/flyer uploads per spec) | Image upload fails — should show "Storage not configured" |
| `R2_PUBLIC_URL` | Not referenced in marketing routes (MISSING) | Yes (for image/flyer public URLs per spec) | Cannot generate public URLs — should show placeholder images |
| `SENDGRID_FROM_EMAIL` | Not referenced (MISSING) | Yes (for email campaigns per spec) | Email campaigns fail — should show "Email sender not configured" |
| `SENDGRID_FROM_NAME` | Not referenced (MISSING) | Yes (for email campaigns per spec) | Email campaigns fail |
| `SENDGRID_UNSUBSCRIBE_GROUP_ID` | Not referenced (MISSING) | Yes (for email unsubscribe per spec) | No unsubscribe group — emails may violate CAN-SPAM |
| `UNSUB_SECRET` | Not referenced (MISSING) | Yes (for HMAC unsubscribe tokens per spec) | Unsubscribe links can be forged |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `/marketing/campaigns/page.tsx` | No infinite scroll | Replace `limit: 100` with `useInfiniteScroll` from `desktop/src/hooks/use-infinite-scroll.ts` |
| `/marketing/campaigns/page.tsx` | No loading skeletons | Replace `<Loader>` spinner with skeleton rows in table |
| `/marketing/campaigns/page.tsx` | No detail drawer | Add slide-over drawer for campaign quick-view on row click |
| `/marketing/campaigns/page.tsx` | No FilterBar component | Replace custom filter inputs with `FilterBar` from `desktop/src/components/domain/filter-bar.tsx` |
| `/marketing/segments/page.tsx` | No infinite scroll | Replace `limit: 100` with `useInfiniteScroll` |
| `/marketing/segments/page.tsx` | No loading skeletons | Replace `<Loader>` spinner with skeleton rows |
| `/marketing/segments/page.tsx` | No detail drawer | Add slide-over drawer for segment quick-view |
| `/marketing/segments/page.tsx` | No FilterBar component | Replace custom search with `FilterBar` |
| `/marketing/flyers/page.tsx` | No infinite scroll | Template gallery has no pagination |
| `/marketing/flyers/page.tsx` | No loading skeletons | No skeleton placeholders during template load |
| `/marketing/branding/page.tsx` | No loading skeletons | No skeleton during branding data fetch |
| `/campaigns/page.tsx` | No infinite scroll | Same as marketing/campaigns — `limit: 100` |
| `/campaigns/page.tsx` | No loading skeletons | Basic spinner instead of skeleton rows |
| `/campaigns/page.tsx` | No detail drawer | No slide-over for campaign preview |
| `/campaigns/new/page.tsx` | No Combobox for template selection | Template selector uses plain `<Select>` instead of searchable `Combobox` |
| `/campaigns/new/page.tsx` | No auto-populate from parent context | Navigating from a segment doesn't pre-fill audience step |
| `/campaigns/[id]/page.tsx` | No infinite scroll on recipients | Fixed `limit: 50` on recipients table |
| `/campaigns/[id]/page.tsx` | No loading skeletons | Spinner instead of skeleton cards for stats |
| `/marketing/social/page.tsx` | No infinite scroll | Posts list has no pagination |
| `/marketing/social/page.tsx` | No loading skeletons | No skeleton placeholders |
| ALL marketing pages | No SendMessageDialog integration | Test messages / quick share should use `SendMessageDialog` from `desktop/src/components/communication/send-message-dialog.tsx` |
| ALL marketing list pages | Missing hover actions consistency | Some pages have DropdownMenu but missing inline icon buttons (Eye, Pencil, Trash2) |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `/marketing/campaigns/page.tsx` | Stats cards at top (3 cards) | Add "campaigns this month" trend sparkline chart | Medium |
| `/marketing/campaigns/page.tsx` | No bulk operations | Add checkbox selection + bulk delete/archive/send | Medium |
| `/marketing/campaigns/page.tsx` | No keyboard shortcuts | Add `Ctrl+N` for new campaign, `Del` for delete selected | Low |
| `/marketing/segments/page.tsx` | No duplicate segment action | Add "Use in Campaign" quick action that navigates to campaign creation with segment pre-selected | High |
| `/marketing/segments/new/page.tsx` | No real-time preview count | Add live contact count that updates as rules change (debounced API call) | High |
| `/marketing/flyers/page.tsx` | Simple gallery + editor split | Add template categories as tabs/chips above gallery grid | Medium |
| `/marketing/flyers/page.tsx` | No "My Flyers" gallery | Add tab or link to view previously generated flyers | High |
| `/marketing/flyers/page.tsx` | No quick create flow | Add "Quick Create" badge on eligible templates + fast-path flow | High |
| `/marketing/branding/page.tsx` | Basic form layout | Add "Preview as Email" and "Preview as Flyer" tabs to see branding applied | Medium |
| `/campaigns/new/page.tsx` | 4-step wizard | Add step progress indicator with clickable step numbers for back-navigation | Medium |
| `/campaigns/[id]/page.tsx` | Static stats | Add auto-refresh polling every 30s while campaign status is "sending" | High |
| `/campaigns/[id]/page.tsx` | No CSV export | Add "Export Report" button to download recipient status as CSV | Medium |
| `/marketing/social/page.tsx` | Week view non-functional | Implement calendar integration for scheduled post visualization | Low |
| Sidebar | Marketing campaigns separate from communication Campaigns | Consider consolidating or clearly differentiating the two campaign sections | Medium |
| Sidebar | Missing "Festival Offers" nav item | Add Festival Offers sub-item under Marketing when TICKET-306 is implemented | High |
| Sidebar | Missing "Opted-Out Contacts" nav item | Add Opted-Out sub-item under Marketing when TICKET-305 is implemented | High |
| Sidebar | Missing "Dashboard" nav item for marketing | Add Marketing Dashboard as first sub-item | High |

## Ticket Details

---

### TICKET-290: Flyer Template Library — Database Schema & API — PARTIAL
**Backend:** DONE — `flyer_templates` and `flyer_template_assets` tables exist in `backend/src/db/tenant-schema.ts` with all required columns. Route file `backend/src/routes/marketing/flyer-templates.ts` (297 lines) exists with GET list, GET by ID, POST create, PUT update, DELETE soft-delete, POST add asset, DELETE remove asset. Properly mounted in `backend/src/index.ts`.
**Frontend:** PARTIAL — No dedicated template gallery page exists at `/marketing/flyer-templates`. The template gallery is embedded within the flyer builder at `/marketing/flyers/page.tsx`.
**API Client:** DONE — `desktop/src/lib/api/marketing.ts` has `flyerTemplates.list()` method.
**UX Issues:**
- No category tabs/chips for filtering templates (festival/destination/offer/general)
- No size preset filter dropdown
- No "My Templates" tab for user-created templates
- No template preview on long-press/hover
- No "Quick Create" badge indicator
- No pull-to-refresh
- No empty state for custom templates section
**Fix Required:**
1. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add category chips (All, Festival, Destination, Offer, General) above template grid
2. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add size preset filter dropdown
3. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add "My Templates" vs "System Templates" tab toggle
4. `backend/src/db/seeds/flyer-template-seeds.ts` — MISSING: no seed file for 20+ system templates

---

### TICKET-291: Image Library — R2 Storage & Management API — PARTIAL
**Backend:** PARTIAL — `image_library` table exists with all required columns. Route file `backend/src/routes/marketing/images.ts` (222 lines) exists with GET list, POST upload, POST upload-logo, DELETE. However, R2 bucket integration is not referenced — `R2_BUCKET` and `R2_PUBLIC_URL` env vars are not used in the marketing route files. Image upload likely stores URLs only, not actual R2 objects.
**Frontend:** PARTIAL — Image upload exists in flyer builder (`/marketing/flyers/page.tsx`) but there is no dedicated image library browser page.
**API Client:** DONE — `desktop/src/lib/api/marketing.ts` has `images.list()`, `images.upload()`, `images.delete()` methods.
**UX Issues:**
- No dedicated image library browser page
- No image category tabs (stock/uploaded/logo)
- No tag-based search
- No drag-and-drop upload zone
- No thumbnail grid view
**Fix Required:**
1. `backend/src/routes/marketing/images.ts` — Verify R2 bucket integration; add `R2_BUCKET` env binding for actual file storage
2. `backend/src/services/image-processing.ts` — MISSING: no thumbnail generation utility
3. Desktop — Add image library browser component or page
4. `backend/src/db/seeds/` — MISSING: no seed for 50+ stock travel images

---

### TICKET-292: Flyer Builder — Flutter Canvas Editor — PARTIAL
**Backend:** N/A (frontend-only ticket, uses APIs from TICKET-290/291)
**Frontend:** PARTIAL — `desktop/src/app/(app)/marketing/flyers/page.tsx` implements a basic flyer builder with text editing (headline, subheadline, offer, contact info), color scheme selection (6 presets), font size control, and image upload. However it is NOT a true WYSIWYG canvas editor as specified.
**API Client:** DONE — Uses `marketing.flyers.create()`, `marketing.flyers.update()`, `marketing.flyerTemplates.list()`.
**UX Issues:**
- Not a true canvas editor — no drag-and-drop element positioning
- No resize handles for elements
- No layer ordering (bring to front/send to back)
- No undo/redo support
- No zoom/pinch functionality
- No grid/snap alignment
- No background color/image picker
- No brand auto-apply on template load
- No size preset switcher (Instagram, Story, Facebook, WhatsApp)
- No preview mode
- No save draft functionality visible in UI
**Fix Required:**
1. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Major rewrite needed to implement true canvas editor with drag-and-drop, resize, layers
2. Add undo/redo state management
3. Add size preset switcher component
4. Add brand auto-apply on template load using branding API
5. Add preview mode toggle
6. Add draft save/resume functionality

---

### TICKET-293: Flyer Template Gallery Screen — PARTIAL
**Backend:** N/A (uses TICKET-290 APIs)
**Frontend:** PARTIAL — Template gallery exists as part of `/marketing/flyers/page.tsx` with a 3-column grid of template cards. However, it lacks many specified features.
**API Client:** DONE — `marketing.flyerTemplates.list()` exists.
**UX Issues:**
- No category tabs (All, Festival, Destination, Offer, General)
- No size preset filter
- No "My Templates" section
- No "Start from scratch" option
- No template preview on hover/long-press
- No "Quick Create" badge on eligible templates
- No infinite scroll/pagination
- No empty state for custom templates
**Fix Required:**
1. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add category filter chips
2. Add "Start from scratch" card as first item in gallery
3. Add template preview overlay on hover
4. Add pagination/infinite scroll for large template libraries
5. Add "My Templates" vs "System" toggle

---

### TICKET-294: Brand Consistency — Auto-Apply Tenant Branding — PARTIAL
**Backend:** PARTIAL — `tenant_branding` table exists but MISSING `logo_r2_key` column. Route `backend/src/routes/marketing/branding.ts` (137 lines) exists with GET and PUT (upsert). Mounted in index.ts.
**Frontend:** DONE — `desktop/src/app/(app)/marketing/branding/page.tsx` implements branding settings with color pickers (primary, secondary), logo upload (drag-drop or URL), font family selector (6 fonts), tagline, email footer, custom CSS, and live preview panel.
**API Client:** DONE — `marketing.branding.get()`, `marketing.branding.update()` exist.
**UX Issues:**
- Missing `logo_r2_key` column in schema — logo R2 storage key not tracked for cleanup
- No brand auto-apply on template load in flyer editor (TICKET-292 dependency)
- No "Preview as flyer" option in branding settings
- Live preview only shows email-style layout, not flyer preview
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `logo_r2_key` TEXT column to `tenant_branding` table
2. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Implement brand auto-apply when loading a template (fetch branding → inject logo, colors, agency name)

---

### TICKET-295: Flyer Export — JPEG, PNG, PDF & Social Media Presets — PARTIAL
**Backend:** PARTIAL — `generated_flyers` table exists but MISSING `size_preset` column and uses `format` instead of `export_format` as specified. Route `backend/src/routes/marketing/flyers.ts` (229 lines) exists with POST save, POST upload to R2, and share endpoint. However, no server-side PDF rendering service exists.
**Frontend:** PARTIAL — Export button exists in flyer builder page. Share link generation works. But no format selection dropdown (JPEG/PNG/PDF), no social media dimension enforcement, no progress indicator during export.
**API Client:** DONE — `marketing.flyers.create()`, `marketing.flyers.update()`, `marketing.flyers.delete()` exist.
**UX Issues:**
- No export format dropdown (JPEG/PNG/PDF)
- No social media size preset enforcement (pixel dimensions not validated)
- No "My Flyers" gallery page for viewing previously exported flyers
- No progress indicator during export
- No PDF export endpoint on backend
- Missing `size_preset` column in `generated_flyers` table
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `size_preset` TEXT column to `generated_flyers`, rename `format` to `export_format`
2. `backend/src/services/pdf-renderer.ts` — MISSING: create PDF rendering service
3. `backend/src/routes/marketing/flyers.ts` — Add PDF export endpoint
4. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add export format selector and size preset enforcement
5. Add "My Flyers" gallery page at `/marketing/flyers/my-flyers`

---

### TICKET-296: Quick Create Flow — 30-Second Flyer — MISSING
**Backend:** PARTIAL — `is_quick_create` flag exists on `flyer_templates` table in schema.
**Frontend:** MISSING — No quick create page exists at `/marketing/flyers/quick-create/`. No quick create flow implemented.
**API Client:** MISSING — No quick-create-specific API methods.
**UX Issues:**
- Entire quick create flow is missing
- No "Quick Create" entry point from template gallery
- No fast-path form (destination + price → auto-generate)
- No auto-preview with branding applied
- No "Use Again" button
**Fix Required:**
1. `desktop/src/app/(app)/marketing/flyers/quick-create/[templateId]/page.tsx` — Create new page with quick create form
2. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add "Quick Create" badge on templates where `is_quick_create = true`
3. Add route in Next.js App Router

---

### TICKET-297: One-Click Share — WhatsApp, Email & Download — PARTIAL
**Backend:** PARTIAL — `flyer_shares` table exists but has column mismatches: uses `sharedBy`/`sharedAt` instead of `created_by`/`created_at`, and MISSING `contact_id` field. Share endpoint exists in `backend/src/routes/marketing/flyers.ts` (POST `/share`).
**Frontend:** PARTIAL — Share button exists in flyer builder with link copy. However, no share sheet with WhatsApp/Email/Download options. No "share to specific contact" with contact picker.
**API Client:** PARTIAL — No dedicated share method visible; flyer share endpoint may not be called from frontend.
**UX Issues:**
- No share sheet dialog with WhatsApp, Email, Download, Copy Link options
- No contact picker for "share to specific contact"
- No share count on flyer cards in "My Flyers" gallery
- Missing `contact_id` in `flyer_shares` for tracking per-contact shares
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `contact_id` TEXT column to `flyer_shares` table, rename `sharedBy` → `created_by`, `sharedAt` → `created_at`
2. `desktop/src/app/(app)/marketing/flyers/page.tsx` — Add share dialog with WhatsApp, Email, Download, Copy Link options
3. Share to WhatsApp/Email should use `SendMessageDialog` from `desktop/src/components/communication/send-message-dialog.tsx`

---

### TICKET-298: Contact Segmentation Engine — Backend — DONE
**Backend:** DONE — `contact_segments` table exists with all required columns (id, tenant_id, name, description, filters_json, contact_count, is_dynamic, created_by, created_at, updated_at). Route `backend/src/routes/marketing/segments.ts` (314 lines) with all required endpoints: GET list, GET by ID, GET contacts preview, POST create, PUT update, POST refresh-count, DELETE soft-delete. Segmentation engine at `backend/src/services/segmentation-engine.ts` (182 lines) supports all required filter operators (equals, not_equals, contains, in, between, gt, lt, is_empty, is_not_empty, starts_with, ends_with) and all required fields (tags, city, state, country, birthday_month, last_travel_date, lead_source, total_bookings, total_spent, has_email, has_phone, opted_out). AND/OR logic with nested groups supported.
**Frontend:** N/A (this is backend-only ticket)
**API Client:** DONE — `marketing.segments.list()`, `marketing.segments.create()`, `marketing.segments.delete()` exist.
**UX Issues:** None for backend.
**Fix Required:**
1. `backend/src/db/seeds/segment-seeds.ts` — MISSING: no seed file for pre-built segments ("All Contacts", "Birthday This Month", "Inactive 6+ Months", "High Value", "Has WhatsApp")

---

### TICKET-299: Contact Segmentation — Flutter UI — PARTIAL
**Backend:** N/A (uses TICKET-298 APIs)
**Frontend:** PARTIAL — Segment list page exists at `/marketing/segments/page.tsx` with search, table (name, criteria summary, contact count, created date), and hover actions (Edit, Duplicate, Delete). Segment builder exists at `/marketing/segments/new/page.tsx` with AND/OR logic groups, field dropdowns, dynamic operators, add/remove rules. However, several features are missing.
**API Client:** DONE — `marketing.segments.list()`, `marketing.segments.create()`, `marketing.segments.delete()` exist.
**UX Issues:**
- No infinite scroll on segment list (uses `limit: 100`)
- No loading skeletons (uses Loader spinner)
- No detail drawer for segment quick-view
- No real-time contact count preview as filters change
- No "Use in Campaign" quick action button
- No edit segment page (Edit action exists but no dedicated `/segments/[id]/edit` page found)
- No FilterBar component (uses custom search)
- No empty state shows count of total matched contacts
**Fix Required:**
1. `desktop/src/app/(app)/marketing/segments/page.tsx` — Add `useInfiniteScroll`, loading skeletons, FilterBar, detail drawer
2. `desktop/src/app/(app)/marketing/segments/new/page.tsx` — Add real-time preview count (debounced API call to `/segments/:id/contacts`)
3. Add edit segment route at `/marketing/segments/[id]/edit/page.tsx`
4. Add "Use in Campaign" button that navigates to `/campaigns/new?segmentId=...`

---

### TICKET-300: Bulk WhatsApp Campaign — PARTIAL
**Backend:** DONE — `marketingCampaigns` table exists with all required columns including type field supporting 'whatsapp'. Route `backend/src/routes/marketing/campaigns.ts` (443 lines) with POST create, POST send (enqueues to CAMPAIGN_QUEUE), GET list, GET by ID, GET analytics, GET recipients, PUT update, POST cancel, DELETE. Campaign queue at `backend/src/queues/campaign-queue.ts` (243 lines) processes WhatsApp messages via Twilio API in batches of 50.
**Frontend:** PARTIAL — Campaign list at `/campaigns/page.tsx` and `/marketing/campaigns/page.tsx` with stats cards, filters, hover actions. Campaign creation wizard at `/campaigns/new/page.tsx` with 4-step flow (Details → Audience → Content → Schedule). Campaign detail at `/campaigns/[id]/page.tsx` with stats and recipients.
**API Client:** DONE — Full CRUD + send + schedule + cancel + getRecipients in `desktop/src/lib/api/campaigns.ts`.
**UX Issues:**
- No infinite scroll on campaign list or recipients
- No loading skeletons
- No detail drawer on campaign list
- Template selector in wizard uses plain `<Select>` instead of searchable Combobox
- No auto-populate when navigating from a segment
- No opt-out contact filtering visible in UI
**Fix Required:**
1. `desktop/src/app/(app)/campaigns/page.tsx` — Add `useInfiniteScroll`, loading skeletons, FilterBar, detail drawer
2. `desktop/src/app/(app)/campaigns/new/page.tsx` — Replace template `<Select>` with searchable `Combobox`; auto-populate segment from URL params
3. `desktop/src/app/(app)/campaigns/[id]/page.tsx` — Add infinite scroll on recipients, loading skeletons

---

### TICKET-301: Bulk SMS Campaign — PARTIAL
**Backend:** DONE — Campaign type `sms` supported in `marketingCampaigns` table. Campaign queue handles SMS via Twilio SMS API (`TWILIO_SMS_FROM_NUMBER`). Queue consumer processes SMS recipients.
**Frontend:** PARTIAL — Campaign creation wizard supports SMS type selection. However, no SMS-specific features are implemented.
**API Client:** DONE — Campaign API supports all types.
**UX Issues:**
- No character counter for SMS body (160 char limit per SMS)
- No multi-part SMS warning when exceeding 160 characters
- No SMS preview showing personalized message for first 3 contacts
- No Twilio delivery status callback webhook
**Fix Required:**
1. `desktop/src/app/(app)/campaigns/new/page.tsx` — Add character counter on content step when type=sms, show multi-part SMS warning at 160+
2. Add SMS preview showing personalized messages
3. `backend/src/routes/webhooks/twilio-sms-status.ts` — MISSING: create delivery status callback endpoint

---

### TICKET-302: Bulk Email Campaign — SendGrid HTML — PARTIAL
**Backend:** PARTIAL — Campaign queue handles email via SendGrid API. However, `email_templates` table is MISSING from schema. No dedicated `/marketing/email-templates` route file exists. No SendGrid event webhook exists for open/click/bounce tracking. `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`, `SENDGRID_UNSUBSCRIBE_GROUP_ID` env vars not referenced in marketing code.
**Frontend:** PARTIAL — Email campaign type exists in wizard, but no email template browser/editor, no HTML preview via WebView, no rich text editing.
**API Client:** PARTIAL — No email template CRUD methods in API client.
**UX Issues:**
- No email template library browser
- No HTML email editor
- No HTML preview (rendered WebView)
- No email template CRUD
- No SendGrid open/click tracking integration
- No unsubscribe link auto-append
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `email_templates` table with all specified columns
2. `backend/src/routes/marketing/email-templates.ts` — MISSING: create CRUD route file
3. `backend/src/routes/webhooks/sendgrid-events.ts` — MISSING: create webhook for open/click/bounce events
4. `desktop/src/lib/api/marketing.ts` — Add email template CRUD methods
5. `desktop/src/app/(app)/marketing/` — Add email template list + editor pages
6. `backend/src/db/seeds/email-template-seeds.ts` — MISSING: seed 10+ system email templates

---

### TICKET-303: Schedule Campaign Sending — PARTIAL
**Backend:** BUG — Campaign scheduler cron exists at `backend/src/cron/campaign-scheduler.ts` (131 lines) and is mounted in `backend/src/index.ts`. However, it queries `email_campaigns` table (which doesn't exist in M17 schema) instead of `marketingCampaigns`. Also uses `EMAIL_QUEUE` instead of `CAMPAIGN_QUEUE`. Schedule/cancel endpoints exist on campaigns route. No `CAMPAIGN_SCHEDULE_QUEUE` with delayed messages — uses cron polling instead (acceptable alternative).
**Frontend:** DONE — Schedule step exists in campaign creation wizard (`/campaigns/new/page.tsx` step 4) with date/time picker. Campaign detail page shows schedule dialog.
**API Client:** DONE — `campaigns.schedule(id, data)` exists.
**UX Issues:**
- Scheduler cron references wrong table (`email_campaigns` instead of `marketingCampaigns`)
- No timezone handling in scheduler
- No 15-minute minimum / 90-day maximum validation in frontend
- Campaign list doesn't show countdown for scheduled campaigns
**Fix Required:**
1. `backend/src/cron/campaign-scheduler.ts` — BUG: Change `email_campaigns` to `marketing_campaigns` (matching Drizzle table name); change `EMAIL_QUEUE` to `CAMPAIGN_QUEUE`
2. `desktop/src/app/(app)/campaigns/new/page.tsx` — Add validation: min 15 minutes ahead, max 90 days
3. `desktop/src/app/(app)/campaigns/page.tsx` — Show countdown timer for scheduled campaigns

---

### TICKET-304: Campaign Performance Tracking & Dashboard — PARTIAL
**Backend:** DONE — Campaign analytics endpoint exists (`GET /campaigns/:id/analytics`). Campaign recipients endpoint with status filtering exists (`GET /campaigns/:id/recipients`). Dashboard-level aggregate stats can be derived from campaign list.
**Frontend:** PARTIAL — Campaign detail page (`/campaigns/[id]/page.tsx`) shows 6 stat cards (Sent, Delivered, Opened, Clicked, Bounced, Failed) with rates, delivery funnel progress bars, content preview, and recipients table. However, no dedicated marketing dashboard page exists.
**API Client:** DONE — `campaigns.getRecipients()` with pagination/status filter.
**UX Issues:**
- No dedicated Marketing Dashboard page at `/marketing` or `/marketing/dashboard`
- No aggregate stats across all campaigns
- No performance trends chart (last 30 days)
- No CSV export of campaign report
- No auto-refresh polling while campaign is sending
- Recipients table has no infinite scroll (fixed `limit: 50`)
**Fix Required:**
1. `desktop/src/app/(app)/marketing/page.tsx` or `desktop/src/app/(app)/marketing/dashboard/page.tsx` — MISSING: create marketing dashboard with aggregate stats, recent campaigns, trends chart
2. `desktop/src/app/(app)/campaigns/[id]/page.tsx` — Add CSV export button, auto-refresh polling every 30s while status=sending, infinite scroll on recipients
3. `backend/src/routes/marketing/campaigns.ts` — Add GET `/dashboard` endpoint for aggregate stats
4. Add sidebar nav item for Marketing Dashboard

---

### TICKET-305: Opt-Out & Unsubscribe Management — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/marketing/opt-out.ts` (90 lines) exists with GET opted-out list, POST opt-out, POST opt-in endpoints. However, contacts table is MISSING `opted_out`, `opted_out_at`, `opt_out_channel` columns in schema. No public unsubscribe endpoint exists. No HMAC token generation for unsubscribe links. No WhatsApp STOP keyword handling. No SMS STOP keyword handling.
**Frontend:** MISSING — No opted-out contacts list page. No opt-out badge on contact detail screen. No opt-out toggle.
**API Client:** PARTIAL — `marketing.optOut(data)` exists in `desktop/src/lib/api/marketing.ts`.
**UX Issues:**
- No opted-out contacts list page at `/marketing/opted-out`
- No opt-out badge on contact detail pages
- No unsubscribe confirmation HTML page
- Missing `opted_out` columns on contacts table
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `opted_out` (INTEGER DEFAULT 0), `opted_out_at` (TEXT), `opt_out_channel` (TEXT) columns to contacts table
2. `backend/src/routes/marketing/unsubscribe.ts` — MISSING: create public unsubscribe endpoint with HMAC token validation and confirmation page
3. `desktop/src/app/(app)/marketing/opted-out/page.tsx` — MISSING: create opted-out contacts list page
4. Add sidebar nav item for Opted-Out Contacts
5. Modify contact detail pages to show opt-out badge and toggle

---

### TICKET-306: Festival Offers — Pre-Scheduled Campaigns — MISSING
**Backend:** MISSING — `festival_campaigns` table does not exist in schema. No `backend/src/cron/festival-campaigns.ts` cron job. No festival route file. No festival seeds.
**Frontend:** MISSING — No festival campaigns page exists. No festival card components. No activation dialog.
**API Client:** MISSING — No festival API methods exist.
**UX Issues:**
- Entire feature is missing
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `festival_campaigns` table with all specified columns
2. `backend/src/routes/marketing/festivals.ts` — Create CRUD route with GET list, PUT activate, PUT deactivate
3. `backend/src/cron/festival-campaigns.ts` — Create daily cron to auto-send campaigns before festival dates
4. `backend/src/db/seeds/festival-seeds.ts` — Create seed with 15+ Indian/international festivals
5. `desktop/src/app/(app)/marketing/festivals/page.tsx` — Create festival campaigns list page
6. `desktop/src/lib/api/marketing.ts` — Add festival CRUD methods
7. Add sidebar nav item for Festival Offers
8. Mount routes in `backend/src/index.ts`

---

### TICKET-307: Marketing Module Routes & Navigation — PARTIAL
**Backend:** N/A (frontend-only ticket)
**Frontend:** PARTIAL — Marketing section exists in sidebar (`desktop/src/components/layout/sidebar.tsx` lines 124-129) with 4 sub-items: Flyers, Segments, Branding, Social Content. Campaigns is in a separate Communication section. Pages exist for: flyers, segments, segments/new, branding, social, campaigns, campaigns/new, campaigns/[id]. However, many specified routes are missing.
**API Client:** N/A
**UX Issues:**
- Sidebar MISSING items: Dashboard, Festival Offers, Opted-Out Contacts
- Campaigns in Communication section instead of Marketing (per spec, should be under Marketing)
- No breadcrumb navigation on marketing screens
- Missing routes: `/marketing` (dashboard), `/marketing/flyers/quick-create/:templateId`, `/marketing/flyers/my-flyers`, `/marketing/festivals`, `/marketing/opted-out`, `/marketing/segments/:id/edit`
- No deep linking tested
**Fix Required:**
1. `desktop/src/components/layout/sidebar.tsx` — Add: Dashboard (first item), Campaigns (move from Communication), Festival Offers, Opted-Out Contacts
2. Add missing page files for: marketing dashboard, quick create, my flyers, festivals, opted-out, segment edit
3. Add breadcrumb navigation component to all marketing pages

---

## Critical Bugs Summary

### BUG-1: Campaign Scheduler Cron References Wrong Table
**File:** `backend/src/cron/campaign-scheduler.ts:27`
**Issue:** Queries `email_campaigns` table which doesn't match the M17 `marketingCampaigns` Drizzle table. Also uses `EMAIL_QUEUE` instead of `CAMPAIGN_QUEUE`.
**Impact:** Scheduled campaigns will never fire because the cron queries a non-existent (or legacy) table.
**Fix:** Update table name to match Drizzle schema output, use `CAMPAIGN_QUEUE`.

### BUG-2: Missing Contacts Opt-Out Columns
**File:** `backend/src/db/tenant-schema.ts`
**Issue:** The contacts table lacks `opted_out`, `opted_out_at`, `opt_out_channel` columns referenced by the opt-out route.
**Impact:** Opt-out API calls will fail with SQL errors. Segmentation engine's `opted_out` filter won't work.
**Fix:** Add all three columns to contacts table definition.

### BUG-3: Generated Flyers Missing Size Preset
**File:** `backend/src/db/tenant-schema.ts`
**Issue:** `generated_flyers` table missing `size_preset` column and uses `format` instead of `export_format`.
**Impact:** Cannot track which social media size preset was used for export. Naming mismatch with API expectations.
**Fix:** Add `size_preset` column, rename `format` to `export_format` (or ensure API normalizes).
