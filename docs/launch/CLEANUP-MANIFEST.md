# Repo cleanup manifest (2026-10-09)

What was removed, moved or changed during the launch cleanup, and how to get any of it back.

## Result

| Measure | Before | After |
|---|---|---|
| Tracked files | 1,984 | 1,516 |
| Largest tracked file | 131 MB (a recording) | 1 MB (`package-lock.json`) |
| `.git` folder | 175 MB | 15 MB |
| Files over 1.5 MB anywhere in branch history | several recordings | none |
| Stale local branches | 3 `worktree-agent-*` | 0 |

Pushed history (`sn-arjun/master`, 8 commits) was not rewritten. Branch contents at each tip are byte-identical before and after the history strip (same tree ids).

## Where everything removed still lives

- **Branch `archive/flutter-crm`**: the Flutter CRM app. Restore with `git checkout archive/flutter-crm -- packages/crm_app`.
- **Branch `archive/pre-cleanup-2026-10-09`** and **tag `pre-launch-baseline`**: the tree before any cleanup (minus recordings).
- **Backup folder `C:/Users/Admin/Downloads/pro/CRM-backups/2026-10-09/`** (outside the repo):
  - `travelcrm-before-history-strip.bundle`: every branch exactly as it was before history was rewritten, recordings included. Restore with `git clone travelcrm-before-history-strip.bundle <folder>`.
  - `travelcrm-all-branches.bundle`, `uncommitted-tracked.patch`, `uncommitted-untracked.tar.gz`: the state at 04:26 before the assistant work was committed.

## Removed from the tree

| What | Files | Why |
|---|---|---|
| `packages/crm_app` | 461 | Replaced by the Electron desktop app; owner decision to archive |
| `.github/workflows/deploy-crm.yml`, `release.yml` | 2 | Only built the Flutter CRM app |
| Root `e2e/` | 25 | February Playwright suite, superseded by `desktop/e2e/` |
| `backend/*.log`, `backend/MILESTONE_10_IMPLEMENTATION.md` | 23 | Test and compiler output, a stale note with sandbox paths |
| `desktop/FLEET_*`, `desktop/README_FLEET_MODULE.md` | 4 | Notes for a mock-data fleet module that no longer exists |
| `desktop/src/lib/api/.env.example` | 1 | Duplicate of `desktop/.env.example` |
| `.~lock.TravelCRM_PRD_Coverage_Audit.xlsx#` | 1 | LibreOffice lock file |
| `desktop/audit/.checkpoint.*` | 2 | Pipeline scratch state |
| `turbo.json` and the `turbo` dependency | 1 | No script used it |
| `everything-claude-code/` | gitlink + folder | Nested clone of a public tool repository with no local changes; re-clone from `github.com/affaan-m/everything-claude-code` if wanted |

## Stopped tracking (files stay on disk, now ignored)

- `desktop/showcase/report/` and `desktop/showcase/.artifacts/`: raw recordings and Playwright output.

## Moved to `docs/archive/`

- `PRD-AUDIT-REPORT.md`, `INTERNATIONAL-FEATURES-SHEET.md`.
- March milestone audits from `desktop/audit/` → `docs/archive/desktop-audit-2026-03/`.

`docs/archive/README.md` says plainly that these overstate the current state. Kept in place because scripts read them: `desktop/audit/fix/` (gate and lint baselines, batches, `FINAL-E2E.md`) and `desktop/audit/remake/` (`CONTRACT.md`, slices).

## Ignore-rule fixes

- `*.js` (meant for compiled Dart) hid every JavaScript file. Now `*.dart.js`. **`landing/main.js` is tracked for the first time**; before this a fresh clone had a landing page with no script.
- `terraform/environments/{dev,staging,prod}.tfvars` are tracked (names and regions only; `terraform.yml` needs them).
- `packages/driver_app/pubspec.lock` is tracked.
- `.log` typo → `*.log`.

## Stripped from local-only history

From the 245 commits that were never pushed: every `*.webm`, `*.mp4`, `*.mov`, `*.mkv`, plus `desktop/showcase/report`, `desktop/showcase/.artifacts`, `desktop/test-results`, `desktop/playwright-report`. Commit ids on `ui-remake`, `assistant-automation`, `launch-readiness` and the archive branches changed as a result; their contents did not.

## Corrections to the audit

- The audit said `backend/package-lock.json` was out of sync. `npm ci --dry-run` passes in `backend/`; no change was needed.

## Deliberately left for the readiness batches

- `terraform/modules/cloudflare/pages.tf` still defines a Pages project that builds the removed Flutter web app and points the root domain at it. The packaging batch replaces it with the landing page.
- Workflows still trigger on `main` and pin Flutter 3.24; the CI batch fixes both.
- `README.md` and `CONTRIBUTING.md` still describe the Flutter CRM app; rewritten after the readiness work so they describe what was built.
- Agent pipeline scripts (`scripts/milestone-pipeline.js`, `remake-pipeline.js`, `.claude/commands/remake-*`) are finished tooling; left in place.
- `backend/.dev.vars` remains in the pushed `master` history (commit `c668ebd`). The values looked like development fakes; every production secret is created fresh at go-live regardless.
