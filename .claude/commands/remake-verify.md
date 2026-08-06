# Phase 3: VERIFY — one real E2E spec for one slice

Slice: **$ARGUMENTS**

## Read first

1. `desktop/audit/remake/slices/$ARGUMENTS.json` — scope, pages, endpoints, `existingSpecs`, `seedHelpers`.
2. `desktop/e2e/helpers/auth.ts` and `desktop/e2e/helpers/api-seed.ts` — the infrastructure you must reuse.

Do not read `CONTRACT.md` unless you need a selector convention. Do not read other slices' specs.

## Deliverable

**Exactly one file: `desktop/e2e/$ARGUMENTS.spec.ts`.**

The pipeline gates on that literal path — if you write it anywhere else or name it anything else, the job fails.

It **replaces** every spec listed in `existingSpecs` for this feature. Those are milestone-named duplicates (the repo has two overlapping numbering schemes for the same features). Before deleting them, read them and **carry forward every distinct assertion**. Losing coverage is a failure even if the new spec passes.

Delete the old spec files once their assertions are merged.

## Test infrastructure

- Config: `desktop/playwright.config.ts` — baseURL `http://localhost:3100`, storage state pre-authenticated by `global-setup.ts`, `workers: 1`.
- Auth helpers: `loginViaUI`, `getAuthToken`, `waitForLoad`, `navigateTo` from `./helpers/auth`.
- Seeders: `seedContact`, `seedLead`, `seedItinerary`, `seedInvoice`, `seedSupplier`, `seedVoucher`, `seedTask`, `seedTraveller`, `seedVehicle`, `seedDriver`, `seedStickyNote`, `seedBookmark`, `seedRateCard`, `seedItineraryTemplate`, `seedPayment`, `seedCreditNote`, `seedCampaign`, `seedEmailTemplate`, plus generic `api(method, path, body)` from `./helpers/api-seed`.
- Credentials: `admin@demo.com` / `Admin@123`, tenant `01960000-0000-7000-8000-000000000001`, API `http://localhost:8787/api/v1`. Already wired into the helpers — do not re-declare them.
- `navigateTo(page, href)` takes an href like `/leads`, not a display name.
- Backend reset: `POST /api/v1/test/reset` (requires `TEST_MODE=true`). Use it in `beforeAll` **only** if your slice needs a clean slate; it wipes shared data and other specs run in the same session.

## What a real test looks like

Every entity in this slice gets the full round trip:

1. Create through the **form UI**, filling every field — not via a seeder shortcut.
2. Assert every filled value appears in the **list**.
3. Open the detail view; assert every value is present.
4. Open the edit form; assert every value is **pre-filled**.
5. Edit, save, assert the change persisted.
6. Delete, assert it is gone.
7. Search and filter actually narrow the results.
8. Relation fields are comboboxes — assert typing filters the options and that no raw ID input exists.
9. Outbound messaging opens `SendMessageDialog`; assert there is no `mailto:` / `wa.me` / `tel:` anchor on the page.
10. Export downloads a file; assert it is non-empty.
11. Infinite scroll loads more rows on scroll.
12. The empty state renders when filters match nothing.

## Fake E2E — never do this

- `page.goto()` followed by a title assertion. Proves nothing.
- Asserting a page "loads" without interacting with a form.
- Hardcoding entity IDs into URLs.
- `expect(true).toBe(true)`, or a test whose only assertion is that no exception was thrown.
- Weakening or `skip`-ing an assertion to make a run go green.

## Gated features

If your manifest lists `gates`, the plan flags may or may not be enabled on the demo tenant. Write the spec to assert the **correct behavior either way**: either the working feature, or a disabled/upgrade affordance. A 403 rendering as an error toast is a bug — fail the test on it.

## Fix code, not tests

Run `cd desktop && npx playwright test e2e/$ARGUMENTS.spec.ts --reporter=list` until green.

When a test fails, the **product** is wrong by default. Fix the page. Only change the test when the test itself encodes a wrong expectation, and say so explicitly in your summary. You may edit files in this slice's `fileAllowlist` to fix real defects you find.

## Finish

Summarize in 10 lines or fewer: which old specs you merged and deleted, how many assertions the new spec has, what you had to fix in the product, and anything still failing.
