# W6 page batches — what changed underneath you (read before editing)

Everything below is already on `ui-remake`. Use these; do not re-invent them.

## Tokens and primitives (B06)
- One palette: legacy shadcn colour names (`bg-primary`, `text-muted-foreground`, `border`, …) resolve to the `--ds-*` tokens (indigo primary) in light and dark. Prefer `ds-*` classes in new code.
- Raw Tailwind palette classes (`text-red-500`, `bg-gray-100`, …), raw hex/rgb and raw px are lint errors (CONTRACT §3). Your files must reach **0 lint errors** (`lintZero` in your batch).
- `Dialog`/`Sheet` content scrolls internally (`max-h` set); do not add your own page-level overflow hacks.

## Shell (B07)
- `<main id="main-content">` is the only page scroller. Pages render inside `PageContainer` (`@/components/layout/page-container`) — `ListPage`, `DetailPage`, `EntityForm` already wrap themselves. Hand-built pages must use `PageContainer` and must NOT set `h-full overflow-auto` (nested scrollers fail the layout probe). Mark an intentional inner scroller with `data-scroll-region`.
- Top-bar title comes from `nav-config.ts` `getPageTitle`; it is a label (`[data-slot="topbar-title"]`), the page owns the single `<h1>`.
- Sidebar/user menu show the real signed-in user; Super Admin link uses `useIsSuperAdmin` (`GET /admin/whoami`).

## API layer (B01, B11)
- `@/lib/api/envelope`: `unwrapList`, `unwrapEntity`, `unwrapReport`, `toApiResponse`, `camelizeKeys`. Never hand-roll `res.data.data` or snake/camel fallbacks in pages.
- The client throws `ApiError`; token refresh is single-flight (no special handling needed).

## Lists (B14)
- `ListPage` props: `refreshKey` (bump after a mutation — never `key=`), `filters` (anything the fetcher reads must be in `filters` or `refreshKey`, otherwise no refetch), `serverSort` + `defaultSort` (fetcher receives `params.sort`). Error state testid `list-error`.
- `DataTable`: rows are plain `<tr>` inside `[data-scroll-region="table"]`; sticky header; sticky actions cell; `footer`, `maxHeight`, `fillViewport`; columns take `minWidth`, `wrap`.
- `useInfiniteScroll` returns `loadMoreError`, `retryLoadMore`, `refetch`.

## Forms (B16)
- `EntityForm`: throw `ApiError` from `onSubmit` → field errors + toast + `role=alert`. Invalid submit toasts "Please fix the highlighted fields" and focuses the first invalid field. `setValue` validates automatically once the form was submitted.
- Dates: `@/lib/dates` — `toLocalDateString`, `parseLocalDate`, `formatDisplayDate`, `toLocalDateTimeInput`. The `toISOString().split('T')[0]` idiom is a lint error.
- `DatePicker` (month/year selects, `fromYear`/`toYear`), `CurrencyInput`, `PhoneInput` (E.164), `AddressAutocomplete`, `RelationCombobox` (never raw ID inputs), `SendMessageDialog` (never `mailto:`/`wa.me`/`tel:`).

## Backend facts (B08, B12, B15, B32–B34)
- `GET /leads|itineraries|follow-ups|tasks|documents?contactId=` filter server-side. Tasks accept camelCase. `assignedTo: null` = unassigned lead.
- Validation errors: 400 `{error:{code:'VALIDATION_ERROR', message, fields}}`.
- Reports: all registry ids return 200; forbidden → 403. `GET /fleet/dashboard` `topDrivers` is real.
- Fleet routes `/fleet/vehicles/availability`, `/fleet/drivers/schedule`, `/vehicle-rate-cards/lookup`, `/calls/analytics`, `/calls/missed` now resolve.
- Transcript search accepts any text.

## E2E (B09, B16, B17)
- `import { test, expect } from './fixtures'` (per-test auth). Honour `E2E_BASE_URL`/`E2E_API_URL` (slot).
- Dates in specs: `e2e/helpers/date-picker.ts` `pickDate(page, trigger, date)`.
- Feature-gated areas: a spec must set the flags it needs or assert the gated state; never rely on another spec's leftovers.
- Current full-suite state and worklist: `desktop/audit/fix/e2e-after-B17.md`.

## Rules for W6 (FIX-PLAN §3)
- Edit only your `filesAllowlist`. If you need a shared component changed, write the request to `desktop/audit/fix/requests/<ID>.md` (what, why, minimal API) and work around it locally without duplicating the component.
- User-visible copy: realistic English; never "E2E", "Showcase", "Test ", lorem. No fake/mock data rendered as real — show real data or an honest empty state.
- Demo-critical: read `desktop/showcase/STORYBOARD.md` §0.4 (FR register) and the scenes that touch your pages; anything the story clicks must work.
