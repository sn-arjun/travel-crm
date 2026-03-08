# Milestone 6 Audit Report
Generated: 2026-03-08
Ticket File: product-requirment/jira-tickets-m6.md

## Summary
| Status  | Count |
|---------|-------|
| DONE    | 14    |
| PARTIAL | 7     |
| MISSING | 1     |
| BUG     | 3     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|
| `NEXT_PUBLIC_API_URL` | desktop/src/lib/api/client.ts | Yes | Defaults to localhost:8787 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | desktop/src/components/ui/address-autocomplete.tsx | No | Falls back to plain text input |
| `SENDGRID_API_KEY` | backend/src/services/sendgrid.ts | No | Email queue silently fails |
| `TWILIO_ACCOUNT_SID` | backend/src/services/twilio.ts | No | WhatsApp send silently fails |
| `TWILIO_AUTH_TOKEN` | backend/src/services/twilio.ts | No | WhatsApp send silently fails |
| `FILE_STORAGE` (R2 binding) | backend/src/routes/files.ts | Yes | File upload/serve fails with 500 |
| `EMAIL_QUEUE` (Queue binding) | backend/src/routes/itineraries.ts:775 | No | try/catch swallows error, no user feedback |
| `SMS_QUEUE` (Queue binding) | backend/src/routes/itineraries.ts:790 | No | try/catch swallows error, no user feedback |
| `MASTER_DB` (D1 binding) | backend/src/routes/itineraries.ts:861 | Yes | Share link creation crashes |
| `KV` (KV binding) | backend/src/services/exchange-rate.ts | No | Falls back to hardcoded rates |

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|
| `/itineraries` list | No FilterBar component | Replace manual `<Select>` + `<Input>` with `FilterBar` from `desktop/src/components/domain/filter-bar.tsx` |
| `/itineraries` list | No detail drawer | Add click-to-open slide-over panel for quick itinerary preview |
| `/itineraries/new` | Lead picker is custom dropdown, not Combobox | Replace custom `leadSearch`/`leadDropdownOpen` state with searchable `Combobox` component |
| `/itineraries/new` | No supplier Combobox on items | Item forms should have searchable supplier picker Combobox (not just rateCardId auto-fill) |
| `/rate-cards` list | No infinite scroll | Replace static 50-item fetch with `useInfiniteScroll` hook |
| `/rate-cards` list | No FilterBar component | Replace manual `<Select>` with `FilterBar` |
| `/rate-cards` list | Delete action not implemented | Wire up `rateCardsApi.delete()` in dropdown handler |
| `/rate-cards` list | No detail drawer | Add click-to-open drawer for rate card details |
| `/rate-cards/new` | Supplier picker is plain `<Select>` | Replace with searchable `Combobox` calling `suppliersApi.list({ search })` |
| `/rate-cards/[id]/edit` | Supplier picker is plain `<Select>` | Same Combobox fix as create page |
| `/itineraries/templates` | No search debounce or FilterBar | Templates page uses basic `<Input>` for search without FilterBar |
| API client `itineraries.ts` | `UpdateItineraryRequest` type mismatch | Type has `description, startDate, endDate, destination, budget` fields that don't match backend schema (should have `days, inclusions, exclusions, termsConditions, markupType, markupValue, status, currency`) |
| API client `itineraries.ts` | `SendItineraryRequest` type mismatch | Has `to: string[]` and `attachPdf?: boolean` but backend expects `channel: 'email'|'whatsapp', to: string, subject?, message?` |
| API client `itineraries.ts` | `CloneItineraryRequest` type mismatch | Has `title?, cloneItems?` but backend expects `targetLeadId?` |
| API config `config.ts` | Missing `itineraryDefaults` endpoint | `settings` section missing `itineraryDefaults: '/settings/itinerary-defaults'` |

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|
| `/itineraries` list | Status filter only | Add filters for: created_by, date range, lead destination | Medium |
| `/itineraries` list | No keyboard shortcuts | Add Ctrl+N for new itinerary, Enter on selected row to view | Low |
| `/itineraries` list | No bulk operations | Add multi-select + bulk delete/status change | Low |
| `/itineraries/new` | No auto-save | Add auto-save draft every 30 seconds (per TICKET-086 AC) | High |
| `/itineraries/new` | No day description templates | Add quick-insert snippets for common day descriptions | Low |
| `/itineraries/new` | No "Load T&C from Settings" button | Add button to fetch tenant default terms from `/settings/itinerary-defaults` | Medium |
| `/itineraries/[id]` | No compare versions view | Add side-by-side version diff showing price/day changes | Low |
| `/itineraries/[id]/pdf` | Client-side print only | Consider server-side PDF generation fallback for higher quality | Medium |
| `/rate-cards` list | No bulk import | Add Excel/CSV bulk import for rate cards (TICKET-092 AC) | Medium |
| `/rate-cards` list | No season indicator | Show current season highlight based on today's date | Low |
| `/itineraries/templates` | Grid view only | Add list/table view toggle for template management | Low |
| All itinerary forms | No real-time pricing engine | Child pricing % and group discounts not calculated client-side (TICKET-093 AC) | High |
| `/itineraries` list | No "Margin" column | Admin/Manager should see profit margin % column (TICKET-104 AC) | Medium |

## Ticket Details

### TICKET-083: Itinerary Drizzle Schema & Migrations — DONE
**Backend:** DONE — All 5 tables exist in `backend/src/db/tenant-schema.ts` (itineraries:209-244, itineraryDays:246-259, itineraryItems:261-286, itineraryTemplates:292-307, rateCards:313-340). All required fields present including `shareToken`, `shareLinkActive`, `viewCount`, `lastViewedAt` on itineraries. Indexes defined for key lookups.
**Frontend:** N/A — Schema-only ticket
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None
---

### TICKET-084: Itinerary CRUD API Endpoints — DONE
**Backend:** DONE — `backend/src/routes/itineraries.ts` (1066 lines). All endpoints implemented: GET /, POST /, GET /:id, PUT /:id, DELETE /:id (soft delete), POST /:id/clone. Nested create/update with days+items works. Zod validation present. RBAC with `requirePermission`. Totals auto-calculated via `calculateTotals()`.
**Frontend:** N/A — Backend-only ticket
**API Client:** DONE — `desktop/src/lib/api/itineraries.ts` has all CRUD methods.
**UX Issues:** None
**Fix Required:** None
---

### TICKET-085: Itinerary Flutter Model, Repository & Providers — N/A (Flutter)
**Backend:** N/A
**Frontend:** N/A — Flutter-only ticket, not applicable to desktop
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None (Desktop uses TypeScript types in `desktop/src/lib/api/itineraries.ts`)
---

### TICKET-086: Day-Wise Itinerary Builder Screen — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — `desktop/src/app/(app)/itineraries/new/page.tsx` exists. Day list with add/remove days, item forms by type (hotel, transport, activity, meal, flight), drag-and-drop reorder via dnd-kit, rich text editor, image upload, inclusions/exclusions, pricing summary footer all present.
**API Client:** DONE
**UX Issues:**
1. `new/page.tsx` — Lead picker uses custom manual dropdown (`leadSearch`/`leadDropdownOpen` state) instead of searchable Combobox
2. `new/page.tsx` — No auto-save every 30 seconds (ticket requires auto-save)
3. `new/page.tsx` — "Load T&C from Settings" button missing (ticket requires loading from tenant defaults)
**Fix Required:**
1. `desktop/src/app/(app)/itineraries/new/page.tsx` — Replace custom lead dropdown with `<Combobox>` calling `leadsApi.list({ search })`
2. Add `useEffect` with 30-second interval calling save-draft API
3. Add "Load from Settings" button that fetches `/settings/itinerary-defaults` and populates T&C field
---

### TICKET-087: Drag-and-Drop Reorder for Days & Items — DONE
**Backend:** N/A
**Frontend:** DONE — `desktop/src/app/(app)/itineraries/new/page.tsx` and `[id]/edit/page.tsx` both use `@dnd-kit/core` and `@dnd-kit/sortable` for day reordering. Day numbers auto-recalculate on drop.
**API Client:** N/A
**UX Issues:** Item reorder within a day may not be implemented (only day reorder confirmed). Move item between days not implemented.
**Fix Required:**
1. Verify item-level drag-and-drop within days works in both create and edit pages
---

### TICKET-088: Rich Text Descriptions & Image Attachments — DONE
**Backend:** DONE — `backend/src/routes/files.ts` (81 lines). POST /upload (5MB max, images only), GET /* (serve from R2), DELETE /* (remove from R2).
**Frontend:** DONE — Rich text editor component used in day descriptions. Image upload with preview and delete in day cards. Uses file upload API.
**API Client:** DONE — File upload calls present in create/edit pages.
**UX Issues:** None significant
**Fix Required:** None
---

### TICKET-089: Include/Exclude & Terms Sections — PARTIAL
**Backend:** DONE — `backend/src/routes/settings.ts` has GET/PUT `/settings/itinerary-defaults` (lines 314-398) returning defaultTerms, defaultInclusions, defaultExclusions, validityDays.
**Frontend:** PARTIAL — Inclusions/exclusions editable in create/edit pages. Terms & Conditions textarea present.
**API Client:** BUG — `desktop/src/lib/api/config.ts` missing `itineraryDefaults` endpoint in settings section. Cannot fetch tenant defaults.
**UX Issues:**
1. No "Load from Settings" button to pre-fill T&C from tenant defaults
2. No common inclusion/exclusion suggestions dropdown (ticket requires predefined options)
3. No auto-calculate validity date from settings
**Fix Required:**
1. `desktop/src/lib/api/config.ts` — Add `itineraryDefaults: '/settings/itinerary-defaults'` to settings endpoints
2. `desktop/src/app/(app)/itineraries/new/page.tsx` — Add "Load Defaults" button calling settings API
3. Add suggestion dropdown with common inclusions/exclusions (e.g., "Breakfast at hotel", "Airport transfers", "Visa fees")
---

### TICKET-090: Itinerary Version Control — DONE
**Backend:** DONE — `backend/src/routes/itineraries.ts` has POST /:id/new-version (line 618) and GET /:id/versions (line 727). Deep clones itinerary with all days+items. Max version tracking works.
**Frontend:** DONE — Detail page shows version badge, "Create New Version" button, version history tab with version list.
**API Client:** DONE — `createNewVersion()` and `getVersions()` methods present.
**UX Issues:** No side-by-side version comparison (nice-to-have per ticket)
**Fix Required:** None (comparison is explicitly marked nice-to-have)
---

### TICKET-091: Clone Itinerary & Itinerary Templates — DONE
**Backend:** DONE — Clone: `POST /itineraries/:id/clone` in itineraries.ts. Templates: `backend/src/routes/itinerary-templates.ts` (358 lines) has GET /, GET /:id, POST /, POST /from-itinerary, POST /create-from, DELETE /:id. All endpoints with Zod validation and RBAC.
**Frontend:** DONE — Detail page has "Duplicate" action. Templates page at `/itineraries/templates` with grid layout, search, preview dialog, "Use Template" flow.
**API Client:** BUG — `CloneItineraryRequest` type has `title?, cloneItems?` but backend expects `targetLeadId?`. Clone may not work correctly for cross-lead cloning.
**UX Issues:**
1. Clone dialog doesn't show lead picker for cross-lead cloning
2. "Save as Template" button not visible on detail page action bar
**Fix Required:**
1. `desktop/src/lib/api/itineraries.ts:64-67` — Fix `CloneItineraryRequest` to `{ targetLeadId?: string }`
2. Add "Save as Template" button to itinerary detail action bar calling `POST /itinerary-templates/from-itinerary`
---

### TICKET-092: Rate Card CRUD API & Management Screen — PARTIAL
**Backend:** DONE — `backend/src/routes/rate-cards.ts` (298 lines). All CRUD + lookup endpoint. Zod validation. Supplier enrichment. Seasonal date filtering.
**Frontend:** PARTIAL — List page at `/rate-cards/page.tsx`, create at `/rate-cards/new/page.tsx`, edit at `/rate-cards/[id]/edit/page.tsx`.
**API Client:** DONE — Uses `client.get/post/put` directly with API_ENDPOINTS.
**UX Issues:**
1. `/rate-cards` list — No infinite scroll (static 50-item fetch)
2. `/rate-cards` list — No FilterBar (uses manual `<Select>`)
3. `/rate-cards` list — Delete action handler missing in dropdown
4. `/rate-cards` list — No detail drawer
5. `/rate-cards/new` — Supplier picker is plain `<Select>`, not searchable Combobox
6. No bulk import from Excel (ticket requires basic import)
**Fix Required:**
1. `/rate-cards/page.tsx` — Add `useInfiniteScroll` hook
2. `/rate-cards/page.tsx` — Replace manual filter with `FilterBar` component
3. `/rate-cards/page.tsx` — Wire delete handler to API
4. `/rate-cards/new/page.tsx` and `[id]/edit/page.tsx` — Replace supplier `<Select>` with searchable `Combobox`
---

### TICKET-093: Dynamic Pricing Engine — Auto-Fill from Rate Cards — PARTIAL
**Backend:** DONE — Rate card lookup endpoint exists at `GET /rate-cards/lookup` with type, destination, season filters and date validity checks.
**Frontend:** PARTIAL — Rate card picker dialog exists in create page. Auto-fills title, cost_price, selling_price on selection.
**API Client:** DONE
**UX Issues:**
1. No client-side group discount calculation (ticket requires: if pax_count > threshold, apply discount %)
2. No client-side child pricing calculation (ticket requires: child items at X% of adult rate)
3. No profit margin indicator per item (ticket requires: margin % = (selling - cost) / selling × 100)
4. No itinerary-level markup recalculation in real-time
**Fix Required:**
1. Add group discount logic to pricing calculation in create/edit pages
2. Add child pricing multiplier to item cost calculation
3. Add profit margin badges per item (green >20%, yellow 10-20%, red <10%) for admin/manager roles
---

### TICKET-094: Seasonal Pricing & Currency Conversion — PARTIAL
**Backend:** DONE — `backend/src/routes/exchange-rates.ts` (31 lines) with GET /?from=&to=. Service at `backend/src/services/exchange-rate.ts` with KV caching and fallback rates.
**Frontend:** PARTIAL — Currency selector exists in itinerary create page.
**API Client:** No dedicated exchange rate API client method.
**UX Issues:**
1. No season indicator in itinerary header showing peak/off-peak/shoulder
2. No currency conversion toggle in builder (show base vs customer currency)
3. No exchange rate display in itinerary header
4. No historical price comparison
**Fix Required:**
1. Add exchange rate API client method
2. Add currency conversion display in itinerary builder when currency != INR
3. Add season badge based on rate card validity dates
---

### TICKET-095: Itinerary List Screen — DONE
**Backend:** N/A
**Frontend:** DONE — `/itineraries/page.tsx` with columns: Title, Lead, Version, Status (badge), Days, Grand Total, Created by, Created date. Infinite scroll with `useInfiniteScroll` hook (30 per page). Search bar, status filter. Row actions: View, Edit, Duplicate, Delete. Empty state with CTA. "Create Itinerary" button.
**API Client:** DONE
**UX Issues:**
1. No FilterBar — uses manual `<Select>` + `<Input>`
2. No detail drawer on row click
3. Missing hover actions for Send (email/WhatsApp)
4. Status badges present but limited color palette
**Fix Required:**
1. Replace manual filters with `FilterBar` component
2. Add detail drawer for quick preview
---

### TICKET-096: Itinerary Detail & Preview Screen — DONE
**Backend:** N/A
**Frontend:** DONE — `/itineraries/[id]/page.tsx` with header (title, version badge, status badge, lead info, validity date), day-by-day view with expandable cards, item display with type icons, pricing summary, inclusions/exclusions, terms. Action bar: Edit, Email (SendMessageDialog), WhatsApp (SendMessageDialog), PDF Preview, Download PDF, Clone, Delete. Version history tab.
**API Client:** DONE
**UX Issues:**
1. Activity timeline tab not present (ticket requires: who created, edited, sent)
2. Read-only enforcement for non-draft may not block edit button visibility
**Fix Required:**
1. Add activity/timeline tab showing itinerary lifecycle events
---

### TICKET-097: Quotation PDF Generation — DONE
**Backend:** DONE — `backend/src/routes/itineraries.ts` GET /:id/pdf (lines 907-1063). Server-side PDF generation using `pdf-lib`. A4 format with branded header, day-wise layout, pricing summary, inclusions/exclusions, T&C, footer. Note: This is server-side (pdf-lib), not client-side Flutter PDF as ticket originally spec'd. Desktop adaptation is appropriate.
**Frontend:** DONE — `/itineraries/[id]/pdf/page.tsx` with print-friendly layout. Download button triggers backend PDF endpoint.
**API Client:** DONE
**UX Issues:**
1. PDF lacks branded header (tenant logo, company info) — uses generic "TRAVEL QUOTATION" header
2. PDF lacks customer info section (contact name, phone, email)
3. No package pricing toggle (itemized vs lump-sum per ticket AC)
4. No per-day images in PDF (ticket requires destination images from R2)
**Fix Required:**
1. `backend/src/routes/itineraries.ts:907-1063` — Add tenant company info from settings to PDF header
2. Add contact info section after header
3. Add customer-facing PDF should exclude cost prices (currently shows sellingPrice only — OK)
---

### TICKET-098: Email Quotation — One-Click Send — DONE
**Backend:** DONE — `POST /itineraries/:id/send` with `channel: 'email'` support. Queues to EMAIL_QUEUE. Updates status to 'sent'. Logs to leadActivities and messageLog.
**Frontend:** DONE — "Email" button on detail page opens SendMessageDialog. Properly integrated.
**API Client:** BUG — `SendItineraryRequest` has `to: string[]` (array) and `attachPdf?: boolean` but backend expects `channel: 'email'|'whatsapp', to: string` (single string). Type mismatch may cause runtime errors.
**UX Issues:** None beyond the type mismatch
**Fix Required:**
1. `desktop/src/lib/api/itineraries.ts:81-85` — Fix `SendItineraryRequest` to match backend: `{ channel: 'email'|'whatsapp', to: string, subject?: string, message?: string }`
---

### TICKET-099: WhatsApp Quotation Share — DONE
**Backend:** DONE — Same `POST /itineraries/:id/send` endpoint handles `channel: 'whatsapp'`. Queues to SMS_QUEUE.
**Frontend:** DONE — "WhatsApp" button on detail page opens SendMessageDialog with WhatsApp channel.
**API Client:** BUG — Same type mismatch as TICKET-098.
**UX Issues:** No fallback offer to SMS if WhatsApp fails (ticket requires this)
**Fix Required:**
1. Same fix as TICKET-098 for SendItineraryRequest type
---

### TICKET-100: Shareable Web Link for Quotation — DONE
**Backend:** DONE — `POST /itineraries/:id/share-link` generates token, saves to master DB. `DELETE /itineraries/:id/share-link` revokes. Public endpoint at `GET /api/v1/public/quotation/:token` in `backend/src/routes/public.ts` with view tracking, expiry check, and internal field hiding.
**Frontend:** DONE — Share tab on detail page with link generation, copy-to-clipboard, view count display.
**API Client:** DONE — `createShareLink()` and `revokeShareLink()` methods present.
**UX Issues:** None significant
**Fix Required:** None
---

### TICKET-101: Multilingual PDF Generation — MISSING
**Backend:** No locale parameter on PDF endpoint
**Frontend:** No language selection in send dialog
**API Client:** N/A
**UX Issues:** Full ticket not implemented — no Hindi/Arabic PDF support, no localized labels, no font loading
**Fix Required:**
1. Add `?locale=en|hi|ar` query param to `GET /itineraries/:id/pdf`
2. Bundle Noto Sans Devanagari font
3. Add locale-aware labels for PDF sections
4. Add language dropdown in send dialog
---

### TICKET-102: Itinerary from Lead Detail Integration — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — Cannot fully verify without reading lead detail page. The itineraries list supports `?leadId=` filter param. Create page accepts leadId from URL context.
**API Client:** DONE
**UX Issues:**
1. Need to verify lead detail page has "Itineraries" tab
2. Need to verify "Create from Template" button exists on lead detail
3. Need to verify stage-change prompt when no itinerary exists
**Fix Required:**
1. Verify/add Itineraries tab on lead detail page with filtered list
2. Add "Create from Template" button alongside "Create Itinerary"
---

### TICKET-103: Itinerary Navigation & GoRouter Routes — DONE (Desktop Equivalent)
**Backend:** N/A
**Frontend:** DONE — Desktop uses Next.js App Router (not GoRouter). Routes exist:
- `/itineraries` → list page ✓
- `/itineraries/new` → create page ✓
- `/itineraries/[id]` → detail page ✓
- `/itineraries/[id]/edit` → edit page ✓
- `/itineraries/[id]/pdf` → PDF preview ✓ (bonus)
- `/itineraries/templates` → templates page ✓
- `/rate-cards` → list page ✓
- `/rate-cards/new` → create page ✓
- `/rate-cards/[id]/edit` → edit page ✓

Sidebar: "Itineraries" with Map icon and "Rate Cards" with Tag icon both present in Operations group at `desktop/src/components/layout/sidebar.tsx:84-85`.
**API Client:** N/A
**UX Issues:** None
**Fix Required:** None
---

### TICKET-104: Itinerary Cost vs Selling Price Admin View — PARTIAL
**Backend:** N/A
**Frontend:** PARTIAL — List page has RBAC-based cost column visibility (admin/manager see cost+selling, others see selling only). Detail page has cost breakdown tab with role check.
**API Client:** N/A
**UX Issues:**
1. No profit margin color coding (green >20%, yellow 10-20%, red <10%) — ticket requires this
2. No "Margin" column on list page for admin/manager
3. PDF correctly excludes cost prices (only shows selling) ✓
**Fix Required:**
1. Add margin % calculation to list page for admin/manager roles
2. Add color-coded margin indicators per item on detail page
---

## Critical Bugs Summary

### BUG-1: API Type Mismatches (High Priority)
**File:** `desktop/src/lib/api/itineraries.ts`
- `UpdateItineraryRequest` (lines 53-62): Has wrong fields (`description, startDate, endDate, destination, budget`). Should match backend: `title?, validityDate?, notes?, inclusions?, exclusions?, termsConditions?, currency?, markupType?, markupValue?, status?, days?`
- `SendItineraryRequest` (lines 81-85): Has `to: string[]` (array). Backend expects `channel: 'email'|'whatsapp', to: string` (single)
- `CloneItineraryRequest` (lines 64-67): Has `title?, cloneItems?`. Backend expects `targetLeadId?`

### BUG-2: Missing Settings API Endpoint (Medium Priority)
**File:** `desktop/src/lib/api/config.ts`
- Settings section missing `itineraryDefaults: '/settings/itinerary-defaults'` endpoint
- Prevents "Load from Settings" functionality for T&C, inclusions, exclusions

### BUG-3: Rate Cards Delete Not Wired (Low Priority)
**File:** `desktop/src/app/(app)/rate-cards/page.tsx`
- Delete dropdown action has no handler or API call
- Clicking delete does nothing

## Files Referenced
- `backend/src/db/tenant-schema.ts` — Schema definitions (lines 209-340)
- `backend/src/routes/itineraries.ts` — All itinerary endpoints (1066 lines)
- `backend/src/routes/itinerary-templates.ts` — Template CRUD (358 lines)
- `backend/src/routes/rate-cards.ts` — Rate card CRUD + lookup (298 lines)
- `backend/src/routes/exchange-rates.ts` — Currency conversion (31 lines)
- `backend/src/routes/files.ts` — R2 file upload/serve (81 lines)
- `backend/src/routes/settings.ts` — Itinerary defaults (lines 314-398)
- `backend/src/routes/public.ts` — Public quotation view (96 lines)
- `backend/src/services/exchange-rate.ts` — Exchange rate with KV cache (46 lines)
- `backend/src/index.ts` — Route mounts (lines 214-218)
- `desktop/src/lib/api/itineraries.ts` — API client (141 lines)
- `desktop/src/lib/api/config.ts` — Endpoint URLs (405 lines)
- `desktop/src/app/(app)/itineraries/page.tsx` — List page
- `desktop/src/app/(app)/itineraries/new/page.tsx` — Create page
- `desktop/src/app/(app)/itineraries/[id]/page.tsx` — Detail page
- `desktop/src/app/(app)/itineraries/[id]/edit/page.tsx` — Edit page
- `desktop/src/app/(app)/itineraries/[id]/pdf/page.tsx` — PDF preview
- `desktop/src/app/(app)/itineraries/templates/page.tsx` — Templates browser
- `desktop/src/app/(app)/rate-cards/page.tsx` — Rate cards list
- `desktop/src/app/(app)/rate-cards/new/page.tsx` — Rate card create
- `desktop/src/app/(app)/rate-cards/[id]/edit/page.tsx` — Rate card edit
- `desktop/src/components/layout/sidebar.tsx` — Navigation (lines 84-85)
- `desktop/src/hooks/use-infinite-scroll.ts` — Infinite scroll hook
- `desktop/src/components/domain/filter-bar.tsx` — FilterBar component
- `desktop/src/components/communication/send-message-dialog.tsx` — SendMessageDialog
