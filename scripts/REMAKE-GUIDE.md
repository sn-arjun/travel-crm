# UI/UX Remake Pipeline — Operator Guide

Autonomous rebuild of the `desktop/` presentation layer, ending in a single
continuous Playwright video of every feature working.

Sibling of `scripts/milestone-pipeline.js`, which it reuses the resilience model
from (fresh `claude -p` process per job, JSON checkpoint, resume/retry/status).

---

## Quick start

```bash
node scripts/remake-pipeline.js --preflight   # what blocks an unattended run
node scripts/remake-pipeline.js --gates       # gates must be green before starting
node scripts/remake-pipeline.js --dry-run     # see the job graph
node scripts/remake-pipeline.js --all         # go (20-35 hours unattended)
```

Progress at any time, from another terminal:

```bash
node scripts/remake-pipeline.js --status
```

---

## The job graph

| Phase | Jobs | Model | Gates |
|---|---|---|---|
| `inventory` | 1 | Opus | — |
| `foundation` | 1 | Opus | typecheck, unit |
| `slice:<name>` | ~30 | Sonnet | backendFrozen, typecheck, unit |
| `verify:<name>` | ~30 | Sonnet | `spec:<name>` |
| `cleanup` | 1 | Haiku 4.5 | backendFrozen, typecheck, unit |
| `showcase` | 1 | Sonnet | showcase recording |

The slice list is **dynamic**. `inventory` writes
`desktop/audit/remake/slices/*.json`, and the graph is re-resolved after every
job — so phases 2 and 3 expand to whatever inventory actually found, including
brand-new slices for backend endpoints that have no UI today.

Each phase is a slash command in `.claude/commands/remake-*.md`. Edit those to
change agent behavior; edit the script to change orchestration.

---

## Why this is token-efficient

1. **One fresh process per job.** ~60 bounded contexts instead of one
   accumulating session. This is the dominant lever; everything else is
   secondary.
2. **JSON contracts between phases.** A slice job reads `CONTRACT.md` (≤300
   lines) plus its own ~150-line manifest. It never reads the 13 `M*-audit.md`
   reports or scans the repo.
3. **File allowlists.** Each manifest names the globs that job may edit.
   Repo-wide `Glob`/`Grep` is forbidden after inventory.
4. **Model routing.** Opus for the 2 design-heavy jobs, Sonnet for the ~60
   mechanical ones, Haiku for cleanup.
5. **Gates run in Node, not in an agent.** Passing builds cost zero tokens. Only
   failures cost anything, and a repair job sees at most 100 lines of output.
6. **Capped repair loops.** 2 attempts per failed gate, then the job is marked
   `gate-failed` and the pipeline moves on. No infinite fix-verify spirals.

---

## Baseline-aware gates — important

**The repo does not start green.** Gating on plain pass/fail would fail all ~60
jobs and burn ~120 pointless repair runs. So gates compare against a recorded
baseline and fail only on *regressions*.

| Gate | Pre-existing state | Passes when |
|---|---|---|
| `typecheck` | 106 `tsc` errors (25 distinct), all in `.test.ts` / `e2e/*.spec.ts`; app `src/` is clean | no error signature that isn't in the baseline |
| `unit` | 1049 tests pass, but 4 test **files** fail to load (`useAuthStore.subscribe is not a function`, thrown at import from `src/lib/api/client.ts`) | no new failing file, and passing count does not drop |
| `backendFrozen` | — | no file under `backend/` differs from `master` except the two sanctioned files |
| `backendTests` | 29 files / 901 tests green | the backend suite still passes |
| `spec:<slice>` | — | `desktop/e2e/<slice>.spec.ts` exists and passes |
| `showcase` | — | the recording run completes |

Baselines live in `desktop/audit/remake/typecheck-baseline.json` and
`unit-baseline.json`. Re-record after legitimately fixing pre-existing issues:

```bash
node scripts/remake-pipeline.js --baseline
```

### The backend suite was broken and is now fixed

`npm run test:api` used to execute **zero tests**. Commit `50e43e5` added
`[ai] binding = "AI"` to `backend/wrangler.toml`, but
`@cloudflare/vitest-pool-workers@0.5.21` bundles `miniflare@3.20241230.0`, which
cannot resolve `miniflare-internal:wrapped:__WRANGLER_EXTERNAL_AI_WORKER` — so
the Workers runtime failed to start entirely.

Rather than jump to `vitest-pool-workers@0.20.x` (which requires vitest ^4, a
large and risky bump from the pinned 2.1.8), `backend/vitest.config.ts` now
derives a **test-only** wrangler config from `wrangler.toml` at load time with
the `[ai]` section stripped, writing `backend/.wrangler-test.toml` (gitignored).
Deriving it rather than forking it means every other binding stays in sync
automatically.

Result: 29 test files, 901 tests, green. Remove the workaround once the
pool/miniflare versions support the AI binding.

---

## The two sanctioned backend changes

`backend/src/routes/test.ts` now **additionally** seeds the demo tenant
(`01960000-0000-7000-8000-000000000001`, `admin@demo.com` / `Admin@123`) that
`desktop/e2e/helpers/auth.ts` hardcodes. Before this, `/api/v1/test/reset` seeded
only `admin@e2e.test` on tenant `00000000-…`, so the entire desktop E2E layer
could not reset to a clean state.

The change is **purely additive** — the `e2e.test` tenant is untouched, so the
15 backend test files that log in as `admin@e2e.test` keep working. The 403 gate
on `TEST_MODE !== 'true'` is unchanged.

The demo tenant is seeded on the `enterprise` plan deliberately. `requireFeature`
falls back to `PLAN_DEFAULTS[plan]` when no `tenant_feature_flags` row exists, and
`enterprise` includes `ai_assistant`, `ai_extraction`, `ai_chatbot`,
`ai_intelligence`, `whatsapp_campaigns`, `voip_calling` and all 22 AI feature
keys — so every gated surface records live in the video instead of showing an
upgrade wall.

`BACKEND_ALLOWED_CHANGES` in the script permits `backend/src/routes/test.ts` and
`backend/vitest.config.ts`, and nothing else.

---

## State, resume, failure

Checkpoint: `desktop/audit/remake/state.json`, keyed by job id.

Statuses: `ok` · `failed` · `skipped` · `timeout` · `context-limit` ·
`gate-failed`.

```bash
node scripts/remake-pipeline.js --resume            # everything not yet ok
node scripts/remake-pipeline.js --retry slice:leads # clear one job, re-run it
node scripts/remake-pipeline.js --job verify:fleet  # run exactly one job
node scripts/remake-pipeline.js --phase verify      # one whole phase
node scripts/remake-pipeline.js --reset             # wipe the checkpoint
```

A failed job never blocks the run — it is recorded and the pipeline continues.
Partial work is still committed, so it is inspectable and revertible.

Git: the pipeline switches to the `ui-remake` branch (override with
`REMAKE_BRANCH`) and commits once per completed job. `--no-branch` and
`--no-commit` disable that.

---

## Outputs

| Path | What |
|---|---|
| `desktop/audit/remake/FEATURE-GAP-ANALYSIS.md` | what the backend exposes vs. what the UI reaches |
| `desktop/audit/remake/inventory.json` | machine-readable endpoint classification |
| `desktop/audit/remake/slices/*.json` | per-slice scope, allowlist, UX checklist |
| `desktop/audit/remake/CONTRACT.md` | the design-system contract (≤300 lines) |
| `desktop/audit/remake/UI-REMAKE-COVERAGE.md` | endpoint → page → UX contract → E2E |
| **`desktop/showcase/full-walkthrough.webm`** | **the deliverable** |
| `desktop/showcase/SHOWCASE.md` | chapter index with timestamps |

---

## Model overrides

```bash
REMAKE_OPUS=claude-opus-5 \
REMAKE_SONNET=claude-sonnet-5 \
REMAKE_HAIKU=claude-haiku-4-5-20251001 \
node scripts/remake-pipeline.js --all
```

---

## Recording the video on its own

Once slices and verification are done:

```bash
node scripts/remake-pipeline.js --job showcase
# or directly:
cd desktop && npx playwright test --config=playwright.showcase.config.ts
```

`desktop/playwright.showcase.config.ts` is separate from
`desktop/playwright.config.ts` on purpose — the main config uses
`video: 'retain-on-failure'` and therefore produces **no video at all** on a
passing run. The showcase config records unconditionally at 1920×1080 with
`slowMo: 250` in a single browser context, so the output is one unbroken take.

Every feature section is wrapped in `section()` from
`desktop/e2e/showcase/showcase-helpers.ts`: a failure is captioned on screen and
the tour continues, and all assertions are deferred to the very end. One broken
feature can never cost the whole recording.
