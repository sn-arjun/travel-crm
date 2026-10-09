# Milestone 13 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m13.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 3     |
| PARTIAL | 12    |
| MISSING | 8     |
| BUG     | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | backend/src/routes/travellers.ts, visa.ts (document upload) | Yes (for document vault) | Document upload buttons should be disabled with "Cloud storage not configured" message |
| `PUSH_NOTIFICATION_QUEUE` | backend/src/cron/auto-reminders.ts:363 | Yes (for expiry alerts) | Cron should log warning and skip push notification if queue unavailable |
| `EMAIL_QUEUE` | backend/src/cron/auto-reminders.ts:396,452 | Yes (for email alerts) | Cron should log warning and skip email notification if queue unavailable |
| `MASTER_DB` | backend/src/cron/auto-reminders.ts:326,418 | Yes (for tenant iteration) | Cron fails silently — OK |
| `TWILIO_*` env vars | TICKET-226 (send documents via WhatsApp) | Yes (for WhatsApp sending) | "Send via WhatsApp" button should be hidden/disabled if Twilio not configured |
| `SENDGRID_API_KEY` | TICKET-226 (send documents via Email) | Yes (for email sending) | "Send via Email" button should be hidden/disabled if SendGrid not configured |

## UX Anti-Patterns (must fix)

| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `visa/page.tsx` | No FilterBar | Replace raw Select/Input (lines 162-193) with `FilterBar` from `@/components/domain/filter-bar.tsx` |
| `visa/page.tsx` | No infinite scroll | Replace `limit: 100` (line 74) with `useInfiniteScroll` from `@/hooks/use-infinite-scroll.ts` |
| `visa/page.tsx` | No loading skeletons | Replace spinner (line 204) with Skeleton table rows |
| `visa/page.tsx` | No hover actions | Add inline Eye/Pencil/Trash2 icon buttons on table row hover |
| `visa/page.tsx` | No detail drawer | Add click-to-open slide-over panel for visa detail preview |
| `visa/new/page.tsx` | Raw Input for destination country | Replace plain Input (line 140-146) with searchable `Combobox` fetching country list |
| `visa/new/page.tsx` | No auto-populate from URL params | Should pre-fill travellerId when navigating from traveller detail |
| `visa/[id]/page.tsx` | No loading skeletons | Replace spinner (lines 118-125) with Skeleton layout |
| `visa/dashboard/page.tsx` | No loading skeletons | Replace spinner (lines 69-76) with Skeleton cards |
| `travellers/page.tsx` | No FilterBar | Replace raw Select/Input (lines 67-81) with `FilterBar` |
| `travellers/page.tsx` | No infinite scroll | Add `useInfiniteScroll`; current page state (line 26) unused |
| `travellers/page.tsx` | No loading skeletons | Replace spinner (line 92) with Skeleton table rows |
| `travellers/page.tsx` | No hover actions | Add inline Eye/Pencil/Trash2 icon buttons on table row hover |
| `travellers/page.tsx` | No detail drawer | Add click-to-open slide-over panel for traveller detail preview |
| `travellers/page.tsx` | Delete not implemented | Line 143: Delete menu item present but no handler wired |
| `travellers/new/page.tsx` | Raw Input for nationality | Replace plain Input (line 116-122) with searchable `Combobox` with country list |
| `travellers/new/page.tsx` | No auto-populate from URL params | Should pre-fill contactId when navigating from contact detail |
| `travellers/[id]/page.tsx` | No loading skeletons | Replace spinner (lines 170-177) with Skeleton layout |
| `travellers/[id]/page.tsx` | Edit form not pre-filled | Line 45: `editForm` initialized as empty object instead of traveller's data |
| `travellers/[id]/page.tsx` | No form validation in edit dialog | Lines 399-447: Edit dialog allows empty required fields |
| `credit-notes/page.tsx` | No detail drawer | No drawer/modal to view full credit note details |
| `credit-notes/page.tsx` | No "Create" button | Missing primary action button in page header |
| `debit-notes/page.tsx` | No detail drawer | No drawer/modal to view full debit note details |
| `debit-notes/page.tsx` | No "Create" button | Missing primary action button in page header |
| `debit-notes/page.tsx` | Wrong type import | Line 15: imports `CreditNote` type instead of `DebitNote` |

## UX Improvements (nice to have)

| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `visa/page.tsx` | Export button exists (line 194) | Implement actual CSV/Excel export functionality | Medium |
| `visa/page.tsx` | Flat table view only | Add toggle between Table and Kanban view (per TICKET-228) | High |
| `visa/new/page.tsx` | Single-step form | Implement multi-step wizard: Select Traveller → Destination/Type → Review Checklist (per TICKET-222) | High |
| `visa/new/page.tsx` | Status hard-coded to 'applied' (line 66) | Let user select initial status (default: not_started) | Medium |
| `visa/[id]/page.tsx` | Basic checklist checkbox | Add "Attach Document" button per checklist item to upload/link documents | High |
| `visa/[id]/page.tsx` | Edit button navigates away (line 163) | Open inline edit form or navigate to `/visa/:id/edit` | Medium |
| `visa/dashboard/page.tsx` | Static stat cards only | Add clickable status chips that filter the visa list | Medium |
| `visa/dashboard/page.tsx` | Table view for upcoming deadlines | Add "Missing Documents" section and "Expiring Soon" section | High |
| `travellers/page.tsx` | Basic table columns | Add passport expiry color indicator (green/yellow/red) and visa count badge | Medium |
| `travellers/[id]/page.tsx` | Two tabs (Details, Visa, Documents) | Add "Preferences & Medical" tab per TICKET-214 | Medium |
| `travellers/[id]/page.tsx` | No passport expiry warning | Add warning banner when passport expires within 6 months | High |
| `credit-notes/page.tsx` | Hardcoded INR currency | Read currency from tenant/invoice settings | Low |
| All list pages | No keyboard shortcuts | Add keyboard shortcuts: N (new), / (search focus), arrow keys (navigate) | Low |
| All list pages | No bulk operations | Add multi-select checkboxes for bulk status changes | Low |

## Ticket Details

### TICKET-210: Drizzle Schema — Travellers, Visa Applications & Checklist Tables — DONE
**Backend:** DONE — All 6 tables exist in `backend/src/db/tenant-schema.ts`:
- `travellers` (lines 466-503) — all required fields present
- `visa_applications` (lines 520-549) — all required fields present
- `visa_checklist_items` (lines 551-568) — all required fields present
- `visa_documents` (lines 570-584) — all required fields present
- `visa_notes` (lines 586-597) — all required fields present
- `expiry_alerts_log` (lines 599-609) — all required fields present
**Frontend:** N/A
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None — schema is complete
---

### TICKET-211: Traveller CRUD API — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/travellers.ts` (138 lines)
- POST `/travellers` — exists (line 50-76) with Zod validation
- GET `/travellers` — exists (line 10-26) but **missing search, nationality filter, sorting, pagination** (query params not parsed beyond contact_id)
- GET `/travellers/:id` — exists (line 28-48) with documents join
- PUT `/travellers/:id` — exists (line 78-125)
- DELETE `/travellers/:id` — exists (line 127-135) but uses **hard delete** instead of soft delete (schema has `is_deleted` field)
- GET `/contacts/:contactId/travellers` — **MISSING** (not registered as separate endpoint)
**Frontend:** N/A (covered by TICKET-215)
**API Client:** `desktop/src/lib/api/visa.ts` — `travellersApi` has list/getById/create/update/delete but list doesn't send search/filter params correctly
**UX Issues:** None at this level
**Fix Required:**
1. `backend/src/routes/travellers.ts:10-26` — Add search (name/passport), nationality filter, pagination (page/limit), sort options to GET /
2. `backend/src/routes/travellers.ts:127-135` — Change to soft delete (set is_deleted=1)
3. `backend/src/routes/travellers.ts` — Add `GET /contacts/:contactId/travellers` endpoint (or register in contacts routes)
---

### TICKET-212: Traveller Freezed Model & Repository (Flutter) — N/A (Desktop)
**Backend:** N/A
**Frontend:** N/A — Flutter-specific ticket. Desktop equivalent is `desktop/src/lib/api/visa.ts` which has `travellersApi` with basic CRUD methods.
**API Client:** DONE — `travellersApi` in `desktop/src/lib/api/visa.ts` lines 128-148
**UX Issues:** None
**Fix Required:** None — Flutter ticket, desktop equivalent exists
---

### TICKET-213: Traveller Profile Form Screen — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/travellers/new/page.tsx` (174 lines)
- Has sections: Personal Details, Passport, Preferences — but **missing**: Frequent Flyer (dynamic list), Medical Notes, Emergency Contact sections
- Validation: firstName and passportNumber only (lines 36-43) — **missing**: fullNamePassport required, DOB in past, passport expiry future, expiry < 6 months warning
- **No edit mode** — page is create-only, no pre-fill for editing
- Nationality field is plain Input (line 116) — should be searchable Combobox
**API Client:** DONE
**UX Issues:**
- Raw Input for nationality (line 116-122)
- No passport expiry warning banner
- No contact linking dropdown
- Missing emergency contact and medical notes sections
- No auto-populate from URL params (contactId)
**Fix Required:**
1. `desktop/src/app/(app)/travellers/new/page.tsx` — Add Frequent Flyer Numbers (dynamic list), Medical Notes, Emergency Contact sections
2. `desktop/src/app/(app)/travellers/new/page.tsx:116` — Replace Input with searchable Combobox for nationality
3. `desktop/src/app/(app)/travellers/new/page.tsx` — Add passport expiry < 6 months warning banner
4. `desktop/src/app/(app)/travellers/new/page.tsx` — Add contact linking Combobox (search contacts API)
5. `desktop/src/app/(app)/travellers/new/page.tsx` — Add form validation for fullNamePassport, DOB in past, passport expiry
6. Create `desktop/src/app/(app)/travellers/[id]/edit/page.tsx` for edit mode with pre-fill
---

### TICKET-214: Traveller Detail Screen — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/travellers/[id]/page.tsx` (470 lines)
- Has 3 tabs: Details, Visa Applications, Documents — **missing 4th tab**: Preferences & Medical
- Overview shows personal + passport details — but **missing** emergency contact display
- Visa History tab exists (line 293-333) — but filtering logic is fragile (line 132: matches by passportNumber OR travelerId)
- Documents tab exists with upload/download (lines 79-114)
- Edit dialog exists but **not pre-filled** with existing data (line 45)
- Delete with confirmation exists
**API Client:** DONE
**UX Issues:**
- No loading skeletons (spinner only at lines 170-177)
- Edit form not pre-filled (line 45: `editForm` = empty object)
- No form validation in edit dialog
- Missing Preferences & Medical tab
- Missing emergency contact section
- Missing passport expiry warning banner
- No "Add Visa Application" button (FAB equivalent)
**Fix Required:**
1. `desktop/src/app/(app)/travellers/[id]/page.tsx:45` — Pre-fill editForm with traveller data on open
2. `desktop/src/app/(app)/travellers/[id]/page.tsx` — Add 4th tab "Preferences & Medical" (frequent flyer, meal/seat/room, medical notes)
3. `desktop/src/app/(app)/travellers/[id]/page.tsx` — Add emergency contact section to Details tab
4. `desktop/src/app/(app)/travellers/[id]/page.tsx` — Add passport expiry warning banner (< 6 months)
5. `desktop/src/app/(app)/travellers/[id]/page.tsx` — Add "New Visa Application" button with auto-populate travellerId
6. `desktop/src/app/(app)/travellers/[id]/page.tsx` — Replace spinner with skeleton loading
---

### TICKET-215: Traveller List Screen — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/travellers/page.tsx` (164 lines)
- Has search by name — but **not debounced** (no debounce logic)
- Has sort dropdown — but missing nationality and passport expiry filters
- Table shows name, nationality, passport, actions — but **missing**: profile photo/avatar, visa count badge, passport expiry indicator (green/yellow/red)
- Has empty state with "Add Traveller" button
- Has "Add Traveller" header button
- **Missing**: infinite scroll, FilterBar, loading skeletons, hover actions, detail drawer, delete handler
**API Client:** DONE
**UX Issues:**
- No FilterBar (lines 67-81: raw Select/Input)
- No infinite scroll (page state unused at line 26)
- No loading skeletons (spinner at line 92)
- No hover actions on rows
- No detail drawer
- Delete menu item not wired (line 143)
- No debounced search
- No passport expiry indicator
- No visa count badge
**Fix Required:**
1. `desktop/src/app/(app)/travellers/page.tsx` — Replace raw filters with FilterBar component
2. `desktop/src/app/(app)/travellers/page.tsx` — Add useInfiniteScroll
3. `desktop/src/app/(app)/travellers/page.tsx` — Add skeleton loading
4. `desktop/src/app/(app)/travellers/page.tsx` — Add hover actions (Eye, Pencil, Trash2)
5. `desktop/src/app/(app)/travellers/page.tsx` — Add detail drawer
6. `desktop/src/app/(app)/travellers/page.tsx:143` — Wire delete handler with confirmation
7. `desktop/src/app/(app)/travellers/page.tsx` — Add passport expiry color indicator and visa count badge
---

### TICKET-216: Traveller-to-Contact Linking — MISSING
**Backend:** MISSING — No link/unlink endpoints exist
- `PUT /travellers/:id/link-contact` — NOT IMPLEMENTED
- `PUT /travellers/:id/unlink-contact` — NOT IMPLEMENTED
- `GET /contacts/:contactId/travellers` — NOT IMPLEMENTED (only partial filter via contact_id query param on GET /)
**Frontend:** MISSING — No linking UI in contact detail or traveller form
- No "Travellers" tab on contact detail page
- No "Link Existing" traveller picker dialog
- No "Add Traveller" button that pre-fills contact_id
- No unlink confirmation dialog
**API Client:** MISSING — No link/unlink methods in travellersApi
**UX Issues:** Complete feature missing
**Fix Required:**
1. `backend/src/routes/travellers.ts` — Add `PUT /:id/link-contact` and `PUT /:id/unlink-contact` endpoints
2. `desktop/src/lib/api/visa.ts` — Add `linkContact(id, contactId)` and `unlinkContact(id)` methods
3. `desktop/src/lib/api/config.ts` — Add endpoint configs for link/unlink
4. Contact detail page — Add "Travellers" tab with "Add Traveller" and "Link Existing" buttons
5. Create `TravellerPickerDialog` component for searching and linking existing travellers
---

### TICKET-217: Traveller Documents Vault — R2 Upload & Management — PARTIAL
**Backend:** PARTIAL
- `traveller_documents` table exists in schema (lines ~503-517)
- GET `/travellers/:id` returns documents array (line 28-48 in routes/travellers.ts)
- **MISSING**: `POST /travellers/:id/documents` — Upload to R2
- **MISSING**: `GET /travellers/:id/documents` — List documents (separate endpoint)
- **MISSING**: `GET /traveller-documents/:docId/download` — Pre-signed R2 URL
- **MISSING**: `DELETE /traveller-documents/:docId` — Soft delete
**Frontend:** PARTIAL — Traveller detail page has basic document display (lines 337-413 in [id]/page.tsx)
- Shows documents list with download links
- Has upload button with file picker
- But upload goes to a **placeholder implementation** — no R2 integration
- Missing: document type selector, file size validation (10MB), mime type filtering (jpeg/png/pdf), preview capability
**API Client:** MISSING — No document-specific methods in travellersApi
**UX Issues:**
- Document upload likely non-functional (no R2 endpoints)
- No document type categorization
- No file size/type validation on frontend
- No thumbnail/preview for images
**Fix Required:**
1. `backend/src/routes/travellers.ts` — Add R2 document upload, list, download, delete endpoints
2. `desktop/src/lib/api/visa.ts` — Add document management methods to travellersApi
3. `desktop/src/app/(app)/travellers/[id]/page.tsx` — Add document type picker, file validation, image preview
---

### TICKET-218: Visa Application CRUD API — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/visa.ts` (215 lines)
- POST `/visa` — exists (line 38-73) with auto-generated checklist from country template ✓
- GET `/visa` — exists (line 15-36) but **missing**: pagination, traveller_id filter, destination_country filter, sorting, search, checklist progress in response
- GET `/visa/:id` — exists (line 75-102) with checklist, documents, notes joins ✓
- PUT `/visa/:id` — exists (line 104-133) ✓
- DELETE `/visa/:id` — exists (line 135-144) with soft delete ✓
- **MISSING**: `PUT /visa/:id/status` — Explicit status transition endpoint with validation
- **MISSING**: `GET /travellers/:travellerId/visa-applications` — List per traveller (separate endpoint)
**Frontend:** N/A (covered by other tickets)
**API Client:** `desktop/src/lib/api/visa.ts` — `visaApi` has list/getById/create/update/delete ✓
**UX Issues:** None at API level
**Fix Required:**
1. `backend/src/routes/visa.ts:15-36` — Add pagination (page/limit), search, traveller_id filter, destination_country filter, sorting
2. `backend/src/routes/visa.ts` — Add explicit `PUT /:id/status` endpoint with valid transition checks (not_started→documents_collecting→applied→processing→approved/rejected)
3. `backend/src/routes/visa.ts` — On "approved" status: require visa_number, visa_issue_date, visa_expiry_date
4. `backend/src/routes/visa.ts` — On "rejected" status: require rejection_reason
---

### TICKET-219: Visa Application Freezed Model & Repository (Flutter) — N/A (Desktop)
**Backend:** N/A
**Frontend:** N/A — Flutter-specific ticket. Desktop equivalent is `desktop/src/lib/api/visa.ts` which has `visaApi` with CRUD methods.
**API Client:** DONE — `visaApi` in `desktop/src/lib/api/visa.ts` lines 91-124
**UX Issues:** None
**Fix Required:** None — Flutter ticket, desktop equivalent exists
---

### TICKET-220: Visa Application List Screen — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/visa/page.tsx` (264 lines)
- Has status filter dropdown and country search — but using raw Select/Input, not FilterBar
- Has table with columns: traveller, destination, type, status, applied date, actions
- Status chip with color coding ✓
- Has "New Application" button ✓
- **Missing**: infinite scroll (loads 100 at once, line 74), FilterBar, loading skeletons, hover actions, detail drawer, checklist progress bar on cards, sort options, quick status counts (horizontal scroll chips)
**API Client:** DONE
**UX Issues:**
- No FilterBar (lines 162-193)
- No infinite scroll (line 74: limit 100)
- No loading skeletons (spinner at line 204)
- No hover actions on rows
- No detail drawer
- No checklist progress bar on list items
- No quick status count chips
- No sort options dropdown
**Fix Required:**
1. `desktop/src/app/(app)/visa/page.tsx` — Replace raw filters with FilterBar component
2. `desktop/src/app/(app)/visa/page.tsx:74` — Replace limit:100 with useInfiniteScroll
3. `desktop/src/app/(app)/visa/page.tsx` — Add skeleton loading, hover actions, detail drawer
4. `desktop/src/app/(app)/visa/page.tsx` — Add checklist progress bar to table rows
5. `desktop/src/app/(app)/visa/page.tsx` — Add horizontal status count chips at top
---

### TICKET-221: Visa Application Detail Screen — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/visa/[id]/page.tsx` (444 lines)
- Has 4 tabs: Details, Checklist, Notes, Timeline ✓
- Status display with color coding ✓
- Checklist with checkboxes and progress tracking ✓
- Notes section with add capability ✓
- Timeline visualization ✓
- Delete with confirmation ✓
- **Missing**: Status pipeline stepper at top (horizontal stepper showing all statuses)
- **Missing**: Traveller info card with navigation link
- **Missing**: "Attach Document" per checklist item
- **Missing**: Document upload grid
- **Missing**: Rejection reason red banner
- **Missing**: "Advance Status" button with next valid status
- Edit button doesn't work correctly (line 163: navigates away instead of editing)
**API Client:** DONE
**UX Issues:**
- No loading skeletons (spinner at lines 118-125)
- Edit button broken (line 163)
- No status pipeline stepper
- No document upload on checklist items
- No rejection reason banner
**Fix Required:**
1. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add horizontal status pipeline stepper at top
2. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add traveller info card with link to traveller detail
3. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add "Attach Document" per checklist item
4. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add rejection reason red banner when status=rejected
5. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add "Advance Status" button
6. `desktop/src/app/(app)/visa/[id]/page.tsx:163` — Fix edit button to navigate to edit page
7. `desktop/src/app/(app)/visa/[id]/page.tsx` — Replace spinner with skeleton loading
---

### TICKET-222: Visa Application Create/Edit Form — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/visa/new/page.tsx` (201 lines)
- Create mode exists — single form, not multi-step wizard as specified
- Has traveller name input — but should be searchable Combobox selecting existing traveller
- Has destination country Input — should be searchable Combobox
- Has visa type select ✓
- Has application date ✓
- **Missing**: Multi-step wizard (Step 1: Select Traveller, Step 2: Destination/Type/Embassy, Step 3: Review auto-generated checklist)
- **Missing**: Lead linking Combobox
- **Missing**: Edit mode (no `/visa/:id/edit` page exists)
- Status hard-coded to 'applied' (line 66) instead of 'not_started'
**API Client:** DONE
**UX Issues:**
- Raw Input for traveller (should be Combobox searching travellersApi.list)
- Raw Input for destination country (should be Combobox)
- No lead linking dropdown
- No edit mode at all
- Status hard-coded incorrectly
- No auto-populate from URL params (travellerId)
**Fix Required:**
1. `desktop/src/app/(app)/visa/new/page.tsx` — Replace traveller name Input with searchable Combobox (travellersApi.list with search)
2. `desktop/src/app/(app)/visa/new/page.tsx:140-146` — Replace country Input with searchable Combobox
3. `desktop/src/app/(app)/visa/new/page.tsx:66` — Change default status from 'applied' to 'not_started'
4. `desktop/src/app/(app)/visa/new/page.tsx` — Add lead linking Combobox (leadsApi.list with search)
5. `desktop/src/app/(app)/visa/new/page.tsx` — Add auto-populate travellerId from URL query params
6. Create `desktop/src/app/(app)/visa/[id]/edit/page.tsx` for edit mode with pre-fill
7. Ideally implement multi-step wizard (Combobox → Details → Checklist review)
---

### TICKET-223: Checklist Progress Tracking & Document Tick-Off — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/visa.ts` lines 147-192
- `PUT /visa/:id/checklist/:itemId` — exists ✓ (marks is_received, sets received_date/received_by, auto-transitions status)
- **MISSING**: `POST /visa/:id/checklist-items` — Add custom checklist item
- **MISSING**: `DELETE /visa-checklist-items/:id` — Remove custom items
- **MISSING**: `GET /visa/:id/checklist-progress` — Returns received/total/required stats
**Frontend:** PARTIAL — Visa detail page has checklist tab with checkboxes
- Checkbox toggle works (calls updateChecklistItem)
- Progress bar displayed
- **Missing**: "Attach Document" per item → file picker → R2 upload
- **Missing**: "Add custom item" button
- **Missing**: Delete custom items
- **Missing**: Notes per checklist item
- **Missing**: Required document red highlight for missing items
**API Client:** PARTIAL — Has `updateChecklistItem` but missing `addChecklistItem`, `deleteChecklistItem`, `getChecklistProgress`
**UX Issues:**
- No document attachment per checklist item
- No custom item management
- Missing required items not highlighted in red
**Fix Required:**
1. `backend/src/routes/visa.ts` — Add POST /:id/checklist-items and DELETE /visa-checklist-items/:id endpoints
2. `desktop/src/lib/api/visa.ts` — Add addChecklistItem, deleteChecklistItem methods
3. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add "Attach Document" button per item, "Add Custom Item" button, red highlight for missing required
---

### TICKET-224: Missing Document Alerts — MISSING
**Backend:** MISSING
- `GET /visa/missing-documents` — NOT IMPLEMENTED (no endpoint exists)
- Cron exists in `backend/src/cron/auto-reminders.ts:416-465` for checking missing docs > 7 days — but only sends email, doesn't create in-app notification
- Missing docs count on dashboard — NOT IMPLEMENTED
**Frontend:** MISSING
- No warning badge on visa list cards
- No "Missing Documents" alert banner on visa detail
- No missing docs count on dashboard
**API Client:** MISSING — No missingDocuments method
**UX Issues:** Complete feature missing from frontend
**Fix Required:**
1. `backend/src/routes/visa.ts` — Add `GET /missing-documents` endpoint returning apps in documents_collecting with unchecked required items
2. `desktop/src/lib/api/visa.ts` — Add `getMissingDocuments()` method
3. `desktop/src/app/(app)/visa/page.tsx` — Add warning badge on list cards for missing docs
4. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add "Missing Documents" alert banner
---

### TICKET-225: Visa Document Upload to R2 — MISSING
**Backend:** MISSING
- `visa_documents` table exists in schema ✓
- **MISSING**: `POST /visa/:id/documents` — Upload to R2
- **MISSING**: `GET /visa/:id/documents` — List documents (currently fetched inline in GET /:id)
- **MISSING**: `GET /visa-documents/:docId/download` — Pre-signed R2 URL
- **MISSING**: `DELETE /visa-documents/:docId` — Soft delete
**Frontend:** MISSING — No document upload UI on visa detail
**API Client:** MISSING — No visa document methods
**UX Issues:** Documents section completely missing from visa detail page
**Fix Required:**
1. `backend/src/routes/visa.ts` — Add document upload (R2), list, download (pre-signed URL), delete endpoints
2. `desktop/src/lib/api/visa.ts` — Add visa document management methods
3. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add Documents tab/section with upload, grid, preview, delete
---

### TICKET-226: Send Visa Documents via WhatsApp/Email — MISSING
**Backend:** MISSING
- `POST /visa/:id/send-documents` — NOT IMPLEMENTED
- No `visa-document-sender.ts` service exists
- No WhatsApp/Email integration for visa documents
**Frontend:** MISSING
- No "Share Documents" button on visa detail
- No channel selector bottom sheet
- No document selection for sending
**API Client:** MISSING
**UX Issues:** Complete feature missing
**Fix Required:**
1. Create `backend/src/services/visa-document-sender.ts` — WhatsApp (Twilio) and Email (SendGrid) sending
2. `backend/src/routes/visa.ts` — Add `POST /:id/send-documents` endpoint
3. `desktop/src/lib/api/visa.ts` — Add `sendDocuments(id, data)` method
4. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add "Share Documents" button with channel/document picker dialog
---

### TICKET-227: Visa Expiry & Passport Expiry Alerts — PARTIAL + BUG
**Backend:** PARTIAL — Cron exists but has bugs
- `checkVisaPassportExpiry` in `backend/src/cron/auto-reminders.ts:324-409` — exists ✓
- `checkMissingVisaDocuments` in `backend/src/cron/auto-reminders.ts:416-465` — exists ✓
- `expiry_alerts_log` table exists in schema ✓
- **BUG**: Cron queries wrong column names:
  - Line 350: `va.country` but schema column is `destination_country`
  - Line 355: `va.expiry_date` but schema column is `visa_expiry_date`
  - Line 382: `t.passport_expiry` but schema column is `passport_expiry_date`
- **MISSING**: Multiple alert thresholds (30/14/7/1 days for visa; 6/3/1 months for passport) — only single threshold implemented
- **MISSING**: Duplicate alert prevention using `expiry_alerts_log` table (table exists but never written to)
- **MISSING**: "EXPIRED" status indicator in UI for expired visas/passports
**Frontend:** MISSING
- No expired visa/passport visual indicator on list/detail pages
**API Client:** N/A (cron-driven)
**UX Issues:**
- Column name mismatch will cause cron queries to fail silently
- No deduplication — same alert sent every day
- No visual indicators for expired items
**Fix Required:**
1. `backend/src/cron/auto-reminders.ts:350` — Fix `va.country` → `va.destination_country`
2. `backend/src/cron/auto-reminders.ts:355` — Fix `va.expiry_date` → `va.visa_expiry_date`
3. `backend/src/cron/auto-reminders.ts:382` — Fix `t.passport_expiry` → `t.passport_expiry_date`
4. `backend/src/cron/auto-reminders.ts` — Add deduplication via expiry_alerts_log writes + checks
5. `backend/src/cron/auto-reminders.ts` — Add multiple thresholds (30/14/7/1 days)
6. Visa/traveller list and detail pages — Add "EXPIRED" badge for expired items
---

### TICKET-228: Bulk Visa Tracking Dashboard — PARTIAL
**Backend:** MISSING
- `GET /visa/dashboard` — NOT IMPLEMENTED (no endpoint exists)
- No status_counts, expiring_soon, missing_documents, recent_updates, by_country aggregation
**Frontend:** PARTIAL — `desktop/src/app/(app)/visa/dashboard/page.tsx` (243 lines)
- Has 4 stat cards (Total, Active, Expiring Soon, Approved) ✓
- Has "Upcoming Deadlines" table ✓
- Has "Applications by Country" section ✓
- **Missing**: Kanban view (columns per status with draggable cards)
- **Missing**: Toggle between Kanban and Table view
- **Missing**: "Expiring Soon" detailed section
- **Missing**: "Missing Documents" section
- **Missing**: Quick filters (by country, status, assigned user, date range)
- No real dashboard API — seems to fetch all visa records and compute stats on frontend
**API Client:** MISSING — No dashboard endpoint defined
**UX Issues:**
- No Kanban view at all
- No loading skeletons (spinner at lines 69-76)
- Stats computed client-side from full list fetch (inefficient)
**Fix Required:**
1. `backend/src/routes/visa.ts` — Add `GET /dashboard` endpoint returning aggregated stats
2. `desktop/src/lib/api/visa.ts` — Add `getDashboard()` method
3. `desktop/src/app/(app)/visa/dashboard/page.tsx` — Add Kanban view toggle, missing docs section, expiring soon section
4. `desktop/src/app/(app)/visa/dashboard/page.tsx` — Replace spinner with skeleton loading
---

### TICKET-229: Visa Notes per Application — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/visa.ts` lines 195-212
- `POST /visa/:id/notes` — exists ✓ (creates note with content, returns noteId)
- Notes returned inline with `GET /visa/:id` ✓
- **MISSING**: `GET /visa/:id/notes` — Dedicated list endpoint (newest first) with user name/avatar
- **MISSING**: `PUT /visa-notes/:noteId` — Edit (creator only)
- **MISSING**: `DELETE /visa-notes/:noteId` — Soft delete (creator or admin)
- **MISSING**: Auto-generated system notes on status change
**Frontend:** PARTIAL — Visa detail has Notes tab with add capability
- Shows notes list ✓
- Has add note text field ✓
- **Missing**: User name/avatar display per note
- **Missing**: Relative timestamps
- **Missing**: Edit/delete own notes (long-press or menu)
- **Missing**: System notes for status changes
**API Client:** PARTIAL — Has `getNotes(id)` and `updateNotes(id, data)` but updateNotes seems to be a PUT (should be POST for adding)
**UX Issues:**
- No user attribution on notes
- No edit/delete capability
- No system notes
**Fix Required:**
1. `backend/src/routes/visa.ts` — Add `PUT /visa-notes/:noteId` (edit) and `DELETE /visa-notes/:noteId` (soft delete) endpoints
2. `backend/src/routes/visa.ts` — Add system note generation on status change
3. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add user name/avatar, relative time, edit/delete menu per note
---

### TICKET-230: Visa & Traveller Routes and Navigation — DONE
**Backend:** N/A
**Frontend:** DONE
- `/visa` → Visa list page ✓ (`desktop/src/app/(app)/visa/page.tsx`)
- `/visa/new` → Visa create page ✓ (`desktop/src/app/(app)/visa/new/page.tsx`)
- `/visa/:id` → Visa detail page ✓ (`desktop/src/app/(app)/visa/[id]/page.tsx`)
- `/visa/dashboard` → Visa dashboard ✓ (`desktop/src/app/(app)/visa/dashboard/page.tsx`)
- `/travellers` → Traveller list ✓ (`desktop/src/app/(app)/travellers/page.tsx`)
- `/travellers/new` → Traveller create ✓ (`desktop/src/app/(app)/travellers/new/page.tsx`)
- `/travellers/:id` → Traveller detail ✓ (`desktop/src/app/(app)/travellers/[id]/page.tsx`)
- Sidebar: "Visa & Travellers" registered at line 90 of sidebar.tsx ✓
- **Missing**: `/visa/:id/edit` route (no edit page)
- **Missing**: `/travellers/:id/edit` route (no edit page)
- **Missing**: Separate "Travellers" sidebar item (currently bundled under "Visa & Travellers")
**API Client:** N/A
**UX Issues:**
- No edit routes for visa or traveller
- Sidebar combines visa and travellers into one item — spec says separate items
**Fix Required:**
1. Create `desktop/src/app/(app)/visa/[id]/edit/page.tsx`
2. Create `desktop/src/app/(app)/travellers/[id]/edit/page.tsx`
3. `desktop/src/components/layout/sidebar.tsx:90` — Consider splitting into "Travellers" and "Visa Management" with sub-items (Applications, Dashboard)
---

### TICKET-231: Country-Specific Visa Checklist Templates — PARTIAL
**Backend:** PARTIAL
- `getChecklistTemplate()` function exists in `backend/src/db/seed/visa-checklist-templates.ts` (82 lines) ✓
- Covers 10 countries: USA, UK, Schengen, Canada, Australia, Dubai, Singapore, Thailand, Japan, New Zealand ✓
- Business, student, medical extras ✓
- Auto-populated on visa creation via `POST /visa` (line 58 of visa.ts) ✓
- **MISSING**: `visa_checklist_templates` table in schema — templates are hard-coded in JS, not in database
- **MISSING**: `GET /visa-checklist-templates` — Admin API to list templates
- **MISSING**: `POST /visa-checklist-templates` — Admin API to add custom template
- **MISSING**: `PUT /visa-checklist-templates/:id` — Admin API to edit template
- **MISSING**: `DELETE /visa-checklist-templates/:id` — Admin API to deactivate
- **MISSING**: Admin settings screen to manage templates
**Frontend:** MISSING — No admin template management screen
**API Client:** MISSING — No template management methods
**UX Issues:** Templates are hard-coded, not tenant-customizable
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `visa_checklist_templates` table
2. `backend/src/routes/visa.ts` — Add template CRUD endpoints (GET, POST, PUT, DELETE)
3. `desktop/src/lib/api/visa.ts` — Add template management methods
4. Create admin template management page (under Settings)
---

### TICKET-232: Visa Status Pipeline Transitions & History — MISSING
**Backend:** MISSING
- `visa_status_history` table — NOT IN SCHEMA
- Valid transition enforcement — NOT IMPLEMENTED (status can be freely changed via PUT)
- On "approved": visa_number, visa_issue_date, visa_expiry_date NOT required
- On "rejected": rejection_reason NOT required
- `GET /visa/:id/history` — NOT IMPLEMENTED
- System notes on status change — NOT IMPLEMENTED
**Frontend:** MISSING
- No status pipeline stepper widget
- No "Advance Status" button
- No approval dialog (requiring visa number, dates)
- No rejection dialog (requiring reason)
- No status history timeline
**API Client:** MISSING — No status transition or history methods
**UX Issues:** Complete feature missing
**Fix Required:**
1. `backend/src/db/tenant-schema.ts` — Add `visa_status_history` table (id, tenant_id, visa_application_id, old_status, new_status, changed_by, changed_at, notes)
2. `backend/src/routes/visa.ts` — Add `PUT /:id/status` with transition validation, auto-set date fields, require visa details on approve, require reason on reject
3. `backend/src/routes/visa.ts` — Add `GET /:id/history` endpoint
4. `desktop/src/lib/api/visa.ts` — Add `updateStatus(id, status, data)` and `getHistory(id)` methods
5. `desktop/src/app/(app)/visa/[id]/page.tsx` — Add status pipeline stepper, advance button, approval/rejection dialogs

---

### Credit/Debit Notes (not explicitly numbered in M13 tickets but implemented in codebase)

### Credit Notes CRUD — DONE
**Backend:** DONE — `backend/src/routes/credit-notes.ts` (lines 63-338)
- `POST /credit-notes` — Create credit note from invoice ✓
- `GET /credit-notes` — List with pagination and contactId filter ✓
- `POST /credit-notes/:id/apply` — Apply to invoice ✓
**Frontend:** DONE — `desktop/src/app/(app)/credit-notes/page.tsx` (199 lines)
- Uses FilterBar ✓, useInfiniteScroll ✓, loading skeletons ✓, empty state ✓, hover actions ✓
**API Client:** DONE — `creditNotesApi` in `desktop/src/lib/api/credit-notes.ts`
**UX Issues:**
- No detail drawer to view full note details
- No "Create" button in header (created from invoice detail page only)
- Missing: `GET /credit-notes/:id`, `PUT /credit-notes/:id` (edit draft), `DELETE /credit-notes/:id` (delete draft)
**Fix Required:**
1. Add detail drawer to credit notes list page
2. `backend/src/routes/credit-notes.ts` — Add GET /:id, PUT /:id (draft only), DELETE /:id (draft only)

---

### Debit Notes CRUD — DONE + BUG
**Backend:** DONE — `backend/src/routes/credit-notes.ts` (lines 345-613)
- `POST /debit-notes` ✓, `GET /debit-notes` ✓, `POST /debit-notes/:id/apply` ✓
**Frontend:** DONE — `desktop/src/app/(app)/debit-notes/page.tsx` (196 lines)
- Uses FilterBar ✓, useInfiniteScroll ✓, loading skeletons ✓, empty state ✓, hover actions ✓
- **BUG**: Line 15 imports `CreditNote` type instead of a proper `DebitNote` type — works because types are identical, but incorrect
**API Client:** DONE — `debitNotesApi` in `desktop/src/lib/api/credit-notes.ts`
**UX Issues:**
- Same as credit notes: no detail drawer, missing GET/PUT/DELETE by ID
- Wrong type import (line 15)
**Fix Required:**
1. `desktop/src/app/(app)/debit-notes/page.tsx:15` — Create proper `DebitNote` type or rename import alias
2. Add detail drawer to debit notes list page
3. `backend/src/routes/credit-notes.ts` — Add GET, PUT, DELETE by ID for debit notes

---

## BUG Summary

| # | Location | Bug | Severity |
|---|----------|-----|----------|
| 1 | `backend/src/cron/auto-reminders.ts:350` | Queries `va.country` but column is `destination_country` — cron will silently fail | Critical |
| 2 | `backend/src/cron/auto-reminders.ts:355` | Queries `va.expiry_date` but column is `visa_expiry_date` — cron will silently fail | Critical |
| 3 | `backend/src/cron/auto-reminders.ts:382` | Queries `t.passport_expiry` but column is `passport_expiry_date` — cron will silently fail | Critical |
| 4 | `desktop/src/app/(app)/debit-notes/page.tsx:15` | Imports `CreditNote` type for debit notes page | Low |
| 5 | `desktop/src/app/(app)/visa/new/page.tsx:66` | Default status hard-coded to 'applied' instead of 'not_started' | Medium |
| 6 | `desktop/src/app/(app)/travellers/[id]/page.tsx:45` | Edit form initialized as empty object instead of pre-filled data | Medium |
