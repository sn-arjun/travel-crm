# TravelCRM Milestone Pipeline — Usage Guide

## What This Does

Automatically audits, fixes, and validates your entire desktop app against all 25 product requirement milestone files (M1-M4, M6-M26). Each milestone runs through 3 phases, each in a **separate Claude session** so context never overflows.

```
Phase 1: AUDIT   → Reads ticket file + scans code → Outputs audit report (read-only)
Phase 2: FIX     → Reads audit report → Fixes all gaps with UX contract enforced
Phase 3: VALIDATE → Reads audit report → Writes + runs real E2E tests
```

Every phase spawns a fresh `claude -p` process with `--dangerously-skip-permissions` (no approval prompts).

---

## Prerequisites

1. **Claude CLI installed globally** and logged in:
   ```bash
   claude --version   # Should print version
   ```

2. **Backend running** (needed for E2E validation phase):
   ```bash
   cd backend && npx wrangler dev --port 8787
   ```

3. **Desktop dev server running** (needed for E2E validation phase):
   ```bash
   cd desktop && npx next dev --turbopack --port 3100
   ```

   > Audit and Fix phases do NOT need servers running — they only read/write files.

4. **Playwright installed** (for validation phase):
   ```bash
   cd desktop && npx playwright install
   ```

---

## Quick Start

### Option 1: Run Everything (full pipeline, all milestones)

```bash
node scripts/milestone-pipeline.js
```

This will process M1 → M2 → M3 → M4 → M6 → ... → M26 sequentially. Each milestone goes through audit → fix → validate. Estimated total time: ~30-50 hours (runs unattended).

### Option 2: Run in Phases (recommended for first time)

```bash
# Step 1: Audit all milestones first (read-only, ~12 hours)
node scripts/milestone-pipeline.js --phase audit

# Step 2: Review audit files
ls desktop/audit/M*-audit.md

# Step 3: Fix all milestones (~25 hours)
node scripts/milestone-pipeline.js --phase fix

# Step 4: Validate all milestones (~25 hours)
# ⚠️ Start backend + desktop servers first!
node scripts/milestone-pipeline.js --phase validate

# Step 5: Generate final report
node scripts/milestone-pipeline.js --final-report
```

### Option 3: Run a Specific Milestone

```bash
# Single milestone (all 3 phases)
node scripts/milestone-pipeline.js 6

# Range of milestones
node scripts/milestone-pipeline.js 6 10

# Single milestone, single phase
node scripts/milestone-pipeline.js 6 --phase fix
```

---

## Checkpoint System

Progress is saved to `desktop/audit/.checkpoint.json` after **every single phase**. If the process crashes, gets killed, or times out, you lose nothing.

### Check Progress

```bash
node scripts/milestone-pipeline.js --status
```

Output:
```
  Milestone  Audit      Fix        Validate
  ──────────────────────────────────────────────────
  M1         ok         ok         ok
  M2         ok         ok         ok
  M3         ok         ok         failed
  M4         ok         ok         ---
  M6         ok         ---        ---
  M7         ---        ---        ---

  FAILURES:
  M3 validate: failed — Test assertion error...
    Retry: node scripts/milestone-pipeline.js --retry 3 validate
```

### Resume After Crash / Restart

```bash
node scripts/milestone-pipeline.js --resume
```

This skips to the first milestone with incomplete work and skips all already-completed phases.

### Retry a Failed Phase

```bash
node scripts/milestone-pipeline.js --retry 3 validate
```

This clears the failed status for M3 validate and re-runs just that phase.

### Start Over

```bash
node scripts/milestone-pipeline.js --reset
```

Clears checkpoint. Does NOT delete audit files.

---

## What Each Phase Does

### Phase 1: Audit (Model: Opus, Timeout: 30 min)

- Reads `product-requirment/jira-tickets-m{N}.md`
- Scans backend routes, schema, desktop pages, API clients, components
- Checks for 12 UX anti-patterns (raw ID inputs, missing infinite scroll, etc.)
- Tracks all environment variables needed
- Suggests UX improvements
- Classifies every ticket: DONE / PARTIAL / MISSING / BUG
- **Writes:** `desktop/audit/M{N}-audit.md`
- **Does NOT modify code**

### Phase 2: Fix (Model: Sonnet, Timeout: 1 hour)

- Reads `desktop/audit/M{N}-audit.md` (NOT the full ticket file — keeps context small)
- Fixes all PARTIAL / MISSING / BUG items
- Enforces UX contract:
  - FilterBar + useInfiniteScroll on all list pages
  - Searchable Combobox for all relation fields (never raw ID inputs)
  - PhoneInput, AddressAutocomplete, CurrencyInput, DatePicker
  - SendMessageDialog for all communication (never mailto:/wa.me)
  - Env fallbacks (graceful degradation, never crash)
- Runs `npx next build` to verify no build errors
- **Large milestones** (>2000 lines): auto-splits into chunks, each gets its own Claude session

### Phase 3: Validate (Model: Sonnet, Timeout: 1 hour)

- Writes Playwright E2E tests that verify REAL functionality:
  - Create entity (fill ALL fields) → verify in list → verify in detail → verify edit prefill → edit → verify → delete → verify
  - Tests search/filter, infinite scroll, combobox dropdowns
  - Tests export downloads with all data
  - Tests import creates records
  - Tests communication uses SendMessageDialog
- Runs `npx playwright test`
- Fixes code when tests fail (ticket is source of truth)

### Final Report (Model: Opus, Timeout: 30 min)

```bash
node scripts/milestone-pipeline.js --final-report
```

Generates:
- `desktop/audit/FINAL-REPORT.md` — Executive summary, status matrix, all env vars, improvements
- `desktop/.env.example` — All environment variables with descriptions and fallback notes
- `desktop/audit/IMPROVEMENTS.md` — Ranked UX improvements (P0/P1/P2)
- `desktop/audit/IMPLEMENTATION-PLAN.md` — Phased plan for remaining work

---

## Output Files

```
desktop/audit/
├── .checkpoint.json         ← Progress tracker (auto-managed)
├── M1-audit.md              ← Per-milestone audit reports
├── M2-audit.md
├── ...
├── M26-audit.md
├── FINAL-REPORT.md          ← Consolidated report
├── IMPROVEMENTS.md          ← Ranked UX improvements
└── IMPLEMENTATION-PLAN.md   ← Phased fix plan

desktop/.env.example         ← All env vars needed
```

---

## Slash Commands (for interactive use)

You can also run individual phases interactively inside a Claude Code session:

```
/audit-milestone M6          # Audit M6 (read-only)
/fix-milestone M6            # Fix M6 (implements changes)
/validate-milestone M6       # Write + run E2E for M6
/final-report                # Generate consolidated report
```

These are useful for debugging a single milestone or re-checking after manual changes.

---

## Failure Handling

| Scenario | What Happens | How to Continue |
|----------|-------------|-----------------|
| Timeout (phase takes >30m/1hr) | Marked `timeout` in checkpoint, skips to next | `--retry M fix` |
| Context limit hit | Marked `context-limit`, skips to next | `--retry M audit` (may need to split tickets further) |
| Claude CLI error | Marked `failed` with error details | `--retry M phase` |
| Process killed (Ctrl+C) | Last completed phase is saved | `--resume` |
| Machine restart | Checkpoint file on disk | `--resume` |
| Large milestone overflows | Auto-splits into chunks | Each chunk runs separately |
| Build error after fix | Phase still marked `ok` | Run `/fix-milestone M` interactively to debug |
| E2E test failures | Phase marked `ok` if Claude finishes | Check `desktop/test-results/` for screenshots |

---

## Tips

1. **Run audit-only first** — Review the audit files before letting it fix code. This lets you catch any misunderstandings before they become code changes.

2. **Start backend + desktop before validate phase** — E2E tests need both servers running on ports 8787 and 3100.

3. **Check git diff after each milestone fix** — The fix phase modifies code. Review changes with `git diff` before moving on.

4. **Commit after each milestone** — Good practice:
   ```bash
   node scripts/milestone-pipeline.js 6 --phase fix
   git add -A && git commit -m "fix: M6 audit fixes"
   node scripts/milestone-pipeline.js 6 --phase validate
   git add -A && git commit -m "test: M6 E2E validation"
   ```

5. **Monitor cost** — Each Claude invocation uses API tokens. Opus (audit) is more expensive than Sonnet (fix/validate). For 25 milestones × 3 phases = 75 Claude sessions.

6. **Run overnight** — The full pipeline takes many hours. Start it before leaving:
   ```bash
   node scripts/milestone-pipeline.js --phase audit > pipeline.log 2>&1
   ```

---

## Troubleshooting

### "spawn claude ENOENT"
Claude CLI not installed or not in PATH. Install with:
```bash
npm install -g @anthropic-ai/claude-code
```

### Phase keeps timing out
The milestone might be too large. The pipeline auto-splits milestones >2000 lines, but if individual tickets are very large, increase the threshold:
```js
// In scripts/milestone-pipeline.js line 53
const LARGE_MILESTONE_THRESHOLD = 1500; // Lower = more chunks = smaller context
```

### Audit file is incomplete
If the audit missed tickets, run it again:
```bash
node scripts/milestone-pipeline.js --retry 8 audit
```

### Fix phase didn't fix everything
Run the fix command interactively for more control:
```
claude "/fix-milestone M8"
```

### E2E tests all failing
Make sure backend and desktop servers are running:
```bash
# Terminal 1
cd backend && npx wrangler dev --port 8787

# Terminal 2
cd desktop && npx next dev --turbopack --port 3100

# Terminal 3
node scripts/milestone-pipeline.js --retry 8 validate
```
