# TravelCRM Pro — Implementation Plan
Generated: 2026-03-09

## Overview

- **Total issues:** 120 (27 P0 + 52 P1 + 41 P2)
- **Missing features:** 40+
- **Organized into 4 phases** with dependency ordering
- **Estimated total effort:** ~35–45 developer-days

---

## Phase 1: Critical Fixes (P0 — Broken Features)

> **Goal:** Make every feature functional. Users can complete core tasks without errors.
> **Estimated effort:** 8–12 developer-days
> **Issues addressed:** 27 items (IMPROVEMENTS.md #1–#27)

### 1.1 Backend Data Integrity (Day 1–2)

These fixes are prerequisites — other features depend on correct backend behavior.

| # | Fix | Files | Effort | Depends On |
|---|-----|-------|--------|------------|
| 1 | **Import queue: MASTER_DB → tenant DB** | `backend/src/queues/import-queue.ts:28` | 30 min | — |
| 2 | **Export queue: MASTER_DB → tenant DB** | `backend/src/queues/export-queue.ts:29` | 30 min | — |
| 3 | **Suppliers: `is_active` → `is_deleted`** column fix | `backend/src/routes/suppliers.ts:35,56,88,108,125,201,237` | 1 hr | — |
| 4 | **Rate card import: supplier name → supplier ID** FK fix | `backend/src/services/imports/row-inserter.ts:123` | 1 hr | — |
| 5 | **Visa cron: wrong column names** (`va.country`, `va.expiry_date`, `t.passport_expiry`) | `backend/src/cron/auto-reminders.ts:350,355,382` | 1 hr | — |
| 6 | **Campaign scheduler: wrong table** (`email_campaigns` → `marketingCampaigns`) | `backend/src/cron/campaign-scheduler.ts:27` | 30 min | — |
| 7 | **Excel export: USD → INR** currency format | `backend/src/services/exports/excel-export.ts:35` | 30 min | — |
| 8 | **Contacts opt-out: missing columns** in schema | `backend/src/db/tenant-schema.ts` | 1 hr | — |
| 9 | **Webhook: tenant DB resolution** on public route | `backend/src/routes/webhooks.ts:34` | 2 hr | — |
| 10 | **Webhook: Twilio signature verification** | `backend/src/routes/webhooks.ts:14` | 1 hr | #9 |

### 1.2 API Contract Fixes (Day 2–3)

Fix all frontend↔backend type mismatches so API calls don't fail at Zod validation.

| # | Fix | Files | Effort | Depends On |
|---|-----|-------|--------|------------|
| 11 | **Events API: POST → PATCH** for reschedule | `desktop/src/lib/api/events.ts:96` | 30 min | — |
| 12 | **Exports API: POST → GET** for contacts export | `desktop/src/lib/api/exports.ts:40` | 30 min | — |
| 13 | **Suppliers compare: POST → GET** method fix | `desktop/src/lib/api/suppliers.ts:129-130` | 30 min | — |
| 14 | **Notification prefs: channel-first → type-first** data format | `settings/notifications/page.tsx:26-56` | 2 hr | — |
| 15 | **Quiet hours: string → integer** time format | `settings/notifications/page.tsx:135-142` | 30 min | #14 |
| 16 | **Communication API contracts** (Send, Template, Document, Bulk shapes) | `desktop/src/lib/api/communications.ts` | 3 hr | — |
| 17 | **Itinerary API contracts** (Send, Clone, Update shapes) | `desktop/src/lib/api/itineraries.ts` | 2 hr | — |
| 18 | **Voucher API types** — align with backend schema | `desktop/src/lib/api/vouchers.ts` | 2 hr | — |

### 1.3 Frontend Critical Fixes (Day 3–5)

| # | Fix | Files | Effort | Depends On |
|---|-----|-------|--------|------------|
| 19 | **Vouchers: complete data model rewrite** — list, detail, create, edit | `vouchers/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx` | 6 hr | #18 |
| 20 | **Supplier detail: field name mismatches** (`.name` → `.company_name`, etc.) | `suppliers/[id]/page.tsx:78,129,134,392-399` | 1 hr | #3 |
| 21 | **Communication: replace mock messages** with API calls | `communication/page.tsx`, `templates/page.tsx`, `bulk-send/` | 4 hr | #16 |
| 22 | **Templates: create API client** and wire CRUD | `desktop/src/lib/api/templates.ts`, config, template pages | 3 hr | #16 |
| 23 | **Reports: remove fallback data**, show error states when API fails | All 12 report pages | 4 hr | — |
| 24 | **Reports hub: use dashboard endpoint** instead of fetching 500 leads + 500 invoices | `reports/page.tsx:174-175` | 1 hr | — |
| 25 | **Dashboard: `/planner` → `/calendar`** link fix | `desktop/src/app/(app)/page.tsx:111` | 10 min | — |
| 26 | **Payments: wire View/Delete handlers** | `payments/page.tsx:188-189` | 1 hr | — |
| 27 | **Payments: fix hardcoded overdueCount** | `payments/page.tsx:69` | 30 min | — |
| 28 | **Fleet trip detail: replace mock data** | `fleet/trips/[id]/page.tsx:124-151` | 2 hr | — |
| 29 | **Sidebar: dynamic notification badge** (replace `badge: 7`) | `sidebar.tsx:117` | 1 hr | — |

### Phase 1 Exit Criteria
- [ ] All backend routes return correct data from tenant DB
- [ ] No API calls fail due to method/type mismatches
- [ ] No pages display mock/hardcoded data as real data
- [ ] All CRUD operations complete successfully
- [ ] `npm run build` passes with no type errors

---

## Phase 2: UX Anti-Pattern Fixes (P1 — Poor UX)

> **Goal:** Every page follows the UX contract. Users see names not IDs, forms are searchable, lists are paginated.
> **Estimated effort:** 12–16 developer-days
> **Issues addressed:** 52 items (IMPROVEMENTS.md #28–#79)

### 2.1 Shared Infrastructure (Day 1–2)

Build once, use everywhere.

| # | Fix | Effort |
|---|-----|--------|
| 1 | **Verify/enhance `useInfiniteScroll`** hook at `desktop/src/hooks/use-infinite-scroll.ts` | 2 hr |
| 2 | **Verify/enhance `FilterBar`** component at `desktop/src/components/domain/filter-bar.tsx` | 2 hr |
| 3 | **Verify/enhance `Combobox`** component at `desktop/src/components/ui/combobox.tsx` | 2 hr |
| 4 | **Create `SkeletonTable` / `SkeletonCard`** loading components | 2 hr |
| 5 | **Create `EmptyState`** component with illustration slot + CTA button | 1 hr |

### 2.2 List Page Upgrades (Day 3–7)

Apply shared components systematically. Each page takes ~2 hours.

| Pages | Changes Per Page |
|-------|-----------------|
| Invoices, Payments, Vouchers | +InfiniteScroll, +FilterBar, +Skeleton, +EmptyState |
| Suppliers, Travellers, Visa | +InfiniteScroll, +FilterBar, +Skeleton, +EmptyState |
| Tasks, Notifications, Templates | +InfiniteScroll, +FilterBar, +Skeleton, +EmptyState |
| Campaigns, Segments, Communication | +InfiniteScroll, +FilterBar, +Skeleton, +EmptyState |
| Rate Cards, Fleet (Vehicles, Drivers, Trips) | +InfiniteScroll, +FilterBar, +Skeleton, +EmptyState |
| Marketing Campaigns, Fleet Alerts | +InfiniteScroll, +FilterBar, +Skeleton, +EmptyState |

**~22 pages × 2 hr = 44 hr (6 days)**

### 2.3 Form Page Upgrades (Day 7–10)

| Pages | Changes |
|-------|---------|
| Invoices/new | Contact → Combobox, Lead → Combobox, +URL params |
| Itineraries/new | Lead → Combobox, Supplier → Combobox |
| Vouchers/new | Lead → Combobox, Supplier → Combobox |
| Visa/new | Traveller → Combobox, Country → Combobox, default status → `not_started` |
| Tasks (create) | +assignedTo, +category, +leadId fields with Combobox |
| Calendar (create) | +location, +recurrence, +all_day, +color, +lead fields |
| Fleet/trips/new | Vehicle → Combobox, Driver → Combobox, +passenger, +lead, +instructions |
| Suppliers/new | PhoneInput, AddressAutocomplete, fix category enum, send all fields |
| Rate Cards (new, edit) | Supplier → Combobox |
| Communication/compose | Recipient → Contact Combobox, fix attachment upload |
| Campaigns/new | Template → Combobox |

**~15 forms × 2 hr = 30 hr (4 days)**

### 2.4 Specific UX Fixes (Day 10–12)

| # | Fix | Files | Effort |
|---|-----|-------|--------|
| 1 | **Raw IDs → names**: Tasks (leadId, assignedTo), Calendar (leadId), Fleet (vehicleId) | 5 pages | 4 hr |
| 2 | **Invoices: GST/Tax breakdown** on detail page | `invoices/[id]/page.tsx` | 3 hr |
| 3 | **Invoices: use SendMessageDialog** instead of custom | `invoices/[id]/page.tsx:399-416` | 1 hr |
| 4 | **Vouchers: use SendMessageDialog** | `vouchers/[id]/page.tsx` | 1 hr |
| 5 | **Invoices PDF: branded header, QR, bank details, amount in words** | `invoices/[id]/page.tsx:93-194` | 6 hr |
| 6 | **Tasks: dedicated detail page** with subtasks + comments | New `tasks/[id]/page.tsx` | 6 hr |
| 7 | **Tasks: status enum alignment** (pending/completed → todo/done) | `desktop/src/lib/api/tasks.ts:10` | 1 hr |
| 8 | **Calendar: all 7 event types** + event editing | `calendar/page.tsx` | 4 hr |
| 9 | **Travellers: pre-fill edit form**, implement delete | `travellers/[id]/page.tsx`, `travellers/page.tsx` | 2 hr |
| 10 | **Fleet: license badge expiry check**, documents tab, vehicle edit | Fleet pages | 4 hr |
| 11 | **Fleet rate cards: remove `@ts-ignore` text** from JSX | `fleet/rate-cards/new/page.tsx` | 30 min |
| 12 | **Fleet dashboard: use `/fleet/dashboard` endpoint** | `fleet/page.tsx` | 1 hr |
| 13 | **Debit notes: fix CreditNote → DebitNote** import | `debit-notes/page.tsx:15` | 10 min |
| 14 | **Communication: real contact info** instead of hardcoded | `communication/[contactId]/page.tsx:79-83` | 2 hr |
| 15 | **Campaign detail: real recipients** from API | `campaigns/[id]/page.tsx` | 2 hr |
| 16 | **Notification deep linking** on click | `notifications/page.tsx:50-52` | 2 hr |
| 17 | **Import wizard: real column mapping** from uploaded file | `import/page.tsx:39-47` | 3 hr |

### Phase 2 Exit Criteria
- [ ] All list pages use `useInfiniteScroll` + `FilterBar` + `SkeletonTable`
- [ ] All relation fields use searchable `Combobox`
- [ ] No raw UUIDs visible to users
- [ ] All `SendMessageDialog` usages standardized
- [ ] All `PhoneInput` / `AddressAutocomplete` usages applied
- [ ] `npm run build` passes

---

## Phase 3: Polish & Enhancements (P2 — Nice to Have)

> **Goal:** Professional-grade UX with power-user features.
> **Estimated effort:** 10–12 developer-days
> **Issues addressed:** 41 items (IMPROVEMENTS.md #80–#120)

### 3.1 Cross-Cutting Enhancements (Day 1–3)

| # | Enhancement | Effort |
|---|-------------|--------|
| 1 | **Detail drawer** component + add to all list pages | 4 hr (component) + 1 hr/page |
| 2 | **Hover action icons** (Eye, Edit, Trash) on table rows | 2 hr (pattern) + 30 min/page |
| 3 | **Empty state** illustrations and contextual CTAs | 2 hr (assets) + 30 min/page |
| 4 | **Keyboard shortcuts** (Ctrl+N create, / focus search, Enter open) | 4 hr |
| 5 | **Bulk selection + operations** (delete, export, status change) | 6 hr |
| 6 | **Unsaved changes guard** on all form pages | 3 hr |

### 3.2 Report Enhancements (Day 3–5)

| # | Enhancement | Effort |
|---|-------------|--------|
| 7 | **`ReportPageTemplate`** shared layout component | 4 hr |
| 8 | **`ReportDataTable`** with sort + pagination | 3 hr |
| 9 | **Period comparison toggle** with % change arrows | 4 hr |
| 10 | **Custom date range picker** | 3 hr |
| 11 | **Loading skeletons** for charts and tables | 2 hr |
| 12 | **Reports hub: search, favorites, recently viewed** | 4 hr |

### 3.3 Calendar & Tasks Polish (Day 5–7)

| # | Enhancement | Effort |
|---|-------------|--------|
| 13 | **Week/Day views** with hourly timeline | 8 hr |
| 14 | **Drag-and-drop rescheduling** | 6 hr |
| 15 | **Team/My calendar toggle** | 2 hr |
| 16 | **"Today" button** | 30 min |
| 17 | **Tasks: list view** alongside Kanban | 4 hr |
| 18 | **Tasks: subtask progress bars** | 2 hr |
| 19 | **Tasks: comments thread** with user avatars | 4 hr |
| 20 | **Tasks: overdue red tint** + badge | 1 hr |

### 3.4 Feature-Specific Polish (Day 7–10)

| # | Enhancement | Effort |
|---|-------------|--------|
| 21 | **Itinerary auto-save** every 30 seconds | 3 hr |
| 22 | **Itinerary pricing engine** (group/child discounts) | 6 hr |
| 23 | **Invoice type selector** (Tax/Proforma) | 2 hr |
| 24 | **Invoice bank details** from settings | 2 hr |
| 25 | **Invoice auto-populate** from URL params | 1 hr |
| 26 | **Rich HTML editor** for email compose | 6 hr |
| 27 | **Draft auto-save** for compose | 2 hr |
| 28 | **Keyboard shortcuts** (Ctrl+Enter to send) | 1 hr |
| 29 | **Real-time notification polling** (60s interval) | 3 hr |
| 30 | **Notification dropdown** from bell icon | 3 hr |
| 31 | **Supplier star rating widget** | 2 hr |
| 32 | **Supplier reconciliation tools** | 4 hr |
| 33 | **Visa Kanban view** | 4 hr |
| 34 | **Visa status pipeline stepper** | 3 hr |
| 35 | **Marketing template gallery** with categories | 3 hr |
| 36 | **"My Flyers" gallery** | 2 hr |
| 37 | **Segment contact count preview** | 2 hr |
| 38 | **Fleet vehicle type filter chips** | 1 hr |
| 39 | **Fleet availability-aware selection** | 4 hr |
| 40 | **Fleet trip Kanban drag-and-drop** | 4 hr |
| 41 | **Sidebar dynamic badges** (Leads, Tasks, Invoices) | 3 hr |

### Phase 3 Exit Criteria
- [ ] All list pages have detail drawer, hover actions, empty state
- [ ] Calendar supports week/day views
- [ ] Tasks have list view + comments
- [ ] Reports use shared template components
- [ ] `npm run build` passes

---

## Phase 4: Missing Features & E2E Coverage

> **Goal:** Implement remaining ticket features and achieve comprehensive test coverage.
> **Estimated effort:** 15–20 developer-days
> **Issues addressed:** 40+ missing features + 13 E2E specs

### 4.1 Missing Feature Implementation (Day 1–12)

Ordered by dependency and business impact.

#### Tier 1 — High Impact (Day 1–5)

| Feature | Milestone | Backend | Frontend | Effort |
|---------|-----------|---------|----------|--------|
| Voucher PDF Generation | M11 | Build | Build | 2 days |
| Visa Document Upload to R2 | M13 | Build | Build | 1.5 days |
| Visa Status Pipeline & History | M13 | Build | Build | 1.5 days |
| Supplier Document Upload | M12 | Build | Build | 1.5 days |
| Report Dashboard Widgets | M15 | Build | Build | 1.5 days |
| Unsubscribe Management (GDPR) | M9 | Build | Build | 1.5 days |

#### Tier 2 — Medium Impact (Day 5–9)

| Feature | Milestone | Backend | Frontend | Effort |
|---------|-----------|---------|----------|--------|
| Payment Receipt PDF | M7 | Build | Build | 1 day |
| Multilingual PDF Generation | M6 | Build | Build | 1.5 days |
| WhatsApp Quick Replies | M8 | Build | Build | 1 day |
| Email Signature Settings | M9 | Build | Build | 1 day |
| Vehicle Documents/Maintenance UI | M18 | Done | Build | 1 day |
| Fleet Trip Cost Management UI | M18 | Done | Build | 1 day |
| Opted-Out Contacts Management | M17 | Partial | Build | 1 day |
| Festival Offers Campaigns | M17 | Build | Build | 1.5 days |

#### Tier 3 — Lower Impact (Day 9–12)

| Feature | Milestone | Backend | Frontend | Effort |
|---------|-----------|---------|----------|--------|
| Multi-Channel Template Adaptation | M8 | Build | Build | 1.5 days |
| Supplier FTS5 Search | M12 | Build | Build | 1 day |
| Supplier Import/Export | M12 | Build | Build | 1 day |
| Traveller-to-Contact Linking | M13 | Build | Build | 1 day |
| Missing Document Alerts | M13 | Build | Build | 1 day |
| Notification Deep Linking | M10 | Done | Build | 0.5 day |
| Custom Admin Announcements UI | M10 | Done | Build | 0.5 day |
| Calendar Drag-and-Drop wiring | M14 | Done | Build | 0.5 day |
| Team Calendar Toggle | M14 | Done | Build | 0.5 day |
| Vehicle Availability Calendar | M18 | Done | Build | 0.5 day |
| Voucher from Itinerary UI | M11 | Done | Build | 0.5 day |
| Voucher Bulk Send UI | M11 | Done | Build | 0.5 day |
| Marketing Dashboard | M17 | Partial | Build | 0.5 day |

### 4.2 E2E Test Validation (Day 12–15)

All 13 spec files exist but haven't been validated against a live environment.

| Step | Action | Effort |
|------|--------|--------|
| 1 | Set up local backend + frontend test environment | 4 hr |
| 2 | Fix auth helpers for test tenant provisioning | 2 hr |
| 3 | Run each spec, fix selectors and assertions | 1 hr/spec × 13 = 13 hr |
| 4 | Add missing happy-path scenarios per milestone | 2 hr/spec × 13 = 26 hr |
| 5 | Add error/edge-case scenarios for P0 fixes | 1 hr/milestone × 13 = 13 hr |
| 6 | Set up CI pipeline for automated test runs | 4 hr |

### Phase 4 Exit Criteria
- [ ] All missing Tier 1 and Tier 2 features implemented
- [ ] All 13 E2E specs pass against live backend
- [ ] Each milestone has ≥5 test scenarios covering CRUD + edge cases
- [ ] CI pipeline runs E2E on every PR
- [ ] `npm run build` passes with no warnings

---

## Execution Summary

| Phase | Focus | Issues | Effort | Cumulative |
|-------|-------|--------|--------|------------|
| **Phase 1** | P0 Critical Fixes | 27 | 8–12 days | 8–12 days |
| **Phase 2** | P1 UX Anti-Patterns | 52 | 12–16 days | 20–28 days |
| **Phase 3** | P2 Polish | 41 | 10–12 days | 30–40 days |
| **Phase 4** | Missing Features + E2E | 40+ features, 13 specs | 15–20 days | 45–60 days |

### Recommended Approach

1. **Phase 1 first, no exceptions.** These are data corruption and security bugs. Ship a hotfix release after Phase 1.
2. **Phase 2 can be parallelized** — list page upgrades and form page upgrades can be done by different developers simultaneously since they touch different files.
3. **Phase 3 is incremental** — each enhancement is independent. Prioritize based on user feedback.
4. **Phase 4 features should follow the existing pipeline** — audit → fix → validate per feature group.

### Quick Wins (< 30 minutes each)

These can be shipped immediately for instant improvement:

- Dashboard `/planner` → `/calendar` link (#25)
- Debit notes `CreditNote` → `DebitNote` import (#13 in 2.4)
- Fleet rate cards remove `@ts-ignore` from JSX (#11 in 2.4)
- Events API POST → PATCH (#11 in 1.2)
- Exports API POST → GET (#12 in 1.2)
- Suppliers compare POST → GET (#13 in 1.2)
- Excel export `$` → `₹` (#7 in 1.1)
- Quiet hours string → integer (#15 in 1.2)
- Campaign scheduler table name fix (#6 in 1.1)
- Payments overdue count (#27 in 1.3)
