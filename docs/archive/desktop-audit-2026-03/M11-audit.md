# Milestone 11 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m11.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 3     |
| PARTIAL | 8     |
| MISSING | 6     |
| BUG     | 5     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| NEXT_PUBLIC_API_URL | desktop/src/lib/api/config.ts | Yes | Falls back to localhost:8787 |
| SENDGRID_API_KEY | backend (voucher email send) | No | Send endpoint stubs response — no actual email sent |
| TWILIO_ACCOUNT_SID | backend (WhatsApp send) | No | Send endpoint stubs response — no actual WhatsApp sent |
| TWILIO_AUTH_TOKEN | backend (WhatsApp send) | No | Send endpoint stubs response |
| R2_BUCKET | backend (PDF storage) | No | PDF generation/storage not implemented |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | desktop (maps link validation) | No | Not used in current voucher pages at all |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| vouchers/page.tsx | No infinite scroll | Replace manual pagination with `useInfiniteScroll` hook |
| vouchers/page.tsx | No FilterBar | Replace inline filters with `FilterBar` component |
| vouchers/page.tsx | No type filter connected to API | `typeFilter` state exists but never passed to API call (line 48-54) |
| vouchers/page.tsx | No hover actions | Table rows need inline Eye/Edit/Send/Trash2 icon buttons on hover |
| vouchers/page.tsx | No detail drawer | Missing click-to-open slide-over panel for quick preview |
| vouchers/page.tsx | No loading skeletons | Uses raw Loader2 spinner instead of Skeleton rows |
| vouchers/page.tsx | No empty state | Empty table shows nothing — needs EmptyState component |
| vouchers/page.tsx | Wrong status values | Uses `issued/used/expired/cancelled` instead of backend's `draft/sent/confirmed` |
| vouchers/page.tsx | Wrong column model | Shows `voucherNumber`, `Amount`, `issueDate` — backend returns `title`, `type`, `lead_name`, `created_at` |
| vouchers/new/page.tsx | Lead picker is plain Select, not searchable Combobox | Replace `<Select>` with searchable `<Combobox>` calling leads API with search |
| vouchers/new/page.tsx | No supplier picker | Missing supplier searchable Combobox — ticket requires it |
| vouchers/new/page.tsx | No URL param auto-populate | `leadId` and `type` query params not read from URL |
| vouchers/new/page.tsx | Details schema mismatch | Sends flat `details` object with all types' fields instead of type-specific validated object |
| vouchers/new/page.tsx | Missing many hotel fields | No room count, no confirmation number, no emergency contact, no dynamic guest names list |
| vouchers/new/page.tsx | Missing many transport fields | No driver phone, no maps links, no route, no sightseeing chips, no terms |
| vouchers/new/page.tsx | Missing many flight fields | No passengers list, no arrival time/terminal, no seat numbers, no meal preference |
| vouchers/new/page.tsx | Missing many activity fields | No meeting point maps link, no what-to-bring chips, no operator/emergency contacts |
| vouchers/new/page.tsx | No language selector | Missing language dropdown for multilingual support |
| vouchers/[id]/page.tsx | Wrong data model | Renders `voucherNumber`, `issueDate`, `validUntil`, `items` — backend returns `title`, `type`, `details`, `lead_name` |
| vouchers/[id]/page.tsx | No type-specific detail rendering | Shows generic "Guest Info" card instead of Hotel/Transport/Flight/Activity detail cards |
| vouchers/[id]/page.tsx | No status timeline | Missing Draft→Sent→Confirmed visual timeline |
| vouchers/[id]/page.tsx | Status update uses wrong endpoint | Calls `vouchersApi.update()` (PUT) instead of status PATCH endpoint |
| vouchers/[id]/page.tsx | Direct email/WhatsApp send dialog | Custom dialog instead of `SendMessageDialog` from Communication Hub |
| vouchers/[id]/page.tsx | Wrong status values in dropdown | Shows `draft/issued/used/expired/cancelled` instead of `draft/sent/confirmed` |
| vouchers/[id]/edit/page.tsx | Edit sends `customFields` object | Sends `{ customFields: { ... } }` — backend expects `{ title, details, supplierId, language, notes }` |
| vouchers/[id]/edit/page.tsx | Same field gaps as new page | Missing all the same fields listed above for new page |
| lib/api/vouchers.ts | Voucher interface mismatch | Interface has `voucherNumber`, `issueDate`, `validUntil`, `items[]`, `discount` — none exist in backend schema |
| lib/api/vouchers.ts | Missing API methods | No `updateStatus()`, no `getByLead()`, no `bulkSend()`, no `fromItineraryItem()` |
| lib/api/vouchers.ts | UpdateVoucherRequest mismatch | Has `customFields` — backend expects `title`, `details`, `supplierId`, `language`, `notes` |
| lib/api/vouchers.ts | SendVoucherRequest mismatch | Has `to: string[]` — backend expects `to: string, channel: string` |
| lib/api/config.ts | Missing API endpoints | No `byLead(leadId)`, `bulkSend`, `fromItineraryItem`, `status(id)` endpoints |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| vouchers/page.tsx | No summary cards | Add stat cards: Total, Draft, Sent, Confirmed counts | High |
| vouchers/page.tsx | No sort controls | Add column header sorting (created_at, type, status) | Medium |
| vouchers/page.tsx | No bulk selection | Add checkbox column + bulk actions bar (bulk send, bulk confirm, bulk delete) | Medium |
| vouchers/new/page.tsx | 4-step wizard | Consider single-page form with sections — 4 steps adds friction for power users | Medium |
| vouchers/new/page.tsx | No auto-save draft | Add 30-second auto-save for in-progress vouchers | Low |
| vouchers/new/page.tsx | No Save Draft / Save & Send split | Only "Save" — ticket requires both "Save Draft" and "Save & Send" buttons | High |
| vouchers/[id]/page.tsx | No "Mark as Confirmed" button | Add confirm dialog for sent→confirmed transition | High |
| vouchers/[id]/page.tsx | No linked itinerary display | If created from itinerary, show link back to source itinerary | Low |
| vouchers/[id]/page.tsx | No PDF preview | Add in-app PDF viewer instead of just download | Medium |
| All voucher pages | No keyboard shortcuts | Add Ctrl+S for save, Ctrl+Enter for save & send | Low |
| vouchers/page.tsx | Table not responsive | No card layout fallback for narrow viewports | Low |

## Ticket Details

### TICKET-177: Voucher Drizzle Schema & Migrations — DONE
**Backend:** DONE — `backend/src/db/tenant-schema.ts:435-461` has all required fields: id, lead_id (FK→leads, CASCADE), type, supplier_id (FK→suppliers, SET NULL), title, details_json, status, language, itinerary_item_id, pdf_r2_key, sent_via, sent_at, confirmed_at, notes, created_by (FK→users), created_at, updated_at, is_deleted
**Frontend:** N/A — backend-only ticket
**API Client:** N/A
**UX Issues:**
- Missing `vouchers_supplier_id_idx` index — ticket requires `vouchers(supplier_id)` index but only `vouchers_lead_id_idx`, `vouchers_type_idx`, `vouchers_status_idx`, `vouchers_itinerary_item_id_idx`, `vouchers_type_status_idx`, `vouchers_created_by_idx` exist
**Fix Required:**
1. `backend/src/db/tenant-schema.ts:454` — Add `index('vouchers_supplier_id_idx').on(table.supplierId)` to the table indexes

---

### TICKET-178: Voucher CRUD API Endpoints — DONE
**Backend:** DONE — `backend/src/routes/vouchers.ts` has all required endpoints:
- GET / (list with pagination, filters: leadId, type, status, supplierId, createdBy, date range, search)
- POST / (create with Zod validation per type)
- GET /:id (detail with lead/supplier joins)
- PUT /:id (update, draft-only enforcement)
- DELETE /:id (soft delete)
- PATCH /:id/status (status transitions with validation)
- GET /by-lead/:leadId (grouped by type)
- RBAC: salesperson restriction on line 175-178
**Frontend:** N/A — backend-only ticket
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None — backend is comprehensive and well-implemented

---

### TICKET-179: Voucher Flutter Model, Repository & Providers — PARTIAL (Desktop context)
**Note:** This is a Flutter ticket. Desktop equivalent is `desktop/src/lib/api/vouchers.ts`.
**Backend:** N/A
**Frontend:** N/A — Flutter ticket, not applicable to desktop Electron app
**API Client:** PARTIAL — `desktop/src/lib/api/vouchers.ts` exists but has major issues:
- `Voucher` interface (line 5-20) has wrong fields: `voucherNumber`, `issueDate`, `validUntil`, `items[]`, `discount`, `status: 'draft'|'issued'|'used'|'expired'|'cancelled'` — none of these match the backend schema
- Correct interface should have: `id`, `title`, `type`, `leadId`, `supplierId`, `details`, `status: 'draft'|'sent'|'confirmed'`, `language`, `itineraryItemId`, `pdfR2Key`, `sentVia`, `sentAt`, `confirmedAt`, `notes`, `createdBy`, `createdAt`, `updatedAt`, `leadName`, `supplierName`
- Missing methods: `updateStatus(id, status)`, `getByLead(leadId)`, `bulkSend(data)`, `fromItineraryItem(data)`
- `SendVoucherRequest` (line 50-54) has wrong shape: `{ to: string[], message?, sendMethod? }` — backend expects `{ channel, to }`
- `UpdateVoucherRequest` (line 39-48) has wrong shape: includes `voucherNumber`, `issueDate`, `validUntil`, `items[]`, `discount`, `customFields` — backend expects `{ title?, supplierId?, details?, language?, notes? }`
**UX Issues:** All downstream pages broken due to wrong interface
**Fix Required:**
1. `desktop/src/lib/api/vouchers.ts:5-20` — Rewrite `Voucher` interface to match backend response
2. `desktop/src/lib/api/vouchers.ts:39-48` — Rewrite `UpdateVoucherRequest` to match backend PUT schema
3. `desktop/src/lib/api/vouchers.ts:50-54` — Rewrite `SendVoucherRequest` to `{ channel: 'email'|'whatsapp'|'both', to: string }`
4. `desktop/src/lib/api/vouchers.ts:56-85` — Add missing methods: `updateStatus`, `getByLead`, `bulkSend`, `fromItineraryItem`
5. `desktop/src/lib/api/config.ts:162-169` — Add missing endpoints: `byLead`, `bulkSend`, `fromItineraryItem`, `status`

---

### TICKET-180: Hotel Voucher Form & Validation — PARTIAL
**Backend:** N/A — frontend ticket
**Frontend:** PARTIAL — `desktop/src/app/(app)/vouchers/new/page.tsx` has basic hotel form (lines 301-350) but is severely incomplete:
- Missing dynamic guest names list — only single `guestName` field instead of add/remove guest list
- Missing room count input
- Missing confirmation number field
- Missing emergency contact field (with auto-fill from tenant settings)
- Room type dropdown only has Standard/Deluxe/Suite — missing Super Deluxe, Premium, Executive, Villa, Cottage, Custom
- Meal plan dropdown has wrong codes: `cp/map/ap` with wrong labels (CP labeled "Room Only" — EP is Room Only) — should be EP/CP/MAP/AP/AI with full names
- No "Save as Draft" vs "Save & Send" split buttons
**API Client:** PARTIAL — `CreateVoucherRequest` correctly has `details: Record<string, any>` but the form sends a flat object with all type fields mixed together
**UX Issues:**
- Hotel form sends `checkInDate`/`checkOutDate` — backend Zod expects `checkIn`/`checkOut`
- Form sends `guestName` (singular string) — backend Zod expects `guestNames` (array of strings, min 1)
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/new/page.tsx:301-350` — Add: dynamic guest names list, room count, confirmation number, emergency contact
2. `desktop/src/app/(app)/vouchers/new/page.tsx:322-343` — Fix room type options (add Super Deluxe, Premium, Executive, Villa, Cottage, Custom), fix meal plan codes/labels (EP/CP/MAP/AP/AI)
3. `desktop/src/app/(app)/vouchers/new/page.tsx:156-178` — Fix details object to send type-specific fields only with correct key names (`checkIn` not `checkInDate`, `guestNames` not `guestName`)

---

### TICKET-181: Transport Voucher Form & Validation — PARTIAL
**Backend:** N/A — frontend ticket
**Frontend:** PARTIAL — `desktop/src/app/(app)/vouchers/new/page.tsx` has basic transport form (lines 353-392) but severely incomplete:
- Missing driver phone input (with country code — should use PhoneInput component)
- Missing maps link fields for pickup/drop locations
- Missing route/itinerary summary textarea
- Missing sightseeing chip list (dynamic add/remove)
- Missing terms textarea
- Vehicle type dropdown only has Sedan/SUV/Tempo/Bus — missing Innova, Tempo Traveller (12-seater), Mini Bus (20-seater), Luxury Coach, Custom
**API Client:** See TICKET-179 issues
**UX Issues:**
- Form sends `pickupDate`/`pickupTime` separately — backend Zod expects `pickupTime` as single datetime string
- Missing `pickupMapsLink`, `dropMapsLink` fields entirely
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/new/page.tsx:353-392` — Add: driver phone (PhoneInput), maps link fields, route textarea, sightseeing chip editor, terms textarea
2. Fix vehicle type options to match ticket spec
3. Fix field mapping to match backend schema

---

### TICKET-182: Flight Voucher Form & Validation — PARTIAL
**Backend:** N/A — frontend ticket
**Frontend:** PARTIAL — `desktop/src/app/(app)/vouchers/new/page.tsx` has basic flight form (lines 395-449) but severely incomplete:
- Missing dynamic passengers list (name + individual PNR per passenger)
- Missing arrival time field
- Missing departure/arrival terminal fields
- Missing seat numbers field
- Missing meal preference field
- Travel class dropdown missing "premium_economy" option
- No baggage allowance hint text
**API Client:** See TICKET-179 issues
**UX Issues:**
- Form sends `departureDate`/`departureTime` separately — backend expects `departureTime` as single datetime
- No `arrivalTime` field at all
- `passengers` required by backend (min 1) but form doesn't collect passengers
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/new/page.tsx:395-449` — Add: passengers list (dynamic add/remove with name+PNR), arrival time, terminals, seat numbers, meal preference, premium_economy class option
2. Fix field mapping to match backend schema

---

### TICKET-183: Activity Voucher Form & Validation — PARTIAL
**Backend:** N/A — frontend ticket
**Frontend:** PARTIAL — `desktop/src/app/(app)/vouchers/new/page.tsx` has basic activity form (lines 452-481) but incomplete:
- Missing meeting point maps link field
- Missing "What to Bring" chip list with predefined suggestions
- Missing emergency contact field
- Missing operator contact field
- Inclusions is a plain textarea — should be dynamic chip list with suggestions
**API Client:** See TICKET-179 issues
**UX Issues:**
- Form sends `activityLocation` — backend expects `meetingPoint`
- Form sends `activityDate`/`activityTime` separately — backend expects `dateTime`
- `inclusions` sent as string — backend expects array
- `whatToBring` not sent at all — backend expects array
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/new/page.tsx:452-481` — Add: maps link for meeting point, what-to-bring chips, emergency/operator contacts, convert inclusions to chip list
2. Fix field names and types to match backend schema

---

### TICKET-184: Voucher Create/Edit Screen — Unified Form — PARTIAL
**Backend:** N/A — frontend ticket
**Frontend:** PARTIAL — Both `new/page.tsx` and `[id]/edit/page.tsx` exist with 4-step wizard but have issues:
- No URL query param reading for `leadId` and `type` pre-fill (new page)
- Lead picker is `<Select>` loading 100 leads, not searchable `<Combobox>` with API search
- No supplier picker at all
- No language selector
- No auto-save draft feature
- No "Save & Send" button (only "Save")
- Edit page sends `customFields` wrapper — backend doesn't accept that
- Type switching doesn't clear type-specific fields
**API Client:** See TICKET-179 issues
**UX Issues:**
- Raw lead ID selection limited to 100 — needs searchable Combobox
- Missing supplier Combobox filtered by voucher type
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/new/page.tsx` — Read `leadId` and `type` from URL search params and pre-fill form
2. Both pages — Replace lead `<Select>` with searchable `<Combobox>` from `desktop/src/components/ui/combobox.tsx`
3. Both pages — Add supplier searchable Combobox
4. Both pages — Add language selector (English, Hindi, Arabic)
5. Both pages — Add "Save Draft" + "Save & Send" split buttons
6. `desktop/src/app/(app)/vouchers/[id]/edit/page.tsx:209-238` — Fix `handleSave` to send `{ title, details, supplierId, language, notes }` instead of `{ customFields: { ... } }`

---

### TICKET-185: Hotel Voucher PDF Generation — MISSING
**Note:** This is a Flutter PDF generation ticket. Desktop equivalent would be server-side PDF generation or client-side PDF.
**Backend:** PARTIAL — Backend has `pdf_r2_key` field and `GET /vouchers/:id/pdf` endpoint in config, but no actual PDF generation endpoint in `backend/src/routes/vouchers.ts`
**Frontend:** MISSING — No PDF generation or preview functionality
**API Client:** PARTIAL — `getPdf(id)` method exists (line 83-84) but endpoint doesn't exist on backend
**UX Issues:** N/A
**Fix Required:**
1. Backend: Add PDF generation endpoint at `GET /vouchers/:id/pdf` or `POST /vouchers/:id/generate-pdf`
2. Desktop: Add PDF preview/download functionality that works with the backend endpoint

---

### TICKET-186: Transport, Flight & Activity Voucher PDF Generation — MISSING
**Backend:** Same as TICKET-185 — no PDF generation
**Frontend:** MISSING — no PDF rendering for any voucher type
**API Client:** Same as TICKET-185
**UX Issues:** N/A
**Fix Required:**
1. Same as TICKET-185 — implement PDF generation for all 4 types

---

### TICKET-187: Voucher from Itinerary — Pre-Fill — PARTIAL
**Backend:** DONE — `backend/src/routes/vouchers.ts:341-471` implements `POST /from-itinerary-item` with:
- Fetches itinerary item with lead context via JOIN
- Checks for existing voucher on same item (returns `existingVoucher` id)
- Maps itinerary item details to voucher details per type
- Creates draft voucher with itinerary_item_id link
**Frontend:** MISSING — No "Create Voucher" button on itinerary items, no "Create All Vouchers" button on itinerary detail
**API Client:** MISSING — No `fromItineraryItem()` method in `desktop/src/lib/api/vouchers.ts`
**UX Issues:** Feature is backend-complete but has zero frontend implementation
**Fix Required:**
1. `desktop/src/lib/api/vouchers.ts` — Add `fromItineraryItem(data: { itineraryItemId: string })` method
2. `desktop/src/lib/api/config.ts` — Add `fromItineraryItem: '/vouchers/from-itinerary-item'` endpoint
3. Itinerary detail page — Add "Create Voucher" button per item and "Create All Vouchers" button

---

### TICKET-188: Voucher List Screen — BUG
**Backend:** N/A — frontend ticket (backend already handles list with correct filters)
**Frontend:** BUG — `desktop/src/app/(app)/vouchers/page.tsx` exists but has critical data model mismatch:
- Table renders `voucher.voucherNumber` (line 125) — backend returns `title`
- Table renders `voucher.issueDate` (line 129) — backend returns `created_at`
- Table renders `voucher.items` amount sum (line 132) — backend has no `items` field
- Table renders `voucher.leadId` as raw text (line 127) — backend returns `lead_name`
- Status filter options are `draft/issued/used/expired/cancelled` — backend uses `draft/sent/confirmed`
- `typeFilter` state variable exists (line 43) but is NEVER passed to API (line 48-54) — type filtering is broken
- No infinite scroll — uses page-based manual pagination with `setPage` but no pagination controls rendered
- No FilterBar component — inline filter implementation
- No hover row actions (Edit, Send, View PDF, Delete)
- No detail drawer
- No loading skeletons
- No empty state component
- No summary cards (Total, Draft, Sent, Confirmed)
**API Client:** See TICKET-179 — wrong interface
**UX Issues:** Page is fundamentally broken — renders wrong fields and uses wrong status values
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/page.tsx` — Complete rewrite needed:
   - Fix table columns: Title, Type (badge), Lead Name, Supplier Name, Status (badge), Created Date
   - Fix status values: draft/sent/confirmed
   - Connect type filter to API call
   - Replace manual pagination with `useInfiniteScroll`
   - Replace inline filters with `FilterBar`
   - Add hover row actions
   - Add detail drawer
   - Add loading skeletons
   - Add empty state
   - Add summary stat cards

---

### TICKET-189: Voucher Detail Screen — BUG
**Backend:** N/A — frontend ticket
**Frontend:** BUG — `desktop/src/app/(app)/vouchers/[id]/page.tsx` exists but has critical data model mismatch:
- Renders `voucher.voucherNumber` (line 150) — backend returns `title`
- Renders `voucher.customFields?.guestName` (line 156) — backend returns `details.guestNames[]`
- Shows "Issue Date" / "Valid Until" (lines 199-216) — backend has no such fields
- Shows `voucher.items` (line 217) — backend has no such field
- No type-specific detail rendering — ticket requires Hotel/Transport/Flight/Activity detail cards
- No status timeline visualization (Draft→Sent→Confirmed with timestamps)
- Status change uses `vouchersApi.update()` (PUT, line 62) — should use PATCH `/vouchers/:id/status`
- Status dropdown has wrong values: `draft/issued/used/expired/cancelled` — should be `sent/confirmed` only (forward transitions)
- No "Mark as Confirmed" confirmation dialog
- Send dialog is custom implementation — should use `SendMessageDialog` from Communication Hub
- Edit button always visible — should be hidden for sent/confirmed vouchers
- No linked itinerary item display
- No notes section
**API Client:** See TICKET-179 — wrong interface
**UX Issues:** Page is fundamentally broken — renders non-existent fields
**Fix Required:**
1. `desktop/src/app/(app)/vouchers/[id]/page.tsx` — Complete rewrite needed:
   - Fix header to show title, type icon, status badge
   - Add type-specific detail cards based on `voucher.type`
   - Add status timeline
   - Replace status update to use PATCH endpoint
   - Replace send dialog with `SendMessageDialog`
   - Add "Mark as Confirmed" button with confirmation dialog
   - Hide Edit button for non-draft vouchers
   - Add linked itinerary link
   - Add notes section

---

### TICKET-190: Email & WhatsApp Voucher Send — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/vouchers.ts:708-768` has `POST /:id/send` endpoint:
- Validates channel and recipient
- Updates status to 'sent', sets sent_at and sent_via
- BUT: No actual email/WhatsApp sending — just status update (comment on line 753: "In production, queue email/whatsapp sending here")
- No PDF generation before send
- No activity log entry (ticket requires logging to lead timeline)
- No message_log table entry
**Frontend:** BUG — Detail page has custom send dialog (lines 83-101) but:
- Uses `SendVoucherRequest` with wrong shape (`{ to: string[], message?, sendMethod? }`)
- Backend expects `{ channel: 'email'|'whatsapp', to: string }`
- Should use `SendMessageDialog` from Communication Hub instead
**API Client:** BUG — `SendVoucherRequest` interface mismatches backend
**UX Issues:** Send dialog doesn't use Communication Hub pattern
**Fix Required:**
1. `desktop/src/lib/api/vouchers.ts:50-54` — Fix `SendVoucherRequest` to `{ channel: string, to: string }`
2. `desktop/src/app/(app)/vouchers/[id]/page.tsx` — Replace custom send dialog with `SendMessageDialog`
3. Backend: Add activity log entry after send
4. Backend: Add message_log table entry after send

---

### TICKET-191: Voucher Status Management — PARTIAL
**Backend:** DONE — `backend/src/routes/vouchers.ts:637-702` has PATCH /:id/status with:
- Valid transitions: draft→sent, draft→confirmed, sent→confirmed
- No backwards transitions
- Sets sent_at or confirmed_at timestamps
**Frontend:** BUG — Detail page status update (lines 59-72):
- Uses PUT update endpoint instead of PATCH status endpoint
- Has wrong status values (issued/used/expired/cancelled)
- No confirmation dialog for status changes
- No visual status indicators per ticket spec (dashed/solid borders)
- No bulk status update functionality
- No activity log display
**API Client:** MISSING — No `updateStatus(id, status)` method
**UX Issues:**
- Status management is broken — wrong endpoint, wrong values
**Fix Required:**
1. `desktop/src/lib/api/vouchers.ts` — Add `updateStatus(id, status)` method calling `PATCH /vouchers/:id/status`
2. `desktop/src/lib/api/config.ts` — Add `status: (id: string) => \`/vouchers/${id}/status\`` endpoint
3. `desktop/src/app/(app)/vouchers/[id]/page.tsx` — Use PATCH status endpoint, fix status values, add confirmation dialog

---

### TICKET-192: Voucher Bulk Send — PARTIAL
**Backend:** DONE — `backend/src/routes/vouchers.ts:774-846` has `POST /bulk-send`:
- Accepts lead_id, voucher_ids, channel, to
- 10-voucher limit enforcement
- Updates all statuses to 'sent'
- BUT: No actual email/WhatsApp sending (same stub pattern as single send)
**Frontend:** MISSING — No bulk send UI, no voucher selection dialog, no progress indicator
**API Client:** MISSING — No `bulkSend()` method
**UX Issues:** Backend is complete but zero frontend implementation
**Fix Required:**
1. `desktop/src/lib/api/vouchers.ts` — Add `bulkSend(data)` method
2. `desktop/src/lib/api/config.ts` — Add `bulkSend: '/vouchers/bulk-send'` endpoint
3. Create bulk send dialog with voucher selection checkboxes, channel selector, recipient input

---

### TICKET-193: Multilingual Voucher Support — MISSING
**Note:** This is a Flutter-specific ticket for PDF localization. Desktop has no PDF generation at all.
**Backend:** PARTIAL — Schema has `language` field (line 443), backend stores it on create/update
**Frontend:** MISSING — No language selector on voucher form, no multilingual support
**API Client:** N/A
**UX Issues:** Language field exists on backend but is never exposed in UI
**Fix Required:**
1. Both form pages — Add language selector dropdown (English/Hindi/Arabic)
2. Will be more relevant once PDF generation is implemented

---

### TICKET-194: Voucher Navigation, GoRouter Routes & Lead Integration — PARTIAL
**Note:** GoRouter is Flutter-specific. Desktop uses Next.js App Router.
**Backend:** N/A — frontend ticket
**Frontend:** PARTIAL
- Routes: All 4 routes exist via App Router folder structure: `/vouchers`, `/vouchers/new`, `/vouchers/[id]`, `/vouchers/[id]/edit` ✓
- Sidebar: "Vouchers" item present in sidebar (line 90 of sidebar.tsx) ✓
- Deep links: App Router handles this automatically ✓
- BUT: No "Vouchers" tab on lead detail page
- No grouped voucher display by type on lead page
- No "Create Voucher" with type pre-selection from lead context
- No "Send All Vouchers" button on lead detail
- No badge count on lead vouchers tab
**API Client:** MISSING — No `getByLead(leadId)` method to support lead integration
**UX Issues:**
- Lead detail page has no voucher integration at all
**Fix Required:**
1. `desktop/src/lib/api/vouchers.ts` — Add `getByLead(leadId)` method
2. `desktop/src/lib/api/config.ts` — Add `byLead: (leadId: string) => \`/vouchers/by-lead/${leadId}\`` endpoint
3. Lead detail page — Add "Vouchers" tab with grouped list, create button, send all button
4. `desktop/src/app/(app)/vouchers/new/page.tsx` — Read `leadId` and `type` from URL query params

---

### TICKET-177 to TICKET-194 — Cross-Cutting BUG: Frontend-Backend Data Model Mismatch
**Description:** The entire frontend voucher implementation appears to have been built against a different (possibly generic voucher/coupon) schema rather than the actual travel voucher backend. The `Voucher` TypeScript interface, all page components, and the API client are built around `voucherNumber`, `issueDate`, `validUntil`, `items[]`, `discount` — none of which exist in the backend. The backend correctly implements travel-specific vouchers with `type`, `title`, `details_json`, `lead_id`, `supplier_id`, `language`, `itinerary_item_id`.

**Impact:** Every single frontend page for vouchers renders the wrong data. The list page shows blank/undefined values, the detail page shows nonexistent fields, and the forms send data in a format the backend Zod validators will reject.

**Root Cause:** The TypeScript interface in `desktop/src/lib/api/vouchers.ts` does not match the backend response schema. The `CreateVoucherRequest` is partially correct but the `Voucher`, `UpdateVoucherRequest`, and `SendVoucherRequest` are completely wrong.

**Fix Required:** Rewrite `desktop/src/lib/api/vouchers.ts` interface to match backend, then update all consuming pages.

---

## Priority Fix Order
1. **CRITICAL** — Rewrite `desktop/src/lib/api/vouchers.ts` (interface + missing methods + endpoint config) — everything depends on this
2. **CRITICAL** — Rewrite `desktop/src/app/(app)/vouchers/page.tsx` (list page) — uses wrong fields, wrong statuses, no infinite scroll, no FilterBar
3. **CRITICAL** — Rewrite `desktop/src/app/(app)/vouchers/[id]/page.tsx` (detail page) — uses wrong fields, wrong status management, no type-specific rendering
4. **HIGH** — Rewrite `desktop/src/app/(app)/vouchers/new/page.tsx` — fix details schema, add missing fields per type, add lead/supplier Combobox, URL param pre-fill
5. **HIGH** — Rewrite `desktop/src/app/(app)/vouchers/[id]/edit/page.tsx` — same issues as new page + wrong update payload format
6. **MEDIUM** — Add lead detail page voucher tab integration
7. **MEDIUM** — Add itinerary "Create Voucher" buttons
8. **LOW** — Add `vouchers_supplier_id_idx` index to schema
9. **LOW** — Backend: add activity log and message_log entries in send endpoints
