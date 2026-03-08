# Milestone 16 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m16.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 5     |
| PARTIAL | 8     |
| MISSING | 1     |
| BUG     | 5     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `FILE_STORAGE` (R2 binding) | `backend/src/routes/imports.ts:64`, `backend/src/queues/import-queue.ts:48`, `backend/src/queues/export-queue.ts:165`, `backend/src/routes/exports.ts:166` | Yes | Upload/download will fail with 500 — needs error message "Storage not configured" |
| `IMPORT_QUEUE` (Queue binding) | `backend/src/routes/imports.ts:128` | Yes | Execute will fail — needs graceful error "Import queue not available" |
| `EXPORT_QUEUE` (Queue binding) | `backend/src/routes/exports.ts:92,123` | Yes | Bulk PDF and full export will fail — needs graceful error |
| `MASTER_DB` (D1 binding) | `backend/src/queues/import-queue.ts:28`, `backend/src/queues/export-queue.ts:29` | Yes | Queue handlers fail silently — should log and mark job as failed |

## UX Anti-Patterns (must fix)

| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `desktop/src/app/(app)/import/page.tsx` | **Hardcoded sample data** (lines 39-45) — Preview shows static data, not parsed file data | Use actual parsed headers/preview from `importsApi.upload()` response |
| `desktop/src/app/(app)/import/page.tsx` | **Hardcoded file columns** (line 47) — `fileColumns` is static `['col1','col2',...]` | Use dynamic headers returned from upload API |
| `desktop/src/app/(app)/import/page.tsx` | **Missing import types** — Only offers contacts/leads/invoices (line 236-239) | Add suppliers, rate_cards, travellers per ticket spec (5 types total) |
| `desktop/src/app/(app)/import/page.tsx` | **No auto-mapping** — Column mapping step has no auto-match logic | Add auto-mapping of CSV headers to CRM fields (case-insensitive fuzzy match) |
| `desktop/src/app/(app)/import/page.tsx` | **No required field indicators** — All fields shown equally in mapper | Mark required fields with * and red warning for unmapped required |
| `desktop/src/app/(app)/import/page.tsx` | **No duplicate mapping prevention** — Same CRM field can be mapped to multiple CSV columns | Disable already-mapped CRM fields in other dropdowns |
| `desktop/src/app/(app)/import/page.tsx` | **Hardcoded record/duplicate counts** (lines 61-62) — `sampleData.length` and `Math.ceil()` | Use real counts from API response |
| `desktop/src/app/(app)/import/page.tsx` | **No real-time progress polling** — Import fires and navigates away after toast | Poll `importsApi.getProgress()` every 2s and show progress bar |
| `desktop/src/app/(app)/import/page.tsx` | **No error report download** — No button to download failed rows after import | Add "Download Error Report" button calling `/imports/:id/errors/download` |
| `desktop/src/app/(app)/import/page.tsx` | **No template download** — Missing "Download Template" link per import type | Add template download button calling `importsApi.getTemplate(type)` |
| `desktop/src/app/(app)/import/page.tsx` | **No validation status in preview** (lines 341-354) — Preview table shows no per-row validation | Add green check / red X per row with tooltip errors |
| `desktop/src/app/(app)/import/page.tsx` | **No file size validation** — No 20MB limit check on client | Add client-side check: `if (file.size > 20*1024*1024)` reject |
| `desktop/src/app/(app)/settings/import/page.tsx` | **Missing column mapping step** — Wizard jumps from upload → configure (skip/update toggle) → execute | Add full column mapping step between upload and execute |
| `desktop/src/app/(app)/settings/import/page.tsx` | **Passes empty mapping** (line 110) — `mapping: {}` sent to execute | Use actual column mapping from file headers |
| `desktop/src/app/(app)/settings/import/page.tsx` | **Missing import types** — Only offers contacts/leads/suppliers (line 210-214) | Add rate_cards, travellers |
| `desktop/src/app/(app)/settings/import/page.tsx` | **No preview step** — Cannot see data before importing | Add preview table showing first 5 rows with mapped fields |
| `desktop/src/app/(app)/settings/export/page.tsx` | **No filtered export** — Exports all data, doesn't respect current filters | Add filter params (type, tags, status, date range, search) |
| `desktop/src/app/(app)/settings/export/page.tsx` | **No CSV format option for contacts** — Contacts export uses POST but API expects GET | Fix: `exportsApi.contacts` uses POST (line 40) but backend route is GET (exports.ts:12) — method mismatch BUG |
| `desktop/src/app/(app)/settings/export/page.tsx` | **Export jobs not loaded on mount** — `exportJobs` starts empty, only populated when user triggers export | Load existing jobs from API on page mount |
| `desktop/src/app/(app)/settings/export/page.tsx` | **Missing export types** — Full export only shows contacts/leads/invoices/tasks toggles (line 227-232) | Add suppliers, travellers, payments, documents, messages per GDPR spec |
| `desktop/src/app/(app)/invoices/page.tsx` | **No multi-select / bulk PDF** — No checkbox column or bulk action toolbar | Add multi-select checkboxes + "Download Selected as PDF" button |
| `desktop/src/app/(app)/invoices/page.tsx` | **Client-side PDF generation** (lines 91-121) — Uses jsPDF with minimal content | Use server-side PDF generation via export API for proper invoices |
| `desktop/src/components/layout/sidebar.tsx` | **No Import/Export sidebar entry** — No navigation item for import/export anywhere | Add "Import / Export" item under Tools section linking to `/import` |
| `desktop/src/app/(app)/contacts/import/page.tsx` | **Client-side template generation** (lines 131-143) — Generates CSV blob locally | Call `importsApi.getTemplate('contacts')` for server-generated template with Field Guide sheet |
| `desktop/src/app/(app)/contacts/import/page.tsx` | **No loading skeleton** — Page shows nothing while upload API runs | Add spinner/skeleton during upload |

## UX Improvements (nice to have)

| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `import/page.tsx` | 5-step wizard with manual Next/Prev | Collapse to 4 steps matching spec: Upload → Map → Preview → Import | Medium |
| `import/page.tsx` | No keyboard shortcuts | Add Ctrl+Enter to proceed to next step | Low |
| `import/page.tsx` | No import history link | Add "View Import History" link to settings/import | Medium |
| `settings/import/page.tsx` | History table has no row actions | Add "View Details", "Download Errors", "Delete" buttons per row | High |
| `settings/import/page.tsx` | History table has no filter/search | Add FilterBar for import_type and status filtering | Medium |
| `settings/import/page.tsx` | No pagination on history | Add useInfiniteScroll or manual pagination (20 per page) | Medium |
| `settings/export/page.tsx` | No auto-refresh for processing jobs | Auto-poll job status every 3s while any job is "processing" | High |
| `settings/export/page.tsx` | No export from list pages | Add "Export" button in contacts/leads/invoices list page toolbars | High |
| `settings/export/page.tsx` | File naming is generic | Use dated naming: `contacts_export_2026-03-08.xlsx` | Low |
| `contacts/import/page.tsx` | Only supports CSV client-side parsing | Support XLSX parsing client-side or rely on server-parsed headers | Medium |
| `invoices/page.tsx` | Single invoice PDF only | Add bulk select + bulk PDF zip download via backend | High |
| All import pages | Multiple overlapping import UIs | Consolidate to single import wizard at `/import` | Medium |
| Sidebar | No Import/Export navigation | Add dedicated section or item | High |

## Ticket Details

### TICKET-276: Import Schema & Job Tracking Infrastructure — DONE
**Backend:** DONE — `backend/src/db/tenant-schema.ts:1059-1119` — `importJobs`, `importErrors`, `importTemplates`, `exportJobs` tables all present with correct fields, indexes, and FK constraints.
**Frontend:** DONE — API client at `desktop/src/lib/api/imports.ts` with full CRUD. Config endpoints at `desktop/src/lib/api/config.ts:266-273`.
**API Client:** DONE — list, upload, execute, getProgress, getErrors, getTemplate methods.
**UX Issues:** None — schema-only ticket.
**Fix Required:** None.

---

### TICKET-277: File Upload & CSV/Excel Parsing Engine — DONE
**Backend:** DONE — `backend/src/routes/imports.ts:28-93` (POST /upload), `backend/src/services/imports/file-parser.ts` (72 lines) — SheetJS-based parser handles CSV/XLSX/XLS, extracts headers, returns preview rows. R2 upload working.
**Frontend:** PARTIAL — Upload works in `contacts/import/page.tsx` and `settings/import/page.tsx`. Main `import/page.tsx` has upload UI but doesn't use parsed headers from response.
**API Client:** DONE — `importsApi.upload()` sends FormData correctly.
**UX Issues:**
- `import/page.tsx:39-47` — Uses hardcoded `sampleData` and `fileColumns` instead of server-returned headers/preview
- `import/page.tsx:47` — Static column names instead of dynamic
**Fix Required:**
1. `desktop/src/app/(app)/import/page.tsx:39-47` — Replace hardcoded sample data with state populated from upload API response (`uploadResponse.data.headers`, `uploadResponse.data.previewData`)
2. `desktop/src/app/(app)/import/page.tsx:296-312` — Column mapping should iterate over dynamic headers

---

### TICKET-278: Data Validation Engine — DONE
**Backend:** DONE — `backend/src/services/imports/import-validator.ts` (118 lines) — Zod schemas for all 5 import types (contacts, leads, suppliers, rate_cards, travellers). Validates required fields, email format, numeric types. Column mapping supported.
**Frontend:** MISSING — No validation preview in any desktop import page. Preview table shows raw data without per-row validation status.
**API Client:** N/A (validation happens server-side in queue).
**UX Issues:**
- `import/page.tsx:320-358` — Preview step shows data but no validation indicators (green check / red X per row)
- No client-side pre-validation before submitting to server
**Fix Required:**
1. `desktop/src/app/(app)/import/page.tsx:320-358` — Add validation status column in preview table. Can either validate client-side or show results from a preview-validate API call.

---

### TICKET-279: Duplicate Detection Engine — PARTIAL
**Backend:** PARTIAL — `backend/src/services/imports/duplicate-detector.ts` (96 lines) — Detects duplicates for contacts (email only), leads (title only), suppliers (email only), travellers (passport only).
**Missing per spec:**
- Contacts should match on phone OR email — only matches email (line 30-39)
- Leads should match on contact_id + destination + travel_date — only matches title (line 45-54)
- Suppliers should match on company_name + phone — only matches email (line 58-67)
- Rate cards should match on supplier_id + service_name + valid_from — has no detection at all (line 83-86)
- Travellers should match on passport_number OR (name + date_of_birth) — only matches passport (line 71-81)
**Frontend:** PARTIAL — Duplicate strategy selector exists in `import/page.tsx:360-404` and `contacts/import/page.tsx:305-314` but only as skip checkbox, not the 3-option radio (skip/merge/create).
**API Client:** DONE — execute() accepts `skipDuplicates` and `updateExisting`.
**UX Issues:**
- `import/page.tsx:360-404` — Has 3 options (skip/update/create) but displayed as radio buttons disconnected from API. API expects `duplicateStrategy` enum.
- `contacts/import/page.tsx:305-314` — Only a single checkbox "Skip duplicates", no merge/create option.
**Fix Required:**
1. `backend/src/services/imports/duplicate-detector.ts:30-39` — Add phone matching for contacts: `or(eq(schema.contacts.email, data.email), eq(schema.contacts.phone, data.phone))`
2. `backend/src/services/imports/duplicate-detector.ts:45-54` — Match on contact_id + destination + travel_date per spec
3. `backend/src/services/imports/duplicate-detector.ts:58-67` — Match on company_name + phone per spec
4. `backend/src/services/imports/duplicate-detector.ts:71-81` — Add name + DOB fallback matching per spec
5. `backend/src/services/imports/duplicate-detector.ts:83-86` — Implement rate_cards duplicate detection per spec
6. `desktop/src/app/(app)/contacts/import/page.tsx:305-314` — Replace single checkbox with 3-option radio matching backend enum

---

### TICKET-280: Chunked Import Processing via Queues — PARTIAL
**Backend:** PARTIAL — `backend/src/queues/import-queue.ts` (156 lines) — Processes import jobs via queue with validation → duplicate check → insert pipeline. Progress updated every 100 rows.
**Missing per spec:**
- Not truly chunked — processes all rows in single queue message (no batching of 100 rows into separate queue messages)
- No cancel support — spec requires `status = 'cancelled'` handling to stop mid-import
- `backend/src/routes/imports.ts` — No `POST /imports/:id/cancel` endpoint
- Queue uses `env.MASTER_DB` (line 28) instead of tenant DB — **BUG**: should resolve tenant DB from the job record
**Frontend:** MISSING — No cancel button during import progress.
**API Client:** MISSING — No `cancel()` method.
**Fix Required:**
1. `backend/src/queues/import-queue.ts:28` — Should use tenant DB, not MASTER_DB
2. `backend/src/queues/import-queue.ts` — Add chunking: split into batches of 100 rows with separate queue messages
3. `backend/src/routes/imports.ts` — Add `POST /:id/cancel` endpoint setting status to 'cancelled'
4. `backend/src/queues/import-queue.ts:72` — Check job status before each row, stop if 'cancelled'
5. `desktop/src/lib/api/imports.ts` — Add `cancel(id)` method
6. `desktop/src/lib/api/config.ts` — Add cancel endpoint

---

### TICKET-281: Row Insertion Service (All 5 Import Types) — PARTIAL
**Backend:** PARTIAL — `backend/src/services/imports/row-inserter.ts` (174 lines) — Handles create and merge for contacts, leads, suppliers, rate_cards, travellers.
**Missing per spec:**
- Contacts: no `source = 'import'` being set (line 36-48)
- Contacts: not normalizing phone (strip spaces/dashes) or lowercasing email
- Leads: creates new contact always instead of resolving by name/phone/email first (line 63-74)
- Leads: no `status = 'new'`, no `source = 'import'` set
- Suppliers: not normalizing phone or lowercasing email
- Rate cards: `supplierId` set to raw `validData.supplierName` (line 123) — should resolve supplier by company_name
- Rate cards: no merge logic (always creates) — `duplicateAction` ignored
- Rate cards: no `sellPrice`, `validFrom`, `validTo` fields being set
- Travellers: not linking to existing contact by matching passport or name+DOB
**Frontend:** N/A (server-side service).
**UX Issues:** None directly — backend correctness issue.
**Fix Required:**
1. `backend/src/services/imports/row-inserter.ts:36-48` — Add `source: 'import'` to contacts insert
2. `backend/src/services/imports/row-inserter.ts:63-74` — Resolve existing contact by name/phone/email before creating new
3. `backend/src/services/imports/row-inserter.ts:120-133` — Resolve supplier by company_name to get supplier_id, add sell_price and date fields
4. `backend/src/services/imports/row-inserter.ts` — Add phone normalization and email lowercasing across all types

---

### TICKET-282: Import Template Download — PARTIAL
**Backend:** DONE — `backend/src/routes/imports.ts:213-228` (GET /templates/:type), `backend/src/services/imports/template-generator.ts` (43 lines) — Generates XLSX templates for all 5 types.
**Missing per spec:**
- Templates only have headers, no sample data row (spec requires 1 sample row)
- No "Field Guide" second sheet (spec requires sheet with Field Name, Required?, Format, Allowed Values, Example)
- Headers use camelCase (`firstName`) instead of human-readable (`First Name *`)
- Required fields not marked with *
**Frontend:** BUG — `contacts/import/page.tsx:131-143` generates template client-side as CSV instead of calling backend API. `settings/import/page.tsx:126-133` calls API but doesn't trigger file download (just calls `getTemplate` which returns JSON, not blob).
**API Client:** PARTIAL — `importsApi.getTemplate(type)` fetches but expects JSON response, not blob/binary download.
**Fix Required:**
1. `backend/src/services/imports/template-generator.ts` — Add sample data row + Field Guide sheet + human-readable headers with * for required
2. `desktop/src/app/(app)/contacts/import/page.tsx:131-143` — Replace client-side CSV generation with API call
3. `desktop/src/lib/api/imports.ts:77-78` — Change `getTemplate` to return blob for file download
4. `desktop/src/app/(app)/settings/import/page.tsx:126-133` — Trigger browser download with blob

---

### TICKET-283: Import Error Export (Failed Rows Download) — DONE
**Backend:** DONE — `backend/src/routes/imports.ts:164-211` (GET /:id/errors/download) — Generates XLSX with row data + error details column. Uses SheetJS.
**Missing per spec (minor):**
- Returns 404 instead of 204 when no errors (line 173-175) — spec says 204 No Content
- No sheet name "Failed Rows" — uses default "Errors" (line 200)
- No red header styling — default style (spec says red background)
- No max 10,000 row limit — uses `findMany()` without limit (line 169-171)
- File name format uses `import_errors_{jobId}` — spec says `{import_type}_errors_{jobId}`
**Frontend:** MISSING — No "Download Error Report" button in any import UI page.
**API Client:** MISSING — No `downloadErrors(id)` method returning blob.
**Fix Required:**
1. `backend/src/routes/imports.ts:173` — Return 204 instead of 404 when no errors
2. `backend/src/routes/imports.ts:200` — Use sheet name "Failed Rows"
3. `backend/src/routes/imports.ts:169` — Add `limit: 10000`
4. `desktop/src/lib/api/imports.ts` — Add `downloadErrors(id)` method with blob response
5. `desktop/src/app/(app)/import/page.tsx` — Add "Download Error Report" button on completion step when error count > 0
6. `desktop/src/app/(app)/contacts/import/page.tsx:327-377` — Add error download button on execute step

---

### TICKET-284: Import Wizard UI — File Upload & Type Selection — PARTIAL
**Backend:** N/A (frontend ticket).
**Frontend:** PARTIAL — Three overlapping import pages exist:
1. `desktop/src/app/(app)/import/page.tsx` (502 lines) — Main 5-step wizard
2. `desktop/src/app/(app)/contacts/import/page.tsx` (383 lines) — Contacts-specific 4-step wizard
3. `desktop/src/app/(app)/settings/import/page.tsx` (345 lines) — Settings-based 3-step wizard
**Missing per spec:**
- Only 3 import types offered (contacts/leads/invoices) — spec requires 5 (add suppliers, rate_cards/travellers)
- No icon grid for type selection — uses dropdown select
- No drag-and-drop that actually triggers upload (import/page.tsx DnD sets file but doesn't upload)
- No file size validation (20MB limit)
- No "Download Template" link per type in main wizard
- Step indicator shows 5 steps — spec says 4 (Upload → Map → Preview → Import)
**API Client:** DONE — upload, execute methods exist.
**UX Issues:**
- `import/page.tsx:20-21` — entityType includes 'invoices' which is not a valid import type per spec
- 3 separate import pages create confusion — should consolidate to one
**Fix Required:**
1. `desktop/src/app/(app)/import/page.tsx:236-239` — Add suppliers/rate_cards/travellers options, remove invoices
2. `desktop/src/app/(app)/import/page.tsx` — Replace dropdown with icon card grid (5 options)
3. `desktop/src/app/(app)/import/page.tsx` — Add "Download Template" link per selected type
4. `desktop/src/app/(app)/import/page.tsx` — Add file size validation (20MB max)
5. `desktop/src/app/(app)/import/page.tsx` — Consolidate to 4 steps per spec

---

### TICKET-285: Visual Column Mapper UI — PARTIAL
**Backend:** N/A (frontend ticket).
**Frontend:** PARTIAL — Basic column mapping exists in:
- `import/page.tsx:285-318` — Shows static columns with dropdown
- `contacts/import/page.tsx:224-264` — Shows CSV headers with per-column dropdown + auto-mapping
**Missing per spec:**
- Main wizard uses hardcoded columns, not parsed file headers
- No sample value preview next to each mapping in main wizard
- No auto-mapping in main wizard (contacts page has it at line 80-93)
- No visual indicator (green check for mapped, red warning for unmapped required)
- No duplicate mapping prevention (same CRM field selectable in multiple dropdowns)
- No "Ignore Column" option in main wizard (contacts page has "__skip")
- No "Reset Mapping" button
- No required field validation — can proceed with unmapped required fields
**API Client:** N/A.
**UX Issues:**
- `import/page.tsx:296-312` — Uses static `fileColumns` array instead of dynamic headers
- `import/page.tsx:77` — Step 2 validation checks `Object.values(form.mappings).length === fileColumns.length` which requires ALL columns mapped
**Fix Required:**
1. `desktop/src/app/(app)/import/page.tsx:285-318` — Use dynamic headers from upload response, show sample values, add auto-mapping, green/red indicators
2. `desktop/src/app/(app)/import/page.tsx` — Add "Reset Mapping" button
3. `desktop/src/app/(app)/import/page.tsx` — Prevent duplicate CRM field selection

---

### TICKET-286: Import Preview & Duplicate Strategy Selection — PARTIAL
**Backend:** N/A (frontend ticket).
**Frontend:** PARTIAL — Preview table exists in both import pages. Duplicate strategy exists in `import/page.tsx:360-404`.
**Missing per spec:**
- Preview uses hardcoded `sampleData` not actual parsed data
- No per-row validation status (green check / red X)
- No invalid cell highlighting with red + tooltip
- No summary bar ("X of Y preview rows valid")
- No total row count display ("Ready to import X rows")
- No warning for >50% error rate
- Duplicate strategy in contacts page is only checkbox, not 3-option radio
**API Client:** DONE — execute accepts duplicateStrategy.
**UX Issues:**
- `import/page.tsx:342` — Iterates over `sampleData` not real preview data
- `contacts/import/page.tsx:305-314` — Only checkbox for "Skip duplicates"
**Fix Required:**
1. `desktop/src/app/(app)/import/page.tsx:320-358` — Use real preview data, add validation column, add summary bar
2. `desktop/src/app/(app)/import/page.tsx:360-404` — Wire duplicate strategy to API's `duplicateStrategy` enum
3. `desktop/src/app/(app)/contacts/import/page.tsx:305-314` — Replace checkbox with 3-option radio (skip/merge/create)

---

### TICKET-287: Import Progress & Log Screen — PARTIAL
**Backend:** DONE — `backend/src/routes/imports.ts:137-149` (GET /:id/progress) and `backend/src/routes/imports.ts:15-25` (GET / list).
**Frontend:** PARTIAL —
- `settings/import/page.tsx:288-341` has import history table with status badges ✓
- BUT no real-time progress polling during active import
- No "Download Error Report" action per job
- No "Delete" action per job
- No filter by import_type or status on history
- No sidebar navigation item for Import/Export
**Missing per spec:**
- No Step 4 execution screen with live progress bar + counters
- No "Cancel Import" button during active import
- No "Download Error Report" button (if errors > 0)
- No "Import Another File" / "View Imported Records" buttons on completion
- Sidebar missing "Import/Export" menu item
**API Client:** DONE — getProgress method exists.
**UX Issues:**
- `import/page.tsx:109-147` — Import fires, shows basic toast, then navigates to `/contacts` after 1.5s delay
- `settings/import/page.tsx:105-123` — Import fires, shows toast, resets form — no progress tracking
**Fix Required:**
1. `desktop/src/app/(app)/import/page.tsx:406-463` — Replace confirm step with live progress screen polling `getProgress()` every 2s
2. `desktop/src/app/(app)/import/page.tsx` — Add "Cancel Import", "Download Errors", "Import Another" buttons
3. `desktop/src/app/(app)/settings/import/page.tsx:288-341` — Add row actions: View Details, Download Errors, Delete
4. `desktop/src/app/(app)/settings/import/page.tsx` — Add FilterBar for import_type + status
5. `desktop/src/components/layout/sidebar.tsx:133-138` — Add `{ title: 'Import / Export', href: '/import', icon: Upload }` to Tools section

---

### TICKET-288: Contact & Lead Export (Filtered Excel/CSV) — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/exports.ts:11-68` — Contacts and leads export endpoints exist.
**Missing per spec:**
- Contacts export: no filter support (type, tags, search, city, country) — exports ALL contacts (line 16)
- Leads export: no filter support (status, assigned_to, date_from, date_to) — exports ALL leads (line 35)
- No CSV format option — only XLSX (spec requires xlsx and csv)
- No 50,000 row limit with 400 error
- No styled header row (bold, blue background) — raw json_to_sheet
- No auto-width columns
- No dated file names — uses static `contacts_export.xlsx`
**Frontend:** PARTIAL — `settings/export/page.tsx:79-103` has contacts/leads export with format selector (csv/xlsx).
**BUG:** `exportsApi.contacts()` uses POST (exports.ts API client line 40) but backend route is GET (backend exports.ts:12) — **HTTP method mismatch will cause 404/405**.
**Missing per spec:**
- No "Export" button on contacts list page toolbar
- No "Export" button on leads list page toolbar
- Export doesn't respect current list page filter state
**API Client:** BUG — contacts export uses POST, should be GET. Leads export correctly uses GET.
**Fix Required:**
1. `backend/src/routes/exports.ts:12-28` — Add query param filters (type, tags, search), 50K limit, CSV option, styled headers, dated filename
2. `backend/src/routes/exports.ts:30-68` — Add query param filters, CSV option, styled headers, dated filename
3. `desktop/src/lib/api/exports.ts:39-40` — Change `client.post` to `client.get` for contacts export
4. Add "Export" button to contacts list page and leads list page toolbars

---

### TICKET-289: Invoice Bulk PDF Download (Zip) — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/exports.ts:70-104` (POST /invoices/bulk-pdf) — Creates export job and queues it. `backend/src/queues/export-queue.ts:46-96` processes it.
**Missing per spec:**
- Export queue generates XLSX workbook of invoices, NOT individual PDFs in a ZIP (spec requires ZIP of PDFs)
- No actual PDF generation per invoice — just exports raw data as Excel
- No ZIP packaging — uses single XLSX file
- File naming: `bulk_invoices_{jobId}.xlsx` instead of ZIP with `Invoice_{number}_{name}.pdf` inside
- No 50 invoice limit validation on backend route
- No `GET /invoices/export/:exportId` status check endpoint (uses generic `/exports/jobs/:id` which works)
- No error handling per invoice (spec: failed PDF → `{number}_ERROR.txt` in zip)
**Frontend:** MISSING — No multi-select UI on invoices page, no bulk PDF download button.
**Desktop invoices page:** Only has single invoice client-side PDF via jsPDF (line 91-121) with minimal content.
**API Client:** DONE — `exportsApi.invoicesBulkPdf({ invoiceIds })` exists.
**UX Issues:**
- `desktop/src/app/(app)/invoices/page.tsx` — No checkboxes for row selection
- No "Download Selected as PDF" bulk action button
- No progress indicator during zip generation
**Fix Required:**
1. `backend/src/queues/export-queue.ts:46-96` — Replace XLSX generation with actual per-invoice PDF generation + ZIP packaging
2. `backend/src/routes/exports.ts:77-79` — Add `invoiceIds.length > 50` validation
3. `desktop/src/app/(app)/invoices/page.tsx` — Add multi-select checkbox column + bulk action toolbar
4. `desktop/src/app/(app)/invoices/page.tsx` — Add "Download as PDF" action that calls `exportsApi.invoicesBulkPdf()`

---

### TICKET-290: Full Tenant Data Export (GDPR Compliance) — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/exports.ts:106-134` (POST /full) and `backend/src/queues/export-queue.ts:98-158` — Exports 7 tables to multi-sheet XLSX.
**Missing per spec:**
- Generates XLSX not ZIP with individual CSV/JSON files per entity (spec requires ZIP with contacts.csv, leads.csv, documents.json, messages.json, settings.json, metadata.json)
- Missing exports: documents, messages (message_log), tenant_settings
- No rate limit (1 per tenant per 24h)
- No admin-only check on route
- No R2 presigned URL with 24h expiry — uses direct R2 key
- No notification sent when export ready
**Frontend:** PARTIAL — `settings/export/page.tsx:105-121` triggers full export, tracks jobs. But:
- Only 4 entity toggles (contacts, leads, invoices, tasks) — spec requires all entities
- No admin-only restriction
- No notification when export complete
**API Client:** DONE — `exportsApi.full()` and `getJobStatus()` exist.
**UX Issues:**
- `settings/export/page.tsx:227-232` — Missing suppliers, travellers, payments, documents, messages toggles
- No "Data & Privacy" section in settings — export page exists but at `/settings/export` not `/settings/data-privacy`
**Fix Required:**
1. `backend/src/queues/export-queue.ts:98-158` — Generate ZIP with individual CSV/JSON files per spec
2. `backend/src/queues/export-queue.ts` — Add documents, messages, settings exports
3. `backend/src/routes/exports.ts:106-134` — Add admin-only middleware, rate limiting (1/24h)
4. `backend/src/queues/export-queue.ts` — Send notification when complete
5. `desktop/src/app/(app)/settings/export/page.tsx:227-232` — Add all entity type toggles
6. R2 presigned URL with 24h TTL for download link

---

## Critical Bugs Found

### BUG-1: HTTP Method Mismatch on Contacts Export
- **File:** `desktop/src/lib/api/exports.ts:40`
- **Issue:** `exportsApi.contacts()` uses `client.post()` but backend route at `backend/src/routes/exports.ts:12` is `GET /exports/contacts`
- **Impact:** Contacts export will fail with 404/405
- **Fix:** Change `client.post` to `client.get` in exports API client

### BUG-2: Import Queue Uses MASTER_DB Instead of Tenant DB
- **File:** `backend/src/queues/import-queue.ts:28`
- **Issue:** `const db = drizzle(env.MASTER_DB, { schema })` — imports data into master DB, not tenant DB
- **Impact:** All imported data goes to wrong database; tenant isolation broken
- **Fix:** Resolve tenant DB from import job's tenant context or store tenantId on import_jobs table

### BUG-3: Export Queue Uses MASTER_DB Instead of Tenant DB
- **File:** `backend/src/queues/export-queue.ts:29`
- **Issue:** `const db = drizzle(env.MASTER_DB, { schema })` — exports data from master DB, not tenant DB
- **Impact:** Full export and bulk invoice export read wrong database
- **Fix:** Same as BUG-2 — resolve tenant DB

### BUG-4: Rate Cards Import Uses Raw Supplier Name as ID
- **File:** `backend/src/services/imports/row-inserter.ts:123`
- **Issue:** `supplierId: validData.supplierName` — inserts supplier name string as foreign key ID
- **Impact:** Rate card insert will fail with FK constraint violation
- **Fix:** Resolve supplier by company_name → get supplier.id

### BUG-5: Import Wizard Hardcoded Sample Data
- **File:** `desktop/src/app/(app)/import/page.tsx:39-47`
- **Issue:** Column mapping and preview use hardcoded `sampleData` array, not parsed file data
- **Impact:** Column mapping is decorative — user maps fake columns, not their actual file headers
- **Fix:** Populate from upload API response (headers + previewData)
