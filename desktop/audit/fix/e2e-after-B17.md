# E2E after B17 (slot 1, fresh DB, full suite `npx playwright test`)

Counts (798 tests incl. `e2e/showcase/smoke.spec.ts`, which the default config also picks up):
**745 passed, 7 failed, 23 skipped, 23 did not run** (26.1 min).
After isolated re-runs of the 6 non-showcase failures: 3 pass (flaky/order-dependent), 3 remain (below).
The 23 "did not run" are the tail of `test.describe.serial` blocks after a failure (documents, import-export, marketing-social, fleet-trips, chatbot) plus the showcase smoke dependants.

## Remaining failures (worklist for B18-B29 / B31)

| spec:line | error | classification |
|---|---|---|
| documents.spec.ts:27 (:105) | after rename, `text=Renamed-<ts>` not visible. The list search box still holds the OLD name, so the refreshed list filters the renamed row out. | STALE spec (not in B17 allowlist). Fix in the spec: clear/re-fill search with the new name before asserting. Owner: B29 (documents) or B31. |
| import-export.spec.ts:508 (:522) | Import history type filter "Travellers": the unrelated `contacts-...-settings.csv` row is still shown. `historyFetcher` in `src/app/(app)/settings/import/page.tsx` filters on `filterType` but is a stable `useCallback`; the list is not re-fetched/filtered when the filter changes (check its deps / refreshKey). | REAL-APP-BUG -> **B29** (import page) |
| marketing-social.spec.ts:301 (:333) | Festival card toggle: `text=<festival>` + `locator('../../..')` no longer contains the Activate/Deactivate button (card DOM). Spec not in B17 allowlist. | STALE locator / possibly B25 restyle -> **B25** (update spec with the new card testid/structure) |

## Failed in full run, passed in isolation (FLAKY / ENV)

| spec:line | error in full run | classification |
|---|---|---|
| chatbot.spec.ts:86 | seed POST `/chatbot` -> 403 `ai_chatbot` not on `pro` plan; passes in isolation (a feature flag toggled by an earlier AI-settings spec changes the plan gate) | ENV-plan-gate / order-dependent; B28 / B31 should make the spec set its flag |
| fleet-trips.spec.ts:494 | `fetch failed: SocketError other side closed` in `seedVehicle` | FLAKY (wrangler dev dropped a connection) |
| test-harness.spec.ts:23 | `contact.id` undefined right after a failed seed (same API hiccup) | FLAKY |
| communication-inbox.spec.ts:45/:80/:92 (seen once in the B17 gate run) | passed in the full run and in isolation | FLAKY |

## Outside scope

| spec | error | classification |
|---|---|---|
| showcase/smoke.spec.ts:14 | `assertClean` banned text `E2E` in the dashboard activity feed ("created lead E2E Reports Lead ...") because the full suite seeds `E2E-` data into the same DB | ENV (showcase belongs to the showcase agent; run on a clean DB; not part of the "ALL minus showcase" gate) |

## STALE specs fixed by B17

campaigns.spec.ts C1; communication-inbox.spec.ts C3-note, D3-note, D3 (strong locator); auth-shell.spec.ts user menu (sidebar-user-menu testid + real name "Admin User"), help-center tests (file-level logged-out storageState; they now sign in); super-admin.spec.ts sidebar gating; contacts.spec.ts custom-field New Field `.first()`; fleet-vehicles.spec.ts rows/scroll region/empty row; ai-business-intelligence.spec.ts briefing mock and export gating; travellers.spec.ts E.164 phone and Link Contact strictness; invoices.spec.ts export success and forced-failure tests; whatsapp-campaigns.spec.ts plan-gated seeding.

Lint: `lint-gate` fails on 3 pre-existing files in `e2e/showcase/` (demo-data.ts, demo-seed.ts, finalize.ts, 1 error each, not in baseline); none of the B17 files regress.
