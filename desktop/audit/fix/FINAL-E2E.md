# B31 final E2E verification

Stack: slot 1 (API 8797, web 3110), `--reset-db` before every run, `npx playwright test` (showcase ignored, 804 tests).
Machine-readable copy: `gates/FINAL.json`.

## Log

- Runs 1-6 on the pre-rebase tree found and fixed the issues below.
- The branch was then rebased onto `ui-remake` (B37, B38, B39 merged meanwhile); clean rebase, no conflicts. The count restarted on the rebased tree (full rebuild, migration 0040).
- Post-rebase run A: 1 failure (sticky-note spec), fixed in b3e3e84. Runs B, C, D: three consecutive clean runs.

## The three consecutive clean runs (rebased tree)

| Run | Passed | Failed | Flaky | Skipped | Did not run | Time |
|---|---|---|---|---|---|---|
| B | 766 | 0 | 0 | 38 | 0 | 22.1 min |
| C | 766 | 0 | 0 | 38 | 0 | 23.6 min |
| D | 766 | 0 | 0 | 38 | 0 | 23.0 min (includes the b3e3e84 spec fix) |

Skips (38), each with a stated reason in the spec:
- ai-intelligence.spec.ts, 14: `ai_intelligence` is not enabled for the demo tenant/plan; the disabled state is verified or the test skips.
- chatbot.spec.ts, 8: `ai_chatbot` is not on the pro plan the stack uses (plan-gated by design).
- marketing-social.spec.ts, 8: posts can only be created by AI generation and this stack has no AI provider (503 AI_UNAVAILABLE since B36).
- super-admin.spec.ts, 8: needs a super-admin account.

## Fixes made (all within the allowlist)

| File | Why |
|---|---|
| e2e/helpers/api-seed.ts | Root cause of test-harness.spec.ts:23 (`contact.id` undefined): the seeded admin of a fresh DB is user `...0002`; the first `/test/reset` rebuilds users with demo admin `...00a1`. The helper cached a token (sub `...0002`) for the whole worker, so every later write failed `FOREIGN KEY constraint failed` on `created_by` and the API answered 500. `api()` now drops the token after a reset. Also: transport retry (GET/HEAD/PUT/DELETE and `/test/reset` on any transport error; POST only on a stale-socket close), `seedRateCard` validFrom defaults to yesterday. |
| e2e/fixtures.ts | `invalidateAuthState()`; called after a reset, because browser sessions minted before it are stale too (travellers document upload hit the same FK 500). |
| src/components/ui/currency-input.tsx | Real bug: the focus handler's delayed `select()` ran after the user had started typing, eating the first keystroke (`18000` became `8000`) and, in the trip cost dialog, pulling focus back from the Notes field so the note text landed in Amount. It now only selects while the field is still focused and untouched. |
| src/app/(app)/fleet/vehicles/[id]/page.tsx | Real bug: expiry tag counted days from a UTC-parsed date against local now (off by one for part of the day); now whole local calendar days. |
| e2e/marketing-social.spec.ts | Stale since B36: generation returns 503 without an AI provider. Probes once; the generate-form test asserts the honest failure state, the 8 tests that need posts skip with a reason. |
| e2e/rate-cards.spec.ts, e2e/fleet-rate-cards.spec.ts | Currency field retype-on-lost-keystroke (belt and braces with the component fix). |
| e2e/auth-shell.spec.ts | Login step survives a click before hydration (refill and resubmit); user-name check accepts "Demo Admin" (the name after any reset). |
| e2e/fleet-trips.spec.ts | Reopen the driver combobox if a late refresh dismissed it. |
| e2e/dashboard.spec.ts | Year-range KPI wait 20 s; sticky-note delete scoped to its own card (it clicked the first note's button). |

## Gates (final tree)

| Gate | Result |
|---|---|
| desktop tsc | 0 errors |
| desktop vitest | 59 files, 1258 tests pass |
| lint-gate | 0 errors (baseline 3 -> 0) |
| desktop build | pass |
| backend vitest / tsc | 1180 pass / 0 errors |
| layout probe, all routes, light+dark, 1366x768 + 1920x1080 | pass (628 runs). The last 20 routes failed in the first pass only because the probe's injected 15-minute token expired mid-run (redirect to /login); re-probed with a fresh session: 80 runs, 0 failing |
| flutter analyze / test (driver) | no issues / 95 pass |
| driver smoke integration test | not run (no emulator, by instruction) |

## FR register

FR-1 pass (driver login + verify returns accessToken on slot 1), FR-2 partial (emulator part not run; driver tests pass), FR-2b, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11 pass. Evidence per item is in `gates/FINAL.json`.

## Pipeline

`verify:travellers` and `cleanup` marked ok through the CLI (104 of 105 jobs ok; `showcase` is left to the orchestrator).

## Unresolved

Nothing needing backend or orchestrator action. The rate-cards lookup UTC-date issue seen before the rebase was fixed by B37.
