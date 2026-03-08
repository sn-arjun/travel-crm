# Milestone 7 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m7.md

## Summary
| Status | Count |
|--------|-------|
| DONE   | 14    |
| PARTIAL| 8     |
| MISSING| 2     |
| BUG    | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `NEXT_PUBLIC_API_URL` | `desktop/src/lib/api/config.ts:1` | Yes | Falls back to `http://localhost:8787/api/v1` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `desktop/src/components/ui/address-autocomplete.tsx:96` | No | Disabled (not used by M7 directly) |
| `SENDGRID_API_KEY` | `backend/src/routes/invoices.ts` (send endpoint) | No | Send via email fails gracefully with error toast |
| `TWILIO_*` | `backend/src/routes/invoices.ts` (send endpoint) | No | Send via WhatsApp fails gracefully with error toast |
| `EMAIL_QUEUE` | `backend/src/cron/auto-reminders.ts` | No | Auto-reminders skip email channel |
| `SMS_QUEUE` | `backend/src/cron/auto-reminders.ts` | No | Auto-reminders skip SMS channel |
| `PUSH_NOTIFICATION_QUEUE` | `backend/src/cron/auto-reminders.ts` | No | Auto-reminders skip push channel |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `invoices/page.tsx` | No FilterBar | Replace manual `<Select>` with `FilterBar` component from `@/components/domain/filter-bar.tsx` |
| `invoices/page.tsx` | No useInfiniteScroll | Replace `limit: 100` with `useInfiniteScroll` from `@/hooks/use-infinite-scroll.ts` |
| `invoices/page.tsx` | No detail drawer | Add slide-over drawer for quick invoice preview |
| `invoices/page.tsx` | No empty state | Show empty state component when `filtered.length === 0` |
| `invoices/page.tsx:229` | Placeholder "Download PDF" action | `DropdownMenuItem` has no `onClick` handler — does nothing |
| `invoices/new/page.tsx:188` | No searchable Combobox for Contact | Replace `<Select>` with searchable `Combobox` that calls contacts API with search param |
| `invoices/new/page.tsx:199` | Raw text input for Lead Reference | Replace `<Input>` with searchable `Combobox` for leads |
| `invoices/new/page.tsx:252` | Raw text input for HSN/SAC code | Replace `<Input>` with searchable `Combobox` calling HSN codes API |
| `invoices/new/page.tsx:57` | Loads ALL contacts (limit:100) | Use search-on-type with API call, not full preload |
| `invoices/[id]/page.tsx:399-416` | Custom send dialog instead of SendMessageDialog | Replace custom dialog with `SendMessageDialog` from `@/components/communication/send-message-dialog.tsx` |
| `invoices/[id]/page.tsx:267-288` | Direct `communicationsApi.send()` for reminder | Should use `SendMessageDialog` for consistent UX |
| `invoices/[id]/page.tsx:600-621` | Line items missing HSN/SAC code display | Add HSN code column to line items display |
| `invoices/[id]/page.tsx:623-656` | No GST/Tax breakdown | Shows only total — missing CGST/SGST/IGST breakdown |
| `invoices/[id]/edit/page.tsx:64` | No searchable Combobox for Contact | Same issue as new page — uses `<Select>` |
| `payments/page.tsx` | No FilterBar | Replace manual `<Select>` with `FilterBar` component |
| `payments/page.tsx` | No useInfiniteScroll | Replace `limit: 100` with `useInfiniteScroll` |
| `payments/page.tsx` | No empty state | Show empty state component when list is empty |
| `payments/page.tsx:69` | Hardcoded `overdueCount = 0` | Should calculate from invoice data or call summary API |
| `payments/page.tsx:188` | Placeholder "View details" action | `DropdownMenuItem` has no `onClick` — does nothing |
| `payments/page.tsx:189` | Placeholder "Delete" action | `DropdownMenuItem` has no `onClick` — does nothing |
| `payments/new/page.tsx:230-259` | Custom search dropdown instead of Combobox | Replace with reusable `Combobox` component for lead search |
| `payments/new/page.tsx:286-318` | Custom search dropdown instead of Combobox | Replace with reusable `Combobox` component for invoice search |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `invoices/page.tsx` | Status filter only | Add date range, type, contact filters via FilterBar | High |
| `invoices/page.tsx` | No sort controls | Add clickable column headers for sorting | Medium |
| `invoices/page.tsx` | No bulk actions | Add checkbox selection + bulk send/delete/export | Medium |
| `invoices/page.tsx:117-151` | Stats calculated client-side | Use `invoicesApi.summary()` for server-side stats | High |
| `invoices/new/page.tsx` | No auto-populate from URL params | Read `?leadId=&contactId=` and prefill form | High |
| `invoices/new/page.tsx` | No invoice type selector | Missing Tax Invoice / Proforma radio buttons per spec | Medium |
| `invoices/new/page.tsx` | No bank details section | Should auto-load from tenant settings | Medium |
| `invoices/new/page.tsx` | No preview before send | Add preview dialog showing formatted invoice | Low |
| `invoices/[id]/page.tsx` | jsPDF for PDF generation | Basic PDF — missing branded header, QR code, GST breakdown, amount in words | High |
| `invoices/[id]/page.tsx` | No credit/debit notes list | Detail page cannot see existing CN/DN linked to invoice | Medium |
| `invoices/[id]/page.tsx` | No payment reminder history | Should show list of sent reminders | Low |
| `payments/page.tsx` | No type filter (incoming/outgoing/advance) | Add payment type filter | High |
| `payments/page.tsx` | No date range filter | Add date range filter | Medium |
| `payments/new/page.tsx` | No invoice balance display | Show invoice balance_due when selecting invoice | High |
| `payments/new/page.tsx` | No amount validation vs balance | Should warn if amount > balance_due | High |
| `reports/financial/page.tsx` | Ageing data in tab only | Create dedicated `/reports/ageing` page per spec | Medium |
| Sidebar | No Credit Notes / Debit Notes entries | Add under Revenue section | Low |
| Dashboard | Financial widgets present | Add click-to-drill-down on overdue widget | Low |

## Ticket Details

### TICKET-105: Invoice & Payment Drizzle Schema — DONE
**Backend:** DONE — `backend/src/db/tenant-schema.ts:346-427`
- `invoices` table (lines 346-383): All required fields present including GST/VAT fields, billing info, currency, exchange_rate, status enum
- `invoice_items` table (lines 385-400): All fields present — description, hsnCode, quantity, rate, discountPercent, taxableAmount, taxRate, taxAmount, amount, sortOrder
- `payments` table (lines 406-427): All fields present — invoiceId, contactId, supplierId, amount, currency, method, reference, type, date
- Indexes present on invoices (invoiceNumber, leadId, contactId, type, status, dueDate, createdAt), invoice_items (invoiceId), payments (invoiceId, contactId, supplierId, type, date)
**Schema Deviations:**
- `credit_notes` and `debit_notes` stored as `type` variants in `invoices` table (not separate tables) — valid pattern
- `numbering_config` stored as keys in settings table — valid pattern
- `hsn_codes` stored as constants + custom codes in settings — valid pattern
**Frontend:** N/A
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None

---

### TICKET-106: Invoice Auto-Numbering System — DONE
**Backend:** DONE — `backend/src/services/numbering.ts` (157 lines)
- `generateInvoiceNumber(tenantDb, type)` — atomic increment using settings table upsert
- `getCurrentFinancialYear()` — April-March cycle
- Format: PREFIX-FY-0001 (e.g., INV-2024-25-0001)
- Prefixes: INV (tax_invoice), PI (proforma), RCP (receipt), CN (credit_note), DN (debit_note)
- Settings endpoints: `GET/PUT /api/v1/settings/numbering` in `backend/src/routes/settings.ts:494-503`
**Frontend:** Config endpoints accessible at `desktop/src/lib/api/config.ts:338` (`settings.numbering`)
**API Client:** Settings endpoints configured in config.ts
**UX Issues:** No UI for configuring numbering settings in desktop app (backend exists)
**Fix Required:**
1. Create settings page for invoice numbering configuration (low priority — backend works)

---

### TICKET-107: Invoice CRUD API Endpoints — DONE
**Backend:** DONE — `backend/src/routes/invoices.ts` (1002 lines)
- `GET /invoices` — List with pagination, filters (status, contact_id, lead_id, type, date range), search by invoice_number/contact name
- `POST /invoices` — Create with auto-generated number, GST auto-calc via `calculateInvoiceTotals`, line items
- `GET /invoices/:id` — Full detail with items and payments
- `PUT /invoices/:id` — Update (draft only), recalculates totals
- `DELETE /invoices/:id` — Soft delete
- `POST /invoices/:id/void` — Void invoice
- `POST /invoices/:id/duplicate` — Duplicate
- Zod validation on all inputs
- RBAC: admin, sales_manager, accountant
**Frontend:** N/A (backend ticket)
**API Client:** All methods present in `desktop/src/lib/api/invoices.ts`
**UX Issues:** None
**Fix Required:** None

---

### TICKET-108: Invoice from Itinerary — Auto-Generate — PARTIAL
**Backend:** DONE — `backend/src/routes/invoices.ts` has `POST /invoices/from-itinerary` endpoint
- Maps itinerary items to invoice line items
- HSN/SAC auto-assigned by item type (hotel=996311, transport=996411, etc.)
- Contact auto-filled from lead
- Duplicate warning if invoice already exists for itinerary
**Frontend:** PARTIAL
- API client method exists: `desktop/src/lib/api/invoices.ts:92-93` — `fromItinerary()`
- API endpoint configured: `desktop/src/lib/api/config.ts:84` — `invoices.fromItinerary`
**UX Issues:**
1. No "Generate Invoice" button on itinerary detail page
2. No review screen before saving generated invoice
3. No integration between itinerary pages and invoice creation
**Fix Required:**
1. `desktop/src/app/(app)/itineraries/[id]/page.tsx` — Add "Generate Invoice" button for approved itineraries
2. Create flow: itinerary detail → review pre-filled invoice → save

---

### TICKET-109: Invoice Flutter Model, Repository & Providers — DONE (Desktop Equivalent)
**Note:** Spec targets Flutter. Desktop equivalent is the API client + shared types.
**Backend:** N/A
**Frontend:** DONE
- `desktop/src/lib/api/invoices.ts` — Full API client with list, getById, create, update, delete, void, duplicate, send, summary, fromItinerary, getPayments
- `desktop/src/lib/api/payments.ts` — Full API client with list, getById, create, update, delete, linkInvoice
- Shared type: `Invoice` imported from `@travelcrm/shared`
**API Client:** DONE — All methods present
**UX Issues:** None
**Fix Required:** None

---

### TICKET-110: Invoice Creation & Edit Form — PARTIAL
**Backend:** N/A (frontend ticket)
**Frontend:** PARTIAL
- `desktop/src/app/(app)/invoices/new/page.tsx` (327 lines) — Creation form exists
- `desktop/src/app/(app)/invoices/[id]/edit/page.tsx` — Edit form exists, pre-fills from loaded data
- Line items with add/remove: YES (lines 249-260 new, lines 74-82 edit)
- Discount (% or fixed): YES (lines 270-283)
- GST rate selector (0/5/12/18/28%): YES (lines 286-296)
- Currency selector (6 currencies): YES (lines 212-223)
- Notes & Terms: YES (lines 308-321)
- Save as Draft / Create & Send: YES (lines 170-175)
- Real-time total calc: YES (lines 90-96)
- Form validation: YES (lines 98-112)
**UX Issues:**
1. **Contact picker uses `<Select>` not searchable Combobox** — `new/page.tsx:188`
2. **Lead reference is raw text `<Input>`** — `new/page.tsx:199` — should be searchable Combobox for leads
3. **HSN/SAC is raw text `<Input>`** — `new/page.tsx:252` — should be searchable picker calling `/api/v1/hsn-codes`
4. **No invoice type selector** — Missing Tax Invoice / Proforma radio per spec
5. **No auto-fill billing info** — Selecting contact should auto-fill billing name/address/GSTIN
6. **No bank details section** — Should auto-load from tenant settings
7. **No drag-to-reorder line items** — Spec requires drag reorder
8. **Edit form missing HSN code column** — `edit/page.tsx` LineItem interface lacks `hsnCode`
9. **No auto-populate from URL params** — `?contactId=&leadId=` not read
**Fix Required:**
1. `new/page.tsx:188` — Replace `<Select>` with `<Combobox>` for contact
2. `new/page.tsx:199` — Replace `<Input>` with `<Combobox>` for lead
3. `new/page.tsx:252` — Replace `<Input>` with searchable HSN code picker
4. Add invoice type radio (tax_invoice / proforma)
5. Auto-fill billing fields on contact selection
6. Read `searchParams` for contactId/leadId auto-populate

---

### TICKET-111: Invoice List Screen — PARTIAL
**Backend:** N/A (frontend ticket)
**Frontend:** PARTIAL — `desktop/src/app/(app)/invoices/page.tsx` (251 lines)
- Table with columns: Invoice #, Client, Issue Date, Due Date, Amount, Paid, Balance, Status: YES
- Status badges with colors (draft/sent/partial/paid/overdue/cancelled): YES (lines 25-36)
- Search by invoice number: YES (lines 83-88)
- Status filter: YES (lines 158-168)
- Hover actions dropdown (View, Record Payment, Download PDF, Delete): YES (lines 220-241)
- Row click → detail page: YES (line 204)
- Summary cards (Collected, Outstanding, Overdue): YES (lines 117-151)
- Loading state: YES (lines 172-178)
- Error state with retry: YES (lines 100-106)
**UX Issues:**
1. **No FilterBar** — Uses basic `<Select>` for status only; missing date range, type, contact filters
2. **No useInfiniteScroll** — Loads all 100 records at once (`limit: 100` line 45)
3. **No detail drawer** — Row click navigates away; should have slide-over for quick view
4. **No empty state** — When 0 invoices found, table is blank
5. **"Download PDF" action is placeholder** — `page.tsx:229-231` — no onClick handler
6. **No sort controls** — Spec requires sorting by date/amount/balance
7. **Stats computed client-side** — Lines 93-95 use `.reduce()` on loaded data; should use `summary()` API
8. **No overdue auto-detection** — Spec says show overdue badge if due_date < today AND status=sent/partial
**Fix Required:**
1. `page.tsx:153-168` — Replace with `<FilterBar>` from `@/components/domain/filter-bar.tsx`
2. `page.tsx:44-47` — Replace with `useInfiniteScroll` from `@/hooks/use-infinite-scroll.ts`
3. `page.tsx:229` — Add `onClick` to Download PDF with PDF generation logic
4. Add empty state when `filtered.length === 0`

---

### TICKET-112: Invoice Detail Screen — PARTIAL
**Backend:** N/A (frontend ticket)
**Frontend:** PARTIAL — `desktop/src/app/(app)/invoices/[id]/page.tsx` (~700 lines)
- Status card with issue date, due date, amount: YES (lines 542-566)
- Line items display: YES (lines 600-621) — but missing HSN/SAC codes
- Summary (Subtotal, Discount, Total, Paid, Balance): YES (lines 623-656)
- Payment history table: YES (lines 659-700+) — date, amount, method, reference
- Record Payment dialog: YES (lines 240-265) — amount, method, reference
- Send Invoice dialog: YES (lines 399-416) — channel (email/WhatsApp), recipient
- Credit Note creation dialog: YES (lines 324-351) — reason, items, notes
- Debit Note creation dialog: YES (lines 353-380) — reason, items, notes
- PDF download (jsPDF): YES (lines 93-194)
- CSV download: YES (lines 196-220)
- Print: YES (lines 222-238)
- Duplicate: YES (lines 382-397)
- Send reminder: YES (lines 267-288)
- Cancel/Void: YES (lines 290-302)
- Edit button (links to edit page): YES (line 462)
**UX Issues:**
1. **No SendMessageDialog** — Custom inline dialogs for send (lines 399-416) and reminder (lines 267-288) — should use `SendMessageDialog`
2. **No GST/Tax breakdown** — Summary section shows only totals, not CGST/SGST/IGST split
3. **No HSN/SAC in line items** — Line items display omits HSN code column
4. **No linked credit/debit notes section** — Cannot see existing CN/DN on invoice
5. **Lead shown as raw ID** — `page.tsx:577-578` shows `invoice.leadId` — should be clickable link with lead title
6. **PDF is basic** — Missing branded header, QR code, amount in words, GST breakdown, signature line
7. **No payment delete** — Payment history rows have no delete action
**Fix Required:**
1. Replace send dialogs with `SendMessageDialog` from `@/components/communication/send-message-dialog.tsx`
2. Add CGST/SGST/IGST breakdown to summary section
3. Add HSN code to line items display
4. Show linked credit/debit notes list section
5. Replace raw leadId with linked lead name

---

### TICKET-113: Invoice PDF Generation (GST-Compliant) — PARTIAL
**Backend:** N/A (frontend/Flutter ticket)
**Frontend:** PARTIAL — `desktop/src/app/(app)/invoices/[id]/page.tsx:93-194`
- PDF generation via `jsPDF`: YES
- Header with invoice number, status, dates: YES
- Bill To section: YES
- Line items table (description, qty, rate, amount): YES
- Totals (Total, Paid, Balance): YES
- Notes section: YES
**Missing per spec:**
1. **No branded header** — No tenant logo, company info, GSTIN
2. **No QR code** — Spec requires QR code per GST e-invoicing requirements
3. **No HSN/SAC codes** in line items table
4. **No GST breakdown** — No CGST/SGST/IGST rows
5. **No amount in words** — Spec: "Rupees One Lakh Fifty Thousand Only"
6. **No bank details section**
7. **No signature line** — "Authorized Signatory"
8. **No "DUPLICATE" watermark** for duplicate invoices
9. **No footer** — "Computer-generated invoice"
**Fix Required:**
1. Major PDF overhaul — add branded header, QR, GST breakdown, bank details, signature, amount in words
2. Consider server-side PDF generation for consistency

---

### TICKET-114: Payment Recording API & UI — DONE
**Backend:** DONE — `backend/src/routes/payments.ts` (459 lines)
- `POST /payments` — Record payment with invoice link, auto-update invoice balances
- `GET /payments` — List with filters (type, contact_id, invoice_id, date range, method)
- `GET /payments/:id` — Detail
- `DELETE /payments/:id` — Delete with reverse of paid_amount
- Validates amount ≤ balance_due
- Auto-generates receipt number for incoming payments
- Activity logging
**Frontend:** DONE
- Payment list: `desktop/src/app/(app)/payments/page.tsx` (201 lines)
- Record payment form: `desktop/src/app/(app)/payments/new/page.tsx` (353 lines)
- Record payment dialog on invoice detail: `invoices/[id]/page.tsx:240-265`
**API Client:** DONE — `desktop/src/lib/api/payments.ts` — all CRUD methods + linkInvoice
**UX Issues:**
1. `payments/page.tsx:188` — "View details" action is placeholder (no onClick)
2. `payments/page.tsx:189` — "Delete" action is placeholder (no onClick)
3. `payments/page.tsx:69` — `overdueCount = 0` hardcoded
4. `payments/new/page.tsx` — No validation that amount ≤ invoice balance_due (frontend)
5. `payments/new/page.tsx` — No display of invoice balance when selecting invoice
**Fix Required:**
1. `payments/page.tsx:188-189` — Wire up View details and Delete actions
2. `payments/page.tsx:69` — Compute or fetch real overdue count
3. `payments/new/page.tsx` — Show balance_due when invoice selected, validate amount

---

### TICKET-115: Payment Receipt Auto-Generation — MISSING
**Backend:** N/A (frontend/Flutter ticket)
**Frontend:** MISSING — No receipt PDF generation implemented
- No receipt generator component
- No "View Receipt" or "Send Receipt" buttons after payment recording
- No receipt list accessible from payment list screen
**UX Issues:** Entire feature missing
**Fix Required:**
1. Create receipt PDF generator (similar to invoice PDF but simpler)
2. Add receipt actions after payment recording in `invoices/[id]/page.tsx`
3. Add receipt column/action in payments list

---

### TICKET-116: Credit Note & Debit Note — PARTIAL
**Backend:** DONE — `backend/src/routes/credit-notes.ts` (617 lines)
- `POST /credit-notes` — Create with auto-generated CN number
- `GET /credit-notes` — List
- `POST /credit-notes/:id/apply` — Apply to invoice (reduces balance)
- `POST /debit-notes` — Create with DN number
- `GET /debit-notes` — List
- `POST /debit-notes/:id/apply` — Apply to invoice (increases grand_total)
- Status flow: Draft → Issued → Applied
**Frontend:** PARTIAL
- Credit Note creation dialog on invoice detail: YES (`invoices/[id]/page.tsx:324-351`)
- Debit Note creation dialog on invoice detail: YES (`invoices/[id]/page.tsx:353-380`)
- API client: `desktop/src/lib/api/credit-notes.ts` — list, create, apply for both
**Missing:**
1. **No standalone credit notes list page** — `/credit-notes/page.tsx` does not exist
2. **No standalone debit notes list page** — `/debit-notes/page.tsx` does not exist
3. **No credit/debit note detail pages**
4. **No "Apply" action in UI** — `apply()` method exists in API client but no UI to trigger it
5. **No linked notes display on invoice detail**
6. **No PDF generation for credit/debit notes**
**Fix Required:**
1. Create `desktop/src/app/(app)/credit-notes/page.tsx` list page
2. Create `desktop/src/app/(app)/debit-notes/page.tsx` list page
3. Add "Apply" button in note management UI
4. Add linked CN/DN section on invoice detail page
5. Add sidebar entries under Revenue

---

### TICKET-117: Invoice Send via Email & WhatsApp — PARTIAL
**Backend:** DONE — `backend/src/routes/invoices.ts` has `POST /invoices/:id/send`
- Accepts channel ('email' | 'whatsapp') and recipient
- Updates status to 'sent' if was 'draft'
- Activity logging
**Frontend:** PARTIAL
- Send dialog on invoice detail: YES (`invoices/[id]/page.tsx:399-416`)
- Channel selector (email/WhatsApp): YES
- Recipient pre-fill from contact: YES (lines 470-473)
- API method: YES (`invoicesApi.send()` at `invoices.ts:86-87`)
**UX Issues:**
1. **Custom dialog instead of SendMessageDialog** — Violates UX contract. Should use the shared communication component for template selection, preview, etc.
2. **No PDF preview before send** — User cannot review PDF before sending
3. **No template selection** — Spec mentions branded email template
**Fix Required:**
1. Replace custom send dialog with `SendMessageDialog` from `@/components/communication/send-message-dialog.tsx`

---

### TICKET-118: Multi-Currency Invoice Support — PARTIAL
**Backend:** DONE — Invoice schema has `currency` and `exchange_rate` fields
**Frontend:** PARTIAL
- Currency selector in new invoice form: YES (`invoices/new/page.tsx:212-223`) — 6 currencies (INR, USD, EUR, GBP, AED, THB)
- Currency in `formatCurrency()`: YES (line 31-33)
**Missing:**
1. **No exchange rate capture** — When selecting non-INR currency, should auto-fetch exchange rate
2. **No base currency equivalent display** — Should show "₹ equivalent" for foreign currencies
3. **No localized number formatting** — Always uses en-IN regardless of currency
4. **Invoice detail doesn't show currency** — Always displays ₹ symbol
5. **Payment currency must match invoice** — Not validated
**Fix Required:**
1. Add exchange rate display/input when non-INR currency selected
2. Show dual-currency amounts on invoice detail

---

### TICKET-119: Advance Payments & Supplier Payments — PARTIAL
**Backend:** DONE — `backend/src/routes/payments.ts`
- `POST /payments/:id/link-invoice` — Link advance to invoice
- Advance payment: type='advance' with no invoice_id
- Supplier payment: type='outgoing'
**Frontend:** PARTIAL
- Advance payment toggle in new payment form: YES (`payments/new/page.tsx:198-211`)
- Lead search for advance payments: YES (`payments/new/page.tsx:228-260`)
- Link invoice API method: YES (`paymentsApi.linkInvoice()`)
**Missing:**
1. **No "Link Advance" UI when creating invoice** — Should show unlinked advances for contact
2. **No "Record Advance" button on lead detail page**
3. **No supplier payment recording from supplier detail**
4. **Link invoice action not exposed in payment list**
**Fix Required:**
1. Add "Link Advance Payment" flow when creating invoice for contact with unlinked advances
2. Add advance recording shortcut on lead detail

---

### TICKET-120: Outstanding Dashboard & Ageing Report — PARTIAL
**Backend:** DONE — `backend/src/routes/reports.ts`
- `GET /reports/outstanding` — Returns totalReceivable, overdueReceivable, ageing buckets, topOverdueInvoices
- `GET /reports/ageing` — Detailed ageing by contact (0-30, 31-60, 61-90, 90+ days)
- Dashboard summary includes financial stats
**Frontend:** PARTIAL
- API endpoints configured: `desktop/src/lib/api/config.ts:272-273`
- API methods: `reportsApi.getOutstandingReport()` and `reportsApi.getAgeingReport()` in `reports.ts:93-97`
- Financial report page fetches outstanding/ageing: `reports/financial/page.tsx:194-202`
**Missing:**
1. **No dedicated `/reports/ageing` page** — Ageing data only appears as tab in financial report
2. **No ageing chart (stacked bar)** — Spec requires fl_chart-style visualization
3. **No "Export ageing to Excel"** action
4. **Dashboard outstanding widget** — Basic cards exist but no click-to-drill-down
**Fix Required:**
1. Create dedicated `desktop/src/app/(app)/reports/ageing/page.tsx` with detailed ageing table
2. Add stacked bar chart visualization
3. Add Excel export for ageing data

---

### TICKET-121: Payment Reminders (Auto & Manual) — PARTIAL
**Backend:** DONE — `backend/src/cron/auto-reminders.ts:108-317`
- Auto reminders: due in 3 days, 1 day overdue, 7 days overdue, 14 days overdue
- Sends via SMS_QUEUE, EMAIL_QUEUE, PUSH_NOTIFICATION_QUEUE
- Creates in-app notifications for 14-day overdue
**Frontend:** PARTIAL
- Manual "Send Reminder" on invoice detail: YES (`invoices/[id]/page.tsx:267-288`)
**Missing:**
1. **No reminder template configuration UI** — Spec requires configurable templates
2. **No reminder history section** — Cannot see when reminders were sent
3. **No auto-reminder settings toggle** — No UI to enable/disable or configure schedule
4. **Reminder uses raw `communicationsApi.send()`** — Should use `SendMessageDialog` for consistency
**Fix Required:**
1. Add reminder history section to invoice detail
2. Add reminder settings in tenant settings page

---

### TICKET-122: HSN/SAC Code Management — PARTIAL
**Backend:** DONE — `backend/src/routes/hsn-codes.ts` (92 lines)
- `GET /hsn-codes` — List pre-loaded + custom, with search
- `POST /hsn-codes` — Add custom (Admin only)
- Pre-loaded codes: 996311, 996411, 998551, 998552, 996331, 997221, 997121, 999799
**Frontend:** PARTIAL
- API client: `desktop/src/lib/api/hsn-codes.ts` — list + create
- API config: `desktop/src/lib/api/config.ts:106-109`
**Missing:**
1. **No HSN code picker in invoice form** — `invoices/new/page.tsx:252` is raw `<Input>`
2. **No HSN code management page** — No UI for viewing/adding custom codes
3. **No auto-suggest based on itinerary item type**
**Fix Required:**
1. Replace HSN `<Input>` with searchable `Combobox` calling `hsnCodesApi.list({ search })`
2. Add HSN code picker to line item rows

---

### TICKET-123: Invoice from Lead Detail Integration — MISSING
**Backend:** N/A (frontend ticket)
**Frontend:** MISSING
- No "Invoices" tab on lead detail page
- No "Create Invoice" button that prefills lead_id + contact
- No "Generate from Itinerary" option
- No payment summary on lead header
**UX Issues:** Entire feature missing — no invoice/payment integration in lead detail
**Fix Required:**
1. Add "Invoices" tab to lead detail page with filtered invoice list
2. Add "Payments" tab to lead detail with payment list
3. Add "Create Invoice" button prefilling leadId + contactId
4. Add payment summary stats to lead header

---

### TICKET-124: Invoice Navigation & GoRouter Routes — DONE (Desktop Equivalent)
**Note:** Spec targets Flutter GoRouter. Desktop uses Next.js App Router.
**Frontend:** DONE
- `/invoices` → Invoice list: YES
- `/invoices/new` → Create form: YES
- `/invoices/[id]` → Detail: YES
- `/invoices/[id]/edit` → Edit form: YES
- `/payments` → Payment list: YES
- `/payments/new` → Record payment: YES
- Sidebar: "Invoices" under Revenue: YES (`sidebar.tsx:94`)
- Sidebar: "Payments" under Revenue: YES (`sidebar.tsx:95`)
**Missing:**
1. No `/reports/ageing` route
2. No `/credit-notes` route
3. No `/debit-notes` route
**Fix Required:**
1. Add routes when pages are created (TICKET-116, TICKET-120)

---

### TICKET-125: Invoice Contact 360° Integration — MISSING (Desktop)
**Backend:** N/A (frontend ticket)
**Frontend:** Status unclear — would need to check contact detail page for invoice/payment tabs
**Missing (presumed):**
1. No "Invoices" tab on contact detail page
2. No "Payments" tab on contact detail
3. No financial summary (Total business, Total paid, Outstanding)
4. No "Create Invoice" from contact pre-filling contactId
**Fix Required:**
1. Add Invoices/Payments tabs to contact detail page
2. Add financial summary stats to contact header
3. Add "Create Invoice" button prefilling contactId

---

### TICKET-126: Bank Details & Payment Terms Settings — PARTIAL
**Backend:** DONE — `backend/src/routes/settings.ts`
- `GET /api/v1/settings/invoice-defaults` — bank_details, payment_terms, due_days, tax config, company info
- `PUT /api/v1/settings/invoice-defaults` — Update (Admin only)
**Frontend:** PARTIAL
- API endpoint configured: `desktop/src/lib/api/config.ts:336` (`settings.invoiceDefaults`)
**Missing:**
1. **No Invoice Settings page** — No UI for configuring bank details, payment terms, tax config
2. **Invoice form doesn't auto-load defaults** — Terms are hardcoded in `new/page.tsx:53`, not fetched from settings
3. **No bank details on invoices** — Neither form nor detail displays bank info
**Fix Required:**
1. Create Invoice Settings page under Settings section
2. Fetch and auto-fill defaults when creating new invoice
3. Display bank details on invoice detail and PDF

---

### TICKET-127: GST vs VAT Adaptive Tax System — PARTIAL
**Backend:** DONE — `backend/src/services/tax-calculator.ts` (186 lines)
- `detectTaxType()` — Determines cgst_sgst/igst/vat/none based on company state, contact state, tax_system
- `calculateLineItemTax()` — Per-item tax calculation
- `calculateInvoiceTotals()` — Full invoice totals with discount, tax
- Valid rates: 0, 5, 12, 18, 28
**Frontend:** PARTIAL
- GST rate selector in form: YES (0/5/12/18/28%)
**Missing:**
1. **No VAT mode UI** — Form always shows "GST" label, no adaptation for VAT tenants
2. **No state-based auto-detection** — Form doesn't detect CGST+SGST vs IGST based on billing state
3. **No custom tax labels** — Always says "GST", should adapt per tenant setting
4. **Detail page has no tax breakdown** — Only shows total
**Fix Required:**
1. Add tenant tax_system awareness to invoice form
2. Show CGST/SGST or IGST based on billing state vs company state
3. Adapt labels for VAT/Sales Tax mode

---

### TICKET-128: Invoice Dashboard Widgets — DONE
**Backend:** DONE — Dashboard summary API includes financial stats
- Revenue this month, outstanding, overdue, collections
**Frontend:** DONE — `desktop/src/app/(app)/dashboard/page.tsx`
- Revenue This Month card with link to /invoices
- Outstanding Receivables card
- Overdue Amount card
- Collections This Month card
- Data fetched via `invoicesApi.summary()`
**UX Issues:**
1. No click-to-drill-down on financial cards
2. No ageing mini chart on dashboard
**Fix Required:** Minor — add navigation links and mini chart (low priority)

---

## BUG Details

### BUG-1: Placeholder hover actions in payments list
**File:** `desktop/src/app/(app)/payments/page.tsx:188-189`
**Issue:** "View details" and "Delete" dropdown actions have no `onClick` handlers — clicking does nothing
**Impact:** Users cannot view payment details or delete payments from the list
**Fix:** Wire up navigation for "View details" and confirmation + API call for "Delete"

### BUG-2: Placeholder "Download PDF" in invoice list
**File:** `desktop/src/app/(app)/invoices/page.tsx:229-231`
**Issue:** "Download PDF" dropdown action has no `onClick` handler
**Impact:** Users cannot download invoice PDF from the list view
**Fix:** Add `onClick` that generates and downloads PDF for the invoice

### BUG-3: Hardcoded overdue count in payments page
**File:** `desktop/src/app/(app)/payments/page.tsx:69`
**Issue:** `const overdueCount = 0;` is hardcoded with comment "Would require invoice data to calculate"
**Impact:** Overdue count stat card always shows 0
**Fix:** Fetch from `invoicesApi.summary()` or compute from payment data
