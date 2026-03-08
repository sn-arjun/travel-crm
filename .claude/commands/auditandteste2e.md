# Universal Ticket Audit, Implementation & E2E Validation Framework

Audit a ticket/milestone specification against the actual codebase, resolve implementation gaps, implement missing functionality, create complete end-to-end UI tests, and verify the system behaves exactly as specified.

This workflow enforces spec-driven development where the ticket document is the primary source of truth.

## Input

$ARGUMENTS

Can be one of:

- Path to a ticket or milestone file (e.g., `product-requirment/M2-auth.md`)
- Audit report file (e.g., `PRD-AUDIT-REPORT.md`)
- Ticket range (e.g., `TICKET-020 to TICKET-040`)

## Source of Truth Hierarchy

All validation must follow this order of authority:

1. **Ticket / PRD document** (PRIMARY SOURCE OF TRUTH)
2. Database schema
3. Backend API contract
4. Frontend implementation
5. Existing tests

If tests contradict tickets — **ticket wins**. Update the test or code accordingly.

---

## Agent Workflow

This process MUST follow a **two-agent model**.

### Planning Agent (Claude Opus 4.6 — High Effort)

Responsible for:

- Understanding ticket scope
- Auditing system state across all layers
- Creating execution plan
- Identifying risks and dependencies
- Generating test coverage plan

The planner **MUST NOT modify code**. It only reads, analyzes, and plans.

**Output:**
- Audit report (Phase 4)
- Implementation plan (Phase 5)
- Test coverage plan (Phase 9)
- UX audit (Phase 15)

**User approval is REQUIRED before execution begins.**

### Execution Agent (Claude Sonnet 4.6)

Responsible for:

- Implementing missing features
- Fixing bugs
- Writing tests
- Running test suites
- Resolving failures

The executor must **strictly follow the approved plan**. Once approved, clear the planning context and use only the plan as context for execution.

---

## Phase 1 — Specification Parsing

1. Read the provided ticket or milestone file.
2. Extract:
   - Functional requirements
   - API contracts
   - UI flows
   - Validation rules
   - Edge cases
   - Success criteria
   - Non-functional requirements
3. Convert tickets into a structured checklist:

| Ticket | Requirement | Expected UI | Expected API | Data Model |
|--------|-------------|-------------|--------------|------------|

---

## Phase 2 — Codebase Mapping

Map each requirement to existing code. Search across:

**Backend:**
- API routes (`backend/src/routes/`)
- Controllers & services (`backend/src/services/`)
- Database schema (`backend/src/db/tenant-schema.ts`, `backend/src/db/master-schema.ts`)
- Migrations (`backend/drizzle/`)
- Validation logic & middleware (`backend/src/middleware/`)

**Frontend (Desktop — Next.js/Electron):**
- Pages (`desktop/src/app/(app)/`)
- Components (`desktop/src/components/`)
- Hooks & stores (`desktop/src/hooks/`, `desktop/src/stores/`)
- API client (`desktop/src/lib/api/`)
- Forms & validation

**Shared:**
- Shared TS types (`packages/shared-ts/`)
- DTOs, validation schemas, API contracts

---

## Phase 3 — Ticket Status Classification

Each ticket must be categorized as:

- **DONE** — Fully implemented. Backend + UI + data flow + API contract + UI behavior all correct.
- **PARTIAL** — Partially implemented. Examples: backend exists but UI missing, UI exists but API missing, fields mismatched, validation missing, navigation missing.
- **MISSING** — No implementation found.
- **BUG** — Feature exists but incorrect. Examples: wrong API endpoint, field mismatch, broken UI, incorrect validation, race conditions, security issues.

---

## Phase 4 — Audit Report

Produce a structured report **before making any changes**.

| Ticket | Status | Issue | Required Fix |
|--------|--------|-------|--------------|

---

## Phase 5 — Implementation Plan

The planning agent must generate a clear execution plan covering:

**Backend work:**
- Routes, controllers, validation, schema changes, migrations

**Frontend work:**
- UI pages, components, API calls, state management, navigation

**Integration work:**
- Wiring API to UI, navigation updates, form field alignment

**Test coverage plan:**
- Unit tests, integration tests, E2E UI tests

---

## Phase 6 — Approval Gate

Execution **MUST NOT begin** until the user approves the plan.

Once approved:
1. Clear planning context
2. Pass only the approved plan as context to the execution agent
3. Start implementation phase using **Sonnet 4.6**

---

## Phase 7 — Implementation (Sonnet 4.6)

For each **PARTIAL**, **MISSING**, or **BUG** ticket:

1. Implement missing backend logic
2. Implement missing UI
3. Fix data mapping issues
4. Align field names with schema
5. Add missing navigation
6. Fix validation
7. Remove placeholder implementations (toast-only functions)
8. Ensure correct API usage
9. Do NOT over-engineer — only fix what the ticket requires

---

## Phase 8 — Unit Testing

Run backend tests:
```
cd backend && npx vitest run
```

Run frontend tests:
```
cd desktop && npx vitest run
```

Fix regressions before continuing.

---

## Phase 9 — UI Flow Coverage Definition

Each feature must have complete UI flow coverage:

1. Navigation to feature
2. Loading initial data
3. Creating data
4. Editing data
5. Deleting data
6. Filtering/searching
7. Error handling
8. Edge cases

Example flow:
```
Open page -> Create item -> Verify list update -> Edit item -> Verify change -> Delete item -> Verify removal
```

---

## Phase 10 — E2E Test Creation

Create Playwright tests that simulate real user behavior.

Tests must:
- Use real UI interactions (clicking buttons, filling forms, submitting actions)
- Avoid internal shortcuts
- Validate actual UI state (rendered results, not API responses)
- Seed test data via API helpers (`desktop/e2e/helpers/api-seed.ts`)

### Playwright Best Practices

**Prefer accessibility selectors:**
```typescript
// Use:
getByRole('button', { name: /Save/i })
getByLabelText('Email')
getByText('Contact Information', { exact: true })
getByPlaceholder(/Search/i)

// Avoid:
page.locator('text=...')  // can match multiple elements
```

**Avoid strict-mode conflicts:**
```typescript
// When elements repeat:
locator.first()
locator.nth(0)
```

**Wait for stable state:**
```typescript
// Use:
waitForLoad(page)         // custom helper — waits for spinners to clear
waitForLoadState('networkidle')
waitForResponse()
waitForSelector()

// NEVER use:
waitForTimeout()          // flaky, timing-dependent
```

**Test data seeding:**
- Seed data via API (`seedContact()`, `seedLead()`, etc.) instead of UI
- Use unique timestamps in names to avoid collisions

**Follow naming convention:** `desktop/e2e/XX-feature-name.spec.ts`

**Infrastructure files:**
- `desktop/playwright.config.ts`
- `desktop/e2e/helpers/auth.ts` (loginViaUI, waitForLoad, navigateTo, getAuthToken)
- `desktop/e2e/helpers/api-seed.ts` (data seeding helpers)
- `desktop/e2e/global-setup.ts` (auth state setup)

---

## Phase 11 — Run E2E Suite

Run full test suite:
```
cd desktop && npx playwright test --reporter=list
```

---

## Phase 12 — Test Failure Triage

When a test fails, follow this order:

**Step 1:** Check the ticket specification. Is the test aligned with the ticket?

**Step 2:** If the test correctly reflects the ticket requirement -> the bug is in the code. Fix the implementation.

**Step 3:** If the test does NOT match the ticket requirement -> update the test to match the spec.

**Step 4:** Review failure artifacts:
- Screenshots (`test-results/*/test-failed-1.png`)
- Traces
- Console logs
- Error context

**Key rule:** The ticket is ALWAYS the source of truth. If a test passes but doesn't match the ticket, the test is wrong. If a test fails but correctly tests the ticket requirement, the code is wrong.

---

## Phase 13 — Test Reliability

Ensure tests are:
- Deterministic
- Isolated
- Independent
- Repeatable

Avoid:
- Shared state between tests
- Timing dependencies
- Environment coupling

---

## Phase 14 — Regression Coverage

Ensure tests cover:
- Happy path
- Validation failures
- Empty states
- API failures
- Permission errors
- Edge cases

---

## Phase 15 — UX Quality Audit

After functional validation, review UX quality:

**Discoverability:**
- Important actions visible without deep menus
- Drawer/side-panel has full action buttons (Edit, Call, WhatsApp, Email, Delete, Create Lead)
- Inline action icons (Call, WhatsApp, Email) visible on table row hover

**Communication Hub:**
- ALL communication (Email, WhatsApp, SMS) routes through Communication Hub (`/communications/send`)
- NEVER use direct `mailto:`, `wa.me`, or `tel:` links
- Template picker shown before sending (channel -> template -> compose -> preview -> send)
- Use `SendMessageDialog` component (`desktop/src/components/communication/send-message-dialog.tsx`)

**Component Reuse:**
- Phone inputs use `PhoneInput` (`@/components/ui/phone-input`) with country code picker
- Address fields use `AddressAutocomplete` (`@/components/ui/address-autocomplete`) with Google Places
- Tag filter in list toolbars alongside type/search filters
- Check for all reusable components before building new ones

**Interaction efficiency:**
- Common actions require minimal clicks
- Delete actions call actual API (not just placeholder toasts)

**Feedback:**
- User receives feedback for: success, failure, loading, validation

**Empty states:**
- Empty pages guide users with helpful messaging

**Form usability:**
- Keyboard navigation works
- Validation messages shown inline
- Autofill supported where applicable

---

## Phase 16 — UX Improvement Report

Present findings in table format:

| Area | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|

User must **approve or reject** each UX suggestion before implementation.

---

## Key Implementation Risks

Common problems to check:

- **API mismatches** — Frontend calling incorrect routes, wrong HTTP methods
- **Field mismatches** — `createdAt` vs `created_at`, `userId` vs `user_id`, `pincode` vs `postalCode`
- **Hydration issues** — Client state mismatches server state (Zustand: start with `isLoading: true`)
- **Placeholder implementations** — Functions that only show toasts without API calls
- **Missing validation** — Backend not enforcing schema constraints
- **Incorrect error handling** — Failures not surfaced to UI
- **Direct communication links** — `mailto:`, `wa.me`, `tel:` used instead of Communication Hub
- **Missing form components** — Plain inputs used instead of `PhoneInput`, `AddressAutocomplete`
- **Incomplete drawers** — Side-panel drawers only display data without action buttons

---

## Communication Hub Rules

ALL outbound communication MUST go through the Communication Hub:

1. **Email**: `communicationsApi.send({ type: 'email', ... })` — NOT `window.open('mailto:...')`
2. **WhatsApp**: `communicationsApi.send({ type: 'whatsapp', ... })` — NOT `window.open('https://wa.me/...')`
3. **SMS**: `communicationsApi.send({ type: 'sms', ... })` — NOT direct provider links
4. **Call**: Can use VoIP dialer route (`/communication/calls/dial?phone=...`) since it goes through the call system
5. **Template Flow**: Channel selection -> Template picker (with "write custom" option) -> Compose/edit -> Preview -> Send
6. Use `SendMessageDialog` at `desktop/src/components/communication/send-message-dialog.tsx`

---

## Component Library

Use these existing components when building features:

- `PhoneInput` — `@/components/ui/phone-input` (Popover/Command country code picker + phone input)
- `AddressAutocomplete` — `@/components/ui/address-autocomplete` (Google Places, uncontrolled input, reverse geocode fallback for postal code)
- `SendMessageDialog` — `@/components/communication/send-message-dialog` (channel -> template -> compose -> preview -> send, scrollable template list)
- `CurrencyInput` — `@/components/ui/currency-input`
- `DatePicker` — `@/components/ui/date-picker`
- `MultiStepWizard` — `@/components/ui/multi-step-wizard`
- `EmptyState` — `@/components/ui/empty-state`

---

## Project-Specific Notes

- Backend: Cloudflare Workers + Hono.js at `backend/src/`
- Desktop: Next.js (Electron) at `desktop/src/`
- Playwright config: `desktop/playwright.config.ts` (base URL: localhost:3100, API: localhost:8787)
- Auth helper: `desktop/e2e/helpers/auth.ts` — `loginViaUI()` does 2-step login (email -> password)
- Global setup saves auth state to `desktop/e2e/.auth/admin.json`
- Admin credentials: `admin@demo.com` / `Admin@123`
- Tenant ID: `01960000-0000-7000-8000-000000000001`
- Google Maps API key: Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` for address autocomplete
- Templates API: Backend at `/templates` (CRUD) — Desktop uses local fallback templates + backend API
- DB: Cloudflare D1 (SQLite), UUIDv7 for all IDs
- ORM: Drizzle with `sqliteTable`

---

## Final Report

After completion, output:

**Audit Summary:**

| Status | Count |
|--------|-------|

**Test Results:**

| Total Tests | Passed | Failed |
|-------------|--------|--------|

**Remaining Issues** (if any)

---

## Outcome

This framework ensures:

- Spec-driven implementation (tickets are law)
- Full UI flow validation
- Reliable, deterministic E2E testing
- No hidden feature gaps
- High UX quality
- Two-agent separation (Opus 4.6 plans, Sonnet 4.6 executes)
- Test failures triaged against source of truth before fixing
