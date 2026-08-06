# Phase 4: CLEANUP — remove the debt, fix the docs drift

Mechanical pass. Every item below is a known, verified defect — you are not searching for problems, you are executing a list. Do not redesign anything.

## 1. Dead structure

- Delete `desktop/src/features/` — it is an empty directory left over from an abandoned structure.
- Delete `desktop/src/lib/mock-data.ts` and `desktop/src/lib/fleet-mock-data.ts`. The slice phase was required to wire every consumer to the real API. **Grep for imports of both first.** If anything still imports them, do not delete — report the remaining importers in your summary instead, because that means a slice job left a feature unimplemented.
- Rename `desktop/src/hooks/useNotifications.ts` → `use-notifications.ts` (a `use-notifications.test.ts` already exists with no matching kebab-case source). Update every import and `desktop/src/hooks/index.ts`.

## 2. Duplicate E2E specs

The suite carries two overlapping numbering schemes for the same features. The verify phase should have consolidated most into `desktop/e2e/<slice>.spec.ts`. Sweep up whatever is left from these known pairs:

| Feature | Duplicates |
|---|---|
| Invoices | `06-invoices.spec.ts` / `07-m7-invoices-payments.spec.ts` |
| Suppliers | `08-suppliers.spec.ts` / `12-m12-suppliers.spec.ts` |
| Fleet | `09-fleet.spec.ts` / `18-m18-fleet.spec.ts` |
| Travellers/Visa | `10-travellers-visa.spec.ts` / `13-m13-travellers-visa.spec.ts` |
| Tasks/Calendar | `11-tasks-calendar.spec.ts` / `14-m14-tasks-calendar.spec.ts` |
| Communication | `12-communication.spec.ts` / `08-m8-communication.spec.ts` |
| Marketing | `19-marketing.spec.ts` / `17-m17-marketing-campaigns.spec.ts` |
| Import/Export | `20-import-export.spec.ts` / `16-m16-import-export.spec.ts` |
| Itineraries | `05-itineraries.spec.ts` / `06-m6-itineraries-rate-cards.spec.ts` |
| Campaigns | `13-campaigns.spec.ts` / `09-m9-campaigns-email.spec.ts` |
| Reports | `14-reports.spec.ts` / `15-m15-reports-analytics.spec.ts` |
| Vouchers | `07-vouchers.spec.ts` / `11-m11-vouchers.spec.ts` |
| Notifications | `10-m10-notifications.spec.ts` |
| AI | `18-ai-features.spec.ts` |

Before deleting any spec, confirm its assertions exist in the surviving `<slice>.spec.ts`. **Carrying forward coverage matters more than reducing file count** — if an old spec asserts something the new one does not, port the assertion rather than dropping it.

Never touch `desktop/e2e/global-setup.ts`, `desktop/e2e/helpers/`, or `desktop/e2e/showcase/`.

## 3. Dead code

Run dead-code detection over `desktop/` (`npx knip` or `npx ts-prune`, plus `npx depcheck` for unused dependencies). Remove unreferenced exports and unused deps.

**Evidence required.** Only delete when the tool output plus a grep confirms zero references. Anything ambiguous goes in your summary as a recommendation — do not guess.

## 4. Build artifacts

Remove `desktop/tsconfig.tsbuildinfo` and `desktop/test-results/` from version control and add both to `.gitignore`.

## 5. Documentation drift — fix, do not archive

`README.md` still describes Flutter as the Web/Windows frontend. It is not: `desktop/` (Electron + Next.js 16 + React 19) is the primary client, and Flutter in `packages/` is mobile-only now. Correct the architecture section, the tech-stack table, and the repository-structure tree.

The root `package.json` has the same drift: `dev`, `build:web`, and `deploy:web` still point at the Flutter web build while the real workflow is `dev:desktop` / `build:desktop`. Make the desktop path the default and keep the Flutter scripts under clearly-named `:flutter` variants. Do not break `dev:api`, `db:*`, `infra*`, or `secrets:push`.

## 6. Archive stray docs — move, never delete

Create `docs/archive/` and move: `MILESTONE_7_API_REFERENCE.md`, `MILESTONE_7_FILE_CHECKLIST.md`, `MILESTONE_7_IMPLEMENTATION.md`, `MILESTONE_7_SUMMARY.md`, `MILESTONE_7_TAX_EXAMPLES.md`, `README_MILESTONE_7.md`, `M2-AUDIT-REPORT.md`, `PRD-AUDIT-REPORT.md`, `E2E-Test-Report.md`, `Flutter-E2E-Test-Report.md`, and the three `TravelCRM_PRD_*.xlsx` workbooks.

Leave `README.md`, `CONTRIBUTING.md`, `INTERNATIONAL-FEATURES-SHEET.md`, and everything under `desktop/audit/` where they are.

## Output — you MUST use the Write tool

### `desktop/audit/remake/UI-REMAKE-COVERAGE.md`

Built from `desktop/audit/remake/inventory.json` and the updated `slices/*.json`. One row per backend endpoint:

| Endpoint | Slice | UI page | CRUD wired | UX contract | E2E spec | Status |
|---|---|---|---|---|---|---|

Plus, at the top: totals, completion percentage, and an explicit **"Not done"** section listing every endpoint that is still not green with the reason. Do not mark anything green you have not verified from the manifests.

## Finish

`cd desktop && npx tsc --noEmit` and `npm run test -w travelcrm-desktop` must both pass. Summarize in 10 lines or fewer: what you deleted, what you archived, what you refused to delete and why.
