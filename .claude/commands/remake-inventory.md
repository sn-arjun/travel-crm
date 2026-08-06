# Phase 0: INVENTORY (READ-ONLY except for the output files)

You are producing the gap analysis that every later job in the UI/UX remake pipeline depends on. **Do not modify a single source file.** Your only writes are the output files listed at the bottom.

Everything downstream reads *your* JSON instead of re-scanning the repo. That is the entire token budget strategy of this pipeline. If your manifests are wrong or incomplete, ~56 later jobs are wrong.

## Source of truth hierarchy

1. `backend/src/index.ts` — the `routeMounts` array and the pre-auth mounts are the definitive list of what the API exposes.
2. `backend/src/routes/*.ts` — the actual handlers.
3. `desktop/src/lib/api/*.ts` — what the client can call.
4. `desktop/src/app/(app)/**` — what a user can actually reach.
5. `desktop/e2e/*.spec.ts` — what is proven to work.

Backend beats frontend. If the API has it and the UI does not, that is a gap, not a decision.

## Step 1 — enumerate the backend surface

Read `backend/src/index.ts` completely. Record:

- Every entry in the `routeMounts` array (~55). Remember each is mounted **twice**: `/api/v1/<path>` and `/api/<path>`.
- The pre-auth mounts registered before `authMiddleware`: `webhooks`, `webhook` (lead capture), `voip` callbacks, `test`, `driver`, `public`.
- Every `requireFeature(...)` and `checkUsageCap(...)` registration and the exact path prefix it guards.
- The WebSocket upgrade route and the cron handlers in `scheduled()`.

Then for each mounted route file in `backend/src/routes/`, list every handler: HTTP method, sub-path, and whether it is a list / create / read / update / delete / action endpoint. Use Grep for `app.get(`, `app.post(`, `app.put(`, `app.patch(`, `app.delete(` — you do not need to read every line of every route file.

## Step 2 — enumerate the client surface

- `desktop/src/lib/api/*.ts` — every exported function and the endpoint path it calls. Ignore the `*.test.ts` files.
- `desktop/src/app/(app)/**/page.tsx` — every reachable page and its route.
- `desktop/src/components/layout/sidebar.tsx` — what is actually navigable (a page that exists but is not linked is effectively missing).
- Grep for imports of `@/lib/mock-data` and `@/lib/fleet-mock-data` — every hit is a **mocked** feature masquerading as a finished one.

## Step 3 — classify every endpoint

| Class | Meaning |
|---|---|
| `wired` | API client function + reachable UI + E2E coverage |
| `client-only` | API client function exists, no UI reaches it |
| `orphaned` | No API client function at all |
| `mocked` | UI exists but reads mock-data instead of the API |
| `stale` | Client function whose backend endpoint no longer exists |

Cross-check against the existing audits in `desktop/audit/M*-audit.md` and `desktop/audit/IMPROVEMENTS.md`. Every unresolved item there must appear in your analysis with a disposition. **Do not read all 13 audit files in full** — grep them for the endpoint/feature names you are unsure about.

## Step 4 — define the slices

Group the whole surface into **feature slices**. A slice is one coherent user-facing area that one agent can rebuild in a single bounded context. Rules:

- Aim for 25–35 slices. A slice with more than ~8 pages is too big; split it.
- Every backend endpoint belongs to exactly one slice.
- `orphaned` endpoints with no UI today get their **own new slices** — this project has decided to build UI for all of them.
- Slice names are lowercase kebab-case, stable, and must not contain `:` or `/`.

## Output — you MUST use the Write tool for every file below

### 1. `desktop/audit/remake/inventory.json`

```json
{
  "generated": "<iso timestamp>",
  "totals": { "endpoints": 0, "wired": 0, "clientOnly": 0, "orphaned": 0, "mocked": 0, "stale": 0 },
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/v1/leads",
      "routeFile": "backend/src/routes/leads.ts",
      "kind": "list",
      "gate": null,
      "apiClient": "desktop/src/lib/api/leads.ts:listLeads",
      "page": "desktop/src/app/(app)/leads/page.tsx",
      "classification": "wired",
      "slice": "leads"
    }
  ]
}
```

`gate` is the feature-gate name (`ai_assistant`, `voip_calling`, `whatsapp_campaigns`, …) or `null`.

### 2. `desktop/audit/remake/slices/<slice>.json` — one per slice

```json
{
  "slice": "leads",
  "title": "Leads",
  "status": "existing",
  "showcaseOrder": 4,
  "endpoints": ["GET /api/v1/leads", "POST /api/v1/leads"],
  "gates": [],
  "apiModules": ["desktop/src/lib/api/leads.ts"],
  "pages": ["desktop/src/app/(app)/leads/page.tsx"],
  "newPages": [],
  "stores": ["desktop/src/stores/lead-store.ts"],
  "existingSpecs": ["desktop/e2e/04-leads.spec.ts"],
  "targetSpec": "desktop/e2e/leads.spec.ts",
  "seedHelpers": ["seedLead"],
  "fileAllowlist": [
    "desktop/src/app/(app)/leads/**",
    "desktop/src/lib/api/leads.ts",
    "desktop/src/stores/lead-store.ts"
  ],
  "uxContract": {
    "listPage": false, "filterBar": true, "infiniteScroll": false,
    "hoverActions": false, "detailDrawer": false, "emptyState": true,
    "skeleton": true, "relationCombobox": false, "urlPrefill": false,
    "phoneInput": true, "addressAutocomplete": false, "currencyInput": false,
    "datePicker": true, "sendMessageDialog": false, "themedExport": false
  },
  "notes": "Detail drawer missing; supplier field is a raw ID input.",
  "showcaseScript": [
    "Open Leads from the sidebar",
    "Filter by status = qualified",
    "Create a lead with all fields",
    "Open the detail drawer and confirm every field",
    "Convert the lead"
  ]
}
```

Rules that later jobs depend on — get these exactly right:

- `status` is `"existing"` (has UI today) or `"new"` (built from an orphaned/mocked endpoint).
- **`targetSpec` MUST be exactly `desktop/e2e/<slice>.spec.ts`.** The pipeline gates on that literal path.
- `uxContract` booleans describe the **current** state — `false` means the slice job must implement it.
- `fileAllowlist` is the complete set of globs the slice job is permitted to edit. Be generous enough that the job is not blocked, tight enough that it cannot wander.
- `showcaseOrder` is a unique integer defining narrative order in the final video: auth/shell first, dashboard second, then core CRM (contacts, leads, itineraries, invoices), then operations, then marketing/AI, then admin/settings last.
- `showcaseScript` is 3–6 imperative one-line steps. These become the video's chapters — write them as a product demo, not a test plan.

### 3. `desktop/audit/remake/FEATURE-GAP-ANALYSIS.md`

Human-readable: totals table, one section per classification listing every endpoint with its slice, a section reconciling the unresolved items from the existing `M*-audit.md` audits, and a "biggest surprises" section at the top for a human skimming it.

## Reminders

- Use the **Write** tool. Printing the report to stdout is a failed job — the pipeline checks that `inventory.json` and `FEATURE-GAP-ANALYSIS.md` exist on disk.
- Emit valid JSON. Downstream jobs `JSON.parse` these files.
- Be exhaustive on endpoints, concise in prose.
