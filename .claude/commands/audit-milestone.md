# Phase 1: Audit Milestone (READ-ONLY)

Audit milestone $ARGUMENTS against the desktop codebase. DO NOT modify any code.

## Input
Milestone number (e.g., `5`, `M5`, `m6-10` for range). Normalize to number(s).

## Process

### Step 1 — Read Ticket Spec
Read `product-requirment/jira-tickets-m{N}.md` in full. Extract every ticket into:
- Ticket ID + title
- Required backend (routes, schema fields, validation)
- Required frontend (pages, forms, components)
- Required UX interactions (autofill, dropdowns, communication)
- Acceptance criteria

### Step 2 — Scan Implementation
For EACH ticket check ALL layers:

**Backend** (`backend/src/routes/`, `backend/src/db/tenant-schema.ts`):
- Route exists with correct HTTP methods?
- Schema has all required fields?
- Validation logic present?

**Desktop Pages** (`desktop/src/app/(app)/`):
- Page exists? Calls correct API? Renders all required fields?
- Uses correct components (FilterBar, useInfiniteScroll, DataTable)?

**API Client** (`desktop/src/lib/api/`):
- Has all required CRUD methods?
- Correct endpoint URLs and params?

### Step 3 — UX Anti-Pattern Scan (CRITICAL)
Check every related page for these bugs:

1. **Raw ID inputs** — `<Input>` where user types contactId/leadId/supplierId. MUST be searchable `<Combobox>` calling list API with search param
2. **No infinite scroll** — Page loads all data or uses manual pagination. MUST use `useInfiniteScroll` from `desktop/src/hooks/use-infinite-scroll.ts`
3. **No FilterBar** — Missing search + filter dropdowns. MUST use `FilterBar` from `desktop/src/components/domain/filter-bar.tsx`
4. **No hover actions** — Table rows missing inline icon buttons (Eye, Pencil, Phone, Mail, Trash2 from lucide-react)
5. **No detail drawer** — List pages missing click-to-open slide-over panel
6. **Direct mailto:/wa.me/tel:** — MUST use `SendMessageDialog` from `desktop/src/components/communication/send-message-dialog.tsx`
7. **Placeholder toasts** — Functions that only call `toast()` without real API calls
8. **No loading skeletons** — Missing Skeleton/Spinner during data fetch
9. **No empty states** — Empty list shows blank instead of helpful EmptyState component
10. **No auto-populate** — Creating related entity doesn't prefill from parent context
11. **No form validation** — Required fields not enforced, no inline errors
12. **No env fallback** — Feature crashes if env var missing instead of graceful degradation

### Step 4 — Env Variable Tracking
Find every environment variable this milestone's features need. For each:
- Variable name
- File(s) that use it
- Required or optional?
- What should happen if missing (graceful degradation description)

### Step 5 — UX Improvement Suggestions
For every page in this milestone, suggest concrete UX improvements:
- Layout and spacing consistency
- Missing keyboard shortcuts
- Missing bulk operations
- Missing quick-action buttons
- Information density improvements
- Accessibility gaps

### Step 6 — Classify & Write Report

Write to `desktop/audit/M{N}-audit.md`:

```markdown
# Milestone {N} Audit Report
Generated: {date}
Ticket File: product-requirment/jira-tickets-m{N}.md

## Summary
| Status | Count |
|--------|-------|
| DONE   | X     |
| PARTIAL| X     |
| MISSING| X     |
| BUG    | X     |

## Environment Variables
| Variable | Used In | Required | Fallback When Missing |
|----------|---------|----------|-----------------------|

## UX Anti-Patterns (must fix)
| Page | Anti-Pattern | Fix Required |
|------|-------------|--------------|

## UX Improvements (nice to have)
| Page | Current State | Suggested Improvement | Priority |
|------|--------------|----------------------|----------|

## Ticket Details

### TICKET-XXX: Title — STATUS
**Backend:** status — details
**Frontend:** status — details
**API Client:** status — details
**UX Issues:** list with file paths
**Fix Required:**
1. file:line — change needed
---
```

## Rules
- DO NOT write or edit any code
- Audit EVERY ticket — do not skip
- Be specific about file paths and line numbers
- The ticket is the source of truth
- Flag EVERY UX anti-pattern even if "feature works"
