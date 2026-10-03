# TravelCRM Pro — Bug Inventory (Agent 1, bug hunter)

Generated 2026-10-03 on branch `ui-remake` (HEAD c07be12). Stack: `wrangler dev` :8787 (TEST_MODE, local D1) + `next build --webpack && next start` :3100; Playwright crawler over all 187 routes in `src/app/(app)` at 1920×1080 and 1366×768, light and dark (748 page loads); scripted interaction checks; Android emulator (Resizable_Experimental, API 36) for the driver app. Screenshots: `desktop/audit/fix/shots/`. Machine-readable: `bugs.json`.

## Executive summary

| | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| desktop | 3 | 22 | 22 | 12 | 59 |
| backend | 4 | 6 | 4 | 3 | 17 |
| driver | 3 | 1 | 3 | 1 | 8 |
| pipeline | 0 | 0 | 2 | 1 | 3 |
| **all** | **10** | **29** | **31** | **17** | **87** |

**Headline problems**

1. **Sessions die** – no single-flight token refresh; any expiry fires ~19 parallel refreshes, the backend flags the replay and the user is thrown to /login (reproduced at runtime).
2. **Backend migration chain is broken on a fresh DB** – 0033 references a column that never existed, 0030 sits in a quarantine folder, festival_campaigns has no migration. `cd backend && npx vitest run` is **16/30 files failing, 268 passed / 676 skipped** (baseline 29 files / 901). The local dev DB only works because it was hand-patched.
3. **Driver app cannot log in** – no tenantId, no OTP bypass, and the error handler itself crashes so the button spins forever. Trip list, check-in (no location permission) and vehicle display are also broken by code reading.
4. **Shell/layout** – no page gutter on 101/187 routes (content flush to the sidebar, subtitles clipped by the collapse toggle), orange legacy palette instead of indigo (contrast 2.6–2.9:1 on every page), undefined CSS variables (invisible Super Admin page in dark mode), theme toggle not persisted, search button dead, Escape causes a stack overflow, hard-coded user "Arjun".
5. **List/Form archetypes** – sort is a no-op, contacts/invoices stop at 20 rows with a "0" count, failed saves are silent, dates are saved one day early in IST (runtime: picked 15 Oct → sent 2026-10-14).
6. **Crashes/fake data** – three report pages white-screen; dashboard KPIs/trends/sparklines are constants and Quick Add / date range are dead; contact detail renders mock records.

**Other headline numbers.** Desktop `tsc --noEmit`: 99 errors (0 in app src, 97 in unit tests, 2 in e2e). `vitest run`: 10 failed / 43 passed files, 19 failed / 1085 passed tests. ESLint crashes on load. `npm run build` fails (needs `--webpack`). E2E (full suite, 56.0m): **560 passed / 179 failed / 0 flaky / 10 skipped / 46 did not run** of 795. 164 of the failures are one auth cascade (shared storageState refresh token rotated → login page from run #517); 15 are individual (6 are evidence of real app bugs, 9 are stale/brittle specs, 1 of which needs triage).

**Runtime coverage notes.** No horizontal page overflow at either resolution except /itineraries/[id] at 1366 (header actions). No empty heading slots were detected. All crawl 403s are the expected /admin/config gate on /super-admin/* (listed separately). The crawler's "LOGGEDOUT" flag on /settings/login-history was a false positive (regex matched "/login" in the path) and is **not** reported as a bug.

## Root causes (fix these first)

| Root cause | Worst | Bugs |
|---|---|---|
| BACKEND-MIGRATIONS | P0 | 3: BUG-002, BUG-003, BUG-030 |
| ROOT-FAKEDATA | P0 | 3: BUG-004, BUG-025, BUG-052 |
| DRIVER-API | P0 | 3: BUG-009, BUG-036, BUG-064 |
| ROOT-ENVELOPE | P0 | 2: BUG-006, BUG-062 |
| DRIVER-AUTH | P0 | 2: BUG-007, BUG-008 |
| ROOT-AUTH | P0 | 1: BUG-001 |
| BACKEND-TRAVELLERS | P0 | 1: BUG-005 |
| DRIVER-ANDROID | P0 | 1: BUG-010 |
| ROOT-SHELL | P1 | 13: BUG-016, BUG-017, BUG-018, BUG-019, BUG-020, BUG-021, BUG-022, BUG-047, BUG-048, BUG-049, BUG-071, BUG-075, BUG-078 |
| ROOT-LISTPAGE | P1 | 7: BUG-011, BUG-012, BUG-013, BUG-034, BUG-040, BUG-046, BUG-055 |
| ROOT-ENTITYFORM | P1 | 7: BUG-014, BUG-041, BUG-057, BUG-058, BUG-059, BUG-069, BUG-077 |
| ROOT-TOKENS | P1 | 5: BUG-023, BUG-024, BUG-050, BUG-051, BUG-072 |
| ROOT-DETAILPAGE | P1 | 4: BUG-033, BUG-053, BUG-054, BUG-076 |
| TOOLING | P1 | 4: BUG-037, BUG-038, BUG-079, BUG-080 |
| TEST-STALE | P1 | 3: BUG-039, BUG-086, BUG-087 |
| ROOT-DATES | P1 | 2: BUG-015, BUG-042 |
| ROOT-CASE | P1 | 2: BUG-026, BUG-056 |
| BACKEND-SCHEMA | P1 | 2: BUG-029, BUG-082 |
| BACKEND-FREEZE | P1 | 2: BUG-031, BUG-063 |
| BACKEND-ROUTEORDER | P1 | 1: BUG-027 |
| BACKEND-REPORTS | P1 | 1: BUG-028 |
| ROOT-COMBOBOX | P1 | 1: BUG-032 |
| BACKEND-PHONE | P1 | 1: BUG-035 |
| ROOT-DIALOG | P2 | 3: BUG-043, BUG-044, BUG-045 |
| PIPELINE | P2 | 3: BUG-067, BUG-068, BUG-085 |
| DRIVER-UI | P2 | 2: BUG-065, BUG-066 |
| ROOT-CONTRACT | P2 | 1: BUG-060 |
| BACKEND-ERRORS | P2 | 1: BUG-061 |
| BACKEND-ASSIGNMENT | P2 | 1: BUG-070 |
| ROOT-A11Y | P3 | 1: BUG-073 |
| ROOT-ARCHETYPE | P3 | 1: BUG-074 |
| BACKEND-IDS | P3 | 1: BUG-081 |
| BACKEND-CORS | P3 | 1: BUG-083 |
| DRIVER-TESTS | P3 | 1: BUG-084 |

## P0

### BUG-001 — Token refresh race logs the user out
- **Area / platform / root cause:** auth · desktop · `ROOT-AUTH`
- **Symptom:** When the access token expires (15 min TTL) every in-flight request 401s and each one starts its own refresh. The backend rotates refresh tokens and rejects the replay ("Token has already been used (possible replay attack)"), so the client clears auth and redirects to /login. This is why the showcase session died mid-recording.
- **Repro:** Log in, corrupt/expire the access token (or wait 15 min), load /dashboard. Runtime: 19 parallel POST /auth/refresh-token calls, URL ends at /login. API-level: two parallel refreshes with the same token -> 200 + 401 replay.
- **Evidence:** `interact.json: token-refresh-race refreshCalls=19 -> /login`; `E2E run: from test #517 (~36 min in) 164 of 179 failures are on the login page (error-context.md shows "Manage your travel business smarter")`; `desktop/src/lib/api/client.ts:127-168 (handleAuthRefresh, no single-flight)`; `desktop/src/lib/api/client.ts:285-330 (proactive interval refresh, separate path)`; `backend/src/routes/auth.ts:430-452 (used_refresh replay key)`
- **Suspected files:** `desktop/src/lib/api/client.ts`

### BUG-002 — Migration 0033_flyers_simplify fails on a fresh database; backend test suite collapses
- **Area / platform / root cause:** migrations · backend · `BACKEND-MIGRATIONS`
- **Symptom:** 0033 copies flyer_templates.preview_url, but no earlier migration creates that column ("no such column: preview_url"). Every fresh D1 (CI, prod deploy, vitest pool) stops at 0033 so 0034 never applies. `npx vitest run` in backend: 16/30 files FAIL in beforeAll, 268 passed / 676 skipped (baseline 29 files / 901 passed). The local dev DB only works because columns were hand-added (d1_migrations shows 0031 as last applied; 0032 then fails with duplicate column).
- **Repro:** cd backend && npx wrangler d1 migrations apply travelcrm-master --local --persist-to <empty dir>  -> 0033 ❌; or cd backend && npx vitest run.
- **Evidence:** `backend/drizzle/tenant/0033_flyers_simplify.sql:32-41 (SELECT preview_url FROM flyer_templates)`; `backend vitest: "Caused by: Error: no such column: preview_url" in test/*.test.ts beforeAll`
- **Suspected files:** `backend/drizzle/tenant/0033_flyers_simplify.sql`, `backend/drizzle/tenant/0010_marketing_tables.sql`

### BUG-003 — Migration 0030 (contacts opt-out columns) was quarantined out of the chain — contact inserts fail on a fresh DB
- **Area / platform / root cause:** migrations · backend · `BACKEND-MIGRATIONS`
- **Symptom:** tenant-schema.ts declares contacts.opted_out_at / opt_out_channel / opt_out_reason but no committed migration creates them. 0030_contacts_opt_out_columns.sql sits in desktop/audit/remake/quarantine/ (its own comment: "broke every contact insert"). The local DB has it applied (d1_migrations lists 0030) so the bug is invisible locally; any fresh tenant DB breaks contact creation and GET /marketing/opt-out.
- **Repro:** Fresh DB from drizzle/tenant + POST /contacts -> "table contacts has no column named opted_out_at".
- **Evidence:** `desktop/audit/remake/quarantine/0030_contacts_opt_out_columns.sql`; `backend/src/db/tenant-schema.ts:57-59`; `backend/src/routes/marketing/opt-out.ts (verify:marketing-opt-out now SELECTs these columns)`; `local d1_migrations: 0030_contacts_opt_out_columns.sql applied, file absent from backend/drizzle/tenant`
- **Suspected files:** `backend/drizzle/tenant/`, `desktop/audit/remake/quarantine/0030_contacts_opt_out_columns.sql`

### BUG-004 — Contact detail renders mock itineraries, payments and documents
- **Area / platform / root cause:** contacts · desktop · `ROOT-FAKEDATA`
- **Symptom:** Contact detail tabs are fed by generated mock arrays rather than API data.
- **Repro:** Open /contacts/<id> and the Itineraries/Payments/Documents tabs.
- **Evidence:** `desktop/src/app/(app)/contacts/[id]/page.tsx:150-191 ("Generate mock itineraries/payments/documents")`; [shots/contact-detail-1920-light.png](shots/contact-detail-1920-light.png)
- **Suspected files:** `desktop/src/app/(app)/contacts/[id]/page.tsx`

### BUG-005 — Traveller email/phone silently discarded; frequent-flyer PUT mapping wrong
- **Area / platform / root cause:** travellers · backend · `BACKEND-TRAVELLERS`
- **Symptom:** Neither validator nor table has email/phone, so they are dropped (verify:travellers gate failure). PUT maps frequent_flyer_number vs column frequent_flyer_numbers. GET /travellers also returns a nested {data:{data:[...]}} snake_case envelope and crypto.randomUUID ids.
- **Repro:** POST /travellers with email+phone, GET it back -> fields absent.
- **Evidence:** `backend/src/routes/travellers.ts:136`; `runtime: GET /travellers?limit=1 -> {"data":{"data":[{..."first_name"...}]}} with no email/phone`
- **Suspected files:** `backend/src/routes/travellers.ts`, `backend/src/validators/`, `backend/drizzle/tenant/0035_*.sql (new)`

### BUG-006 — Reports customer / team / visa pages crash with "Application error"
- **Area / platform / root cause:** reports · desktop · `ROOT-ENVELOPE`
- **Symptom:** Pages assume res.data is an array, but /reports/:id returns {success,data:{data:[],columns,meta}}. `D.reduce is not a function` / `T.forEach is not a function` -> full white screen.
- **Repro:** Open /reports/customer, /reports/team or /reports/visa.
- **Evidence:** [shots/reports-customer-crash-1366-light.png](shots/reports-customer-crash-1366-light.png); `crawl pageErrors on all 4 combos`; `desktop/src/app/(app)/reports/customer/page.tsx:76,111`; `desktop/src/app/(app)/reports/team/page.tsx:97-109`; `desktop/src/app/(app)/reports/visa/page.tsx:112`
- **Suspected files:** `desktop/src/app/(app)/reports/customer/page.tsx`, `desktop/src/app/(app)/reports/team/page.tsx`, `desktop/src/app/(app)/reports/visa/page.tsx`

### BUG-007 — Driver login impossible: missing tenantId -> 400, then error handler throws and spinner hangs forever
- **Area / platform / root cause:** auth · driver · `DRIVER-AUTH`
- **Symptom:** sendOtp/verifyOtp post {phone} without tenantId (backend requires it -> 400 ZodError). DriverAuthNotifier._extractError returns response.data["error"] which is a Map, not a String -> TypeError; state stays sendingOtp, Send OTP button spins forever with no message.
- **Repro:** Emulator: enter 9876543210, tap Send OTP. logcat: "type _Map<String, dynamic> is not a subtype of type String" at driver_auth_provider.dart:74.
- **Evidence:** [shots/driver-02-send-otp.png](shots/driver-02-send-otp.png); [shots/driver-03-otp-stuck-spinner.png](shots/driver-03-otp-stuck-spinner.png); `packages/driver_app/lib/features/auth/data/driver_auth_repository.dart:12,20`; `packages/driver_app/lib/features/auth/data/driver_auth_provider.dart:72-77`
- **Suspected files:** `packages/driver_app/lib/features/auth/data/driver_auth_repository.dart`, `packages/driver_app/lib/features/auth/data/driver_auth_provider.dart`

### BUG-008 — No OTP bypass without Twilio: /driver/login returns 500 "Failed to send OTP"
- **Area / platform / root cause:** driver-auth · backend · `DRIVER-AUTH`
- **Symptom:** Even with tenantId, OTP send/verify call Twilio Verify unconditionally; local/dev/demo has no Twilio credentials so drivers can never log in.
- **Repro:** curl -X POST :8787/api/v1/driver/login -d {phone:"+919876543210",tenantId:"01960000-…0001"} -> 500.
- **Evidence:** `backend/src/routes/driver.ts:121-184`
- **Suspected files:** `backend/src/routes/driver.ts`

### BUG-009 — Trip list never loads (pagination.offset null) and load-more pages wrong
- **Area / platform / root cause:** trips · driver · `DRIVER-API`
- **Symptom:** trip_provider computes hasMore from pagination["offset"] + pagination["limit"]; backend paginated() returns page/limit/total -> null + int throws -> list shows error/cached data. Repository sends offset= but backend reads page= so load-more refetches page 1 (duplicates).
- **Repro:** Code read (login blocked at runtime).
- **Evidence:** `packages/driver_app/lib/features/trips/data/trip_provider.dart:35`; `packages/driver_app/lib/features/trips/data/trip_repository.dart:9-17`; `backend/src/routes/driver.ts:306-351`
- **Suspected files:** `packages/driver_app/lib/features/trips/data/trip_provider.dart`, `packages/driver_app/lib/features/trips/data/trip_repository.dart`

### BUG-010 — AndroidManifest has no location permissions; no cleartext policy
- **Area / platform / root cause:** android · driver · `DRIVER-ANDROID`
- **Symptom:** Check-in/check-out call Geolocator.requestPermission(); with no ACCESS_FINE/COARSE_LOCATION declared it throws -> check-in impossible. usesCleartextTraffic not set (debug build reached http://localhost via adb reverse, but release/profile builds will block HTTP). App label is "driver_app".
- **Repro:** Code read; check-in screen unreachable at runtime because login is blocked.
- **Evidence:** `packages/driver_app/android/app/src/main/AndroidManifest.xml`; `packages/driver_app/lib/features/trips/presentation/screens/check_in_screen.dart:41-55`
- **Suspected files:** `packages/driver_app/android/app/src/main/AndroidManifest.xml`

## P1

### BUG-011 — Contacts & Invoices lists stop at the first page; count badge shows 0
- **Area / platform / root cause:** list-pages · desktop · `ROOT-LISTPAGE`
- **Symptom:** extractTotal reads r.data.pagination.total but the client returns {success,data:[...],pagination}. Total=0 -> badge "0" and hasMore=false, so infinite scroll never loads page 2 (contacts: 20 of 77 shown).
- **Repro:** /contacts: badge "0"; scroll to bottom -> still 20 rows.
- **Evidence:** [shots/contacts-list-count0-1920-light.png](shots/contacts-list-count0-1920-light.png); `interact.json: contacts-count-badge "0", contacts-infinite-scroll before=20 after=20`; `desktop/src/app/(app)/contacts/page.tsx:537`; `desktop/src/app/(app)/invoices/page.tsx:123`
- **Suspected files:** `desktop/src/app/(app)/contacts/page.tsx`, `desktop/src/app/(app)/invoices/page.tsx`, `desktop/src/hooks/use-infinite-scroll.ts`

### BUG-012 — List sort does nothing
- **Area / platform / root cause:** list-pages · desktop · `ROOT-LISTPAGE`
- **Symptom:** Clicking a sortable header toggles the icon but no request is made and row order never changes; sort is not passed to the fetcher.
- **Repro:** /contacts -> click "Name" twice: first row stays "Aarav Sharma", no /contacts request fired.
- **Evidence:** `interact.json: contacts-sort-name reqs=[]`; `desktop/src/components/domain/list-page.tsx:134-139`
- **Suspected files:** `desktop/src/components/domain/list-page.tsx`, `desktop/src/hooks/use-infinite-scroll.ts`

### BUG-013 — ListPage refetches on any parent re-render, shows fetch errors as empty state, no refresh()
- **Area / platform / root cause:** list-pages · desktop · `ROOT-LISTPAGE`
- **Symptom:** Inline fetcher is a hook dependency -> full refetch on unrelated state changes; fetch failure renders the "No X yet" empty state instead of an error with retry; 23 pages remount with key={listKey} to refresh.
- **Repro:** Code read (known finding).
- **Evidence:** `desktop/src/components/domain/list-page.tsx:134-139,252`
- **Suspected files:** `desktop/src/components/domain/list-page.tsx`, `desktop/src/hooks/use-infinite-scroll.ts`

### BUG-014 — Failed saves are silent (no toast, no inline error)
- **Area / platform / root cause:** forms · desktop · `ROOT-ENTITYFORM`
- **Symptom:** EntityForm onSubmit has no try/catch; the API client throws, so a 400 leaves the user on the form with nothing shown. Example: invoice with unit price 0 -> backend 400 ZodError, UI shows nothing. Client schema also does not enforce rate > 0.
- **Repro:** /invoices/new: pick contact, type a description, leave Unit Price 0, Save.
- **Evidence:** `interact.json: invoice-create -> 400 POST /invoices "Too small: expected number to be >0", toast="", validation=[]`; `desktop/src/components/domain/entity-form.tsx:119`; [shots/invoice-new-nogutter-1366-light.png](shots/invoice-new-nogutter-1366-light.png)
- **Suspected files:** `desktop/src/components/domain/entity-form.tsx`, `desktop/src/app/(app)/invoices/new/page.tsx`

### BUG-015 — Dates saved one day early in IST
- **Area / platform / root cause:** dates · desktop · `ROOT-DATES`
- **Symptom:** toISOString().split("T")[0] converts local midnight to the previous UTC day. Runtime: picked 15 Oct in Travel Date -> POST /leads travelDate "2026-10-14". 71 occurrences across app/ components/ lib/.
- **Repro:** /leads/new, pick 15th of next month, save, inspect request body.
- **Evidence:** `interact.json: lead-create dateShown="15 Oct 2026" postBody travelDate "2026-10-14"`; `desktop/src/app/(app)/leads/new/page.tsx`; `desktop/src/app/(app)/leads/[id]/edit/page.tsx`; `desktop/src/app/(app)/fleet/drivers/new/page.tsx`; `desktop/src/app/(app)/invoices/[id]/edit/page.tsx`
- **Suspected files:** `desktop/src/lib/utils/date.ts (new toLocalDate)`, `desktop/src/app/(app)/leads/new/page.tsx`, `desktop/src/app/(app)/leads/[id]/edit/page.tsx`, `desktop/src/app/(app)/invoices/new/page.tsx`, `desktop/src/app/(app)/invoices/[id]/edit/page.tsx`, `desktop/src/app/(app)/fleet/drivers/new/page.tsx`, `desktop/src/app/(app)/fleet/drivers/[id]/edit/page.tsx`, `desktop/src/app/(app)/calendar/page.tsx`, `desktop/src/app/(app)/fleet/page.tsx`

### BUG-016 — Theme toggle bypasses next-themes; choice lost on reload
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** TopNavbar keeps its own useState and toggles the .dark class directly; localStorage "theme" never updates, so reload reverts. Icon state is also out of sync with system theme.
- **Repro:** Click moon icon -> dark; reload -> light again.
- **Evidence:** `interact.json: theme-toggle before=light after="light dark" reloaded=light ls=null`; `desktop/src/components/layout/top-navbar.tsx:328-334`
- **Suspected files:** `desktop/src/components/layout/top-navbar.tsx`

### BUG-017 — Top-bar "Search…" button does nothing
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Dispatches a synthetic keydown on document; CommandPalette listens on window (Ctrl+K itself works).
- **Repro:** Click "Search… ⌘K" in the top bar.
- **Evidence:** `interact.json: search-button-opens-palette dialogs=0; ctrl-k-opens-palette dialogs=1`; `desktop/src/components/layout/top-navbar.tsx:348`; `desktop/src/components/ui/command-palette.tsx:85`
- **Suspected files:** `desktop/src/components/layout/top-navbar.tsx`, `desktop/src/components/ui/command-palette.tsx`

### BUG-018 — Pressing Escape triggers infinite recursion ("Maximum call stack size exceeded")
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** The global Escape shortcut re-dispatches an Escape keydown on document, which the same listener handles again. Six page errors per keypress.
- **Repro:** Focus anything that is not an input and press Escape (e.g. after opening the command palette).
- **Evidence:** `interact.json: pageErrors "Maximum call stack size exceeded." x6 during search-button step`; `desktop/src/components/domain/keyboard-shortcuts-provider.tsx:62-77`; `desktop/src/hooks/use-keyboard-shortcuts.ts:43`
- **Suspected files:** `desktop/src/components/domain/keyboard-shortcuts-provider.tsx`

### BUG-019 — Sidebar highlights parent and child at once (49 routes)
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Prefix match marks e.g. /marketing and /marketing/flyers (and /marketing/flyers/templates -> 3 items) as active.
- **Repro:** Open /marketing/flyers/templates or /itineraries/templates.
- **Evidence:** `crawl sidebarActive: 49/187 routes with !=1 active item`; `interact.json sidebar-active /itineraries/templates`; `desktop/src/components/layout/sidebar.tsx:240`
- **Suspected files:** `desktop/src/components/layout/sidebar.tsx`

### BUG-020 — Hard-coded user "Arjun" in sidebar footer, dashboard greeting and AI briefing
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Logged in as Demo Admin, sidebar shows "Arjun S / arjun@travelcrm.io", dashboard says "Welcome back, Arjun".
- **Repro:** Log in as admin@demo.com and look at the sidebar footer and /dashboard header.
- **Evidence:** [shots/dashboard-1920-light.png](shots/dashboard-1920-light.png); `desktop/src/components/layout/sidebar.tsx:358-362`; `desktop/src/app/(app)/dashboard/page.tsx:774`; `desktop/src/components/domain/ai-daily-briefing.tsx:24`
- **Suspected files:** `desktop/src/components/layout/sidebar.tsx`, `desktop/src/app/(app)/dashboard/page.tsx`, `desktop/src/components/domain/ai-daily-briefing.tsx`

### BUG-021 — Super Admin link visible to every tenant admin; its empty state is invisible in dark mode
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Sidebar always shows Super Admin; the page then 403s (/admin/config) and shows "Platform administration access required". In dark mode the page body is near-white with white text (contrast 1.00) because EmptyState uses undefined --color-text-primary on a hardcoded light background. Top-bar title is blank on all /super-admin/* routes.
- **Repro:** Click Super Admin as admin@demo.com; repeat in dark theme.
- **Evidence:** [shots/super-admin-blank-title-1366-light.png](shots/super-admin-blank-title-1366-light.png); [shots/xdark-super-admin-invisible-1920.png](shots/xdark-super-admin-invisible-1920.png); `desktop/src/components/layout/sidebar.tsx:172,298`; `crawl gated: 403 GET /admin/config on 9 routes`
- **Suspected files:** `desktop/src/components/layout/sidebar.tsx`, `desktop/src/components/ui/empty-state.tsx`, `desktop/src/app/(app)/super-admin/layout.tsx`

### BUG-022 — No page gutter / max-width on 101 of 187 routes
- **Area / platform / root cause:** layout · desktop · `ROOT-SHELL`
- **Symptom:** h1 sits at x=0 of <main> (flush against the sidebar border); primary buttons touch the right window edge; the sidebar collapse toggle (x≈240) covers the first letter of page subtitles ("assenger records…", "tay on top…", "ll messages…").
- **Repro:** Open /leads/new, /invoices/new, /travellers, /follow-ups, /communication at 1366x768.
- **Evidence:** [shots/lead-new-nogutter-1366-light.png](shots/lead-new-nogutter-1366-light.png); [shots/invoice-new-nogutter-1366-light.png](shots/invoice-new-nogutter-1366-light.png); [shots/travellers-clipped-subtitle-1366-light.png](shots/travellers-clipped-subtitle-1366-light.png); [shots/follow-ups-1366-light.png](shots/follow-ups-1366-light.png); `crawl gutterLeft=0 on 101 routes (all 4 combos)`; `desktop/src/components/layout/app-shell.tsx:38`; `desktop/src/components/domain/list-page.tsx:176`; `desktop/src/components/domain/detail-page.tsx:101`; `desktop/src/components/domain/entity-form.tsx:119`
- **Suspected files:** `desktop/src/components/layout/app-shell.tsx`, `desktop/src/components/domain/list-page.tsx`, `desktop/src/components/domain/detail-page.tsx`, `desktop/src/components/domain/entity-form.tsx`

### BUG-023 — Orange shadcn palette instead of indigo ds-primary; orange/indigo mixed on 27 routes; primary buttons fail contrast
- **Area / platform / root cause:** design-tokens · desktop · `ROOT-TOKENS`
- **Symptom:** All ui/* primitives use the legacy orange --primary (globals.css:330). Links, charts, badges and ds-* components are indigo -> clashes (dashboard, fleet, follow-ups, settings/ai, calendar…). White on orange buttons = 2.64:1 (63 hits in dark), orange sidebar active text on white = 2.90:1 (every route).
- **Repro:** Any page; e.g. /settings/ai, /fleet, /follow-ups.
- **Evidence:** [shots/settings-ai-orange-indigo-1366-dark.png](shots/settings-ai-orange-indigo-1366-dark.png); [shots/fleet-dashboard-dup-tripids-1920-light.png](shots/fleet-dashboard-dup-tripids-1920-light.png); [shots/lead-new-1366-dark.png](shots/lead-new-1366-dark.png); `crawl: lowContrast on 184/187 routes; orange+indigo on 27 routes`; `desktop/src/app/globals.css:330`
- **Suspected files:** `desktop/src/app/globals.css`, `desktop/src/components/ui/button.tsx`, `desktop/src/components/ui/`

### BUG-024 — CSS variables referenced but never defined
- **Area / platform / root cause:** design-tokens · desktop · `ROOT-TOKENS`
- **Symptom:** --color-text-*, --color-bg-muted, --sidebar-collapsed, --z-popover, --radius-button are used (37 references) but not defined, so empty states, filter bar, data table, form field, page header, sidebar collapsed width and tooltip z-index fall back to browser defaults (see invisible super-admin text).
- **Repro:** grep "var(--color-text" desktop/src/components.
- **Evidence:** `desktop/src/components/ui/empty-state.tsx`; `desktop/src/components/domain/filter-bar.tsx`; `desktop/src/components/ui/data-table.tsx`; `desktop/src/components/layout/sidebar.tsx:306`; `desktop/src/components/ui/tooltip.tsx:20`; [shots/xdark-super-admin-invisible-1920.png](shots/xdark-super-admin-invisible-1920.png)
- **Suspected files:** `desktop/src/app/globals.css`

### BUG-025 — Dashboard shows fabricated KPIs and dead controls
- **Area / platform / root cause:** dashboard · desktop · `ROOT-FAKEDATA`
- **Symptom:** Trend % (12/5/8/5), "87% Collection Rate" and all sparklines are constants; "Quick Add" has no onClick; the "This Month" range selector state is never used; "Revenue (Month) ₹0" (won-lead value) contradicts "Revenue This Month ₹221.3Cr" (invoices) on the same screen. Also fetches leads?limit=1000 and invoices?limit=1000 to compute client-side.
- **Repro:** Open /dashboard; click Quick Add; change "This Month".
- **Evidence:** [shots/dashboard-1920-light.png](shots/dashboard-1920-light.png); `desktop/src/app/(app)/dashboard/page.tsx:682-683 (dateRange unused)`; `desktop/src/app/(app)/dashboard/page.tsx:746-767 (hardcoded trends, 87%)`; `desktop/src/app/(app)/dashboard/page.tsx:784 (Quick Add, no handler)`; `desktop/src/app/(app)/dashboard/page.tsx:807-843 (sparkData literals)`; `desktop/src/app/(app)/dashboard/page.tsx:705-708`
- **Suspected files:** `desktop/src/app/(app)/dashboard/page.tsx`

### BUG-026 — Lead notes show "Unknown · Invalid Date"
- **Area / platform / root cause:** leads · desktop · `ROOT-CASE`
- **Symptom:** GET /leads/:id/notes returns snake_case (created_by_name, created_at); the page reads note.createdBy / note.createdAt.
- **Repro:** Open any lead detail -> Notes card.
- **Evidence:** [shots/lead-detail-invalid-date-1920-light.png](shots/lead-detail-invalid-date-1920-light.png); `desktop/src/app/(app)/leads/[id]/page.tsx:338`; `crawl flags "Invalid Date" on /leads/[id]`
- **Suspected files:** `desktop/src/app/(app)/leads/[id]/page.tsx`, `backend/src/routes/leads.ts`

### BUG-027 — Static routes shadowed by /:id routes (calls analytics, vehicle availability, rate-card lookup)
- **Area / platform / root cause:** routing · backend · `BACKEND-ROUTEORDER`
- **Symptom:** Hono matches in registration order: GET /calls/analytics hits /calls/:id ("Call log not found" 404); GET /fleet/vehicles/availability hits /vehicles/:id (404, so the fleet availability grid ignores trips); GET /fleet/vehicle-rate-cards/lookup hits /:id (404 even when a matching card exists -> trip auto-pricing never works).
- **Repro:** GET /api/v1/fleet/vehicle-rate-cards/lookup?vehicleType=sedan&tripType=airport_pickup after creating that card -> 404.
- **Evidence:** `backend/src/routes/calls.ts:171 vs :437`; `backend/src/routes/fleet.ts:71 vs :520`; `backend/src/routes/fleet.ts:1926 vs :1935`; `crawl failed: /communication/calls/analytics, /fleet`
- **Suspected files:** `backend/src/routes/calls.ts`, `backend/src/routes/fleet.ts`

### BUG-028 — Report SQL errors: fleet_utilization, lead_response_time, followup_compliance
- **Area / platform / root cause:** reports · backend · `BACKEND-REPORTS`
- **Symptom:** fleet_utilization uses v.registration_no (column is registration_number); lead_response_time / followup_compliance have ambiguous created_at. All 400 -> /reports/fleet and /reports/leads show "Failed to load".
- **Repro:** GET /api/v1/reports/fleet_utilization?date_preset=this_month
- **Evidence:** `backend/src/services/reports/fleet-reports.ts:17`; `backend/src/services/reports/lead-reports.ts`; `crawl failed requests on /reports/fleet, /reports/leads`
- **Suspected files:** `backend/src/services/reports/fleet-reports.ts`, `backend/src/services/reports/lead-reports.ts`

### BUG-029 — Campaign recipients endpoint 500 (no such column m.sent_at)
- **Area / platform / root cause:** campaigns · backend · `BACKEND-SCHEMA`
- **Symptom:** /campaigns/[id] recipients tab fails.
- **Repro:** GET /api/v1/campaigns/<id>/recipients
- **Evidence:** `backend/src/routes/campaigns.ts:554-559`; `backend log: "[CAMPAIGNS] Recipients error: no such column: m.sent_at"`
- **Suspected files:** `backend/src/routes/campaigns.ts`

### BUG-030 — Festival campaigns: route added in verify phase but table never migrated (500)
- **Area / platform / root cause:** marketing · backend · `BACKEND-MIGRATIONS`
- **Symptom:** festival-campaigns.ts queries festival_campaigns which no migration creates ("no such table") -> /marketing/festivals shows "Failed to…". Routes also lack requirePermission.
- **Repro:** GET /api/v1/marketing/festivals
- **Evidence:** [shots/marketing-festivals-500-1366-light.png](shots/marketing-festivals-500-1366-light.png); `backend/src/routes/festival-campaigns.ts:62-114`; `backend log: no such table: festival_campaigns`
- **Suspected files:** `backend/src/routes/festival-campaigns.ts`, `backend/drizzle/tenant/ (new migration)`

### BUG-031 — Verify-phase backend edits broke the Flutter CRM app contract
- **Area / platform / root cause:** api-contract · backend · `BACKEND-FREEZE`
- **Symptom:** bookmarks: POST body entity_type->entityType, GET /check -> POST /check, list now camelCase+paginated (packages/crm_app bookmark_repository.dart:10-38 + shared bookmark_model still snake_case). documents: DTO drops file_url (shared DocumentModel requires fileUrl -> JSON parse failure). social-content: generatedText -> content (shared social_content_model.dart:14).
- **Repro:** Compare git diff 08312a4..HEAD for those routes with packages/shared models.
- **Evidence:** `cdd7d35 bookmarks.ts`; `b6b0c25 documents.ts`; `76ee8d2 social-content.ts`; `packages/shared/lib/models/document_model.dart:11`; `packages/crm_app/lib/features/bookmarks/data/bookmark_repository.dart:10-38`
- **Suspected files:** `backend/src/routes/bookmarks.ts`, `backend/src/routes/documents.ts`, `backend/src/routes/social-content.ts`

### BUG-032 — Combobox: invalid Tailwind v4 width class, filters by value not label, selected label disappears while searching
- **Area / platform / root cause:** combobox · desktop · `ROOT-COMBOBOX`
- **Symptom:** Known finding, confirmed by E2E: typing a seeded record name does not surface it as an option (calls dial contact search, documents lead/itinerary pickers).
- **Repro:** Any RelationCombobox/Combobox, type to search.
- **Evidence:** `desktop/src/components/ui/combobox.tsx`; `desktop/src/components/domain/relation-combobox.tsx`; `e2e calls.spec.ts:30, calls.spec.ts:271 (text=CallContact-…/DialSearch-… not visible)`; `e2e documents.spec.ts:27, :295 (option DocItinerary-…/ComboLead-… never appears)`
- **Suspected files:** `desktop/src/components/ui/combobox.tsx`, `desktop/src/components/domain/relation-combobox.tsx`

### BUG-033 — Itinerary detail: raw JSON destination, broken tabs bar, header actions overflow at 1366
- **Area / platform / root cause:** itineraries · desktop · `ROOT-DETAILPAGE`
- **Symptom:** Destination renders `["Thailand"]`; the Tabs list is stretched to full width with pill outlines spanning; at 1366 the 7 header buttons overflow (Delete off-screen, main scrollWidth 1180>1126) and the owner name wraps.
- **Repro:** Open /itineraries/<id> at 1920 and 1366.
- **Evidence:** [shots/itinerary-detail-tabs-json-1920-light.png](shots/itinerary-detail-tabs-json-1920-light.png); [shots/x1366-itinerary-detail-actions-overflow.png](shots/x1366-itinerary-detail-actions-overflow.png); `desktop/src/app/(app)/itineraries/[id]/page.tsx:265-266`
- **Suspected files:** `desktop/src/app/(app)/itineraries/[id]/page.tsx`

### BUG-034 — Itinerary Templates has no create action
- **Area / platform / root cause:** itinerary-templates · desktop · `ROOT-LISTPAGE`
- **Symptom:** Only Export is offered; no way to create a template from the list.
- **Repro:** Open /itineraries/templates.
- **Evidence:** `desktop/src/app/(app)/itineraries/templates/page.tsx`; `crawl 1366x768-light itineraries_templates.jpg`
- **Suspected files:** `desktop/src/app/(app)/itineraries/templates/page.tsx`

### BUG-035 — Phone numbers stored in mixed formats; driver lookup is exact match
- **Area / platform / root cause:** phones · backend · `BACKEND-PHONE`
- **Symptom:** Desktop PhoneInput stores digits only ("9820000000") while API/seeded data and the driver app use "+91…". /driver/login does WHERE phone = ? so a driver created from the desktop UI can never log in from the app.
- **Repro:** Create a driver in /fleet/drivers/new with 98…; app sends +9198….
- **Evidence:** [shots/contacts-list-count0-1920-light.png (mixed phone column)](shots/contacts-list-count0-1920-light.png (mixed phone column)); `backend/src/routes/driver.ts:100-103`; `packages/driver_app/lib/features/auth/presentation/screens/phone_input_screen.dart:45`
- **Suspected files:** `backend/src/routes/driver.ts`, `backend/src/routes/fleet.ts`, `desktop/src/components/ui/phone-input.tsx`

### BUG-036 — Trip card/detail read flat vehicleRegistration but backend sends nested vehicle.registration
- **Area / platform / root cause:** trips · driver · `DRIVER-API`
- **Symptom:** Vehicle never shown on trip cards.
- **Repro:** Code read.
- **Evidence:** `packages/driver_app/lib/features/trips/presentation/widgets/trip_card.dart:17`; `backend/src/routes/driver.ts:879-886`
- **Suspected files:** `packages/driver_app/lib/features/trips/presentation/widgets/trip_card.dart`, `packages/driver_app/lib/features/trips/presentation/screens/trip_detail_screen.dart`

### BUG-037 — ESLint does not run; contract lint rules unenforced
- **Area / platform / root cause:** tooling · desktop · `TOOLING`
- **Symptom:** eslint.config.mjs crashes on load (FlatCompat "Converting circular structure to JSON" via react plugin); "lint": "next lint" no longer exists in Next 16.
- **Repro:** cd desktop && npx eslint src/app/layout.tsx; npm run lint
- **Evidence:** `desktop/eslint.config.mjs`; `desktop/package.json:14`
- **Suspected files:** `desktop/eslint.config.mjs`, `desktop/package.json`

### BUG-038 — `npm run build` / `build:electron` fail on Next 16
- **Area / platform / root cause:** tooling · desktop · `TOOLING`
- **Symptom:** next build defaults to Turbopack and errors on the custom webpack config ("Call retries were exceeded"). Only `next build --webpack` (used by the pipeline gate) works, so Electron packaging scripts are broken.
- **Repro:** cd desktop && npx next build
- **Evidence:** `desktop/next.config.ts:19-30`; `desktop/package.json:10-12`
- **Suspected files:** `desktop/package.json`, `desktop/next.config.ts`

### BUG-039 — E2E harness reuses one storageState (one rotating refresh token) for the whole 56-min run
- **Area / platform / root cause:** e2e-harness · desktop · `TEST-STALE`
- **Symptom:** global-setup logs in once and every test context starts from e2e/.auth/admin.json. Refresh tokens are single-use (used_refresh replay key), so once any context refreshes, every later context presents a used token and is bounced to /login. 164/179 failures (all of payments → whatsapp-campaigns from run #517 on) are this cascade, not feature bugs. Fix BUG-001 (single-flight) AND re-authenticate per spec file (or mint a fresh storageState in a beforeAll / worker fixture).
- **Repro:** npx playwright test (full suite); inspect test-results/*/error-context.md – login hero "Manage your travel business smarter".
- **Evidence:** `scratchpad e2e.log; 164 error-context.md files show the login page`; `desktop/e2e/global-setup.ts`; `desktop/playwright.config.ts:22 (storageState for all tests)`
- **Suspected files:** `desktop/e2e/global-setup.ts`, `desktop/playwright.config.ts`, `desktop/e2e/helpers/auth.ts`

## P2

### BUG-040 — DataTable sticky header never sticks; >200 rows switches to 600px inner scroll (page jump)
- **Area / platform / root cause:** data-table · desktop · `ROOT-LISTPAGE`
- **Symptom:** Known finding (code read).
- **Repro:** List with >200 rows.
- **Evidence:** `desktop/src/components/ui/data-table.tsx:191-196`
- **Suspected files:** `desktop/src/components/ui/data-table.tsx`

### BUG-041 — Stale validation errors (214/262 setValue calls without shouldValidate)
- **Area / platform / root cause:** forms · desktop · `ROOT-ENTITYFORM`
- **Symptom:** Errors stay visible after picking a value via Combobox/DatePicker.
- **Repro:** Submit empty /leads/new, then pick a contact.
- **Evidence:** `desktop/src/components/domain/entity-form.tsx`
- **Suspected files:** `desktop/src/components/domain/entity-form.tsx`, `pages using form.setValue`

### BUG-042 — DatePicker only navigates month-by-month
- **Area / platform / root cause:** date-picker · desktop · `ROOT-DATES`
- **Symptom:** Picking a passport expiry or DOB requires dozens of clicks.
- **Repro:** /travellers/new DOB.
- **Evidence:** `desktop/src/components/ui/date-picker.tsx`
- **Suspected files:** `desktop/src/components/ui/date-picker.tsx`

### BUG-043 — Follow-up "Schedule" button disabled with no hint
- **Area / platform / root cause:** follow-ups · desktop · `ROOT-DIALOG`
- **Symptom:** Dialog opens with Schedule disabled and nothing explains that Lead and Date & time are required.
- **Repro:** /follow-ups -> Schedule follow-up.
- **Evidence:** [shots/followup-save-disabled-no-hint-1366.png](shots/followup-save-disabled-no-hint-1366.png); `interact.json followup-create saveDisabledInitially=true`
- **Suspected files:** `desktop/src/app/(app)/follow-ups/page.tsx`

### BUG-044 — Dialogs have no max-height / internal scroll
- **Area / platform / root cause:** dialogs · desktop · `ROOT-DIALOG`
- **Symptom:** DialogContent has no max-h or overflow; Create task is already 568px tall at 1366x768 and grows past the viewport once validation messages or extra fields render. (All 8 dialogs probed fit in their initial state.)
- **Repro:** Open Create task at 1366x768, submit empty.
- **Evidence:** `desktop/src/components/ui/dialog.tsx:64`; [shots/dialog-tasks-addtask-1366.png](shots/dialog-tasks-addtask-1366.png); `dialogs.json`
- **Suspected files:** `desktop/src/components/ui/dialog.tsx`

### BUG-045 — Native window.confirm() instead of ConfirmDialog
- **Area / platform / root cause:** dialogs · desktop · `ROOT-DIALOG`
- **Symptom:** Browser confirm boxes (unstyled, block the thread, not themed).
- **Repro:** Delete a contact from the list hover action; send/cancel/delete a campaign; apply a credit note.
- **Evidence:** `desktop/src/app/(app)/campaigns/[id]/page.tsx:94,123,134`; `desktop/src/app/(app)/contacts/page.tsx:614`; `desktop/src/app/(app)/credit-notes/page.tsx:44`; `desktop/src/app/(app)/debit-notes/page.tsx:44`
- **Suspected files:** `desktop/src/app/(app)/campaigns/[id]/page.tsx`, `desktop/src/app/(app)/contacts/page.tsx`, `desktop/src/app/(app)/credit-notes/page.tsx`, `desktop/src/app/(app)/debit-notes/page.tsx`

### BUG-046 — Client-side filtering over 100–1000 rows (dashboard, contact detail)
- **Area / platform / root cause:** performance · desktop · `ROOT-LISTPAGE`
- **Symptom:** Dashboard requests leads?limit=1000 and invoices?limit=1000; contact detail filters related records client-side.
- **Repro:** Network tab on /dashboard.
- **Evidence:** `desktop/src/app/(app)/dashboard/page.tsx:705-708`; `desktop/src/app/(app)/contacts/[id]/page.tsx`
- **Suspected files:** `desktop/src/app/(app)/dashboard/page.tsx`, `desktop/src/app/(app)/contacts/[id]/page.tsx`

### BUG-047 — Blank or generic top-bar titles on 23 routes
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Top bar is empty on /credit-notes*, /debit-notes*, /travellers*, /reports/{customer,team,visa}, /super-admin/*, /help, /import, /onboarding; other areas repeat the section name instead of the page.
- **Repro:** Open /travellers.
- **Evidence:** [shots/travellers-clipped-subtitle-1366-light.png](shots/travellers-clipped-subtitle-1366-light.png); `crawl topbar="" on 23 routes`; `desktop/src/components/layout/top-navbar.tsx (getPageTitle)`
- **Suspected files:** `desktop/src/components/layout/top-navbar.tsx`

### BUG-048 — Nested double scroll areas (20 routes at 1366)
- **Area / platform / root cause:** layout · desktop · `ROOT-SHELL`
- **Symptom:** Pages wrap content in their own overflow-auto flex-1 container inside <main overflow-auto> (dashboard, contacts/new+edit, itineraries/new+edit, reports/*, marketing, festivals, help, import, fleet, settings/email-signature).
- **Repro:** Scroll /dashboard at 1366x768 – inner div scrolls, not main.
- **Evidence:** `crawl innerScrollers list (1366x768-light)`
- **Suspected files:** `desktop/src/app/(app)/dashboard/page.tsx`, `desktop/src/app/(app)/reports/`, `desktop/src/app/(app)/contacts/new/page.tsx`, `desktop/src/app/(app)/itineraries/new/page.tsx`, `desktop/src/app/(app)/marketing/page.tsx`, `desktop/src/app/(app)/help/page.tsx`

### BUG-049 — Sidebar at 1366x768: tiny nav viewport, blank logo in light mode, stray green dot
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Only ~10 nav items visible (fixed bottom block + user card take ~250px; "Itinerary Templates" cut mid-line). Logo tile is an empty white square in light mode (glyph only visible in dark). Unlabelled green dot under Settings.
- **Repro:** /dashboard at 1366x768.
- **Evidence:** [shots/lead-new-1366-dark.png](shots/lead-new-1366-dark.png); [shots/dashboard-1920-light.png](shots/dashboard-1920-light.png)
- **Suspected files:** `desktop/src/components/layout/sidebar.tsx`

### BUG-050 — Dark mode mixes warm brown-black surfaces with a navy header band; off-system gradients
- **Area / platform / root cause:** design-tokens · desktop · `ROOT-TOKENS`
- **Symptom:** Body/cards use the legacy warm dark palette while page headers use a navy tint. Festivals and Reports hub use saturated rainbow gradient banners and emoji; "Republic Day" title is gray-800 on dark (1.26:1); calendar event chips are 10px text at 2.8:1.
- **Repro:** /dashboard, /marketing/festivals, /reports, /calendar in dark mode.
- **Evidence:** [shots/dashboard-1920-dark.png](shots/dashboard-1920-dark.png); [shots/xdark-festivals-1366.png](shots/xdark-festivals-1366.png); [shots/xdark-reports-1366.png](shots/xdark-reports-1366.png); [shots/xdark-calendar-1366.png](shots/xdark-calendar-1366.png)
- **Suspected files:** `desktop/src/app/globals.css`, `desktop/src/app/(app)/marketing/festivals/page.tsx`, `desktop/src/app/(app)/reports/page.tsx`, `desktop/src/app/(app)/calendar/page.tsx`

### BUG-051 — Calendar month view: out-of-month cells drawn with orange highlight borders
- **Area / platform / root cause:** calendar · desktop · `ROOT-TOKENS`
- **Symptom:** Leading days of the month look selected/focused.
- **Repro:** /calendar (October 2026).
- **Evidence:** [shots/calendar-1920-light.png](shots/calendar-1920-light.png)
- **Suspected files:** `desktop/src/app/(app)/calendar/page.tsx`

### BUG-052 — Fleet dashboard: identical trip IDs, "No drivers available" with 3 drivers, availability ignores trips
- **Area / platform / root cause:** fleet · desktop · `ROOT-FAKEDATA`
- **Symptom:** Trip labels use trip.id.slice(0,8) – UUIDv7 prefixes are time-based so every trip reads "Trip #01a100b2". Top Drivers empty despite 3 active drivers. Availability grid shows all vehicles free on trip days (endpoint 404, see BACKEND-ROUTEORDER). Dates shown as raw ISO.
- **Repro:** /fleet with 3 trips.
- **Evidence:** [shots/fleet-dashboard-dup-tripids-1920-light.png](shots/fleet-dashboard-dup-tripids-1920-light.png); `desktop/src/app/(app)/fleet/page.tsx:260,395,417`
- **Suspected files:** `desktop/src/app/(app)/fleet/page.tsx`

### BUG-053 — Invoice detail omits the client and uses en-US dates
- **Area / platform / root cause:** invoices · desktop · `ROOT-DETAILPAGE`
- **Symptom:** No Bill-to/contact on the detail page; Issue Date "3/10/2026" (ambiguous en-US) while the rest of the app is en-IN; status shown twice (badge + lowercase "draft"). Same toLocaleDateString() issue on itinerary templates ("3/10/2026").
- **Repro:** Open any invoice.
- **Evidence:** [shots/invoice-detail-1920-dark.png](shots/invoice-detail-1920-dark.png); `desktop/src/app/(app)/invoices/[id]/page.tsx:411`
- **Suspected files:** `desktop/src/app/(app)/invoices/[id]/page.tsx`, `desktop/src/app/(app)/itineraries/templates/page.tsx`

### BUG-054 — Contact detail: "Last Interaction" is the first scheduled follow-up; City not shown; "₹0.0L"
- **Area / platform / root cause:** contacts · desktop · `ROOT-DETAILPAGE`
- **Symptom:** Last Interaction (2 Oct) predates creation (3 Oct) because it is follow-ups[0].scheduledAt; City entered at creation is missing from Contact Information; zero revenue rendered as ₹0.0L.
- **Repro:** Open /contacts/<id> for a contact with a follow-up.
- **Evidence:** [shots/contact-detail-1920-light.png](shots/contact-detail-1920-light.png); `desktop/src/app/(app)/contacts/[id]/page.tsx:142-148`
- **Suspected files:** `desktop/src/app/(app)/contacts/[id]/page.tsx`

### BUG-055 — Suppliers table cramped at 1366: wrapping cells, hover actions clipped, horizontal scroll
- **Area / platform / root cause:** suppliers · desktop · `ROOT-LISTPAGE`
- **Symptom:** Company/contact/phone wrap to 2-3 lines; row hover icons cut at the right edge; table scrollWidth 1090 > 1060.
- **Repro:** /suppliers at 1366x768.
- **Evidence:** [shots/x1366-suppliers-table-cramped.png](shots/x1366-suppliers-table-cramped.png)
- **Suspected files:** `desktop/src/app/(app)/suppliers/page.tsx`, `desktop/src/components/ui/data-table.tsx`

### BUG-056 — Tasks list: view toggle floats above header; "DE" initials for Demo Admin
- **Area / platform / root cause:** tasks · desktop · `ROOT-CASE`
- **Symptom:** List/board toggle sits alone in a row above the page header; avatar initials take the first two letters of the first word.
- **Repro:** /tasks.
- **Evidence:** [shots/tasks-1366-light.png](shots/tasks-1366-light.png)
- **Suspected files:** `desktop/src/app/(app)/tasks/page.tsx`

### BUG-057 — Raw ID / plain inputs for relations
- **Area / platform / root cause:** forms · desktop · `ROOT-ENTITYFORM`
- **Symptom:** Contract requires RelationCombobox.
- **Repro:** Code read.
- **Evidence:** `desktop/src/app/(app)/campaigns/new/page.tsx:225`; `desktop/src/app/(app)/chatbot/conversations/[id]/page.tsx:309`; `desktop/src/app/(app)/itineraries/new/page.tsx (plain Combobox for lead)`
- **Suspected files:** `desktop/src/app/(app)/campaigns/new/page.tsx`, `desktop/src/app/(app)/chatbot/conversations/[id]/page.tsx`, `desktop/src/app/(app)/itineraries/new/page.tsx`

### BUG-058 — 16 raw type="date" inputs (US mm/dd/yyyy) and raw number inputs for money
- **Area / platform / root cause:** forms · desktop · `ROOT-ENTITYFORM`
- **Symptom:** e.g. itineraries/new "Valid Until" shows mm/dd/yyyy.
- **Repro:** /itineraries/new.
- **Evidence:** [shots/itinerary-new-native-date-1366-light.png](shots/itinerary-new-native-date-1366-light.png); `desktop/src/app/(app)/contacts/new/page.tsx`; `desktop/src/app/(app)/contacts/[id]/edit/page.tsx`; `desktop/src/app/(app)/fleet/vehicles/[id]/page.tsx`; `desktop/src/app/(app)/itineraries/new/page.tsx`; `desktop/src/app/(app)/itineraries/[id]/edit/page.tsx`; `desktop/src/app/(app)/suppliers/compare/page.tsx`; `desktop/src/components/domain/report-page-template.tsx`
- **Suspected files:** `desktop/src/app/(app)/itineraries/new/page.tsx`, `desktop/src/app/(app)/contacts/new/page.tsx`, `desktop/src/app/(app)/contacts/[id]/edit/page.tsx`

### BUG-059 — New itinerary shows phantom versions V1/V2/V3 and a hidden title field
- **Area / platform / root cause:** itineraries · desktop · `ROOT-ENTITYFORM`
- **Symptom:** A brand-new itinerary already displays three version chips; the title is a borderless "Itinerary title…" placeholder in the header.
- **Repro:** /itineraries/new.
- **Evidence:** [shots/itinerary-new-native-date-1366-light.png](shots/itinerary-new-native-date-1366-light.png)
- **Suspected files:** `desktop/src/app/(app)/itineraries/new/page.tsx`

### BUG-060 — share-panel uses mailto: / wa.me
- **Area / platform / root cause:** messaging · desktop · `ROOT-CONTRACT`
- **Symptom:** Bypasses Communication Hub (contract §4, rule 3).
- **Repro:** Itinerary Share tab.
- **Evidence:** `desktop/src/components/domain/share-panel.tsx:52,62`
- **Suspected files:** `desktop/src/components/domain/share-panel.tsx`

### BUG-061 — Validation errors returned as a raw JSON string in error.message
- **Area / platform / root cause:** errors · backend · `BACKEND-ERRORS`
- **Symptom:** zValidator failures return {error:{name:"ZodError",message:"[\n {\n \"code\"…"}} – any UI that toasts error.message shows JSON.
- **Repro:** POST /leads with source "walk_in".
- **Evidence:** `runtime: POST /invoices, /leads, /suppliers, /fleet/trips 400 bodies`
- **Suspected files:** `backend/src/index.ts (onError / zValidator hook)`, `backend/src/utils/response.ts`

### BUG-062 — Inconsistent response envelopes and casing across endpoints
- **Area / platform / root cause:** api-contract · backend · `ROOT-ENVELOPE`
- **Symptom:** /visa -> {data:{data,pagination}} with no success flag; /notifications -> {data:{items,total,page,limit,data,pagination}}; /users unpaginated; /travellers nested + snake_case; /tasks snake_case and ignores camelCase dueDate on create; lead notes snake_case. Every page re-implements unwrapping (root of BUG contacts/invoices/reports).
- **Repro:** GET each endpoint with ?page=1&limit=2.
- **Evidence:** `runtime envelope probe (scratch)`; `backend/src/routes/tasks.ts:117-127`; `backend/src/routes/visa.ts`; `backend/src/routes/notifications.ts:73-82`
- **Suspected files:** `backend/src/routes/visa.ts`, `backend/src/routes/notifications.ts`, `backend/src/routes/tasks.ts`, `backend/src/routes/travellers.ts`, `backend/src/routes/users.ts`

### BUG-063 — festival-campaigns routes have no requirePermission
- **Area / platform / root cause:** rbac · backend · `BACKEND-FREEZE`
- **Symptom:** Any authenticated role can create/update festival campaigns.
- **Repro:** Code read.
- **Evidence:** `backend/src/routes/festival-campaigns.ts`
- **Suspected files:** `backend/src/routes/festival-campaigns.ts`

### BUG-064 — "Today" tab uses UTC date and includes cancelled/completed; upcoming excludes en_route/started
- **Area / platform / root cause:** trips · driver · `DRIVER-API`
- **Symptom:** date('now') in SQL is UTC – IST trips before 05:30 fall into the wrong day.
- **Repro:** Code read.
- **Evidence:** `backend/src/routes/driver.ts:315-326`
- **Suspected files:** `backend/src/routes/driver.ts`

### BUG-065 — Document upload is a TODO
- **Area / platform / root cause:** profile · driver · `DRIVER-UI`
- **Symptom:** Upload button does nothing.
- **Repro:** Profile -> Documents.
- **Evidence:** `packages/driver_app/lib/features/profile/presentation/screens/documents_screen.dart:81`
- **Suspected files:** `packages/driver_app/lib/features/profile/presentation/screens/documents_screen.dart`

### BUG-066 — Driver app visual polish: off-brand blue, mismatched inputs, low-contrast icon in dark
- **Area / platform / root cause:** ui · driver · `DRIVER-UI`
- **Symptom:** Seed colour #1565C0 (not the desktop indigo); country-code dropdown is outlined while the phone field is filled (different heights/styles); Send OTP button is a muted grey-blue that reads as disabled; car icon keeps the fixed light-theme primary in dark mode; status colours hardcoded (assigned = orange); no branded splash/app name.
- **Repro:** Launch app in light and dark.
- **Evidence:** [shots/driver-01-launch.png](shots/driver-01-launch.png); [shots/driver-04-login-dark.png](shots/driver-04-login-dark.png); `packages/driver_app/lib/core/constants/app_colors.dart`; `packages/driver_app/lib/app/theme.dart`
- **Suspected files:** `packages/driver_app/lib/app/theme.dart`, `packages/driver_app/lib/core/constants/app_colors.dart`, `packages/driver_app/lib/features/auth/presentation/screens/phone_input_screen.dart`

### BUG-067 — Demo tenant polluted with test data
- **Area / platform / root cause:** demo-data · pipeline · `PIPELINE`
- **Symptom:** "Showcase Contact", "Showcase Traveller Showcase Last Name" (nationality Afghan), "E2E Salesperson" auto-assigned to new leads, ₹221.3Cr revenue from E2E invoices.
- **Repro:** Open /contacts, /travellers, a new lead.
- **Evidence:** [shots/contacts-list-count0-1920-light.png](shots/contacts-list-count0-1920-light.png); [shots/dashboard-1920-light.png](shots/dashboard-1920-light.png)
- **Suspected files:** `backend/src/routes/test.ts`, `desktop/e2e/helpers/api-seed.ts`

### BUG-068 — Showcase gate: sign-out click timed out; state.json keeps only the head of gate output
- **Area / platform / root cause:** showcase · pipeline · `PIPELINE`
- **Symptom:** Sign-out itself works (interact sign-out PASS) – the showcase failure is the session dying first (see token refresh race). The pipeline stores the head of the output so repair runs never saw the cause.
- **Repro:** desktop/audit/remake/state.json showcase entry.
- **Evidence:** `desktop/audit/remake/state.json`; `scripts/remake-pipeline.js`
- **Suspected files:** `scripts/remake-pipeline.js`

### BUG-069 — Invoice bulk export failure is silent (no error toast)
- **Area / platform / root cause:** invoices · desktop · `ROOT-ENTITYFORM`
- **Symptom:** When the export job fails to queue the list shows nothing; spec expects "Failed to export invoices".
- **Repro:** e2e invoices.spec.ts:369 (mocks a failing export).
- **Evidence:** `e2e invoices.spec.ts:369`
- **Suspected files:** `desktop/src/app/(app)/invoices/page.tsx`, `desktop/src/components/domain/list-page.tsx`

### BUG-070 — Leads are auto-assigned on create, so "Unassigned leads" can never be populated
- **Area / platform / root cause:** leads · backend · `BACKEND-ASSIGNMENT`
- **Symptom:** A lead created without assignedTo comes back assigned (to "E2E Salesperson" in the demo tenant) by assignment rules/round-robin; /leads/unassigned bulk-assign spec receives an assignee id where it expects none.
- **Repro:** POST /leads without assignedTo, GET it back.
- **Evidence:** `e2e leads.spec.ts:413 (Received "01a0fba9-…")`; [shots/lead-detail-invalid-date-1920-light.png (Assigned To E2E Salesperson)](shots/lead-detail-invalid-date-1920-light.png (Assigned To E2E Salesperson))
- **Suspected files:** `backend/src/routes/leads.ts`, `backend/src/services/ (assignment rules)`

## P3

### BUG-071 — Electron drag bar covers the sidebar logo
- **Area / platform / root cause:** shell · desktop · `ROOT-SHELL`
- **Symptom:** Fixed h-8 drag region over the sidebar header in Electron.
- **Repro:** Run in Electron.
- **Evidence:** `desktop/src/components/layout/app-shell.tsx:21-23`
- **Suspected files:** `desktop/src/components/layout/app-shell.tsx`, `desktop/src/components/layout/sidebar.tsx`

### BUG-072 — 400+ raw Tailwind palette classes and 48 hex literals in app/components
- **Area / platform / root cause:** design-tokens · desktop · `ROOT-TOKENS`
- **Symptom:** Violates contract lint rule 1 once ESLint runs.
- **Repro:** grep -rE "#[0-9a-f]{6}" desktop/src/app
- **Evidence:** `desktop/src/app/(app)/dashboard/page.tsx:69`; `desktop/src/app/(app)/itineraries/new/page.tsx:94`; `desktop/src/app/(app)/marketing/festivals/page.tsx`
- **Suspected files:** `desktop/src/app/(app)/dashboard/page.tsx`, `desktop/src/app/(app)/calendar/page.tsx`, `desktop/src/app/(app)/marketing/`, `desktop/src/app/(app)/itineraries/new/page.tsx`, `desktop/src/app/(app)/contacts/[id]/page.tsx`

### BUG-073 — Missing aria-labels on icon-only buttons; duplicate id="relation-error"
- **Area / platform / root cause:** a11y · desktop · `ROOT-A11Y`
- **Symptom:** Theme toggle, notification bell, row actions; duplicate ids when two RelationComboboxes are on one form.
- **Repro:** axe on /leads/new.
- **Evidence:** `desktop/src/components/layout/top-navbar.tsx:357`; `desktop/src/components/domain/relation-combobox.tsx`
- **Suspected files:** `desktop/src/components/layout/top-navbar.tsx`, `desktop/src/components/domain/relation-combobox.tsx`

### BUG-074 — ~18 pages not built on ListPage/EntityForm/DetailPage
- **Area / platform / root cause:** architecture · desktop · `ROOT-ARCHETYPE`
- **Symptom:** contacts/new+edit, itineraries/*, reports/*, marketing, settings/*, ai/* hand-roll headers/padding.
- **Repro:** Code read.
- **Evidence:** `desktop/src/app/(app)/contacts/new/page.tsx`; `desktop/src/app/(app)/itineraries/new/page.tsx`; `desktop/src/app/(app)/reports/`
- **Suspected files:** `desktop/src/app/(app)/contacts/new/page.tsx`, `desktop/src/app/(app)/contacts/[id]/edit/page.tsx`, `desktop/src/app/(app)/itineraries/`, `desktop/src/app/(app)/reports/`, `desktop/src/app/(app)/settings/`

### BUG-075 — Orphan pages and missing sidebar entries
- **Area / platform / root cause:** navigation · desktop · `ROOT-SHELL`
- **Symptom:** /settings/announcements, /settings/phone-numbers, /fleet/rate-cards unreachable from nav; /campaigns/*, /onboarding and /reports/* subpages highlight nothing in the sidebar.
- **Repro:** Open /campaigns.
- **Evidence:** `crawl sidebarActive=[] on /campaigns*, /reports/{customer,team,visa}, /onboarding`
- **Suspected files:** `desktop/src/components/layout/sidebar.tsx`, `desktop/src/app/(app)/settings/page.tsx`

### BUG-076 — Lead detail copy: "1 Adults", blank Priority, raw source values ("manual")
- **Area / platform / root cause:** leads · desktop · `ROOT-DETAILPAGE`
- **Symptom:** Pluralisation and empty values not handled.
- **Repro:** Open a lead created without priority.
- **Evidence:** [shots/lead-detail-invalid-date-1920-light.png](shots/lead-detail-invalid-date-1920-light.png); [shots/lead-new-nogutter-1366-light.png](shots/lead-new-nogutter-1366-light.png)
- **Suspected files:** `desktop/src/app/(app)/leads/[id]/page.tsx`, `desktop/src/app/(app)/leads/new/page.tsx`

### BUG-077 — Driver form requires licence number + expiry though the API makes them optional
- **Area / platform / root cause:** fleet · desktop · `ROOT-ENTITYFORM`
- **Symptom:** Cannot add a driver quickly (e.g. for the demo) without licence data.
- **Repro:** /fleet/drivers/new with name+phone only.
- **Evidence:** `interact.json driver-create validation ["License number is required","License expiry is required"]`
- **Suspected files:** `desktop/src/app/(app)/fleet/drivers/new/page.tsx`

### BUG-078 — Missing /grid.svg asset (404)
- **Area / platform / root cause:** assets · desktop · `ROOT-SHELL`
- **Symptom:** Background pattern request 404s.
- **Repro:** Network tab.
- **Evidence:** `crawl failed: 404 GET /grid.svg`
- **Suspected files:** `desktop/public/`, `desktop/src/app/(app)/layout.tsx`

### BUG-079 — Vitest: 10 failing files / 19 failing tests (baseline: 4 load-failure files)
- **Area / platform / root cause:** tests · desktop · `TOOLING`
- **Symptom:** New stale API-client tests after slice changes: ai, chatbot, credit-notes (8), exports, marketing, payments, vouchers; plus auth/client/users fail to load (useAuthStore.subscribe is not a function in client.ts:345).
- **Repro:** cd desktop && npx vitest run
- **Evidence:** `vitest: Test Files 10 failed | 43 passed (53); Tests 19 failed | 1085 passed (1104)`
- **Suspected files:** `desktop/src/lib/api/*.test.ts`, `desktop/src/lib/api/client.ts:345`

### BUG-080 — tsc: 99 errors, all in tests (97 unit, 2 e2e) – exactly at the gate ceiling
- **Area / platform / root cause:** tests · desktop · `TOOLING`
- **Symptom:** Any new test-file error breaks the "≤99" gate.
- **Repro:** cd desktop && npx tsc --noEmit
- **Evidence:** `e2e/itineraries.spec.ts:40`; `e2e/webhooks-integrations.spec.ts:61`; `desktop/src/hooks/use-notifications.test.ts`; `desktop/src/lib/api/client.test.ts`
- **Suspected files:** `desktop/src/**/*.test.ts`, `desktop/e2e/itineraries.spec.ts`, `desktop/e2e/webhooks-integrations.spec.ts`

### BUG-081 — crypto.randomUUID() in 15 backend files (project rule: UUIDv7)
- **Area / platform / root cause:** ids · backend · `BACKEND-IDS`
- **Symptom:** events, tasks, travellers, visa, suppliers, driver, imports/exports, webhook, cron use random v4 ids.
- **Repro:** grep -rl crypto.randomUUID backend/src
- **Evidence:** `backend/src/routes/planner.ts:121`; `backend/src/routes/travellers.ts`; `backend/src/routes/tasks.ts`
- **Suspected files:** `backend/src/routes/planner.ts`, `backend/src/routes/tasks.ts`, `backend/src/routes/travellers.ts`, `backend/src/routes/visa.ts`, `backend/src/routes/suppliers.ts`, `backend/src/routes/driver.ts`

### BUG-082 — Drizzle schema drift on flyers
- **Area / platform / root cause:** schema · backend · `BACKEND-SCHEMA`
- **Symptom:** generatedFlyers.name is notNull() but 0033 made it nullable; sizePreset declared but no column; flyer_shares table has shared_by/shared_at while schema says createdBy/createdAt.
- **Repro:** Compare tenant-schema.ts:1297-1330 with migrations.
- **Evidence:** `backend/src/db/tenant-schema.ts:1297-1330`; `backend/drizzle/tenant/0010_marketing_tables.sql:154-190`
- **Suspected files:** `backend/src/db/tenant-schema.ts`

### BUG-083 — CORS allowHeaders omits X-Tenant-Id
- **Area / platform / root cause:** cors · backend · `BACKEND-CORS`
- **Symptom:** Driver/web clients sending X-Tenant-Id fail preflight from a browser origin.
- **Repro:** Code read.
- **Evidence:** `backend/src/index.ts:119-127`
- **Suspected files:** `backend/src/index.ts`

### BUG-084 — Driver app has no tests (placeholder widget_test.dart)
- **Area / platform / root cause:** tests · driver · `DRIVER-TESTS`
- **Symptom:** flutter test proves nothing.
- **Repro:** packages/driver_app/test/widget_test.dart
- **Evidence:** `packages/driver_app/test/widget_test.dart`
- **Suspected files:** `packages/driver_app/test/`

### BUG-085 — Verify jobs lack backendFrozen gate; git add not scoped
- **Area / platform / root cause:** pipeline · pipeline · `PIPELINE`
- **Symptom:** Verify jobs made ~29 unapproved backend changes (migrations 0031-0034 etc.) that only the cleanup gate caught.
- **Repro:** scripts/remake-pipeline.js:285-317.
- **Evidence:** `scripts/remake-pipeline.js:267,290,317`
- **Suspected files:** `scripts/remake-pipeline.js`

### BUG-086 — Specs that assert the old GET /templates 400 bug now fail (bug fixed by d7e8f45)
- **Area / platform / root cause:** e2e · desktop · `TEST-STALE`
- **Symptom:** campaigns.spec.ts:342 C1, communication-inbox.spec.ts:366 C3-note and :461 D3-note expect the template dropdown to 400; verify:message-templates switched page/limit to z.coerce so /templates now returns 200 with options. The app is correct; update the specs to assert options load.
- **Repro:** npx playwright test campaigns communication-inbox
- **Evidence:** `e2e campaigns.spec.ts:342`; `e2e communication-inbox.spec.ts:366,461`; `commit d7e8f45 backend/src/routes/templates.ts:35-36`
- **Suspected files:** `desktop/e2e/campaigns.spec.ts`, `desktop/e2e/communication-inbox.spec.ts`

### BUG-087 — Brittle/stale specs outside the auth cascade
- **Area / platform / root cause:** e2e · desktop · `TEST-STALE`
- **Symptom:** auth-shell.spec.ts:154 expects a user menu named "Admin User" (tenant user is "Demo Admin"); contacts.spec.ts:423 strict-mode violation – two "New Field" buttons (header + empty state; consider one CTA); fleet-drivers.spec.ts:27 clicks day "15" which is disabled by the picker min/max date (date-dependent); fleet-vehicles.spec.ts:498 counts tbody tr[role="button"] = 0 (row role changed); notifications.spec.ts:378 preference page shows only the "Settings" heading – confirm whether /settings/notifications lost its page header (possible app bug); ai-business-intelligence.spec.ts:92 gets "No briefing available" because the e2e wrangler config strips the [ai] binding.
- **Repro:** Run each spec individually after the auth harness fix.
- **Evidence:** `e2e auth-shell.spec.ts:154`; `e2e contacts.spec.ts:423`; `e2e fleet-drivers.spec.ts:27`; `e2e fleet-vehicles.spec.ts:498`; `e2e notifications.spec.ts:378`; `e2e ai-business-intelligence.spec.ts:92`
- **Suspected files:** `desktop/e2e/auth-shell.spec.ts`, `desktop/e2e/contacts.spec.ts`, `desktop/e2e/fleet-drivers.spec.ts`, `desktop/e2e/fleet-vehicles.spec.ts`, `desktop/e2e/notifications.spec.ts`, `desktop/e2e/ai-business-intelligence.spec.ts`

## Backend freeze review

Merge-base: `git merge-base HEAD master` = `08312a4` (REMAKE_BASE_REF default `master`). `git diff 08312a4..HEAD --stat -- backend/`: 36 files, +2670/−184. Verify-phase commits touching backend: bda1404, 97879fd, 0de0ec3, 680f9a1, cdd7d35, b6b0c25, 86aed27, f5315fe, eb66ddc, 76ee8d2, d7e8f45, 1920189, b932cf7, afbb63e, c47a13e, 5317f45, efcfd0d, f92f576 (+ f2d7440 admin, sanctioned).

**Backend tests now:** `cd backend && npx vitest run` (package.json has no `test` script; the pipeline gate runs `npx vitest run`) → **Test Files 16 failed | 14 passed (30); Tests 268 passed | 676 skipped (944)**. Every failure is the same beforeAll error: `no such column: preview_url` from 0033. Baseline was 29 files / 901 tests green. Once 0033 is reworked, rerun to confirm the remaining changes are green.

| File(s) | Commit / job | Verdict | Reason |
|---|---|---|---|
| backend/.dev.vars | — | **ACCEPT (untracked, sanctioned)** | Removed from index; secrets still in history – rotate. |
| backend/src/routes/admin.ts, middleware/require-super-admin.ts, test/admin.test.ts, index.ts (admin mount) | backend:admin | **ACCEPT** | Sanctioned /admin surface with 650-line test file. |
| backend/vitest.config.ts, routes/test.ts (reset) | sanctioned + f92f576 | **ACCEPT** | Reset now discovers tables and deletes in FK passes; test-only (TEST_MODE). |
| drizzle/tenant/0031_leads_fts_repair.sql + routes/leads.ts (FTS escaping) | bda1404 verify:leads | **ACCEPT** | Defensive trigger recreate + rebuild; quoted FTS phrase fixes "-" / ":" search crashes. Applies cleanly on fresh DB. |
| drizzle/tenant/0032_import_export_jobs_tenant_id.sql + exports.ts csv + file-parser String() + row-inserter imports | 86aed27 verify:import-export | **ACCEPT** | Applies on fresh DB; local DB was hand-patched so 0032 errors "duplicate column" locally – reset local D1 once. |
| drizzle/tenant/0033_flyers_simplify.sql + tenant-schema.ts + flyers.ts/flyer-templates.ts/branding.ts + validators/marketing.ts | f5315fe verify:marketing-flyers | **REWORK** | Migration fails on fresh DB (preview_url) – breaks 16 backend test files (BUG P0). Fix: ALTER ADD preview_url (and custom_css) before the copy, or SELECT NULL. Also category enum changed (destination/offer -> seasonal/promotional) and createGeneratedFlyer now requires templateId+title (Flutter crm_app sends name); schema drift (name notNull). |
| drizzle/tenant/0034_users_invite_signature.sql | c47a13e verify:settings-team | **ACCEPT** | Adds columns tenant-schema already declares; never applied on fresh DB because 0033 fails first. |
| (missing) 0030_contacts_opt_out_columns.sql — in desktop/audit/remake/quarantine | slice:settings-company 1d70215 moved it | **REWORK (restore)** | opt-out.ts (eb66ddc) reads/writes opted_out_at/opt_out_channel/opt_out_reason; without 0030 every contact insert fails on fresh DB. |
| routes/marketing/opt-out.ts | eb66ddc verify:marketing-opt-out | **ACCEPT (after 0030 restored)** | Search/channel filters + camelCase rows. |
| routes/festival-campaigns.ts + index.ts mount | 76ee8d2 verify:marketing-social | **REWORK** | Table festival_campaigns has no migration -> 500; no requirePermission. |
| routes/social-content.ts | 76ee8d2 | **REWORK** | generatedText -> content rename breaks packages/shared social_content_model; keep both keys. |
| routes/bookmarks.ts | cdd7d35 verify:dashboard | **REWORK** | Breaking contract for Flutter crm_app (snake body, GET /check, list shape). Accept both casings and keep GET /check. |
| routes/reports.ts (content as description) | cdd7d35 | **ACCEPT** | Column fix. |
| routes/documents.ts (DTO) | b6b0c25 verify:documents | **REWORK** | DTO drops file_url/fileUrl that packages/shared DocumentModel requires; add fileUrl back. |
| routes/ai-settings.ts (gate keys) | 97879fd, 0de0ec3 | **ACCEPT** | Adds desktop feature-gate keys incl. voip_calling. |
| routes/calls.ts (callLogId in 500 body) | 0de0ec3 verify:calls | **ACCEPT** | Additive. |
| routes/credit-notes.ts (search) | 680f9a1 | **ACCEPT** | Adds LEFT JOIN for count; correct. |
| routes/templates.ts (z.coerce page/limit; hide inactive) | d7e8f45 | **ACCEPT** | Query params were always strings – real fix. |
| routes/notifications.ts + notification-preferences.ts | 1920189 | **ACCEPT (minor)** | Adds data/pagination alongside items; limit cap raised 100->500 (consider 100). |
| routes/payments.ts (search, qualified cols) | b932cf7 | **ACCEPT** | Fixes ambiguous column names. |
| middleware/rate-limiter.ts (TTL >= 60) | afbb63e | **ACCEPT** | KV rejects TTL < 60 – real bug fix. |
| routes/suppliers.ts (supplier_id, cost_price) | 5317f45 | **ACCEPT** | Payments were stored under contact_id; compare-rates ordered by nonexistent rc.rate. |
| routes/tasks.ts (paginated) | efcfd0d | **ACCEPT** | data stays an array; adds pagination. |

## E2E suite results

Command: `cd desktop && npx playwright test --reporter=line` (reused the running `next start` :3100 and `wrangler dev` :8787 via reuseExistingServer). Duration 56.0m. **560 passed, 179 failed, 0 flaky, 10 skipped, 46 did not run (of 795).**

**Classification.** 15 failures are individual (real bugs or stale specs, classified per row). **164 failures are one cascade**: from run #517 (payments.spec, ~36 min into the run) every UI test lands on the login page because all tests share one storageState whose single-use refresh token was rotated by an earlier context (BUG-001 + harness item). Those specs (payments, rate-cards, reports, settings-company, settings-team, super-admin, suppliers, tasks, test-harness, travellers, visa, voip-settings, vouchers, whatsapp-campaigns, showcase/full-walkthrough) are **untested**, not proven broken – re-run after the auth fix. The backend stayed up for the whole run (wrangler log shows traffic until the last spec).

**Why 46 did not run.** 14 spec files use `test.describe.configure({ mode: 'serial' })` (auth-shell, chatbot, fleet-vehicles, follow-ups, import-export, marketing-campaigns, marketing-opt-out, notifications, settings-company, settings-team, test-harness, voip-settings, vouchers, whatsapp-campaigns). In serial mode Playwright stops a describe block at its first failure and reports the remaining tests as "did not run"; nearly all of the 46 are tails of serial blocks inside the login cascade (settings-team, vouchers, voip-settings, whatsapp-campaigns, test-harness, notifications, settings-company, fleet-vehicles, auth-shell). The 10 "skipped" are explicit test.skip/fixme in specs.

All 179 failures (Run = position in the 795-test run; full error tails in the scratch e2e-parsed.json):

| # | Run | Spec › test | Error (tail) | Class | Bug |
|---|---|---|---|---|---|
| 1 | 18 | ai-business-intelligence.spec.ts:92:7 › Daily Briefings › generates a briefing, switches type, and refreshes | Error: expect(locator).toBeVisible() failed Locator: locator('text=Weekly briefing').first() Expected: visible | TEST-STALE (AI binding stripped) | BUG-087 |
| 2 | 59 | auth-shell.spec.ts:154:7 › Auth shell — authenticated session › logs in, uses the app shell, then logs out via the user menu | Error: expect(locator).toBeVisible() failed Locator: getByRole('button', { name: /Admin User/i }) Expected: visible | TEST-STALE | BUG-087 |
| 3 | 72 | calls.spec.ts:30:7 › Calls › full round trip: dial via UI, view in list, view detail, edit outcome, delete | Error: expect(locator).toBeVisible() failed Locator: locator('text=CallContact-1791014746709').first() Expected: visible | real | BUG-032 |
| 4 | 80 | calls.spec.ts:271:7 › Calls › dial pad uses PhoneInput and a searchable contact combobox, no raw ID input | Error: expect(locator).toBeVisible() failed Locator: locator('text=DialSearch-1791014785974').first() Expected: visible | real | BUG-032 |
| 5 | 97 | campaigns.spec.ts:342:7 › C. Template relation combobox › C1: template combobox is a real combobox with no raw ID input; loading options 400s (backend query-param validation bug) | Error: expect(received).toBe(expected) // Object.is equality Expected: true Received: false | TEST-STALE | BUG-086 |
| 6 | 131 | communication-inbox.spec.ts:366:7 › C. Compose page › C3-note: template dropdown never lists options — GET /templates 400s on every call (backend query-param validation bug, same defect documented in campaigns.spec.ts) | Error: expect(received).toBe(expected) // Object.is equality Expected: true Received: false | TEST-STALE | BUG-086 |
| 7 | 137 | communication-inbox.spec.ts:461:7 › D. Bulk send page › D3-note: template dropdown never lists options — GET /templates 400s on every call (backend query-param validation bug, same defect documented in campaigns.spec.ts) | Error: expect(received).toBe(expected) // Object.is equality Expected: true Received: false | TEST-STALE | BUG-086 |
| 8 | 160 | contacts.spec.ts:423:7 › Contacts › custom field can be created in settings, saved with a contact, and deleted | Error: locator.click: Error: strict mode violation: getByRole('button', { name: /New Field/i }) resolved to 2 elements: Call log: - waiting for getByRole('button', { name: /New Field/i }) | TEST-STALE | BUG-087 |
| 9 | 206 | documents.spec.ts:27:7 › Documents › full round trip: upload, view in list, view detail, rename, verify prefill, save, delete | TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole('option', { name: 'DocItinerary-1791014977535' }) | real | BUG-032 |
| 10 | 212 | documents.spec.ts:295:7 › Documents › linked lead/itinerary fields are searchable comboboxes with no raw ID input | Error: expect(locator).toBeVisible() failed Locator: getByRole('option', { name: 'ComboLead-1791015011527' }) Expected: visible | real | BUG-032 |
| 11 | 240 | fleet-drivers.spec.ts:27:7 › Fleet Drivers › full round trip: create, view in list, view detail, edit, verify prefill, save, delete | TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for locator('.w-\\[280px\\]').last().locator('.grid').getByRole('button', { name: '15', exact: true }) - locator resolved to <button disabled typ | TEST-STALE | BUG-087 |
| 12 | 306 | fleet-vehicles.spec.ts:498:7 › Fleet vehicles › infinite scroll loads more rows; bulk delete removes them | Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr[role="button"]') Expected: 20 Received: 0 | TEST-STALE | BUG-087 |
| 13 | 358 | invoices.spec.ts:369:7 › Invoices › export surfaces an error toast when the bulk export job fails to queue | Error: expect(locator).toBeVisible() failed Locator: getByText('Failed to export invoices') Expected: visible | real | BUG-069 |
| 14 | 406 | leads.spec.ts:413:7 › Leads › unassigned leads page lists leads with no owner and bulk-assigns them | Error: expect(received).toBeFalsy() Received: "01a0fba9-165f-7402-8755-fa6e94f0e5ef" | real | BUG-070 |
| 15 | 500 | notifications.spec.ts:378:7 › Notification preferences › lists all 8 types with Email/Push/In-App columns and a mute-all switch | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: /notification preferences/i }) Expected: visible | triage | BUG-087 |
| 16 | 517 | payments.spec.ts:309:7 › Payments — list › method filter narrows results, shows an active-filter chip, and clears | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('table tbody tr') Ex | auth cascade (login page) | BUG-039 |
| 17 | 518 | payments.spec.ts:338:7 › Payments — list › empty state renders when search matches nothing | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('No payments yet') Expected | auth cascade (login page) | BUG-039 |
| 18 | 519 | payments.spec.ts:346:7 › Payments — list › hover actions: view opens detail, receipt opens receipt, delete removes the row and reverses the invoice | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table tbody tr:has-text("HOV | auth cascade (login page) | BUG-039 |
| 19 | 520 | payments.spec.ts:390:7 › Payments — list › bulk delete removes every selected payment | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('table tbody tr') Ex | auth cascade (login page) | BUG-039 |
| 20 | 521 | payments.spec.ts:410:7 › Payments — list › export downloads a non-empty CSV containing the listed payment | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table tbody tr:has-text("EXP | auth cascade (login page) | BUG-039 |
| 21 | 522 | payments.spec.ts:436:7 › Payments — list › infinite scroll loads more rows as the list is scrolled | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('table tbody tr') Ex | auth cascade (login page) | BUG-039 |
| 22 | 524 | payments.spec.ts:464:7 › Payments — detail › messaging goes through SendMessageDialog, not raw links; unknown id shows not-found state | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Against invoice INV-2026-2 | auth cascade (login page) | BUG-039 |
| 23 | 525 | rate-cards.spec.ts:70:7 › Rate Cards › full round trip: create via form, list, drawer, edit prefill, edit, delete | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 24 | 528 | rate-cards.spec.ts:232:7 › Rate Cards › supplier is a searchable combobox that filters options; no raw ID input; URL param pre-fills it | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('option', { name: /Alpha179 | auth cascade (login page) | BUG-039 |
| 25 | 529 | rate-cards.spec.ts:264:7 › Rate Cards › valid-to date cannot precede valid-from; currency input rejects letters | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for locator('.w | auth cascade (login page) | BUG-039 |
| 26 | 530 | rate-cards.spec.ts:277:7 › Rate Cards › list shows seeded rate card values, hover Edit opens that rate card | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table tbody tr:has-text("See | auth cascade (login page) | BUG-039 |
| 27 | 531 | rate-cards.spec.ts:306:7 › Rate Cards › editing a non-existent rate card shows an error, not a blank form | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Failed to load rate card') | auth cascade (login page) | BUG-039 |
| 28 | 532 | rate-cards.spec.ts:312:7 › Rate Cards › search narrows the list to matching rate cards | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table tbody tr:has-text("Src | auth cascade (login page) | BUG-039 |
| 29 | 533 | rate-cards.spec.ts:330:7 › Rate Cards › category filter narrows the list and clearing it restores rows | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table tbody tr:has-text("Fil | auth cascade (login page) | BUG-039 |
| 30 | 534 | rate-cards.spec.ts:357:7 › Rate Cards › empty state renders when filters match nothing | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('No rate cards yet') Expect | auth cascade (login page) | BUG-039 |
| 31 | 535 | rate-cards.spec.ts:366:7 › Rate Cards › infinite scroll loads more rows on scroll | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('table tbody tr:has- | auth cascade (login page) | BUG-039 |
| 32 | 536 | rate-cards.spec.ts:384:7 › Rate Cards › bulk delete removes every selected rate card from the list | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('table tbody tr') Ex | auth cascade (login page) | BUG-039 |
| 33 | 537 | rate-cards.spec.ts:405:7 › Rate Cards › export downloads a non-empty CSV containing the rate card | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table tbody tr:has-text("Exp | auth cascade (login page) | BUG-039 |
| 34 | 550 | reports.spec.ts:165:7 › Reports hub › renders KPI metrics from the dashboard API and every category card | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Revenue This Month', { exa | auth cascade (login page) | BUG-039 |
| 35 | 551 | reports.spec.ts:179:7 › Reports hub › search narrows the cards and shows the empty state for no match | login page (session lost) – TimeoutError: locator.clear: Timeout 15000ms exceeded. Call log: - waiting for getByPlaceh | auth cascade (login page) | BUG-039 |
| 36 | 552 | reports.spec.ts:193:7 › Reports hub › favoriting a card adds it to Favorites and persists across reload | login page (session lost) – Error: page.reload: net::ERR_ABORTED; maybe frame was detached? Call log: - waiting for na | auth cascade (login page) | BUG-039 |
| 37 | 553 | reports.spec.ts:206:7 › Reports hub › clicking a card navigates and records it under Recently Viewed | login page (session lost) – TimeoutError: page.waitForURL: Timeout 15000ms exceeded. waiting for navigation to "**/rep | auth cascade (login page) | BUG-039 |
| 38 | 571 | reports.spec.ts:274:7 › Report filters › changing the date range on sales re-queries with the new preset | login page (session lost) – TimeoutError: page.waitForRequest: Timeout 15000ms exceeded while waiting for event "reque | auth cascade (login page) | BUG-039 |
| 39 | 573 | reports.spec.ts:305:7 › Report filters › changing the date range on financial re-queries | login page (session lost) – TimeoutError: page.waitForRequest: Timeout 15000ms exceeded while waiting for event "reque | auth cascade (login page) | BUG-039 |
| 40 | 574 | reports.spec.ts:328:9 › Report tabs › /reports/sales: every tab activates and shows a panel (data, empty state, or retry) | login page (session lost) – TimeoutError: locator.scrollIntoViewIfNeeded: Timeout 15000ms exceeded. Call log: - waitin | auth cascade (login page) | BUG-039 |
| 41 | 575 | reports.spec.ts:328:9 › Report tabs › /reports/leads: every tab activates and shows a panel (data, empty state, or retry) | login page (session lost) – TimeoutError: locator.scrollIntoViewIfNeeded: Timeout 15000ms exceeded. Call log: - waitin | auth cascade (login page) | BUG-039 |
| 42 | 576 | reports.spec.ts:328:9 › Report tabs › /reports/financial: every tab activates and shows a panel (data, empty state, or retry) | login page (session lost) – TimeoutError: locator.scrollIntoViewIfNeeded: Timeout 15000ms exceeded. Call log: - waitin | auth cascade (login page) | BUG-039 |
| 43 | — | reports.spec.ts:342:7 › Report tabs › sales Summary tab shows KPI labels | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Total Revenue').first() Ex | auth cascade (login page) | BUG-039 |
| 44 | 580 | reports.spec.ts:385:7 › Report export › sales export downloads a non-empty xlsx | login page (session lost) – TimeoutError: page.waitForEvent: Timeout 30000ms exceeded while waiting for event "downloa | auth cascade (login page) | BUG-039 |
| 45 | 581 | reports.spec.ts:402:9 › Report export › /reports/financial: Export Excel downloads a non-empty xlsx | login page (session lost) – TimeoutError: page.waitForEvent: Timeout 30000ms exceeded while waiting for event "downloa | auth cascade (login page) | BUG-039 |
| 46 | 582 | reports.spec.ts:402:9 › Report export › /reports/leads: Export Excel downloads a non-empty xlsx | login page (session lost) – TimeoutError: page.waitForEvent: Timeout 30000ms exceeded while waiting for event "downloa | auth cascade (login page) | BUG-039 |
| 47 | 583 | reports.spec.ts:402:9 › Report export › /reports/pipeline: Export Excel downloads a non-empty xlsx | login page (session lost) – TimeoutError: page.waitForEvent: Timeout 30000ms exceeded while waiting for event "downloa | auth cascade (login page) | BUG-039 |
| 48 | 584 | reports.spec.ts:402:9 › Report export › /reports/revenue: Export Excel downloads a non-empty xlsx | login page (session lost) – TimeoutError: page.waitForEvent: Timeout 30000ms exceeded while waiting for event "downloa | auth cascade (login page) | BUG-039 |
| 49 | 585 | reports.spec.ts:414:7 › Report export › financial export offers PDF and downloads a non-empty file | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 50 | 587 | settings-company.spec.ts:144:7 › Settings — company configuration › settings hub lists every configuration area and links through | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Company | auth cascade (login page) | BUG-039 |
| 51 | 596 | settings-team.spec.ts:29:7 › Settings › Team › invite dialog opens, validates required fields, and cancels | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 52 | 604 | settings-team.spec.ts:182:7 › Settings › Profile › profile page pre-fills values and persists edits | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Profile | auth cascade (login page) | BUG-039 |
| 53 | 606 | settings-team.spec.ts:224:7 › Settings › Profile › back button returns to settings | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 54 | 607 | settings-team.spec.ts:233:7 › Settings › Email signature › fill every field, preview updates, saves and re-loads pre-filled | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Email S | auth cascade (login page) | BUG-039 |
| 55 | 608 | settings-team.spec.ts:280:7 › Settings › Email signature › hide / show preview toggles the preview card | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Signature Preview') Expect | auth cascade (login page) | BUG-039 |
| 56 | 609 | settings-team.spec.ts:292:7 › Settings › Login history & sessions › own login history lists the current login with a status badge | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('thead').getByText('Date & ti | auth cascade (login page) | BUG-039 |
| 57 | 610 | settings-team.spec.ts:305:7 › Settings › Login history & sessions › sessions page shows table with current session | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('table') Expected: visible | auth cascade (login page) | BUG-039 |
| 58 | 613 | settings-team.spec.ts:341:7 › Settings › Activity log › lists entries with search, filter dialog, and empty state | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 59 | 614 | settings-team.spec.ts:368:7 › Settings › Activity log › infinite scroll loads more activity rows | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 60 | 615 | settings-team.spec.ts:379:7 › Settings › Activity log › userId URL param pre-filters the log to that user | login page (session lost) – Error: expect(locator).toContainText(expected) failed Locator: locator('tbody tr').first() | auth cascade (login page) | BUG-039 |
| 61 | 616 | showcase\full-walkthrough.spec.ts:303:5 › TravelCRM Pro — complete feature walkthrough | login page (session lost) – Test timeout of 90000ms exceeded. | auth cascade (login page) | BUG-039 |
| 62 | 617 | super-admin.spec.ts:55:7 › Super Admin › sidebar exposes the Super Admin entry to a tenant admin and routes to the dashboard | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Platform administration ac | auth cascade (login page) | BUG-039 |
| 63 | 618 | super-admin.spec.ts:65:7 › Super Admin › every page renders either its data view or the access panel, with no error toast and no mailto/wa.me/tel links | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByTestId('super-admin-no-access')  | auth cascade (login page) | BUG-039 |
| 64 | 619 | super-admin.spec.ts:77:7 › Super Admin › a tenant admin without super-admin rights sees an explanation instead of 403 errors | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByTestId('super-admin-no-access')  | auth cascade (login page) | BUG-039 |
| 65 | 628 | suppliers.spec.ts:58:7 › Suppliers: CRUD round trip › create with every field → list → drawer → detail → edit prefill → edit → delete | login page (session lost) – TimeoutError: locator.fill: Timeout 15000ms exceeded. Call log: - waiting for locator('#co | auth cascade (login page) | BUG-039 |
| 66 | 629 | suppliers.spec.ts:202:7 › Suppliers: CRUD round trip › form validation: name required and invalid email rejected | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 67 | 630 | suppliers.spec.ts:225:7 › Suppliers: form components › PhoneInput, category enum, status, preferred switch; no raw ID inputs | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('button[role="combobox"]').fi | auth cascade (login page) | BUG-039 |
| 68 | 631 | suppliers.spec.ts:267:7 › Suppliers: form components › edit form pre-fills seeded values with no "undefined" | login page (session lost) – Error: expect(locator).toHaveValue(expected) failed Locator: locator('#companyName') Expec | auth cascade (login page) | BUG-039 |
| 69 | 632 | suppliers.spec.ts:300:7 › Suppliers: list page › header, Add Supplier, columns, search placeholder, no undefined/NaN | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 70 | 633 | suppliers.spec.ts:322:7 › Suppliers: list page › search narrows results to the matching supplier only | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 71 | 634 | suppliers.spec.ts:334:7 › Suppliers: list page › category, status and preferred filters actually narrow the list | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 72 | 635 | suppliers.spec.ts:384:7 › Suppliers: list page › empty state renders when filters match nothing | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('No suppliers yet') Expecte | auth cascade (login page) | BUG-039 |
| 73 | 636 | suppliers.spec.ts:391:7 › Suppliers: list page › hover actions: View, Edit, Delete (and Call) appear and navigate | login page (session lost) – TimeoutError: locator.hover: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 74 | 637 | suppliers.spec.ts:414:7 › Suppliers: list page › delete via row action removes the supplier | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 75 | 638 | suppliers.spec.ts:430:7 › Suppliers: list page › bulk select + Delete removes several suppliers | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 76 | 639 | suppliers.spec.ts:444:7 › Suppliers: list page › infinite scroll loads more rows when scrolled | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr[class*="cu | auth cascade (login page) | BUG-039 |
| 77 | 640 | suppliers.spec.ts:460:7 › Suppliers: list page › export downloads a non-empty CSV containing the data | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 78 | 642 | suppliers.spec.ts:494:7 › Suppliers: detail page › stats, tabs and overview sections render without undefined | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'DetailT | auth cascade (login page) | BUG-039 |
| 79 | 643 | suppliers.spec.ts:518:7 › Suppliers: detail page › Prefer / Unprefer toggles and persists | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 80 | 644 | suppliers.spec.ts:535:7 › Suppliers: detail page › record a payment → appears in Payments list and updates totals | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 81 | 645 | suppliers.spec.ts:572:7 › Suppliers: detail page › Related tab: rate cards, payments and ledger sections with Add Rate Card link | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 82 | 646 | suppliers.spec.ts:599:7 › Suppliers: detail page › Documents tab shows an upload dropzone and empty state | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 83 | 647 | suppliers.spec.ts:620:7 › Suppliers: detail page › missing supplier shows a friendly error with a way back | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Failed to load supplier')  | auth cascade (login page) | BUG-039 |
| 84 | 648 | suppliers.spec.ts:639:7 › Suppliers: communication › detail "Send message" opens SendMessageDialog; no mailto/wa.me/tel links | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 85 | 649 | suppliers.spec.ts:658:7 › Suppliers: communication › list drawer "Email" opens SendMessageDialog; Call routes through the dialer | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 86 | 650 | suppliers.spec.ts:684:7 › Suppliers: rate comparison › form fields, season options and enable/disable of Compare Rates | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 87 | 651 | suppliers.spec.ts:709:7 › Suppliers: rate comparison › no matching rates shows the "No rates found" empty state | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 88 | 652 | suppliers.spec.ts:721:7 › Suppliers: rate comparison › compares seeded rate cards, ranks cheapest first and navigates to the supplier | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 89 | 653 | suppliers.spec.ts:767:7 › Suppliers: navigation and API › sidebar Suppliers and Rate Comparison links navigate | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('aside a[href="/suppliers"]') | auth cascade (login page) | BUG-039 |
| 90 | 655 | tasks.spec.ts:91:7 › Tasks: CRUD round trip › create with every field → list → detail → edit prefill → edit → delete | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 91 | 656 | tasks.spec.ts:202:7 › Tasks: create form › submitting without a title shows a validation toast and keeps the dialog open | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 92 | 657 | tasks.spec.ts:211:7 › Tasks: create form › category dropdown lists every option | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 93 | 658 | tasks.spec.ts:223:7 › Tasks: create form › assignee and lead are searchable comboboxes (typing filters), never raw ID inputs | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  getByRole('dialog').locator( | auth cascade (login page) | BUG-039 |
| 94 | 659 | tasks.spec.ts:253:7 › Tasks: create form › lead is pre-filled from ?leadId URL params and the created task is linked to it | login page (session lost) – Error: expect(locator).toContainText(expected) failed Locator: getByRole('dialog').locator | auth cascade (login page) | BUG-039 |
| 95 | 660 | tasks.spec.ts:277:7 › Tasks: list UX › search narrows rows and a non-matching search renders the empty state | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 96 | 661 | tasks.spec.ts:294:7 › Tasks: list UX › status filter lists every status and narrows the table | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 97 | — | tasks.spec.ts:320:7 › Tasks: list UX › priority filter narrows the table | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for locator('bu | auth cascade (login page) | BUG-039 |
| 98 | 663 | tasks.spec.ts:335:7 › Tasks: list UX › row hover actions: view navigates, delete removes the row | login page (session lost) – TimeoutError: locator.hover: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 99 | 664 | tasks.spec.ts:360:7 › Tasks: list UX › bulk select → Mark complete, then bulk Delete | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 100 | 665 | tasks.spec.ts:388:7 › Tasks: list UX › export downloads a non-empty CSV containing the data | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 101 | 666 | tasks.spec.ts:409:7 › Tasks: list UX › infinite scroll loads more rows when scrolled | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr:has(td)'). | auth cascade (login page) | BUG-039 |
| 102 | 668 | tasks.spec.ts:433:7 › Tasks: detail page › status select updates the task and the Overview badge | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Status  | auth cascade (login page) | BUG-039 |
| 103 | 669 | tasks.spec.ts:453:7 › Tasks: detail page › subtasks: add, toggle complete, progress and parent counts | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('No subtasks yet') Expected | auth cascade (login page) | BUG-039 |
| 104 | 670 | tasks.spec.ts:475:7 › Tasks: detail page › comments: post, edit, delete; Activity tab shows creation and comments | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 105 | 671 | tasks.spec.ts:508:7 › Tasks: detail page › overdue badge shows for past due dates and disappears when done | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Overdue', { exact: true }) | auth cascade (login page) | BUG-039 |
| 106 | 672 | tasks.spec.ts:521:7 › Tasks: detail page › unknown task id renders the not-found state | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Task not found') Expected: | auth cascade (login page) | BUG-039 |
| 107 | 673 | tasks.spec.ts:535:7 › Tasks: kanban › three columns, overdue card, drag a card to Done persists and updates the dashboard summary | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('h3').filter({ hasText: 'To D | auth cascade (login page) | BUG-039 |
| 108 | 674 | tasks.spec.ts:576:7 › Tasks: kanban › create from the kanban view adds the card to To Do | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('h3').filter({ hasText: 'To D | auth cascade (login page) | BUG-039 |
| 109 | 675 | tasks.spec.ts:594:7 › Tasks: no direct messaging links › list, kanban and detail pages have no mailto:/wa.me/tel: anchors | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('h3').filter({ hasText: 'To D | auth cascade (login page) | BUG-039 |
| 110 | 679 | test-harness.spec.ts:52:7 › Test harness — /test/reset › reseeded record appears in the CRM UI and disappears after reset | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Harness Visible 1791016990 | auth cascade (login page) | BUG-039 |
| 111 | 680 | travellers.spec.ts:95:7 › Travellers: full round trip › create with every field -> list -> detail -> edit pre-fill -> edit -> delete | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 112 | 681 | travellers.spec.ts:203:7 › Travellers: form › email and phone entered in the form persist and show on the detail and edit pages | login page (session lost) – Error: expect(page).toHaveURL(expected) failed Expected pattern: /\/travellers\/(?!new$)[\ | auth cascade (login page) | BUG-039 |
| 113 | 684 | travellers.spec.ts:269:7 › Travellers: form › contact is a searchable relation combobox, not a raw id input | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('option', { name: /RelAlpha | auth cascade (login page) | BUG-039 |
| 114 | 686 | travellers.spec.ts:295:7 › Travellers: form › ?contactId prefills the contact combobox with the contact name | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('combobox').filter({ hasTex | auth cascade (login page) | BUG-039 |
| 115 | 687 | travellers.spec.ts:307:7 › Travellers: list › header, add button, search box, columns and sidebar entry | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('aside a[href="/travellers"]' | auth cascade (login page) | BUG-039 |
| 116 | 688 | travellers.spec.ts:325:7 › Travellers: list › search narrows by name and by passport number; no match shows empty state | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 117 | 689 | travellers.spec.ts:347:7 › Travellers: list › hover reveals View / Edit / Delete; row click and View open detail; Edit opens edit page | login page (session lost) – TimeoutError: locator.hover: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 118 | 690 | travellers.spec.ts:377:7 › Travellers: list › row Delete asks for confirmation; Cancel keeps the row, Delete removes it | login page (session lost) – TimeoutError: locator.hover: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 119 | 691 | travellers.spec.ts:407:7 › Travellers: list › passport expiry tag: valid, expiring soon and expired all render real dates | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 120 | 692 | travellers.spec.ts:432:7 › Travellers: list › export downloads a non-empty CSV containing the visible rows | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 121 | 693 | travellers.spec.ts:454:7 › Travellers: list › bulk select + delete removes the selected rows | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 122 | 694 | travellers.spec.ts:473:7 › Travellers: list › infinite scroll loads the next page when the sentinel is reached | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr[tabindex]' | auth cascade (login page) | BUG-039 |
| 123 | 696 | travellers.spec.ts:507:7 › Travellers: detail › tabs, header, passport in mono font, no undefined/NaN | login page (session lost) – Error: expect(locator).toHaveText(expected) failed Locator:  getByRole('heading', { level: | auth cascade (login page) | BUG-039 |
| 124 | 697 | travellers.spec.ts:524:7 › Travellers: detail › passport status tag reflects valid vs expired | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText(/Passport valid till \d{1,2 | auth cascade (login page) | BUG-039 |
| 125 | 698 | travellers.spec.ts:536:7 › Travellers: detail › link and unlink a contact via the Link Contact dialog | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('No contact linked yet') Ex | auth cascade (login page) | BUG-039 |
| 126 | 699 | travellers.spec.ts:565:7 › Travellers: detail › Send message opens SendMessageDialog; no mailto:/tel:/wa.me anchors on detail | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 127 | 700 | travellers.spec.ts:583:7 › Travellers: detail › Related tab lists the traveller's visa applications; New visa application carries the traveller | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 128 | 701 | travellers.spec.ts:610:7 › Travellers: detail › traveller without visas shows the empty related state | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 129 | 702 | travellers.spec.ts:618:7 › Travellers: detail › Documents tab uploads, lists and deletes a traveller document | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 130 | 703 | travellers.spec.ts:638:7 › Travellers: detail › deleting from detail asks for confirmation first; Cancel keeps the traveller | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 131 | 705 | visa.spec.ts:155:7 › A. Create → list → detail → edit → delete › every field survives create, list, detail, edit pre-fill, edit and delete | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 132 | 707 | visa.spec.ts:278:7 › B. Form › traveller and destination are searchable comboboxes — typing filters options, no raw ID input | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  getByRole('option', { name:  | auth cascade (login page) | BUG-039 |
| 133 | 708 | visa.spec.ts:323:7 › B. Form › ?travellerId= pre-selects the traveller by name, and the prefilled form saves | login page (session lost) – Error: expect(locator).toContainText(expected) failed Locator: locator('label').filter({ h | auth cascade (login page) | BUG-039 |
| 134 | 710 | visa.spec.ts:358:7 › C. List › header, count, columns, filter bar and sidebar entry render | login page (session lost) – TimeoutError: page.waitForURL: Timeout 30000ms exceeded. waiting for navigation until "loa | auth cascade (login page) | BUG-039 |
| 135 | — | visa.spec.ts:377:7 › C. List › search narrows rows by destination | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 136 | 712 | visa.spec.ts:394:7 › C. List › status filter lists every status, narrows rows, shows the empty state and clears | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 137 | 713 | visa.spec.ts:427:7 › C. List › empty state renders when the search matches nothing | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('No visa applications yet') | auth cascade (login page) | BUG-039 |
| 138 | 714 | visa.spec.ts:436:7 › C. List › hover reveals View / Edit / Delete and each one navigates or acts | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 139 | — | visa.spec.ts:462:7 › C. List › clicking a row opens the detail page | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 140 | 716 | visa.spec.ts:476:7 › C. List › row Delete asks for confirmation: Cancel keeps the row, Delete removes it and the list refreshes | login page (session lost) – TimeoutError: locator.hover: Timeout 15000ms exceeded. Call log: - waiting for locator('tb | auth cascade (login page) | BUG-039 |
| 141 | 717 | visa.spec.ts:504:7 › C. List › bulk select + delete removes the selected rows | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 142 | 718 | visa.spec.ts:523:7 › C. List › export downloads a non-empty, correctly-shaped CSV | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr').filter({ | auth cascade (login page) | BUG-039 |
| 143 | 719 | visa.spec.ts:556:7 › C. List › infinite scroll loads the next page when the sentinel is reached | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr[tabindex]' | auth cascade (login page) | BUG-039 |
| 144 | 720 | visa.spec.ts:581:7 › D. Detail › header shows traveller, destination · type and status; missing optionals render a dash, not undefined | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Hdr1791 | auth cascade (login page) | BUG-039 |
| 145 | 721 | visa.spec.ts:602:7 › D. Detail › every status renders its own label on the detail page | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Stt1791 | auth cascade (login page) | BUG-039 |
| 146 | 722 | visa.spec.ts:621:7 › D. Detail › checklist is auto-generated; ticking items updates progress, persists, and advances the status | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('0/8 completed') Expected:  | auth cascade (login page) | BUG-039 |
| 147 | 723 | visa.spec.ts:652:7 › D. Detail › notes can be edited, cancelled and saved, and persist | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Original note') Expected:  | auth cascade (login page) | BUG-039 |
| 148 | 724 | visa.spec.ts:681:7 › D. Detail › documents: upload, list, download and delete | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 149 | 725 | visa.spec.ts:719:7 › D. Detail › documents: a disallowed file type is rejected client-side | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 150 | 726 | visa.spec.ts:730:7 › D. Detail › activity tab shows created and current status | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 151 | 727 | visa.spec.ts:741:7 › D. Detail › delete asks for confirmation: Cancel keeps the record, Delete removes it and returns to the list | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 152 | 728 | visa.spec.ts:759:7 › D. Detail › an unknown id shows the error state with a way back, not a crash | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Failed to load visa record | auth cascade (login page) | BUG-039 |
| 153 | 729 | visa.spec.ts:772:7 › E. Dashboard › stats match the API, upcoming deadlines and by-country render real data and link to detail | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Visa Da | auth cascade (login page) | BUG-039 |
| 154 | — | visa.spec.ts:802:7 › E. Dashboard › View All Applications goes to the list | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 155 | 731 | visa.spec.ts:815:7 › F. Cross-entity and API › traveller detail → New visa application opens the form with that traveller selected; the new visa appears on the traveller | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 156 | 732 | visa.spec.ts:840:7 › F. Cross-entity and API › sidebar entry navigates to the visa list | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for locator('as | auth cascade (login page) | BUG-039 |
| 157 | 735 | voip-settings.spec.ts:152:7 › A. voip_calling gate › both pages render the feature or an upgrade affordance, never a 403 error | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'VoIP Se | auth cascade (login page) | BUG-039 |
| 158 | 736 | voip-settings.spec.ts:181:7 › B. VoIP settings form › fill every field, save, pre-fill after reload, persisted via API with masked secret | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'VoIP Se | auth cascade (login page) | BUG-039 |
| 159 | 742 | voip-settings.spec.ts:312:7 › C. Phone numbers › empty state, search -> purchase, set primary, delete | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Phone N | auth cascade (login page) | BUG-039 |
| 160 | 746 | vouchers.spec.ts:129:7 › A. Hotel voucher — full lifecycle › create through the form with every field, lands on detail showing every value | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 161 | 752 | vouchers.spec.ts:345:7 › B. Transport, flight and activity vouchers through the UI › transport voucher: every field in, detail and edit round trip | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 162 | 753 | vouchers.spec.ts:393:7 › B. Transport, flight and activity vouchers through the UI › flight voucher: every field in, detail and edit pre-fill | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 163 | 754 | vouchers.spec.ts:436:7 › B. Transport, flight and activity vouchers through the UI › activity voucher: every field in, detail and edit pre-fill | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 164 | 755 | vouchers.spec.ts:467:7 › B. Transport, flight and activity vouchers through the UI › title is auto-generated when left empty | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 165 | 756 | vouchers.spec.ts:483:7 › C. Voucher form — validation, relations, prefill › submitting an empty form shows required errors and creates nothing | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 166 | 757 | vouchers.spec.ts:521:7 › C. Voucher form — validation, relations, prefill › lead and supplier are searchable comboboxes, never raw ID inputs | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('option', { name: /VchLeadB | auth cascade (login page) | BUG-039 |
| 167 | 758 | vouchers.spec.ts:546:7 › C. Voucher form — validation, relations, prefill › URL params pre-fill the lead and the voucher type | login page (session lost) – Error: expect(locator).toContainText(expected) failed Locator: locator('label[for="leadId" | auth cascade (login page) | BUG-039 |
| 168 | 760 | vouchers.spec.ts:600:7 › D. Voucher list › header, count, primary action, filter bar and sidebar entry | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('aside a[href="/vouchers"]'). | auth cascade (login page) | BUG-039 |
| 169 | 761 | vouchers.spec.ts:618:7 › D. Voucher list › search narrows the list and the empty state renders when nothing matches | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 170 | 762 | vouchers.spec.ts:634:7 › D. Voucher list › type filter narrows, shows a chip, and the chip removes it | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 171 | 763 | vouchers.spec.ts:656:7 › D. Voucher list › status filter offers draft/sent/confirmed only and narrows | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 172 | 764 | vouchers.spec.ts:678:7 › D. Voucher list › hover reveals View/Edit/Send/Delete and row click opens the detail page | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: locator('tbody tr').filter({ hasText: | auth cascade (login page) | BUG-039 |
| 173 | 765 | vouchers.spec.ts:706:7 › D. Voucher list › bulk selection deletes several vouchers and refreshes the list | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 174 | 766 | vouchers.spec.ts:720:7 › D. Voucher list › infinite scroll loads the next page when the list is scrolled | login page (session lost) – Error: expect(locator).toHaveCount(expected) failed Locator:  locator('tbody tr') Expected | auth cascade (login page) | BUG-039 |
| 175 | 767 | vouchers.spec.ts:740:7 › D. Voucher list › export downloads a non-empty, themed CSV containing the data | login page (session lost) – TimeoutError: page.waitForEvent: Timeout 15000ms exceeded while waiting for event "downloa | auth cascade (login page) | BUG-039 |
| 176 | 768 | vouchers.spec.ts:766:7 › E. Voucher detail — messaging and PDF › Send message opens the Communication Hub dialog, no mailto:/wa.me/tel: anywhere | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 177 | 769 | vouchers.spec.ts:786:7 › E. Voucher detail — messaging and PDF › PDF button downloads a non-empty file without an error toast | login page (session lost) – TimeoutError: locator.click: Timeout 15000ms exceeded. Call log: - waiting for getByRole(' | auth cascade (login page) | BUG-039 |
| 178 | 770 | vouchers.spec.ts:801:7 › E. Voucher detail — messaging and PDF › detail page shows lead, language and created date for a seeded voucher | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByText('Voucher info') Expected: v | auth cascade (login page) | BUG-039 |
| 179 | 781 | whatsapp-campaigns.spec.ts:130:7 › WhatsApp campaigns › A. list page renders the working feature or an upgrade affordance, never an error toast | login page (session lost) – Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'WhatsAp | auth cascade (login page) | BUG-039 |

## Driver app session log

Built with `flutter build apk --debug --dart-define=API_BASE_URL=http://localhost:8787 --dart-define=TENANT_ID=01960000-0000-7000-8000-000000000001` (x86 PowerShell), installed on emulator-5554, `adb reverse tcp:8787 tcp:8787`. Cleartext HTTP was **not** blocked in the debug build (request reached wrangler and returned 400). Login screen renders (shots/driver-01-launch.png, driver-04-login-dark.png); Send OTP → 400 (missing tenantId) → client TypeError → infinite spinner (driver-02/03). With tenantId added manually via curl the backend returns 500 "Failed to send OTP" (Twilio). Login was therefore impossible; trips, trip detail, accept/en-route/check-in/complete, history, profile and documents were reviewed by code only (bugs listed above under DRIVER-*). Emulator was shut down afterwards.

## Static checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 99 errors: 0 app src, 97 unit-test files, 2 e2e (`e2e/itineraries.spec.ts:40`, `e2e/webhooks-integrations.spec.ts:61`) |
| `npx vitest run` | Files 10 failed / 43 passed (53); tests 19 failed / 1085 passed (1104). Baseline (unit-baseline.json): 1049 passed, failedFiles auth/client/settings/users. New failures: ai, chatbot, credit-notes, exports, marketing, payments, vouchers (stale client tests). |
| `npx eslint` | Crashes: "Converting circular structure to JSON … property 'react' closes the circle" (@eslint/eslintrc config-validator) |
| `npm run lint` | `next lint` does not exist in Next 16.1.6 |
| `npx next build` | Fails (Turbopack vs webpack config). `npx next build --webpack` succeeds. |
| `flutter build apk --debug` (driver) | Succeeds (Java "source value 8 obsolete" warnings only) |
