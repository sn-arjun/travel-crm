# M8 — Communication Hub: Validation Report

**Date:** 2026-03-08
**Milestone:** M8 — Communication Hub
**E2E Test File:** `desktop/e2e/08-m8-communication.spec.ts`
**Result:** ✅ **43 / 43 tests PASSED**

---

## Test Results Summary

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| A. Message Templates CRUD | 5 | 5 | 0 |
| B. Templates List Page UX | 5 | 5 | 0 |
| C. Communication Log / Inbox | 7 | 7 | 0 |
| D. Per-Contact Chat View | 5 | 5 | 0 |
| E. Compose Page | 2 | 2 | 0 |
| F. Bulk Send Page | 2 | 2 | 0 |
| G. Sidebar Navigation | 4 | 4 | 0 |
| H. API Contract Validation | 5 | 5 | 0 |
| I. Template Form Validation | 4 | 4 | 0 |
| J. Cross-Entity: SendMessageDialog | 3 | 3 | 0 |
| **TOTAL** | **43** | **43** | **0** |

---

## Covered Tickets

| Ticket | Description | Validated By |
|--------|-------------|--------------|
| TICKET-136 | Message Templates CRUD (create, edit, delete, duplicate) | A1–A5, B1–B5, I1–I4 |
| TICKET-138 | Per-Contact Chat View (real API, no mocks) | D1–D5 |
| TICKET-139 | Communication Log / Inbox (channels, FilterBar, API) | C1–C7 |
| TICKET-131 / 134 | Send API contract, send-template, bulk-send | H2–H4 |
| TICKET-147 | Sidebar navigation — Communication section | G1–G4 |

---

## Fixes Applied During Fix + Validate Phases

### Backend
- `backend/src/routes/templates.ts`: Added `GET /templates`, `POST /templates`, `PUT /templates/:id`, `DELETE /templates/:id` (soft delete) routes
- `backend/src/routes/templates.ts`: Fixed `z.coerce.boolean()` for `is_active` query param (Zod rejects string `"1"` from query params with `z.boolean()`)
- `backend/src/routes/templates.ts`: Added default active-only filter (`isActive=1`) when `is_active` not specified
- `backend/src/db/tenant-schema.ts`: Added `messageTemplates` table

### Frontend
- `desktop/src/lib/api/templates.ts`: Created templates API client (list, create, getById, update, delete)
- `desktop/src/lib/api/config.ts`: Added `templates` endpoint section
- `desktop/src/app/(app)/communication/templates/page.tsx`: Replaced hardcoded templates with `useApiQuery` → `templatesApi.list()`, added real delete, real duplicate, FilterBar with search + channel + category filters, Skeleton loading, empty state, error state
- `desktop/src/app/(app)/communication/templates/new/page.tsx`: Replaced `setTimeout` stub with real `templatesApi.create()`, aligned variable format to `{var_name}`
- `desktop/src/app/(app)/communication/templates/[id]/edit/page.tsx`: Replaced mock data with `templatesApi.getById()`, replaced stubs with real `templatesApi.update()` and `templatesApi.delete()`
- `desktop/src/app/(app)/communication/page.tsx`: Added FilterBar with search, channel tab for SMS, `useApiQuery` for real conversation log
- `desktop/src/app/(app)/communication/[contactId]/page.tsx`: Replaced hardcoded contact mock with `contactsApi.getById(contactId)`, real message history from API
- `desktop/src/app/(app)/communication/compose/page.tsx`: Removed `mailto:` links, routes through Communication Hub API
- `desktop/src/app/(app)/communication/bulk-send/page.tsx`: Fixed API contract to match backend schema
- `desktop/src/components/layout/sidebar.tsx`: Added SMS tab and corrected Communication section links
- `desktop/src/components/communication/send-message-dialog.tsx`: Enforces `SendMessageDialog` for all outbound comms

---

## Key Patterns Fixed

1. **React controlled inputs in E2E**: `fill()` does not trigger React `onChange` reliably → use `pressSequentially(value, { delay: 20 })` after `clear()`
2. **Skeleton-based loading detection**: `waitForLoad()` checks `.animate-spin` only; templates page uses Skeleton cards → use `page.waitForResponse()` with URL-specific matching
3. **Soft delete**: `DELETE /templates/:id` sets `isActive=0`; list defaults to `isActive=1` → deleted templates disappear from list automatically
4. **Exact text match for substring names**: When name A is a substring of name B, use `getByText(name, { exact: true })` not `filter({ hasText: name })`

---

## UX Contract Compliance

| Contract | Status |
|----------|--------|
| FilterBar with search on list pages | ✅ |
| Skeleton loading on list pages | ✅ |
| Empty state with CTA | ✅ |
| Error state | ✅ |
| All comms via Communication Hub API (`/communications/send`) | ✅ |
| No direct `mailto:` or `wa.me` links | ✅ |
| Sidebar has all required Communication links | ✅ |
| Real API calls (no hardcoded mock data) | ✅ |

---

## Status: VALIDATED ✅
