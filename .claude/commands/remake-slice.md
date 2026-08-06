# Phase 2: SLICE — rebuild one feature area

Slice: **$ARGUMENTS**

## Read exactly two files first

1. `desktop/audit/remake/CONTRACT.md` — the design system you must build on.
2. `desktop/audit/remake/slices/$ARGUMENTS.json` — your scope, your file allowlist, your UX-contract checklist.

That is your context budget. It is deliberate.

## Hard scope limits

- **Only edit files matching `fileAllowlist` in your manifest.** Nothing else.
- **No repo-wide `Glob` or `Grep`.** The inventory phase already did that; its answers are in your manifest. Searching the whole repo is how a slice job blows its context and gets killed.
- **Do not read other slices' pages, manifests, or specs.**
- **Do not touch `backend/`.** If you believe you need a backend change, stop and say so in your summary instead.
- **Do not change function signatures, request shapes, or response shapes in `desktop/src/lib/api/*.ts`** — they are verified against the backend and covered by colocated `*.test.ts` files. You may *add* functions for endpoints listed as `orphaned` in your manifest, and you may add types.
- Do not edit `desktop/e2e/**`. That is the verify phase's job.

## What to do

### If `status` is `"existing"`
Migrate every page in `pages` onto the archetypes from `CONTRACT.md`. Delete the bespoke layout markup, tables, and form scaffolding it replaces. Every `false` in the manifest's `uxContract` object is a defect you must fix.

### If `status` is `"new"`
Build the pages listed in `newPages` from scratch against the endpoints in `endpoints`, to exactly the same standard. A new feature gets the full archetype treatment — a list page with filters and infinite scroll, a real form with relation comboboxes, a detail view. Not a stub.

### Either way
- Add the slice to `desktop/src/components/layout/sidebar.tsx` if it is not navigable. A page nobody can reach does not count.
- If any page in this slice imports `@/lib/mock-data` or `@/lib/fleet-mock-data`, that feature is **not implemented**. Wire it to the real API. Removing the mock import without implementing the API call is a failure, not a fix.
- Wrap gated features (`gates` in your manifest) in `useFeatureGate`. A 403 must render an upgrade/disabled state, never an error toast.
- Every env-dependent feature degrades gracefully. Never crash on a missing key.

## The UX contract — every box must end up checked

**List pages:** `PageHeader` with total count → `FilterBar` → `DataTable` with hover row actions (Eye / Pencil / Phone / Mail / Trash2) → `useInfiniteScroll` (not load-all, not numbered pages) → detail drawer on row click → `EmptyState` with a create CTA → skeleton loading → bulk select + bulk actions → themed export covering the **full filtered dataset**, not just loaded pages.

**Form pages:** `RelationCombobox` for every relation field — **a raw text input for an ID is always a bug** → prefill from URL search params → `PhoneInput` / `AddressAutocomplete` / `CurrencyInput` / `DatePicker` by field type → inline validation → required indicators → sectioned layout → sticky Save/Cancel → unsaved-changes guard.

**Detail pages:** title + status badge + actions dropdown → Overview / Activity / Related / Documents tabs → activity timeline → related entities → all messaging via `SendMessageDialog`.

**Universal:** tokens only (no raw hex or px) → light and dark → keyboard navigable with visible focus → loading via `Skeleton`, errors via `sonner` toast plus inline for forms.

## Round-trip correctness

This is where the current app fails most often, so check it explicitly for every entity in your slice:

- Every field captured at creation appears in the **list** (or is deliberately excluded), the **detail view**, and **pre-filled in the edit form**.
- Navigating from a parent entity carries context — Contact → New Lead pre-fills the contact.
- Edit saves persist and are reflected without a manual refresh.

## Finish

1. `cd desktop && npx tsc --noEmit` until clean.
2. Update `desktop/audit/remake/slices/$ARGUMENTS.json` — set every `uxContract` boolean to its true post-change value, and rewrite `notes` to describe what remains (empty string if nothing).
3. Summarize in **10 lines or fewer**: files changed, endpoints newly wired, anything you could not do and why.

The pipeline runs `typecheck` and `vitest` itself after you exit and will send a repair job if either fails. Do not run the Playwright suite.
