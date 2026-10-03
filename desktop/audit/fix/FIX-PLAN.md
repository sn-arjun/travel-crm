# TravelCRM Pro — Fix Plan (Agent 2a, planner)

Generated 2026-10-03 on branch `ui-remake` (HEAD `9e45368`).

Inputs:
- `desktop/audit/fix/BUGS.md` and `bugs.json` (87 bugs, 10 of them P0)
- `desktop/showcase/STORYBOARD.md` §0.4 (FR-1..FR-11) and §D.6 (driver widget keys)
- `desktop/audit/remake/CONTRACT.md`
- The approved plan (Agent 2 section)

The plan has **32 batches** (`B00`–`B31`) in **5 lanes** and **8 waves**. Each batch is a self-contained JSON file in `desktop/audit/fix/batches/`.

Every bug has exactly one **owner batch**, which is accountable for closing it. Some bugs also list **contributing batches**, which change files the owner cannot touch. One bug is deferred, with a reason.

---

## 1. Overview

### What changed versus the approved B0–B9 shape

1. **B0 is split into three batches.**
   - Tooling (`B00`)
   - Token refresh (`B01`)
   - E2E harness isolation (`B09`)

   Tooling and refresh can run in parallel. The harness batch codemods every spec, so it has to land before any batch that edits specs.

2. **The backend is split into four batches.** They run in their own lane and are all flagged `backend:true`.
   - `B02`: the migration chain plus the Flutter contract. This restores the test baseline first.
   - `B08`: driver auth, phones, IST "today", CORS and travellers.
   - `B12`: route bugs, readable validation errors, `whoami` and `contactId` filters.
   - `B15`: UUIDv7.

3. **The archetypes are split by file ownership.**
   - Tokens and primitives (`B06`)
   - Shell (`B07`)
   - API envelope (`B11`)
   - List (`B14`)
   - Form and dates (`B16`)

   These five are mostly sequential, because each one touches pages the next one touches.

4. **Per-page bugs and the token/archetype sweeps are merged into 12 page-group batches** (`B18`–`B29`, wave W6).
   - Each page group owns a disjoint set of files.
   - It fixes its functional bugs **and** brings its files to the contract in the same pass, which means zero ESLint errors, ds tokens, `PageContainer`, DatePicker/CurrencyInput/RelationCombobox, `useConfirm`, and a clean layout probe.
   - All 12 can run in parallel worktrees.
   - `B30` then cleans the shared files and verifies the cross-cutting bugs.

5. **Lint is a per-file ratchet, not "0 errors".**
   - The planner made ESLint load with a native flat config and ran it over `src/`. It found **1216 errors** (817 `no-explicit-any`, 276 contract-rule hits and 109 unused vars) across 200 files.
   - B00 also adds a raw-palette rule (for example `bg-gray-100`), and there are about 600 more of those sites.
   - So the rule is: no file may gain errors, every batch's owned files must reach 0 (`lintZero`), and `B30` drives the whole app to 0.

6. **The driver app has three batches:**
   - `B03`: functional fixes and widget keys
   - `B10`: polish
   - `B13`: tests, plus an emulator proof that uses the TEST_MODE OTP

7. **Shared tooling is introduced once** (in B00) and used by every gate:
   - `desktop/scripts/fix-stack.mjs`: an isolated stack per slot
   - `desktop/scripts/fix-gates.mjs`: runs a batch's gates and stores the **tail** of each output
   - `desktop/scripts/layout-probe.mjs`: replaces Agent 1's throwaway crawler with a reusable check
   - `desktop/scripts/lint-gate.mjs`: the ratchet

### Lanes

| Lane | Batches | Notes |
|---|---|---|
| desktop | B00 B01 B06 B07 B11 B14 B16 B18–B30 | Archetype chain is sequential; W6 is 12-way parallel |
| backend | B02 B08 B12 B15 | `backend:true`; keep `cd backend && npx vitest run` ≥ baseline; never break `packages/shared` / `packages/crm_app` |
| driver | B03 B10 B13 | Flutter via x86 PowerShell only |
| tests | B04 B09 B17 B31 | Unit-test repair, harness, stale specs, final triage |
| pipeline | B05 | `scripts/remake-pipeline.js` hygiene |

---

## 2. Dependency diagram and waves

```
W1  B00 tooling ─┬──────────────┐      B01 auth ─┐     B02 backend-migr ──┐   B03 driver-fn ──┐   B04 unit-tests ─┐   B05 pipeline
                 │              │                │                        │                   │                   │
W2  B06 tokens ◄─┤  B07 shell ◄─┘  B09 harness ◄─┴─(B00)   B08 backend-driver ◄─┘   B10 driver-ui ◄─┘                   │
                 │       │                │                        │                     │                         │
W3               └──► B11 envelope ◄──────┼── (B04, B06, B07, B08) ├─► B12 backend-routes  └─► B13 driver-tests ◄─(B08)
                              │           │                        │
W4                     B14 list ◄─────────┘ (B06,B07,B09,B11)      └─► B15 uuidv7
                              │
W5                     B16 form+dates      B17 stale-specs ◄─(B07,B09,B14)
                              │                   │
W6   ┌────────────────────────┴───────────────────┴─────────────────────────────────────────┐
     B18 dashboard  B19 contacts*  B20 leads*  B21 itineraries  B22 money  B23 fleet*  B24 reports*
     B25 marketing* B26 comms*     B27 settings*  B28 ai  B29 entities*        (* also need B12 / B08 / B02)
     └────────────────────────────────────────────┬──────────────────────────────────────────┘
W7                                         B30 shared sweep (lint → 0)
W8                                         B31 final e2e + gates  ◄─(B13, B15, B05)
```

**Waves:** a wave starts when every batch it depends on has merged. Batches in the same wave have disjoint files and may run at the same time in separate git worktrees.

| Wave | Run in parallel | Concurrency notes |
|---|---|---|
| W1 | B00, B01, B02, B03, B04, B05 | Only one desktop stack (slot 0) is usable before B08 lands (CORS) and before B09 (ports). B01 starts it with the manual recipe in §4.3 |
| W2 | B06, B07, B08, B09, B10 | Desktop browser checks stay on slot 0 until B08 merges. Give B06 and B07 separate turns on slot 0, or let them share the running stack after each rebuild |
| W3 | B11, B12, B13 | B13 uses slot 0 plus the emulator. B11 uses slot 1, which is fine once B08 has merged |
| W4 | B14, B15 | |
| W5 | B16, B17 | Slots 0 and 1 |
| W6 | B18–B29 | **At most 4 at a time** (slots 0–3). Suggested order, heaviest first: B21, B24, B19, B20 → B23, B18, B27, B25 → B22, B26, B29, B28 |
| W7 | B30 | Runs alone |
| W8 | B31 | Runs alone |

After each batch: the orchestrator runs `node desktop/scripts/fix-gates.mjs <ID>` in the merged checkout, then commits `fix(<ID>): <title>`, and then ratchets the baselines (see §5.3).

---

## 3. Executor rules (every batch)

1. **Read before editing:** your batch JSON (all fields), this file's §3–§5, `desktop/audit/remake/CONTRACT.md`, and the bug entries in `bugs.json`/`BUGS.md` for your `bugIds`.
2. **Only edit files in `filesAllowlist`.** Never edit anything in `mustNotTouch`. If you need a change elsewhere:
   - W6 batches write it to `desktop/audit/fix/requests/<ID>.md`.
   - Other batches stop and report it.
3. **Do not commit, push, rebase or `git add -A`.** The orchestrator commits. Leave the work tree with your changes only.
4. **Backend rules** apply only when `backend:true`:
   - Drizzle + D1 (SQLite) types: TEXT ISO dates, REAL money, INTEGER booleans, TEXT JSON.
   - New migrations go in `backend/drizzle/tenant/` with the next number. Taken so far: 0035 = festival_campaigns (B02), 0036 = travellers email/phone (B08).
   - New database ids use `generateId()` (UUIDv7).
   - Add tests for every new behaviour.
   - Before changing any response shape, grep `packages/shared/lib` and `packages/crm_app/lib`. Changes must be additive for Flutter.
5. **Flutter:** run it only via `"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd <abs path>; flutter ..."`.
6. **Never touch:**
   - `desktop/e2e/showcase/**`, `desktop/playwright.showcase.config.ts` and `desktop/showcase/**` (these belong to the showcase agent)
   - `backend/.dev.vars`
   - `product-requirment/`
7. **No new npm or pub dependencies** unless the batch says so. No batch currently does, apart from the `integration_test` SDK dependency in B03.
8. **User-visible text:** use realistic English. Never write "E2E", "Showcase", "Test " or lorem in app code; the showcase quality gate rejects them.
9. **Final report**, delivered as your final message and not as a file:
   - A summary of the changes
   - Files changed
   - Each gate's result, with the last lines of any failing output
   - Deviations from the batch steps, with the reason for each
   - Pre-existing failures you saw that belong to other batches
   - Requests for shared changes
10. **Time-box:** if a gate still fails after two honest fix attempts, stop and report rather than widening scope.

---

## 4. Worktree bootstrap and runtime stack

### 4.1 Fresh worktree (parallel batches)

Run these from the worktree root `<WT>`. `C:\Users\Admin\Downloads\pro\CRM` is the main checkout.

```bash
# node_modules are not in git; junction them from the main checkout (no npm install)
cmd //c mklink /J "<WT>\\node_modules"          "C:\\Users\\Admin\\Downloads\\pro\\CRM\\node_modules"
cmd //c mklink /J "<WT>\\desktop\\node_modules"  "C:\\Users\\Admin\\Downloads\\pro\\CRM\\desktop\\node_modules"
cmd //c mklink /J "<WT>\\backend\\node_modules"  "C:\\Users\\Admin\\Downloads\\pro\\CRM\\backend\\node_modules"
# untracked config
cp C:/Users/Admin/Downloads/pro/CRM/backend/.dev.vars  <WT>/backend/.dev.vars
cp C:/Users/Admin/Downloads/pro/CRM/desktop/.env.local <WT>/desktop/.env.local
# driver batches only (x86 PowerShell)
"C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -Command "cd <WT>/packages/driver_app; flutter pub get"
```

A fresh worktree has no local D1 state. Its first `fix-stack up` therefore creates it, applies migrations and seeds the admin (`admin@demo.com` / `Admin@123`, tenant `01960000-0000-7000-8000-000000000001`).

### 4.2 Stack slots (after B00)

```bash
cd desktop
node scripts/fix-stack.mjs up --slot <N> [--reset-db] [--no-build]
#   slot N → API http://localhost:(8787+10N)/api/v1, web http://localhost:(3100+10N)
#   TEST_MODE=true, Twilio/SendGrid blanked, production build (next build (Turbopack) + next start)
export E2E_BASE_URL=http://localhost:3100 E2E_API_URL=http://localhost:8787/api/v1   # printed by `up`
node scripts/fix-gates.mjs <BATCH_ID> --slot <N>
node scripts/fix-stack.mjs down --slot <N>
```

- **Before B08 merges:** only slot 0 works for browser tests, because CORS only allows `localhost:3100`.
- **Before B09 merges:** Playwright ignores `E2E_*`, so use slot 0.
- **Rebuild after every code change** before running specs or the probe: `up --no-build` skips the build, and plain `up` rebuilds.
- **Main checkout:** its local D1 was hand-patched by earlier jobs. After B02 merges, the orchestrator runs `up --slot 0 --reset-db` once.

### 4.3 Manual stack (W1, before `fix-stack.mjs` exists)

```bash
cd backend && node -e "<strip [ai] from wrangler.toml → .wrangler-e2e.toml>  (same as desktop/playwright.config.ts)"
npx wrangler dev --port 8787 -c .wrangler-e2e.toml --var TEST_MODE:true &
cd ../desktop && NEXT_PUBLIC_API_URL=http://localhost:8787/api/v1 npx next build && npx next start -p 3100 &
```

---

## 5. Gates

### 5.1 Baselines (measured 2026-10-03)

| Check | Baseline | Target |
|---|---|---|
| Desktop `npx tsc --noEmit` | 99 errors: 0 in app `src/`, 97 in unit tests, 2 in e2e | 0 after B01, B04 and B09 |
| Desktop `npx vitest run` | 10 failing files (`src/lib/api/{ai,auth,chatbot,client,credit-notes,exports,marketing,payments,users,vouchers}.test.ts`); 19 failed / 1085 passed tests | 0 failing after B01 and B04 |
| Desktop ESLint | Crashes on load. With a native config: 1216 errors / 5142 warnings, before the palette rule | Ratchet → 0 at B30 |
| Desktop build | `next build` (Turbopack) fails on the webpack() hook | `npm run build` passes (B00) |
| Backend `npx vitest run` | 16 failed / 14 passed files; 268 passed / 676 skipped | 0 failed files, ≥ 901 passed (B02), then ≥ the previous count |
| E2E (795 tests) | 560 passed / 179 failed (164 of them auth cascade) / 10 skipped / 46 did not run | 0 failed (B31) |
| Driver | `flutter analyze` clean; placeholder test only | analyze clean, ≥ 25 real tests, emulator smoke (B13) |

The numbers live in `desktop/audit/fix/gate-baseline.json` and `lint-baseline.json`, which B00 creates. **Only the orchestrator ratchets them**, after each merge. Exception: B16 regenerates `lint-baseline.json` after it adds the date-idiom rule.

### 5.2 Gate semantics (fields of `gates` in each batch JSON)

| Field | Command | Pass condition |
|---|---|---|
| `typecheck` | `cd desktop && npx tsc --noEmit` | 0 errors in non-test `src/` files, and test/e2e errors ≤ `gate-baseline.tscTestErrors` |
| `unit` | `cd desktop && npx vitest run` | No failing file outside `gate-baseline.vitestFailingFiles` |
| `lint` | `node scripts/lint-gate.mjs` | No file's error count rises above `lint-baseline.json`, and no new file has errors |
| `lintZero` | `node scripts/lint-gate.mjs --zero <globs>` | Every file matching the batch's globs has 0 errors |
| `build` | `cd desktop && npm run build` | Exit 0 |
| `backendTests` | `cd backend && npx vitest run` | 0 failed files, and passed ≥ `gate-baseline.backendPassedMin` |
| `flutter` | x86 PowerShell: `flutter analyze` then `flutter test` in `packages/driver_app` | "No issues found" and all tests pass |
| `specs` | `npx playwright test <specs>` against the batch's slot | 0 failures, except entries in `allowedSpecFailures` (each names the batch that owns the fix). `["ALL"]` means the full suite minus `e2e/showcase/` |
| `layoutProbe` | `node scripts/layout-probe.mjs --routes …` at 1366×768 and 1920×1080, light and dark | No console or page errors, no horizontal overflow, gutter ≥ 16px, no nested scrollers outside `[data-scroll-region]`/dialogs/popovers, non-empty top-bar title. `["ALL"]` means every route |

Wave-1 batches run before `fix-gates.mjs` exists, so they run the commands above by hand. `lint` does not apply to them.

### 5.3 Orchestrator loop per batch

1. Launch the executor (Sonnet) with the batch JSON. W6 batches and other parallel batches run in a worktree.
2. Merge the worktree, then run `fix-gates.mjs <ID>` on the merged tree.
3. Commit `fix(<ID>): …`.
4. Ratchet the baselines (`lint-gate --update`, plus lower `tscTestErrors`, `vitestFailingFiles` and `backendPassedMin`).
5. If a gate fails, run one repair attempt (Sonnet). Give it the tail from `desktop/audit/fix/gates/<ID>.json`.
6. If it still fails, send it back to the planner.

**Final gate (after B31):**
- The full desktop e2e suite is green, including `travellers.spec.ts`.
- `layout-probe --routes ALL` is clean.
- Backend and driver gates are green.
- Every FR detection check passes.
- `state.json` shows 105 jobs ok.

---

## 6. Batch table

Column notes:
- **est** is the estimated number of files touched.
- **PG** is the parallel group, the same as the wave. Batches in one PG may run concurrently.
- **BE** marks backend batches.

| ID | Title | Lane | BE | Wave/PG | dependsOn | Bugs | FRs | est |
|---|---|---|---|---|---|---|---|---|
| [B00](batches/B00-desktop-tooling.json) | Desktop tooling: working ESLint + contract rules, build script, gate runner, stack launcher, layout probe | desktop |  | W1 | — | 037 038 | — | 9 |
| [B01](batches/B01-auth-single-flight.json) | Single-flight, cross-tab-safe token refresh (session no longer dies) | desktop |  | W1 | — | 001 | FR-11 | 6 |
| [B02](batches/B02-backend-migrations-contract.json) | Backend: repair the migration chain and restore the Flutter CRM API contract | backend | yes | W1 | — | 002 003 030 031 063 082 | — | 14 |
| [B03](batches/B03-driver-functional.json) | Driver app: login, trips, vehicle display, Android permissions, document upload, widget keys | driver |  | W1 | — | 007 009 010 036 065 | FR-2 FR-2b FR-4 | 18 |
| [B04](batches/B04-unit-tests-repair.json) | Desktop unit tests: fix the 7 stale vitest files and the unit-test tsc errors | tests |  | W1 | — | 079 080 | — | 17 |
| [B05](batches/B05-pipeline-hygiene.json) | Remake pipeline hygiene: output tails, backendFrozen on verify, scoped git add, ignores | pipeline |  | W1 | — | 068 085 | — | 2 |
| [B06](batches/B06-tokens-primitives.json) | One palette: map legacy shadcn colours onto ds tokens, define missing vars, fix dialog/tooltip/empty-state primitives | desktop |  | W2 | B00 | 023 024 044 078 | — | 25 |
| [B07](batches/B07-app-shell.json) | App shell: page gutter, sidebar (real user, super-admin gating, single active item), top bar (theme, search, titles), Escape loop, notification click | desktop |  | W2 | B00 | 016 017 018 019 020 021 022 047 049 071 075 | FR-3 FR-9 | 16 |
| [B08](batches/B08-backend-driver-auth-travellers.json) | Backend: driver OTP bypass (TEST_MODE), phone normalisation, IST "today", CORS, traveller email/phone | backend | yes | W2 | B02 | 005 008 035 064 083 | FR-1 FR-2 | 14 |
| [B09](batches/B09-e2e-harness.json) | E2E harness: refresh-safe per-test auth state, port parametrisation, next start | tests |  | W2 | B00, B01 | 039 | FR-11 | 58 |
| [B10](batches/B10-driver-ui-polish.json) | Driver app UI polish to client-presentable standard (indigo brand, consistent inputs, status chips, timeline, states) | driver |  | W2 | B03 | 066 | — | 22 |
| [B11](batches/B11-api-envelope.json) | Desktop API envelope + casing normalisation (one unwrap helper; visa/travellers, notifications, users, tasks, lead notes) | desktop |  | W3 | B04, B06, B07, B08 | 026 062 | — | 20 |
| [B12](batches/B12-backend-route-fixes.json) | Backend route bugs: route shadowing, report SQL, campaign recipients, readable validation errors, lead assignment, whoami, contactId filters | backend | yes | W3 | B08 | 027 028 029 061 070 | — | 50 |
| [B13](batches/B13-driver-tests-emulator.json) | Driver app: real unit/widget tests, integration smoke test, emulator walk-through proof | driver |  | W3 | B10, B08 | 084 | FR-2 | 15 |
| [B14](batches/B14-list-archetype.json) | List archetype: stable fetcher, real sort, error state, refreshKey, sticky header, no virtualisation jump, export errors | desktop |  | W4 | B06, B07, B09, B11 | 011 012 013 040 055 069 | — | 32 |
| [B15](batches/B15-backend-uuidv7.json) | Backend: UUIDv7 for every DB primary key (replace crypto.randomUUID) | backend | yes | W4 | B12 | 081 | — | 15 |
| [B16](batches/B16-form-archetype-dates.json) | Form archetype: save errors surface, live re-validation, local dates everywhere, DatePicker month/year, Combobox fixes | desktop |  | W5 | B14 | 014 015 032 041 042 077 | — | 65 |
| [B17](batches/B17-stale-specs.json) | Update stale / brittle specs (templates now load, real user name, super-admin gating, AI mock, robust locators) | tests |  | W5 | B07, B09, B14 | 086 087 | — | 8 |
| [B18](batches/B18-dashboard-calendar.json) | Dashboard + calendar: real data only, working controls, readable calendar | desktop |  | W6 | B16, B17 | 025 051 | — | 12 |
| [B19](batches/B19-contacts.json) | Contacts: real related data on detail, correct facts, EntityForm create/edit | desktop |  | W6 | B16, B17, B12 | 004 046 054 | — | 10 |
| [B20](batches/B20-leads-followups-tasks.json) | Leads, follow-ups, tasks: copy, required-field hints, header layout, unassigned option, Book transfer | desktop |  | W6 | B16, B17, B12 | 043 056 076 | FR-7 | 14 |
| [B21](batches/B21-itineraries-messaging.json) | Itineraries + templates + sharing: builder fixes, rate-card picker, New template, Communication Hub sharing with filled placeholders | desktop |  | W6 | B16, B17 | 033 034 059 060 | FR-5 FR-6 FR-10 | 10 |
| [B22](batches/B22-money.json) | Invoices, payments, credit/debit notes, vouchers, accounts: invoice detail facts, confirms, locale dates | desktop |  | W6 | B16, B17 | 053 | — | 20 |
| [B23](batches/B23-fleet.json) | Fleet: readable trip labels, working availability/top drivers, trip type + lead prefill, human timeline | desktop |  | W6 | B16, B17, B08, B12 | 052 | FR-7 FR-8 | 22 |
| [B24](batches/B24-reports.json) | Reports: no crashes, tokenised hub, real date ranges, single scroller | desktop |  | W6 | B16, B17, B12 | 006 | — | 16 |
| [B25](batches/B25-marketing-campaigns.json) | Marketing + campaigns: festivals restyle, campaign template picker, themed confirms | desktop |  | W6 | B16, B17, B02, B12 | — | — | 32 |
| [B26](batches/B26-communication-chatbot.json) | Communication hub + calls + chatbot: analytics reachable, relation pickers, sweep | desktop |  | W6 | B16, B17, B12 | — | — | 22 |
| [B27](batches/B27-settings-superadmin.json) | Settings + Super Admin: page headers, hub links to orphan pages, signature page scroll, notification preferences | desktop |  | W6 | B16, B17, B12 | — | — | 37 |
| [B28](batches/B28-ai-pages.json) | AI pages: gate-correct, tokenised, archetype layout | desktop |  | W6 | B16, B17 | — | — | 25 |
| [B29](batches/B29-entities-misc.json) | Travellers, visa, suppliers, rate cards, documents, bookmarks, notifications, help, import, onboarding | desktop |  | W6 | B16, B17, B08 | — | — | 28 |
| [B30](batches/B30-shared-sweep-lint-zero.json) | Shared sweep: ESLint to zero, cross-cutting contract checks, all-route layout probe | desktop |  | W7 | B18, B19, B20, B21, B22, B23, B24, B25, B26, B27, B28, B29 | 045 048 050 057 058 072 073 074 | — | 60 |
| [B31](batches/B31-final-e2e-triage.json) | Final: full E2E suite, residual triage, all gates, mark remake jobs resolved | tests |  | W8 | B30, B13, B15, B05 | — | FR-1 FR-2 FR-3 FR-5 FR-6 FR-7 FR-8 FR-9 FR-10 FR-11 | 15 |

### File ownership in W6 (parallel page groups)

| Batch | Owns (`desktop/src/…`) |
|---|---|
| B18 | `app/(app)/{dashboard,calendar}/**`, `components/domain/{ai-daily-briefing,ai-health-score,ai-recommendations,stat-card,sticky-notes-widget}.tsx`, `components/domain/dashboard/**`, `lib/api/{events,sticky-notes}.ts` |
| B19 | `app/(app)/contacts/**`, `lib/api/contacts.ts`, `components/domain/duplicate-detection-dialog.tsx` |
| B20 | `app/(app)/{leads,follow-ups,tasks}/**`, `components/domain/{lead-lost-dialog,pipeline-card,kanban-board}.tsx`, `lib/api/follow-ups.ts` |
| B21 | `app/(app)/itineraries/**`, `components/domain/share-panel.tsx`, `components/communication/send-message-dialog.tsx`, `lib/api/itineraries.ts` |
| B22 | `app/(app)/{invoices,payments,credit-notes,debit-notes,vouchers,accounts}/**`, `components/domain/{payment-receipt,hsn-code-picker}.tsx`, `lib/api/{invoices,payments,credit-notes,vouchers,exports,hsn-codes}.ts` |
| B23 | `app/(app)/fleet/**`, `components/domain/fleet/**`, `lib/api/fleet.ts` |
| B24 | `app/(app)/reports/**`, `components/domain/{report-page-template.tsx,reports/**}`, `lib/api/reports.ts` |
| B25 | `app/(app)/{marketing,campaigns}/**`, `components/domain/marketing/**`, `lib/api/{marketing,campaigns,whatsapp-campaigns}.ts` |
| B26 | `app/(app)/{communication,chatbot}/**`, `components/domain/{call-controls-panel,call-transcript-panel,click-to-call-button,compose-modal}.tsx`, `lib/api/{communications,voip,chatbot,templates}.ts` |
| B27 | `app/(app)/{settings,super-admin}/**`, `lib/api/settings.ts` |
| B28 | `app/(app)/ai/**`, `components/domain/{ai-assistant-panel,ai-extraction-review,ai-feature-gate}.tsx`, `components/domain/ai/**`, `lib/api/{ai,ai-extractions}.ts` |
| B29 | `app/(app)/{travellers,visa,suppliers,rate-cards,documents,bookmarks,notifications,help,import,onboarding}/**`, `components/domain/file-upload.tsx`, `lib/api/{suppliers,rate-cards,documents,bookmarks,imports}.ts` |
| B30 (W7) | Everything else in `desktop/src`: `components/ui/**`, `components/layout/**`, the shared `components/domain/*`, `hooks/**`, `stores/**` and the remaining `lib/**`, plus any W6 leftovers |

Each W6 batch may also edit the e2e specs for its own area, but only where a behaviour it changed requires it. Shared helpers (`e2e/helpers/**`, `e2e/fixtures.ts`) are frozen in W6.

---

## 7. FIX-REQ register → batches

| FR | Blocking | Needed for | Fixed in | Proven in | Detection (STORYBOARD §0.4) |
|---|---|---|---|---|---|
| FR-1 | yes | Scene 7 | B08 | B31 | POST /driver/login then /login/verify with {phone:'+919876543210', tenantId, otp:'123456'} returns accessToken (TEST_MODE only) |
| FR-2 | yes | Scene 7 | B03 (pagination, tenantId, nested vehicle, manifest), B08 (IST today) | B13 (smoke_login_test on emulator), B31 | integration test dry run passes; Today tab lists a trip created today |
| FR-2b |  | Scene 7 | B03 | B13 | grep -r "Key('send-otp')" packages/driver_app/lib (all D.6 keys) |
| FR-3 | yes | every desktop shot | B07 | B31 | sidebar footer shows the logged-in user (Ananya Menon in the demo seed) |
| FR-4 |  | Scene 7 | B03 | B13 | integration_test in driver_app pubspec dev_dependencies |
| FR-5 |  | Scene 4 | B21 | B31 | "Quotation Email" body has no [Destination] / [Amount] |
| FR-6 |  | Shot 3.7, walkthrough | B21 | B31 | rate-card picker rows show real names and non-zero cost |
| FR-7 |  | Scene 6 | B23 (Trip type select + URL prefill), B20 (lead "Book transfer") | B31 | trip form has "Trip type"; lead detail has "Book transfer" |
| FR-8 |  | Shot 8.2 | B23 | B31 | trip timeline row for check_in reads "Checked in" |
| FR-9 |  | Shot 1.2 | B07 (click routing), B11 (normalised fields) | B31 | clicking a bell notification navigates |
| FR-10 |  | Walkthrough templates | B21 | B31 | /itineraries/templates has "New template" |
| FR-11 |  | Story token life | B01 (single flight), B09 (fresh e2e auth) | B01 token-refresh.spec, B31 | expired access token + navigation keeps the user logged in; 30-min idle survives |

---

## 8. Coverage matrix (bug → owner batch)

The owner is accountable for closing the bug: its acceptance checks prove the fix. Contributors change files the owner cannot touch.

| Bug | Sev | Platform | Title | Owner | Contributing |
|---|---|---|---|---|---|
| BUG-001 | P0 | desktop | Token refresh race logs the user out | **B01** | B09 (fresh e2e auth per test) |
| BUG-002 | P0 | backend | Migration 0033_flyers_simplify fails on a fresh database; backend test suite collapses | **B02** | — |
| BUG-003 | P0 | backend | Migration 0030 (contacts opt-out columns) was quarantined out of the chain — contact inserts fail on a fresh DB | **B02** | — |
| BUG-004 | P0 | desktop | Contact detail renders mock itineraries, payments and documents | **B19** | — |
| BUG-005 | P0 | backend | Traveller email/phone silently discarded; frequent-flyer PUT mapping wrong | **B08** | B11 (client type/normalisation), B29 (traveller form + travellers.spec) |
| BUG-006 | P0 | desktop | Reports customer / team / visa pages crash with "Application error" | **B24** | — |
| BUG-007 | P0 | driver | Driver login impossible: missing tenantId -> 400, then error handler throws and spinner hangs forever | **B03** | B08 (backend accepts X-Tenant-Id fallback) |
| BUG-008 | P0 | backend | No OTP bypass without Twilio: /driver/login returns 500 "Failed to send OTP" | **B08** | B13 (emulator proof) |
| BUG-009 | P0 | driver | Trip list never loads (pagination.offset null) and load-more pages wrong | **B03** | B13 (tests + emulator proof) |
| BUG-010 | P0 | driver | AndroidManifest has no location permissions; no cleartext policy | **B03** | B13 (emulator check-in proof) |
| BUG-011 | P1 | desktop | Contacts & Invoices lists stop at the first page; count badge shows 0 | **B14** | — |
| BUG-012 | P1 | desktop | List sort does nothing | **B14** | — |
| BUG-013 | P1 | desktop | ListPage refetches on any parent re-render, shows fetch errors as empty state, no refresh() | **B14** | — |
| BUG-014 | P1 | desktop | Failed saves are silent (no toast, no inline error) | **B16** | — |
| BUG-015 | P1 | desktop | Dates saved one day early in IST | **B16** | — |
| BUG-016 | P1 | desktop | Theme toggle bypasses next-themes; choice lost on reload | **B07** | — |
| BUG-017 | P1 | desktop | Top-bar "Search…" button does nothing | **B07** | — |
| BUG-018 | P1 | desktop | Pressing Escape triggers infinite recursion ("Maximum call stack size exceeded") | **B07** | — |
| BUG-019 | P1 | desktop | Sidebar highlights parent and child at once (49 routes) | **B07** | — |
| BUG-020 | P1 | desktop | Hard-coded user "Arjun" in sidebar footer, dashboard greeting and AI briefing | **B07** | — |
| BUG-021 | P1 | desktop | Super Admin link visible to every tenant admin; its empty state is invisible in dark mode | **B07** | B06 (empty-state tokens), B12 (GET /admin/whoami) |
| BUG-022 | P1 | desktop | No page gutter / max-width on 101 of 187 routes | **B07** | B18–B29 (non-archetype pages adopt PageContainer), B30 (all-route probe) |
| BUG-023 | P1 | desktop | Orange shadcn palette instead of indigo ds-primary; orange/indigo mixed on 27 routes; primary buttons fail contrast | **B06** | — |
| BUG-024 | P1 | desktop | CSS variables referenced but never defined | **B06** | — |
| BUG-025 | P1 | desktop | Dashboard shows fabricated KPIs and dead controls | **B18** | — |
| BUG-026 | P1 | desktop | Lead notes show "Unknown · Invalid Date" | **B11** | — |
| BUG-027 | P1 | backend | Static routes shadowed by /:id routes (calls analytics, vehicle availability, rate-card lookup) | **B12** | B23, B26 (consumers verify) |
| BUG-028 | P1 | backend | Report SQL errors: fleet_utilization, lead_response_time, followup_compliance | **B12** | B24 (pages verify) |
| BUG-029 | P1 | backend | Campaign recipients endpoint 500 (no such column m.sent_at) | **B12** | B25 (campaign detail verifies) |
| BUG-030 | P1 | backend | Festival campaigns: route added in verify phase but table never migrated (500) | **B02** | — |
| BUG-031 | P1 | backend | Verify-phase backend edits broke the Flutter CRM app contract | **B02** | — |
| BUG-032 | P1 | desktop | Combobox: invalid Tailwind v4 width class, filters by value not label, selected label disappears while searching | **B16** | — |
| BUG-033 | P1 | desktop | Itinerary detail: raw JSON destination, broken tabs bar, header actions overflow at 1366 | **B21** | — |
| BUG-034 | P1 | desktop | Itinerary Templates has no create action | **B21** | — |
| BUG-035 | P1 | backend | Phone numbers stored in mixed formats; driver lookup is exact match | **B08** | B03 (app sends E.164) |
| BUG-036 | P1 | driver | Trip card/detail read flat vehicleRegistration but backend sends nested vehicle.registration | **B03** | B13 (tests) |
| BUG-037 | P1 | desktop | ESLint does not run; contract lint rules unenforced | **B00** | — |
| BUG-038 | P1 | desktop | `npm run build` / `build:electron` fail on Next 16 | **B00** | — |
| BUG-039 | P1 | desktop | E2E harness reuses one storageState (one rotating refresh token) for the whole 56-min run | **B09** | B01 (single flight) |
| BUG-040 | P2 | desktop | DataTable sticky header never sticks; >200 rows switches to 600px inner scroll (page jump) | **B14** | — |
| BUG-041 | P2 | desktop | Stale validation errors (214/262 setValue calls without shouldValidate) | **B16** | — |
| BUG-042 | P2 | desktop | DatePicker only navigates month-by-month | **B16** | — |
| BUG-043 | P2 | desktop | Follow-up "Schedule" button disabled with no hint | **B20** | — |
| BUG-044 | P2 | desktop | Dialogs have no max-height / internal scroll | **B06** | — |
| BUG-045 | P2 | desktop | Native window.confirm() instead of ConfirmDialog | **B30** | B19 (contacts), B22 (credit/debit notes), B25 (campaigns) |
| BUG-046 | P2 | desktop | Client-side filtering over 100–1000 rows (dashboard, contact detail) | **B19** | B12 (contactId filters), B18 (dashboard limit=1000) |
| BUG-047 | P2 | desktop | Blank or generic top-bar titles on 23 routes | **B07** | — |
| BUG-048 | P2 | desktop | Nested double scroll areas (20 routes at 1366) | **B30** | B18, B19, B21, B23, B24, B25, B27, B29 |
| BUG-049 | P2 | desktop | Sidebar at 1366x768: tiny nav viewport, blank logo in light mode, stray green dot | **B07** | — |
| BUG-050 | P2 | desktop | Dark mode mixes warm brown-black surfaces with a navy header band; off-system gradients | **B30** | B06 (dark palette), B18 (calendar), B24 (reports hub), B25 (festivals) |
| BUG-051 | P2 | desktop | Calendar month view: out-of-month cells drawn with orange highlight borders | **B18** | — |
| BUG-052 | P2 | desktop | Fleet dashboard: identical trip IDs, "No drivers available" with 3 drivers, availability ignores trips | **B23** | — |
| BUG-053 | P2 | desktop | Invoice detail omits the client and uses en-US dates | **B22** | B21 (itinerary templates dates) |
| BUG-054 | P2 | desktop | Contact detail: "Last Interaction" is the first scheduled follow-up; City not shown; "₹0.0L" | **B19** | — |
| BUG-055 | P2 | desktop | Suppliers table cramped at 1366: wrapping cells, hover actions clipped, horizontal scroll | **B14** | — |
| BUG-056 | P2 | desktop | Tasks list: view toggle floats above header; "DE" initials for Demo Admin | **B20** | — |
| BUG-057 | P2 | desktop | Raw ID / plain inputs for relations | **B30** | B21 (itinerary lead), B25 (campaigns/new), B26 (chatbot conversation) |
| BUG-058 | P2 | desktop | 16 raw type="date" inputs (US mm/dd/yyyy) and raw number inputs for money | **B30** | B19, B21, B23, B24, B29 |
| BUG-059 | P2 | desktop | New itinerary shows phantom versions V1/V2/V3 and a hidden title field | **B21** | — |
| BUG-060 | P2 | desktop | share-panel uses mailto: / wa.me | **B21** | — |
| BUG-061 | P2 | backend | Validation errors returned as a raw JSON string in error.message | **B12** | B16 (EntityForm maps server field errors) |
| BUG-062 | P2 | backend | Inconsistent response envelopes and casing across endpoints | **B11** | B12 (tasks accept camelCase) |
| BUG-063 | P2 | backend | festival-campaigns routes have no requirePermission | **B02** | — |
| BUG-064 | P2 | driver | "Today" tab uses UTC date and includes cancelled/completed; upcoming excludes en_route/started | **B08** | B13 (emulator proof) |
| BUG-065 | P2 | driver | Document upload is a TODO | **B03** | — |
| BUG-066 | P2 | driver | Driver app visual polish: off-brand blue, mismatched inputs, low-contrast icon in dark | **B10** | — |
| BUG-067 | P2 | pipeline | Demo tenant polluted with test data | **DEFER** | — |
| BUG-068 | P2 | pipeline | Showcase gate: sign-out click timed out; state.json keeps only the head of gate output | **B05** | — |
| BUG-069 | P2 | desktop | Invoice bulk export failure is silent (no error toast) | **B14** | — |
| BUG-070 | P2 | backend | Leads are auto-assigned on create, so "Unassigned leads" can never be populated | **B12** | B20 ("Unassigned" option in lead form) |
| BUG-071 | P3 | desktop | Electron drag bar covers the sidebar logo | **B07** | — |
| BUG-072 | P3 | desktop | 400+ raw Tailwind palette classes and 48 hex literals in app/components | **B30** | B06 (ui primitives), B18–B29 (every page group) |
| BUG-073 | P3 | desktop | Missing aria-labels on icon-only buttons; duplicate id="relation-error" | **B30** | B07 (top-bar aria-labels), B16 (RelationCombobox useId) |
| BUG-074 | P3 | desktop | ~18 pages not built on ListPage/EntityForm/DetailPage | **B30** | B18–B29 |
| BUG-075 | P3 | desktop | Orphan pages and missing sidebar entries | **B07** | B27 (settings hub links) |
| BUG-076 | P3 | desktop | Lead detail copy: "1 Adults", blank Priority, raw source values ("manual") | **B20** | — |
| BUG-077 | P3 | desktop | Driver form requires licence number + expiry though the API makes them optional | **B16** | — |
| BUG-078 | P3 | desktop | Missing /grid.svg asset (404) | **B06** | — |
| BUG-079 | P3 | desktop | Vitest: 10 failing files / 19 failing tests (baseline: 4 load-failure files) | **B04** | B01 (auth/client/users test files) |
| BUG-080 | P3 | desktop | tsc: 99 errors, all in tests (97 unit, 2 e2e) – exactly at the gate ceiling | **B04** | B01 (3 test files), B09 (2 e2e files) |
| BUG-081 | P3 | backend | crypto.randomUUID() in 15 backend files (project rule: UUIDv7) | **B15** | — |
| BUG-082 | P3 | backend | Drizzle schema drift on flyers | **B02** | — |
| BUG-083 | P3 | backend | CORS allowHeaders omits X-Tenant-Id | **B08** | — |
| BUG-084 | P3 | driver | Driver app has no tests (placeholder widget_test.dart) | **B13** | — |
| BUG-085 | P3 | pipeline | Verify jobs lack backendFrozen gate; git add not scoped | **B05** | — |
| BUG-086 | P3 | desktop | Specs that assert the old GET /templates 400 bug now fail (bug fixed by d7e8f45) | **B17** | — |
| BUG-087 | P3 | desktop | Brittle/stale specs outside the auth cascade | **B17** | B16 (fleet-drivers:27), B27 (notifications:378 app fix) |

---

## 9. Deferred / won't fix

| Bug | Decision | Reason |
|---|---|---|
| BUG-067 | DEFER → showcase agent (Agent 3) | Demo tenant data pollution is replaced wholesale by the showcase agent's idempotent demo seed (backend/scripts/seed-demo.mjs + /test/reset, STORYBOARD A.9 fixups). No app code change fixes it; e2e keeps using its own tenant data. |

Also out of scope, and recorded here so nobody re-opens them:
- **No backend envelope normalisation** (BUG-062 is solved on the desktop side). `packages/shared` Flutter models depend on the current envelopes.
- **No grace window for refresh-token reuse.** Replay detection stays strict. The fix is the client-side single flight plus fresh e2e auth.
- **Contact phone numbers are not normalised globally.** Only driver phones are normalised (B08), because only drivers log in by phone. A global contact-phone migration should be its own change.
- **Secrets in git history** (`backend/.dev.vars`) must be rotated before anything leaves the machine. That is an ops task, not a batch.

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Contained-scroll DataTable (B14)** moves list scrolling from `<main>` into the table card. Specs that wheel over the page header or set `main.scrollTop` stop triggering infinite scroll. | Most specs wheel over rows or use `scrollIntoViewIfNeeded`, which still work. Breakages go to B17/B31. The `[data-scroll-region]` attribute is the documented scroll target. |
| 2 | **Global palette remap (B06)** changes every screen at once (orange → indigo) and removes the legacy HSL triplets. | Planner grep shows no TSX uses of `hsl(var(--…))`. B06 probes 7 representative routes in both themes; W6 probes every route. |
| 3 | **Editing `0033` in place (B02)** instead of adding a corrective migration. | Safe because no database ever applied 0033 successfully. Dev machines reset their local D1 once (`fix-stack up --reset-db`). Production tenant DBs have not received 0031–0034. Confirm before deploying. |
| 4 | **Validator import swap across ~39 route files (B12)** changes the 400 body. | `error.message` stays a string, so the Dart client keeps working. B12 greps `packages/shared` first and updates backend tests. |
| 5 | **Parallel worktrees** share the machine. | Fixed ports per slot. D1 state is per worktree. `node_modules` are junctions, so no `npm install` is allowed in a worktree. CORS for extra ports arrives with B08. At most 4 concurrent slots. |
| 6 | **Lint ratchet merge conflicts.** | Only the orchestrator (and B16, alone in W5) writes `lint-baseline.json`. W6 executors never do. |
| 7 | **W6 batches are large** (up to ~37 files). | Each is one area with mostly mechanical sweep work. The orchestrator may split B27/B25/B30 by sub-directory if an executor runs out of session. Allowlists are directory-based, so splits stay disjoint. |
| 8 | **The emulator (B13)** may not boot inside an executor session. | Tests still land. The orchestrator re-runs the documented emulator step. FR-2 is not proven until it passes. |
| 9 | **Showcase agent overlap.** | Showcase files are in every `mustNotTouch`. B13 writes `smoke_login_test.dart` and never `demo_flow_test.dart`. FR checks are re-run in B31. |
| 10 | **Hidden shared-component regressions** from W6 local workarounds. | The requests files are consumed by B30. B30 re-probes every route and runs the core specs. |

---

## 11. Owner decisions encoded as defaults (override before the relevant wave)

> **Owner answers 2026-10-03:** confirmed 1 (explicit null = unassigned), 2 (GET /admin/whoami approved), 4 (no-explicit-any stays an error), 6 (edit 0033 in place; no prod/staging DB has 0031-0034). **Overridden: 3 -> migrate production builds to Turbopack.**

1. **Lead auto-assignment (B12, W3).** An explicit `assignedTo: null` creates an unassigned lead. Omitting the field keeps the current behaviour (routing rule, then round robin). The alternative is to make round robin opt-in per tenant.
2. **Super Admin visibility (B07/B12).** A new additive endpoint, `GET /admin/whoami`, decides it. The sidebar hides the link for tenant admins, and `super-admin.spec.ts:55` is rewritten to match.
3. **Production builds migrate to Turbopack** (owner override 2026-10-03): plain `next build`; the webpack() hook in `next.config.ts` is removed/replaced in B00.
4. **`no-explicit-any` stays an error.** About 817 sites get fixed across the W6 batches and B30. Downgrading it to a warning would cut roughly 30% of W6 and B30 effort.
5. **Envelope normalisation happens on the desktop only** (B11). There are no backend envelope changes.
6. **`0033` is edited in place, plus a one-time local DB reset** (B02), rather than adding a corrective migration.
7. **BUG-067 (demo data pollution) is deferred** to the showcase agent's seed.
8. **Phone normalisation covers drivers only** (B08).
