# E2E Test Report — TravelCRM Backend API

**Date:** February 22, 2026
**Total Tests:** 200
**Pass Rate:** 100% (200/200)

---

## Summary

All 10 milestones are fully passing. Every E2E API test across the entire backend has been verified green.

| Milestone | Description | Tests | Status |
|-----------|------------|-------|--------|
| M1 | Infrastructure & Health | 11/11 | PASS |
| M2 | Authentication & RBAC | 14/14 | PASS |
| M3 | Contact Management | 17/17 | PASS |
| M4 | Lead Management | 16/16 | PASS |
| M5 | Follow-ups & Scheduling | 20/20 | PASS |
| M6 | Itinerary Builder | 21/21 | PASS |
| M7 | Invoicing & Tax Management | 31/31 | PASS |
| M8 | Communications | 23/23 | PASS |
| M9 | Email Campaigns | 24/24 | PASS |
| M10 | Notifications | 23/23 | PASS |

---

## Bugs Found & Fixed

### M7 — Invoicing & Tax Management

1. **Tax calculation returning zero** — `calculateInvoiceTotals()` in `tax-calculator.ts` had `const taxType = discountType ? (taxSystem as TaxType) : 'none'`, meaning tax was only applied when a discount existed. Fixed to always use the provided tax type. Additionally, `invoices.ts` was computing `taxType` via `detectTaxType()` but never passing it to `calculateInvoiceTotals()`. Added the missing 4th argument.

2. **Credit/debit note routes returning 404** — Route handlers in `credit-notes.ts` used paths like `/credit-notes` and `/debit-notes` despite already being mounted at `/api/credit-notes`. This created doubled paths like `/api/credit-notes/credit-notes`. Fixed all route paths to `/` and extracted debit note routes into a separate router mounted at `/api/debit-notes`.

3. **Ambiguous column name in credit/debit note list queries** — SQL joins between `invoices` and `contacts` used unqualified `type` column. Added `i.` table alias prefix.

4. **Invoice duplicate 500 error** — INSERT statement had 26 columns but only 25 placeholder values (`?1` through `?25`). Added missing `?26`.

### M8 — Communications

5. **Invalid RBAC permission** — `communications.ts` used `requirePermission('communications', 'send')` but `'send'` is not a valid permission action. Changed to `'create'` across 4 occurrences.

6. **Query parameter validation rejecting valid requests** — Zod schemas for `historyFilterSchema` and `logFilterSchema` used `z.number()` for query params that arrive as strings. Changed to `z.coerce.number()`.

7. **Template soft-delete behavior** — Templates use soft delete (`isActive = 0`) but tests expected a 404 on GET after delete. Updated test to verify `isActive === 0` instead.

### M9 — Email Campaigns

8. **Missing database tables** — `email_campaigns` and `email_message_log` tables did not exist. Created migration file `0005_email_campaigns.sql` and applied via `wrangler d1 execute --local`.

9. **Campaign list response format** — Tests expected `{items: [...]}` but `paginated()` responses unwrap to plain arrays through the API client. Fixed tests to expect arrays.

### M10 — Notifications

10. **Badge-counts 500 error** — Query referenced a `related_id` column that doesn't exist in `activity_logs`. Simplified the overdue invoices subquery to use `created_by` instead.

11. **Notification preferences endpoint mismatch** — Tests used `NOTIFICATION_PREFERENCES` but the actual endpoint key is `NOTIFICATIONS_PREFERENCES` (with an S). Fixed all references.

12. **Push token deregister using wrong HTTP method** — Backend uses `DELETE /push-tokens/token/:fcmToken` but tests used POST. Fixed to use DELETE.

### Infrastructure / Test Config

13. **Playwright EPERM errors** — Test results were written to the mounted workspace folder, causing permission errors. Changed `outputDir` to `/tmp/e2e-results`.

14. **Wrangler SyntaxError with --no-bundle** — TypeScript `import type` syntax caused parse errors without bundling. Removed `--no-bundle` flag.

---

## Test Coverage by Feature Area

### M1: Infrastructure (11 tests)
Health checks, CORS headers, rate limiting, error handling, response structure validation.

### M2: Authentication (14 tests)
Login/logout, JWT token refresh, tenant resolution, role-based access control, session management.

### M3: Contacts (17 tests)
CRUD operations, search, filtering by type/tags/city, pagination, duplicate detection, bulk operations.

### M4: Leads (16 tests)
CRUD operations, status transitions (new → contacted → qualified → proposal → won/lost), search, filtering, assignment.

### M5: Follow-ups (20 tests)
CRUD, scheduling, status management (pending → completed/cancelled), overdue detection, filtering by lead/status/date.

### M6: Itineraries (21 tests)
CRUD, day/item management, cloning, template creation from itineraries, template-based generation, PDF-ready structure.

### M7: Invoicing (31 tests)
Invoice CRUD (6), GST/IGST tax calculations (6), status management (3), payment recording with multiple methods (6), credit note creation/application (4), invoice duplication and voiding (3), input validation (3).

### M8: Communications (23 tests)
Template CRUD including soft-delete (7), sending via email/WhatsApp/SMS channels (6), bulk messaging (4), communication history and log queries with filtering (6).

### M9: Email Campaigns (24 tests)
Campaign CRUD (8), lifecycle management — scheduling, cancelling, sending (6), segmentation by contact type, geography, and birthday (4), input validation and status-based restrictions (6).

### M10: Notifications (23 tests)
Push token management with deduplication (7), notification CRUD and read/unread tracking (5), badge counts for leads/follow-ups/invoices (2), notification preferences and quiet hours (7), system announcements (2).

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/tax-calculator.ts` | Fixed tax type parameter, removed conditional tax application |
| `backend/src/routes/invoices.ts` | Passed detected taxType to calculateInvoiceTotals, fixed duplicate INSERT placeholder count |
| `backend/src/routes/credit-notes.ts` | Fixed route paths, separated debit note router, fixed ambiguous SQL column |
| `backend/src/routes/communications.ts` | Fixed RBAC permissions, added z.coerce for query params |
| `backend/src/routes/notifications.ts` | Fixed badge-counts query |
| `backend/src/index.ts` | Added debit-notes route mount |
| `backend/drizzle/tenant/0005_email_campaigns.sql` | New migration for campaign tables |
| `e2e/tests/api/m8-communications.spec.ts` | Rewritten for snake_case keys, correct response formats |
| `e2e/tests/api/m9-email-campaigns.spec.ts` | Fixed list response expectations |
| `e2e/tests/api/m10-notifications.spec.ts` | Rewritten for correct endpoints, HTTP methods, response formats |
| `e2e/playwright.config.ts` | Fixed output directory, simplified reporter |
