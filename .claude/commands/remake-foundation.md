# Phase 1: FOUNDATION — the design system every later job builds on

You are building the single design language for the TravelCRM Pro desktop app. ~30 slice jobs will build on top of what you produce here and will read **only** your `CONTRACT.md`, never your source. Get the APIs right the first time; there is no second foundation pass.

Read `desktop/audit/remake/inventory.json` for scope (which slices exist, which are new). Do **not** read the `M*-audit.md` files.

## What is wrong today

The app was built milestone-by-milestone by different agents. Every page invents its own layout markup, spacing, and color. Relation fields are raw ID inputs. Most list pages have no infinite scroll. There is no shared page shell. Your job is to make that impossible going forward.

## 1. Tokens — `desktop/src/design-system/tokens/`

Author the complete token set. **Every token needs a light and a dark value. No token may be light-only.**

- **Color** — semantic roles, not raw palettes: `background`, `surface`, `surface-raised`, `surface-sunken`, `border`, `border-strong`, `foreground`, `foreground-muted`, `foreground-subtle`, `primary`, `success`, `warning`, `danger`, `info`, each with `-hover`, `-active`, `-subtle`, and `-foreground` variants. Keep the established brand hues as the starting point (primary `#6366F1`, success `#10B981`, warning `#F59E0B`, danger `#EF4444`) but derive a proper scale around them.
- **Spacing** — 8pt scale.
- **Typography** — a type scale with size/line-height/weight/tracking triples.
- **Radius, elevation, motion** (durations + easings), **z-index** ladder.

Wire into `desktop/src/app/globals.css` using Tailwind 4 `@theme`, and export a typed TS mirror (`tokens.ts`) for consumers that cannot use classes — Recharts, jsPDF, and canvas.

**Contrast is a hard requirement:** every foreground/background token pair must hit 4.5:1 in both themes. Verify, do not assume.

## 2. Primitives — `desktop/src/components/ui/`

Re-baseline all 39 existing primitives onto the tokens. Every one gets consistent size variants, and `disabled` / `loading` / `error` states, a visible focus ring, and correct keyboard behavior.

Existing primitives to preserve the public API of (pages already import them): `button`, `input`, `select`, `combobox`, `table`, `dialog`, `sheet`, `tabs`, `badge`, `card`, `checkbox`, `switch`, `textarea`, `tooltip`, `popover`, `dropdown-menu`, `command`, `command-palette`, `date-picker`, `currency-input`, `phone-input`, `address-autocomplete`, `rich-text-editor`, `multi-step-wizard`, `empty-state`, `skeleton`, `spinner`, `progress`, `avatar`, `alert`, `accordion`, `collapsible`, `scroll-area`, `separator`, `label`, `form-field`, `aspect-ratio`, `countdown-badge`.

**Add the primitives the app currently open-codes:** `DataTable` (sorting, column visibility, row selection, sticky header, virtualization above ~200 rows), `Pagination`, `PageHeader`, `SectionCard`, `Stat`, `Toolbar`, `ConfirmDialog`, `FileDropzone`, `Timeline`, `Tag`, `Kbd`, `SplitButton`, and themed `Chart` wrappers over Recharts.

Export everything from `desktop/src/components/ui/index.ts`.

**Hard rule:** nothing in `components/ui/` may import from `@/lib/api`. Primitives are domain-free.

## 3. Archetypes — `desktop/src/components/domain/`

Three shells. Every feature screen in the app will be one of these.

Reuse what already exists rather than rewriting it: `components/domain/filter-bar.tsx`, `hooks/use-infinite-scroll.ts`, `hooks/use-debounced-value.ts`, `hooks/use-unsaved-changes.ts`, `hooks/use-api.ts`, `components/communication/send-message-dialog.tsx`, and the `PaginatedResponse<T>` / `ApiResponse<T>` types already exported from `desktop/src/lib/api/client.ts` — **do not redefine those types.**

### `ListPage<T>`
Composes: `PageHeader` with a total-count badge → `FilterBar` → `DataTable` with per-row hover actions → infinite scroll → detail drawer on row click → `EmptyState` → skeleton loading → bulk select with bulk actions → themed export button.

### `EntityForm<T>`
`react-hook-form` + Zod resolver. Sectioned layout with headings, required-field indicators, inline per-field validation, sticky Save/Cancel in the header, unsaved-changes guard, and **prefill from URL search params** so cross-entity navigation carries context.

### `DetailPage<T>`
Header with title + status badge + actions dropdown; tabs (Overview / Activity / Related / Documents); activity timeline; related-entity lists; all communication through `SendMessageDialog`.

### `RelationCombobox<T>`
**This component exists to delete every raw ID input in the app.** Searchable, debounced, paginated, async-loading, with an inline "create new" escape hatch. Any form field that references another entity uses this.

## 4. Field-type rules (enforced, not suggested)

| Field kind | Component |
|---|---|
| Relation / foreign key | `RelationCombobox` — **never** a text input |
| Phone / mobile | `PhoneInput` (country code picker) |
| Address | `AddressAutocomplete`, falling back to plain inputs when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is absent |
| Money / amount | `CurrencyInput` |
| Date | `DatePicker` |
| Outbound message | `SendMessageDialog` — **never** `mailto:`, `wa.me`, or `tel:` |

## 5. Feature gates — `desktop/src/hooks/use-feature-gate.ts`

The backend enforces plans in middleware and returns **403**. The UI must anticipate that, not react to it.

```ts
function useFeatureGate(feature: 'voip_calling' | 'ai_assistant' | 'ai_extraction'
  | 'ai_intelligence' | 'ai_chatbot' | 'whatsapp_campaigns'):
  { enabled: boolean; reason: 'ok' | 'not_in_plan' | 'cap_exceeded'; upgradeHref: string }
```

Gated surfaces render a disabled or upgrade state. A 403 must **never** surface as an error toast. Extend `hooks/use-ai-feature.ts` rather than duplicating it.

## 6. Lint enforcement

Add ESLint rules to `desktop/eslint.config.mjs` that fail the build on:
- raw hex / `rgb()` / hardcoded `px` outside `design-system/` and `globals.css`
- imports from `@/lib/api` inside `components/ui/`
- `mailto:` / `wa.me` / `tel:` links anywhere
- inline user-facing string literals in components (copy belongs in `design-system/copy/`)

## 7. Graceful degradation

Every env-dependent feature degrades to a disabled state or a manual fallback. **Nothing may crash on a missing env var.** This applies to Google Places, the realtime WebSocket, AI, VoIP, and messaging.

## Output — you MUST use the Write tool

### `desktop/audit/remake/CONTRACT.md` — **hard cap 300 lines**

This is the only foundation artifact later jobs read. It must be complete enough to build against and short enough to be cheap. Include:

1. Import paths for every archetype and primitive.
2. The full TypeScript props interface of `ListPage`, `EntityForm`, `DetailPage`, `RelationCombobox`, `DataTable`, `PageHeader`.
3. The token names — categories and the actual names, not values.
4. The field-type rules table above.
5. `useFeatureGate` usage with a 5-line example.
6. One complete ~40-line worked example of a list page built on `ListPage`, and one ~30-line form example. Slice jobs will pattern-match on these, so make them exemplary.
7. The lint rules, so slice jobs do not trip them.

No philosophy, no rationale, no history. Reference material only.

## Done when

- `npm run typecheck -w travelcrm-desktop` passes.
- `npm run test -w travelcrm-desktop` passes.
- `CONTRACT.md` exists and is ≤ 300 lines.

The pipeline runs those gates itself and will send you a repair job if they fail. Do not run the full Playwright suite — that is not your phase.
