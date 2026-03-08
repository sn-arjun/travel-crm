# Milestone 12 Audit Report — Supplier Management
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m12.md
Total Tickets: 17 (TICKET-194 through TICKET-210)

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 4     |
| PARTIAL | 8     |
| MISSING | 5     |
| BUG     | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `SENDGRID_API_KEY` | Backend (TICKET-205: supplier email) | Required for email | Email sending fails; currently no email endpoint implemented — N/A |
| `R2_BUCKET` | Backend (TICKET-204: document upload) | Required for docs | Document upload/download fails; currently no document endpoints — N/A |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Desktop address autocomplete | Optional | Should fall back to plain text inputs; currently not used (plain inputs only) |
| `NEXT_PUBLIC_API_BASE_URL` | `desktop/src/lib/api/config.ts` | Required | Falls back to `http://localhost:8787/api/v1` |

## UX Anti-Patterns (must fix)

| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `suppliers/page.tsx` | No FilterBar component | Replace manual search+Select with `FilterBar` from `@/components/domain/filter-bar.tsx` for consistency |
| `suppliers/page.tsx` | No status filter | Spec requires active/inactive filter; only category filter exists (line 59-71) |
| `suppliers/page.tsx` | No preferred filter | Spec requires is_preferred filter chip; missing entirely |
| `suppliers/page.tsx` | No sort controls | Spec requires sort by company_name, rating, created_at; no sort UI |
| `suppliers/page.tsx` | No rating column | Spec requires Rating (stars) column; missing from table |
| `suppliers/page.tsx` | No preferred badge in list | Spec requires preferred star icon per row; missing |
| `suppliers/page.tsx` | No empty state component | When zero suppliers, shows empty table body instead of proper EmptyState |
| `suppliers/page.tsx:120` | Delete action is placeholder | `onClick={(e) => e.stopPropagation()` — no actual delete call |
| `suppliers/page.tsx` | Category enum mismatch | List has `activity`, `tour_operator`, `resort`, `ota` (line 66-69) but spec/schema has `activity_provider`, `guide`, `visa_agent`, `insurance` |
| `suppliers/new/page.tsx:128` | Phone uses plain Input | Must use `PhoneInput` from `@/components/ui/phone-input.tsx` with country code picker |
| `suppliers/new/page.tsx:151-171` | Address uses plain Inputs | Must use `AddressAutocomplete` from `@/components/ui/address-autocomplete.tsx` (with env fallback) |
| `suppliers/new/page.tsx` | Category enum mismatch | Form has `visa`, `tour_operator`, `resort`, `ota` (line 16-25) but spec/schema has `activity_provider`, `guide`, `visa_agent`, `insurance` |
| `suppliers/new/page.tsx:57-68` | Fields not submitted | `street`, `pincode`, `bankName`, `accountNumber`, `ifscCode` are collected in form but NOT sent to API |
| `suppliers/new/page.tsx` | Missing fields from spec | No `postalCode`, `gstNumber`, `taxId` sent to API (lines 57-68 only send companyName, category, contactPerson, phone, email, website, city, state, country, notes) |
| `suppliers/new/page.tsx` | No status toggle | Spec requires Active/Inactive switch; missing |
| `suppliers/new/page.tsx` | No isPreferred toggle | Spec requires preferred checkbox; missing |
| `suppliers/[id]/page.tsx` | Missing Documents tab | Spec (TICKET-199) requires 4 tabs: Overview, Rate Cards, Payments, Documents; only has Overview, Rate Cards, Payments, Ledger |
| `suppliers/[id]/page.tsx:78` | Ledger balance field mismatch | Code uses `entry.balance` but backend returns `runningBalance` (backend line 326); will show undefined |
| `suppliers/[id]/page.tsx:129,134` | Uses `sup.name` instead of `sup.company_name` | Backend returns `company_name` (snake_case); detail page reads `.name` which will be undefined |
| `suppliers/[id]/page.tsx` | No "Email Supplier" action | Spec requires email quick action in header; missing (TICKET-205) |
| `suppliers/[id]/page.tsx` | No "Record Payment" button | Payments tab has no way to record new payment; just displays list |
| `suppliers/[id]/page.tsx` | No "Add Rate Card" button | Rate Cards tab has no way to create new rate card; just displays list |
| `suppliers/[id]/page.tsx` | No "Upload Document" button | Documents tab doesn't exist at all |
| `suppliers/[id]/page.tsx` | No rating widget | Spec requires interactive star rating (1-5) on detail page; only shows static number |
| `suppliers/[id]/page.tsx` | No communication history | Spec requires sent emails/messages list; missing entirely |
| `suppliers/[id]/edit/page.tsx` | Edit form incomplete | Missing: city, state, country, postalCode, gstNumber, taxId, status toggle — cannot edit these fields |
| `suppliers/[id]/edit/page.tsx:38` | Uses `s.name` | Backend returns `company_name` but edit pre-fills from `.name`; will be empty |
| `suppliers/[id]/edit/page.tsx:24` | UpdateSupplierRequest missing fields | Type (suppliers.ts:23-34) lacks city, state, country, postalCode, gstNumber, taxId, status |
| `suppliers/compare/page.tsx` | Compare uses POST but backend is GET | API client line 129-130 uses `client.post()` but backend route is `GET /compare-rates` (backend line 99); will 404 or fail |
| `suppliers/compare/page.tsx` | Request params mismatch | Sends `{ category, serviceType }` but backend expects `{ service_type, destination, season, date }` via query string |
| `suppliers/compare/page.tsx` | No destination field | Spec requires destination text field; page only has category + service type |
| `suppliers/compare/page.tsx` | No season/date filters | Spec requires season dropdown and date picker; missing |
| Sidebar (sidebar.tsx:88) | No Rate Comparison sub-item | Spec requires "Rate Comparison" sub-item under Suppliers; only has single "Suppliers" link |

## UX Improvements (nice to have)

| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `suppliers/page.tsx` | Simple list only | Add category summary chips at top showing count per category (TICKET-197) | HIGH |
| `suppliers/page.tsx` | No import/export | Add Import/Export buttons in header (TICKET-207) | HIGH |
| `suppliers/page.tsx` | Basic dropdown actions | Add inline hover icons (Eye, Edit, Star, Trash2) like other list pages | MEDIUM |
| `suppliers/page.tsx` | No detail drawer | Add click-to-open slide-over panel for quick supplier preview | MEDIUM |
| `suppliers/page.tsx` | No keyboard shortcuts | Add Ctrl+N for new supplier, / for search focus | LOW |
| `suppliers/new/page.tsx` | Single column sections | Use 2-column layout on desktop for Company Info and Contact sections | MEDIUM |
| `suppliers/new/page.tsx` | No dirty form check | Add unsaved changes confirmation on cancel/navigate away | LOW |
| `suppliers/[id]/page.tsx` | Tab badges show count only | Add loading skeleton per tab while data loads | MEDIUM |
| `suppliers/[id]/page.tsx` | No bulk operations | Add "Select All" and bulk delete/export in rate cards & payments tabs | LOW |
| `suppliers/[id]/page.tsx` | No reconciliation tools | Add reconciliation checkboxes and "Reconcile Selected" button in ledger tab | HIGH |
| `suppliers/[id]/page.tsx` | No ledger export | Add "Export to PDF/Excel" button for ledger tab | MEDIUM |
| `suppliers/compare/page.tsx` | No supplier click-through | Add click on supplier name to navigate to supplier detail | MEDIUM |
| `suppliers/compare/page.tsx` | No "Use This Rate" action | Spec requires action to copy rate or pass to itinerary builder | LOW |
| Dashboard | No supplier widgets | Add supplier summary card, category chart, expiring contracts alert (TICKET-209) | HIGH |

## Ticket Details

---

### TICKET-194: Supplier Drizzle Schema & Rate Card Extension — DONE
**Backend:** DONE — `suppliers` table at `backend/src/db/tenant-schema.ts:686-714` with all required fields (company_name, contact_person, email, phone, address, city, state, country, postal_code, gst_number, tax_id, category, website, notes, rating, is_preferred, status, created_by, created_at, updated_at, is_deleted). `supplier_documents` table at lines 716-731 with all fields. `rate_cards` table has `supplier_id` at line 317.
**Schema Issues:**
1. Missing `suppliers(company_name)` index — spec requires it but only has category, city, status, is_deleted indexes
2. Missing FTS5 virtual table `suppliers_fts` — spec requires it for full-text search
3. Missing `supplier_ratings` table — spec (TICKET-210) requires: id, supplier_id, rating, comment, rated_by, rated_at
**Frontend:** N/A (backend-only ticket)
**API Client:** N/A

---

### TICKET-195: Supplier CRUD API Endpoints — PARTIAL
**Backend:** PARTIAL — `backend/src/routes/suppliers.ts` (335 lines)
- GET / (list): EXISTS at line 30 — has pagination, category/status/is_preferred/search filters, sort
- POST / (create): EXISTS at line 143 — Zod validation, all fields
- GET /:id (detail): EXISTS at line 121 — includes rate_cards count and total_payments stats
- PUT /:id (update): EXISTS at line 170 — dynamic camelCase→snake_case mapping
- DELETE /:id (soft delete): EXISTS at line 198
- POST /:id/toggle-preferred: EXISTS at line 206
- POST /:id/rate: EXISTS at line 218
- GET /categories/summary: EXISTS at line 85

**BUG — is_active vs is_deleted mismatch:**
Routes use `is_active = 1` (lines 35, 56, 88, 108, 125, 201, 237) but schema defines `is_deleted` column with no `is_active` column. This will cause SQL errors at runtime.

**Missing endpoints from spec:**
- GET /suppliers/search?q= (FTS5 search) — MISSING
- GET /suppliers/:id/ratings (individual ratings list) — MISSING

**Route Mounting:** DONE — `backend/src/index.ts` mounts at `/api/v1/suppliers`
**Validators:** DONE — `backend/src/validators/supplier.ts` has createSupplierSchema, updateSupplierSchema, supplierListSchema, rateSupplierSchema
**Fix Required:**
1. `backend/src/routes/suppliers.ts:35,56,88,108,125,201,237` — Replace `is_active = 1` with `is_deleted = 0` and `is_active = 0` with `is_deleted = 1`
2. Add FTS5 search endpoint: GET /suppliers/search?q=
3. Add supplier_ratings table to schema and GET /:id/ratings endpoint

---

### TICKET-196: Supplier Flutter Model, Repository & Providers — N/A (Flutter)
**Status:** N/A — This is a Flutter-only ticket. Desktop uses TypeScript API client instead.
**Desktop Equivalent:** `desktop/src/lib/api/suppliers.ts` — PARTIAL (12 of 31 required methods implemented)

---

### TICKET-197: Supplier List Screen — PARTIAL
**Frontend:** PARTIAL — `desktop/src/app/(app)/suppliers/page.tsx` (140 lines)
- Infinite scroll: DONE (useInfiniteScroll at line 37-40)
- Search: DONE (line 57)
- Category filter: PARTIAL — wrong enum values (has `activity`, `tour_operator`, `resort`, `ota` instead of `activity_provider`, `guide`, `visa_agent`, `insurance`)
- Status filter: MISSING
- Preferred filter: MISSING
- Sort controls: MISSING
- Rating column: MISSING
- Preferred badge: MISSING
- Category summary chips at top: MISSING
- Status badges (green/gray): MISSING
- Row tap → detail: DONE (line 102)
- Quick actions: PARTIAL — View/Edit exist; Delete is placeholder (line 120); Toggle Preferred missing
- FAB "Add Supplier": DONE (line 49-51)
- FilterBar component: NOT USED (manual search+Select instead)
- Empty state: MISSING (empty table body only)
**Fix Required:**
1. `page.tsx:62-69` — Fix category enum values to match schema
2. `page.tsx:59-71` — Add status filter, preferred filter, sort controls
3. `page.tsx:54-72` — Replace with FilterBar component
4. `page.tsx:100-127` — Add rating column, preferred badge, status badge
5. `page.tsx:120` — Implement delete action with API call
6. Add category summary chips section above table

---

### TICKET-198: Supplier Creation & Edit Form — PARTIAL
**Frontend (Create):** PARTIAL — `desktop/src/app/(app)/suppliers/new/page.tsx` (225 lines)
- Company Name: DONE (line 107)
- Category dropdown: DONE but wrong enum (line 111-118; has `visa`, `tour_operator`, `resort`, `ota` instead of spec values)
- Contact Person: DONE (line 124)
- Email: DONE (line 134)
- Phone: DONE but plain Input, not PhoneInput (line 128)
- Address fields: DONE but plain Input, not AddressAutocomplete (lines 151-171)
- GST Number: Collected in form (line 202) but NOT sent to API (line 57-68)
- Tax ID: MISSING from form entirely
- Status toggle: MISSING
- Preferred toggle: MISSING
- Form validation: Only company_name required check (line 53-56); no email/phone/GST format validation
- Banking fields (bankName, accountNumber, ifscCode): In form but NOT in spec schema and NOT sent to API — dead fields

**Frontend (Edit):** PARTIAL — `desktop/src/app/(app)/suppliers/[id]/edit/page.tsx` (219 lines)
- Pre-fill from existing data: DONE (lines 34-49)
- Missing fields vs create form: city, state, country, postalCode, gstNumber, taxId, status, street, pincode, bankName, accountNumber, ifscCode
- Category enum: Wrong values (same issue, line 127-134)
- Uses `.name` instead of `.company_name` for pre-fill (line 38)

**Fix Required:**
1. `new/page.tsx:16-25` — Fix category enum to `activity_provider`, `guide`, `visa_agent`, `insurance`
2. `new/page.tsx:57-68` — Include gstNumber, taxId, postalCode in API submission
3. `new/page.tsx:128` — Replace with PhoneInput component
4. `new/page.tsx:151-171` — Replace with AddressAutocomplete (with env fallback)
5. `new/page.tsx` — Add status toggle and isPreferred checkbox
6. `new/page.tsx` — Add taxId field, remove non-spec banking fields
7. `[id]/edit/page.tsx` — Add all missing fields (city, state, country, postalCode, gstNumber, taxId, status)
8. `[id]/edit/page.tsx:38` — Fix to read `company_name` or `companyName` from response
9. `suppliers.ts:23-34` — Add missing fields to UpdateSupplierRequest type

---

### TICKET-199: Supplier Profile / Detail Screen (Tabbed) — PARTIAL
**Frontend:** PARTIAL — `desktop/src/app/(app)/suppliers/[id]/page.tsx` (434 lines)
- Header with company name, category badge: DONE (line 133-136)
- Preferred badge: DONE (line 137-141)
- Email + phone in subtitle: DONE (line 143-146)
- Quick actions (Edit, Delete, Prefer): DONE (lines 150-159)
- Stats row (Total Payments, Outstanding, Rating, Rate Cards): DONE (lines 164-197)
- **Overview tab:** DONE — contact info, business details, notes, timeline (lines 212-286)
- **Rate Cards tab:** DONE — lists rate cards (lines 289-323)
- **Payments tab:** DONE — lists payments (lines 326-362)
- **Ledger tab:** DONE — but field mismatch (lines 365-407)
- **Documents tab:** MISSING — spec requires it as 4th tab (TICKET-199 acceptance criteria)
- Tab badges: PARTIAL — rate cards and payments show counts; documents tab missing
- Loading skeletons per tab: MISSING (only overall loading state)

**BUG — Field name mismatches:**
1. `line 129,134` — Uses `sup.name` but backend returns `company_name`
2. `line 78` — Uses `entry.balance` but backend returns `runningBalance`
3. `line 393` — Uses `entry.debit` but backend returns `debitAmount`
4. `line 396` — Uses `entry.credit` but backend returns `creditAmount`

**Missing features:**
- "Email Supplier" button (TICKET-205)
- "Record Payment" button in Payments tab
- "Add Rate Card" button in Rate Cards tab
- Interactive star rating widget (TICKET-210)
- Communication history section

**Fix Required:**
1. `[id]/page.tsx:129,134` — Use `sup.company_name || sup.name` for backward compatibility
2. `[id]/page.tsx:78,392-399` — Fix ledger field names to match backend response (`runningBalance`, `debitAmount`, `creditAmount`)
3. Add Documents tab with upload/list/download/delete functionality
4. Add "Record Payment" button to Payments tab
5. Add "Add Rate Card" button to Rate Cards tab
6. Add "Email Supplier" action button

---

### TICKET-200: Supplier Rate Cards API & UI — PARTIAL
**Backend:**
- GET /:id/rate-cards: DONE (line 231-249)
- POST /:id/rate-cards: DONE (line 251-270)
- PUT /rate-cards/:id: MISSING
- DELETE /rate-cards/:id: MISSING
- POST /:id/rate-cards/bulk: MISSING

**Frontend:** PARTIAL — Rate cards displayed in detail page tab (lines 289-323) but read-only. No create/edit/delete UI for rate cards from supplier context.
**API Client:** PARTIAL — `getRateCards` exists (suppliers.ts:111-112) but no `createRateCard`, `updateRateCard`, `deleteRateCard`, `bulkCreateRateCards`
**Fix Required:**
1. Backend: Add PUT /rate-cards/:id, DELETE /rate-cards/:id, POST /:id/rate-cards/bulk
2. API client: Add createRateCard, updateRateCard, deleteRateCard, bulkCreateRateCards methods
3. Frontend: Add "Add Rate Card" button + form dialog, edit/delete actions per row

---

### TICKET-201: Rate Comparison Across Suppliers — PARTIAL
**Backend:** DONE — `GET /compare-rates` at line 99-118 with service_type, destination, season, date filters
**Frontend:** PARTIAL — `desktop/src/app/(app)/suppliers/compare/page.tsx` (202 lines)
- Category dropdown: DONE (line 92-107)
- Service type dropdown: DONE (line 111-122)
- Results table: DONE with ranking, Best Rate badge, savings percentage
- **BUG:** Frontend sends POST but backend expects GET (API client line 129-130 vs backend line 99)
- **BUG:** Frontend sends `{ category, serviceType }` but backend expects query params `service_type, destination` (TICKET-201 spec)
- Missing: destination text field, season dropdown, date picker per spec
- No click-through to supplier detail from results
**API Client:** EXISTS (suppliers.ts:129-130) but wrong HTTP method and params
**Fix Required:**
1. `suppliers.ts:129-130` — Change from POST to GET, fix params to `{ service_type, destination, season?, date? }`
2. `compare/page.tsx` — Add destination text field, season dropdown, date picker
3. `compare/page.tsx` — Fix request to send correct params
4. `config.ts:121` — Verify compare-rates endpoint is correct
5. Add click on supplier name → navigate to detail

---

### TICKET-202: Supplier Outgoing Payments API & UI — PARTIAL
**Backend:**
- POST /:id/payments: DONE (line 276-293)
- GET /:id/payments: DONE (line 295-304)
- GET /:id/ledger: DONE (line 306-333)
- GET /suppliers/payments/summary: MISSING
- DELETE /:id/payments/:paymentId: MISSING

**Frontend:** PARTIAL — Payments displayed in detail page tab (lines 326-362) but read-only. No "Record Payment" button or form.
**API Client:**
- getPayments: EXISTS (suppliers.ts:114-115)
- getLedger: EXISTS (suppliers.ts:117-118)
- recordPayment: MISSING
- deletePayment: MISSING
- getPaymentsSummary: MISSING

**Fix Required:**
1. Backend: Add DELETE /:id/payments/:paymentId, GET /suppliers/payments/summary
2. API client: Add recordPayment, deletePayment, getPaymentsSummary methods
3. API config: Add payments recording endpoint
4. Frontend: Add "Record Payment" dialog with amount, method, reference, date, notes, invoice ref

---

### TICKET-203: Supplier Ledger & Payment Reconciliation — PARTIAL
**Backend:** PARTIAL — Ledger endpoint exists (line 306-333) but:
- POST /:id/reconcile: MISSING
- GET /suppliers/reconciliation/pending: MISSING
- Ledger entries lack `is_reconciled`, `reconciled_at` fields in response (only has hardcoded `isReconciled: 0`)

**Frontend:** PARTIAL — Ledger tab exists (detail page lines 365-407) but:
- No reconciliation checkboxes
- No "Reconcile Selected" button
- No reconciliation status filter (All/Reconciled/Unreconciled)
- No export to PDF/Excel
- Field name mismatch (see TICKET-199 bugs)

**API Client:** MISSING — no reconcile or pending reconciliation methods
**Fix Required:**
1. Backend: Add POST /:id/reconcile, GET /suppliers/reconciliation/pending
2. API client: Add reconcile, getPendingReconciliation methods
3. Frontend: Add reconciliation checkbox per ledger row, "Reconcile Selected" button, status filters

---

### TICKET-204: Supplier Document Upload & Management — MISSING
**Backend:** MISSING — No document endpoints in suppliers.ts (no upload, list, download, delete)
**Frontend:** MISSING — No Documents tab in detail page; no upload dialog
**API Client:** MISSING — No document-related methods
**Schema:** DONE — `supplier_documents` table exists (tenant-schema.ts:716-731)
**Fix Required:**
1. Backend: Add POST /:id/documents (upload to R2), GET /:id/documents, GET /:id/documents/:docId/download, DELETE /:id/documents/:docId
2. API client: Add uploadDocument, getDocuments, downloadDocument, deleteDocument methods
3. Frontend: Add Documents tab to detail page, upload dialog, document list with type badges, expiry warnings, download/delete actions

---

### TICKET-205: Supplier Communication (Email from CRM) — MISSING
**Backend:** MISSING — No email endpoint, no communication history endpoint
**Frontend:** MISSING — No email compose dialog, no communication history tab/section
**API Client:** MISSING — No sendEmail, getCommunications methods
**Fix Required:**
1. Backend: Add POST /:id/email (SendGrid integration), GET /:id/communications (from message_log)
2. API client: Add sendEmail, getCommunications methods
3. Frontend: Add "Email Supplier" button → compose dialog using `SendMessageDialog` component, communication history section
4. Email templates for common supplier communications

---

### TICKET-206: Supplier Search (FTS5) — MISSING
**Backend:** MISSING — No FTS5 virtual table, no triggers, no /search endpoint. Current search uses LIKE (line 43-45).
**Frontend:** Search exists using LIKE on list page (line 57) but no FTS5 features (prefix matching, BM25 ranking, snippets)
**Fix Required:**
1. Backend migration: Create `suppliers_fts` FTS5 virtual table and INSERT/UPDATE/DELETE triggers
2. Backend: Add GET /suppliers/search?q= endpoint with FTS5 MATCH, snippet(), bm25() ordering
3. Frontend: Debounced search input (300ms), highlighted results
4. Global search integration

---

### TICKET-207: Supplier Import/Export (Excel) — MISSING
**Backend:** MISSING — No import, export, or template endpoints
**Frontend:** MISSING — No Import/Export buttons on list page
**API Client:** MISSING — No importSuppliers, exportSuppliers, getImportTemplate methods
**Fix Required:**
1. Backend: Add POST /suppliers/import, GET /suppliers/export, GET /suppliers/import/template (XLSX via library)
2. API client: Add import/export/template methods
3. Frontend: Add "Import" and "Export" buttons to list page header, import dialog with file picker, results display

---

### TICKET-208: Supplier Navigation & GoRouter Routes — DONE (Desktop equivalent)
**Frontend:** DONE — Desktop uses Next.js App Router (not GoRouter)
- `/suppliers` → page.tsx (list): DONE
- `/suppliers/new` → new/page.tsx: DONE
- `/suppliers/[id]` → [id]/page.tsx (detail): DONE
- `/suppliers/[id]/edit` → [id]/edit/page.tsx: DONE
- `/suppliers/compare` → compare/page.tsx: DONE (note: URL is `/compare` not `/compare-rates`)
- `/suppliers/[id]/ledger` → embedded as tab in [id]/page.tsx (not separate page)

**Sidebar:** DONE — "Suppliers" under Operations section (sidebar.tsx:88)
**Missing:** Rate Comparison sub-item in sidebar
**Fix Required:**
1. `sidebar.tsx:88` — Add sub-item for Rate Comparison (`/suppliers/compare`)

---

### TICKET-209: Supplier Dashboard Widget & Category Summary — MISSING
**Backend:** MISSING — No GET /api/v1/reports/suppliers/summary endpoint
**Frontend:** MISSING — No supplier widgets on dashboard
**Fix Required:**
1. Backend: Add reports/suppliers/summary endpoint with total_suppliers, active_count, by_category, total_outstanding, expiring_contracts, top_rated
2. Frontend: Add supplier summary card, category chart, expiring contracts alert, top suppliers mini-list to dashboard

---

### TICKET-210: Supplier Rating & Preferred Supplier System — PARTIAL
**Backend:** PARTIAL
- POST /:id/rate: EXISTS (line 218-225) but overwrites rating directly instead of storing individual ratings
- POST /:id/toggle-preferred: EXISTS (line 206-215)
- GET /suppliers?is_preferred=true: EXISTS (list filter at line 40)
- `supplier_ratings` table: MISSING from schema
- GET /:id/ratings: MISSING
- No duplicate rating check (one per user per day)

**Frontend:** PARTIAL
- Preferred badge on detail: DONE (line 137-141)
- Toggle preferred button: DONE (line 150-153)
- Rating display (static number): DONE (line 186, 257-263)
- Interactive star rating widget: MISSING (no tap-to-rate, no rating dialog)
- Rating history list: MISSING
- Preferred filter on list: MISSING

**Fix Required:**
1. Schema: Add `supplier_ratings` table (id, supplier_id, rating, comment, rated_by, rated_at)
2. Backend: Modify POST /:id/rate to insert into supplier_ratings and compute running average
3. Backend: Add GET /:id/ratings endpoint
4. Frontend: Add interactive star rating widget with dialog
5. Frontend: Add rating history section in overview tab
6. Frontend: Add "Preferred" filter chip on list page

---

## Critical Bugs Summary

### BUG-1: `is_active` Column Does Not Exist (HIGH SEVERITY)
**Files:** `backend/src/routes/suppliers.ts` lines 35, 56, 88, 108, 125, 201, 237
**Issue:** All queries reference `is_active` column but schema defines `is_deleted`. There is no `is_active` column in the `suppliers` table (schema line 708: `isDeleted: integer('is_deleted').default(0)`).
**Impact:** ALL supplier API calls will fail with SQL error at runtime.
**Fix:** Replace `is_active = 1` → `is_deleted = 0` and `is_active = 0` → `is_deleted = 1` across all queries.

### BUG-2: Ledger Response Field Name Mismatch (MEDIUM SEVERITY)
**Files:** Backend `suppliers.ts:320-328` returns `{ debitAmount, creditAmount, runningBalance }`. Frontend `[id]/page.tsx:392-399` reads `{ debit, credit, balance }`.
**Impact:** Ledger tab shows undefined/NaN values for all financial columns.
**Fix:** Either change backend to return `{ debit, credit, balance }` or update frontend to read `{ debitAmount, creditAmount, runningBalance }`.

### BUG-3: Compare Rates HTTP Method Mismatch (MEDIUM SEVERITY)
**Files:** API client `suppliers.ts:129-130` uses `client.post()`. Backend `suppliers.ts:99` defines `GET /compare-rates`.
**Impact:** Rate comparison always fails (POST to GET-only endpoint).
**Fix:** Change API client to use `client.get()` with query params instead of POST body.

---

## Implementation Coverage by Layer

| Layer | Implemented | Total Required | Coverage |
|-------|------------|----------------|----------|
| Schema tables | 2/3 | suppliers, supplier_documents, ~~supplier_ratings~~ | 67% |
| Backend endpoints | 14/31 | See TICKET-195 missing list | 45% |
| Desktop pages | 5/6 | Missing: dedicated ledger (embedded as tab) | 83% |
| API client methods | 12/31 | See API client audit | 39% |
| API config endpoints | 11/24 | Missing document, email, import/export, reconciliation endpoints | 46% |

## Files Analyzed
- `backend/src/db/tenant-schema.ts` (lines 686-731)
- `backend/src/routes/suppliers.ts` (335 lines)
- `backend/src/validators/supplier.ts`
- `backend/src/validators/supplier-payment.ts`
- `backend/src/validators/rate-card.ts`
- `backend/src/index.ts` (route mounting)
- `desktop/src/app/(app)/suppliers/page.tsx` (140 lines)
- `desktop/src/app/(app)/suppliers/new/page.tsx` (225 lines)
- `desktop/src/app/(app)/suppliers/[id]/page.tsx` (434 lines)
- `desktop/src/app/(app)/suppliers/[id]/edit/page.tsx` (219 lines)
- `desktop/src/app/(app)/suppliers/compare/page.tsx` (202 lines)
- `desktop/src/lib/api/suppliers.ts` (132 lines)
- `desktop/src/lib/api/config.ts` (supplier endpoints lines 111-122)
- `desktop/src/components/layout/sidebar.tsx` (line 88)
