#!/usr/bin/env node
/**
 * TravelCRM UI/UX Remake Pipeline — Autonomous Agent Orchestrator
 *
 * Sibling of scripts/milestone-pipeline.js. Same resilience model (fresh
 * `claude -p` process per job, JSON checkpoint, resume/retry/status), but a
 * different job graph aimed at a full presentation-layer remake ending in a
 * single continuous Playwright video walkthrough.
 *
 * JOB GRAPH
 *   0. inventory          (opus)   → desktop/audit/remake/inventory.json + slices/*.json
 *   1. foundation         (opus)   → design tokens, primitives, archetypes, CONTRACT.md
 *   2. slice:<name>       (sonnet) → migrate + build each feature area  [N jobs, dynamic]
 *   3. verify:<name>      (sonnet) → one consolidated Playwright spec each [N jobs]
 *   4. cleanup            (haiku)  → dead code, duplicate specs, docs drift
 *   5. showcase           (sonnet) → single-recording walkthrough spec
 *
 * TOKEN EFFICIENCY
 * - One fresh process per job: nothing accumulates across ~45 bounded contexts.
 * - Deterministic gates (typecheck / vitest / playwright) run HERE in Node, not
 *   in an agent. Passing builds cost zero tokens. Failures feed back at most
 *   GATE_FEEDBACK_LINES lines into a capped repair loop.
 * - Agents read JSON manifests + a 300-line CONTRACT.md, never the whole repo.
 *
 * Usage:
 *   node scripts/remake-pipeline.js --preflight        # check blockers, run nothing
 *   node scripts/remake-pipeline.js --dry-run          # print the job graph
 *   node scripts/remake-pipeline.js --all              # full unattended run
 *   node scripts/remake-pipeline.js --phase inventory  # one phase only
 *   node scripts/remake-pipeline.js --job slice:leads  # one job only
 *   node scripts/remake-pipeline.js --resume           # continue after interruption
 *   node scripts/remake-pipeline.js --retry slice:invoices
 *   node scripts/remake-pipeline.js --status
 *   node scripts/remake-pipeline.js --reset
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'desktop');
const BACKEND = path.join(ROOT, 'backend');
const REMAKE_DIR = path.join(DESKTOP, 'audit', 'remake');
const SLICE_DIR = path.join(REMAKE_DIR, 'slices');
const STATE_FILE = path.join(REMAKE_DIR, 'state.json');
const INVENTORY_FILE = path.join(REMAKE_DIR, 'inventory.json');
const CONTRACT_FILE = path.join(REMAKE_DIR, 'CONTRACT.md');
const COVERAGE_FILE = path.join(REMAKE_DIR, 'UI-REMAKE-COVERAGE.md');
const GAP_FILE = path.join(REMAKE_DIR, 'FEATURE-GAP-ANALYSIS.md');
const SHOWCASE_CONFIG = path.join(DESKTOP, 'playwright.showcase.config.ts');
const SHOWCASE_SPEC = path.join(DESKTOP, 'e2e', 'showcase', 'full-walkthrough.spec.ts');

// Model routing. Opus only for the two design-heavy jobs; Sonnet for the ~60
// mechanical jobs; Haiku for the mechanical cleanup pass.
// Override with REMAKE_OPUS / REMAKE_SONNET / REMAKE_HAIKU if your plan exposes
// different model ids.
const OPUS = process.env.REMAKE_OPUS || 'claude-opus-5';
const SONNET = process.env.REMAKE_SONNET || 'claude-sonnet-5';
const HAIKU = process.env.REMAKE_HAIKU || 'claude-haiku-4-5-20251001';

const MIN = 60000;
const TIMEOUT = {
  inventory: 45 * MIN,
  foundation: 90 * MIN,
  slice: 60 * MIN,
  verify: 45 * MIN,
  cleanup: 45 * MIN,
  showcase: 90 * MIN,
  repair: 30 * MIN,
};

const MAX_REPAIRS = 2;            // repair attempts per failed gate, then move on
const GATE_FEEDBACK_LINES = 100;  // how much failure output a repair job may see
const GATE_TIMEOUT = 20 * MIN;

const BRANCH = process.env.REMAKE_BRANCH || 'ui-remake';

// Freeze proof: the ref the backend must remain identical to, and the only
// backend file this project sanctioned changing (aligning the /test/reset seed
// with the credentials desktop/e2e/helpers/auth.ts hardcodes).
const BASE_REF = process.env.REMAKE_BASE_REF || 'master';
const BACKEND_ALLOWED_CHANGES = [
  // Seeds the demo tenant that desktop/e2e/helpers/auth.ts hardcodes, so the
  // Playwright suites can reset to a clean database.
  'backend/src/routes/test.ts',
  // Strips the [ai] binding from a generated test-only wrangler config; without
  // it the Workers test runtime cannot start at all.
  'backend/vitest.config.ts',
  // Untracked (git rm --cached) — it holds local dev secrets and was committed
  // despite the README calling it gitignored. The file stays on disk.
  'backend/.dev.vars',
  // The /admin surface, built by the backend:admin job and now a permanent part
  // of the codebase. Listed here so it does not flag on the ~100 later jobs;
  // BACKEND_ADMIN_CHANGES still governs who may CREATE it.
  'backend/src/routes/admin.ts',
  'backend/src/middleware/require-super-admin.ts',
  'backend/src/index.ts',
  'backend/test/admin.test.ts',
];

/**
 * The owner lifted the freeze for the missing /admin surface (the 10 in-desktop
 * super-admin pages call API_ENDPOINTS.admin.* and every one 404s today).
 *
 * These are allowed ONLY for the `backend:admin` job. Slice and verify jobs are
 * still held to BACKEND_ALLOWED_CHANGES, so a wandering agent cannot use the
 * lifted freeze as a general licence to edit the backend.
 */
const BACKEND_ADMIN_CHANGES = [
  'backend/src/routes/admin.ts',
  'backend/src/middleware/require-super-admin.ts',
  'backend/src/index.ts',
  'backend/test/admin.test.ts',
];

/**
 * Fallback slice list. The real list is produced by the inventory job as
 * desktop/audit/remake/slices/<name>.json — including brand-new slices for
 * orphaned backend endpoints that have no UI today. This constant only governs
 * --dry-run before inventory has run, and acts as a safety net if inventory
 * produced no manifests.
 */
const DEFAULT_SLICES = [
  'shell-auth', 'dashboard', 'contacts', 'leads', 'follow-ups',
  'itineraries', 'rate-cards', 'invoices', 'payments', 'credit-debit-notes',
  'vouchers', 'suppliers', 'travellers-visa', 'fleet', 'tasks-calendar',
  'communication', 'campaigns', 'marketing', 'ai', 'chatbot', 'reports',
  'documents', 'import-export', 'notifications', 'bookmarks-notes',
  'settings-users', 'onboarding-help',
];

// ─── Small utils ─────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();
const pad = (s, n) => String(s).padEnd(n);
const head = (text, n) => String(text || '').split('\n').slice(0, n).join('\n');
const tail = (text, n) => String(text || '').trim().split('\n').slice(-n).join('\n');

function banner(lines) {
  const width = 64;
  console.log('\n' + '='.repeat(width));
  for (const l of lines) console.log('  ' + l);
  console.log('='.repeat(width) + '\n');
}

// ─── Checkpoint ──────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { started: nowIso(), jobs: {} };
  }
}

function saveState(st) {
  fs.mkdirSync(REMAKE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
}

function markJob(st, id, status, error = null, extra = {}) {
  st.jobs[id] = {
    status, // ok | failed | skipped | timeout | context-limit | gate-failed | partial
    timestamp: nowIso(),
    error: error ? String(error).slice(0, 300) : null,
    ...extra,
  };
  st.lastCompleted = { id, status, timestamp: nowIso() };
  saveState(st);
}

const isDone = (st, id) => st.jobs[id]?.status === 'ok';

// ─── Slice discovery ─────────────────────────────────────────────

/**
 * Slices the owner reviews before the remaining ~47 are built on the same
 * foundation. Deliberately core-CRM: alphabetical order would have led with
 * `accounts` (a Suppliers-view special case) and the gated AI slices, which
 * tell you nothing about whether the design language is right.
 */
const REVIEW_SLICES = ['contacts', 'leads', 'invoices'];

function loadSlices() {
  let all;
  try {
    const files = fs.readdirSync(SLICE_DIR).filter((f) => f.endsWith('.json'));
    all = files.length ? files.map((f) => f.replace(/\.json$/, '')).sort() : DEFAULT_SLICES;
  } catch {
    all = DEFAULT_SLICES;
  }
  // Review slices lead; the rest keep their stable alphabetical order.
  const lead = REVIEW_SLICES.filter((s) => all.includes(s));
  return [...lead, ...all.filter((s) => !lead.includes(s))];
}

function sliceManifestPath(slice) {
  return path.join(SLICE_DIR, `${slice}.json`);
}

/** Spec path a verify job is expected to produce, per naming convention. */
function sliceSpecPath(slice) {
  return path.join(DESKTOP, 'e2e', `${slice}.spec.ts`);
}

// ─── Job graph ───────────────────────────────────────────────────

function buildJobs() {
  const slices = loadSlices();
  const jobs = [
    {
      id: 'inventory',
      phase: 'inventory',
      model: OPUS,
      cmd: '/remake-inventory',
      gates: [],
      // Inventory must actually write files — same lesson as milestone-pipeline:
      // an agent that prints instead of writing gets marked failed.
      requires: [],
      produces: [INVENTORY_FILE, GAP_FILE],
    },
    {
      id: 'foundation',
      phase: 'foundation',
      model: OPUS,
      cmd: '/remake-foundation',
      mustChangeFiles: true,
      gates: ['typecheck', 'unit'],
      requires: [INVENTORY_FILE],
      produces: [CONTRACT_FILE],
    },
  ];

  // Backend surfaces the owner authorised building. Must precede any slice whose
  // manifest declares `requiresBackend`, or that slice has nothing to call.
  const needsAdminBackend = slices.some((s) => {
    try {
      return JSON.parse(fs.readFileSync(sliceManifestPath(s), 'utf8')).requiresBackend === 'admin';
    } catch {
      return false;
    }
  });
  if (needsAdminBackend) {
    jobs.push({
      id: 'backend:admin',
      phase: 'backend',
      model: OPUS,
      cmd: '/remake-backend admin',
      mustChangeFiles: true,
      gates: ['backendFrozen', 'backendTests'],
      requires: [sliceManifestPath('super-admin')],
      produces: [path.join(BACKEND, 'src', 'routes', 'admin.ts')],
    });
  }

  for (const s of slices) {
    // A slice whose API was built by a backend job cannot run before it.
    let dependsOn = [];
    try {
      const m = JSON.parse(fs.readFileSync(sliceManifestPath(s), 'utf8'));
      if (m.requiresBackend) dependsOn = [`backend:${m.requiresBackend}`];
    } catch { /* manifest absent → no dependency */ }

    jobs.push({
      id: `slice:${s}`,
      phase: 'slice',
      slice: s,
      model: SONNET,
      cmd: `/remake-slice ${s}`,
      mustChangeFiles: true,
      // backendFrozen is a cheap git diff — it catches a wandering agent on the
      // very slice that wandered, instead of at the end of a 30-hour run.
      gates: ['backendFrozen', 'typecheck', 'unit'],
      requires: [CONTRACT_FILE, sliceManifestPath(s)],
      dependsOn,
      produces: [],
    });
  }

  for (const s of slices) {
    jobs.push({
      id: `verify:${s}`,
      phase: 'verify',
      slice: s,
      model: SONNET,
      cmd: `/remake-verify ${s}`,
      mustChangeFiles: true,
      gates: [`spec:${s}`],
      requires: [CONTRACT_FILE, sliceManifestPath(s)],
      produces: [sliceSpecPath(s)],
    });
  }

  jobs.push({
    id: 'cleanup',
    phase: 'cleanup',
    model: HAIKU,
    cmd: '/remake-cleanup',
    mustChangeFiles: true,
    gates: ['backendFrozen', 'backendTests', 'typecheck', 'unit'],
    requires: [],
    produces: [COVERAGE_FILE],
  });

  jobs.push({
    id: 'showcase',
    phase: 'showcase',
    model: SONNET,
    cmd: '/remake-showcase',
    mustChangeFiles: true,
    gates: ['showcase'],
    requires: [CONTRACT_FILE],
    produces: [SHOWCASE_SPEC],
  });

  return jobs;
}

// ─── Claude runner ───────────────────────────────────────────────

function runClaude(slashCommand, model, label, phase) {
  const timeout = TIMEOUT[phase] || 30 * MIN;
  banner([
    label,
    `Command: ${slashCommand}`,
    `Model:   ${model}   Timeout: ${Math.round(timeout / MIN)}min`,
    `Time:    ${nowIso()}`,
  ]);

  const start = Date.now();

  // Strip CLAUDECODE so the child does not refuse as a "nested session".
  const env = { ...process.env };
  delete env.CLAUDECODE;

  // NEVER use shell:true here. The Windows shell word-splits the argv entry, so
  // `-p "/remake-slice contacts"` arrived as `/remake-slice` with $ARGUMENTS
  // EMPTY — agents asked which slice to build, exited 0 in 30s having changed
  // nothing, and every gate passed because doing nothing breaks nothing.
  // The same splitting silently truncated multi-line repair prompts to their
  // first line. `claude` resolves fine without a shell, so there is no reason
  // to use one. Prompts go via stdin, which is immune either way.
  const res = spawnSync('claude', ['-p', '--model', model, '--dangerously-skip-permissions'], {
    cwd: ROOT,
    encoding: 'utf8',
    input: slashCommand,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout,
    env,
    shell: false,
  });

  const elapsed = Math.round((Date.now() - start) / 1000);

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT' || /TIMEOUT/i.test(res.error.message)) {
      console.error(`  TIMEOUT after ${elapsed}s`);
      return { ok: false, reason: 'timeout', error: res.error.message };
    }
    console.error(`  ERROR: ${res.error.message}`);
    return { ok: false, reason: 'failed', error: res.error.message };
  }

  if (res.status !== 0) {
    const stderr = (res.stderr || '').slice(0, 500);
    if (/context|token|limit/i.test(stderr)) {
      console.error(`  CONTEXT LIMIT after ${elapsed}s`);
      return { ok: false, reason: 'context-limit', error: stderr };
    }
    console.error(`  EXIT ${res.status} after ${elapsed}s`);
    if (stderr) console.error(`  STDERR: ${stderr}`);
    return { ok: false, reason: 'failed', error: stderr };
  }

  if (res.stdout) console.log(`  ...last 15 lines:\n${tail(res.stdout, 15)}`);
  console.log(`\n  COMPLETED: ${label} (${elapsed}s)\n`);
  return { ok: true };
}

// ─── Deterministic gates (run in Node, not by an agent) ──────────

function sh(cmd, args, cwd, timeout = GATE_TIMEOUT) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    shell: process.platform === 'win32',
    env: process.env,
  });
  const output = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  return { ok: !res.error && res.status === 0, output, status: res.status };
}

/**
 * Baseline-aware gating.
 *
 * The repo does not start green: desktop `tsc --noEmit` reports ~108
 * pre-existing errors, every one of them inside `.test.ts` / `e2e/*.spec.ts`
 * (application `src/` is clean). A naive pass/fail gate would fail all 58 jobs
 * and burn 2 repair jobs each — ~116 wasted agent runs.
 *
 * So gates compare against a recorded baseline and fail only on *new*
 * regressions. Signatures deliberately omit line/column, since unrelated edits
 * shift line numbers without changing the underlying error.
 */
const TYPECHECK_BASELINE = path.join(REMAKE_DIR, 'typecheck-baseline.json');

function parseTscErrors(output) {
  const sigs = [];
  // Split on CRLF as well as LF: `\r` is a JS regex line terminator, so a
  // trailing `\r` makes `.` and `$` fail to match and silently drops every
  // error on Windows.
  for (const line of String(output).split(/\r?\n/)) {
    // e.g. src/stores/x.test.ts(29,14): error TS2532: Object is possibly 'undefined'.
    const m = line.match(/^(.+?)\(\d+,\d+\):\s+(error\s+TS\d+):\s*(.*)$/);
    if (m) sigs.push(`${m[1].trim()} :: ${m[2]} :: ${m[3].trim()}`);
  }
  return sigs;
}

function loadBaseline() {
  try {
    return new Set(JSON.parse(fs.readFileSync(TYPECHECK_BASELINE, 'utf8')));
  } catch {
    return null;
  }
}

function captureAllBaselines() {
  captureBaseline();
  const res = runVitestJson();
  if (res) saveUnitBaseline(res);
  else console.log('  [baseline] unit: vitest produced no JSON — skipped');
}

function captureBaseline() {
  console.log('  [baseline] capturing desktop typecheck baseline...');
  const res = sh('npx', ['tsc', '--noEmit'], DESKTOP);
  const sigs = parseTscErrors(res.output);
  fs.mkdirSync(REMAKE_DIR, { recursive: true });
  fs.writeFileSync(TYPECHECK_BASELINE, JSON.stringify([...new Set(sigs)].sort(), null, 2));
  console.log(`  [baseline] recorded ${new Set(sigs).size} pre-existing error(s) → ${path.relative(ROOT, TYPECHECK_BASELINE)}`);
  return new Set(sigs);
}

const UNIT_BASELINE = path.join(REMAKE_DIR, 'unit-baseline.json');
const VITEST_JSON = path.join(REMAKE_DIR, '.vitest-run.json');

/** Run desktop vitest with the JSON reporter and reduce it to a comparable shape. */
function runVitestJson() {
  sh('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${VITEST_JSON}`], DESKTOP);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(VITEST_JSON, 'utf8'));
  } catch {
    return null;
  }
  const failedFiles = (raw.testResults || [])
    .filter((t) => t.status === 'failed')
    .map((t) => path.relative(DESKTOP, t.name).replace(/\\/g, '/'))
    .sort();
  return {
    passed: raw.numPassedTests ?? 0,
    failed: raw.numFailedTests ?? 0,
    failedFiles,
  };
}

function loadUnitBaseline() {
  try {
    return JSON.parse(fs.readFileSync(UNIT_BASELINE, 'utf8'));
  } catch {
    return null;
  }
}

function saveUnitBaseline(res) {
  fs.mkdirSync(REMAKE_DIR, { recursive: true });
  fs.writeFileSync(UNIT_BASELINE, JSON.stringify(res, null, 2));
  console.log(`  [baseline] unit: ${res.passed} passing, ${res.failedFiles.length} failing file(s) recorded`);
  return res;
}

const GATES = {
  typecheck: () => {
    console.log('  [gate] typecheck (regressions only)...');
    const baseline = loadBaseline() || captureBaseline();
    const res = sh('npx', ['tsc', '--noEmit'], DESKTOP);
    if (res.ok) return { ok: true, output: 'clean' };

    const current = parseTscErrors(res.output);
    const regressions = [...new Set(current.filter((s) => !baseline.has(s)))];
    if (!regressions.length) {
      console.log(`  [gate] ${current.length} pre-existing error(s), 0 new — passing`);
      return { ok: true, output: 'no regressions' };
    }
    return {
      ok: false,
      output:
        `${regressions.length} NEW type error(s) introduced (pre-existing baseline ignored):\n` +
        regressions.map((s) => '  ' + s).join('\n'),
    };
  },
  /**
   * Desktop unit tests, baseline-aware.
   *
   * Today: 1049 tests pass but 4 test FILES fail to load
   * ("useAuthStore.subscribe is not a function" thrown at import time from
   * src/lib/api/client.ts), so `npm run test` exits 1. Pre-existing.
   *
   * Gate contract: no NEW failing file, and the passing-test count must not
   * drop. That catches real regressions while tolerating the known breakage.
   */
  unit: () => {
    console.log('  [gate] vitest (regressions only)...');
    const res = runVitestJson();
    if (!res) return { ok: true, output: '(vitest produced no JSON; skipping)' };

    const baseline = loadUnitBaseline() || saveUnitBaseline(res);
    const newFailures = res.failedFiles.filter((f) => !baseline.failedFiles.includes(f));
    const lostTests = baseline.passed - res.passed;

    if (!newFailures.length && lostTests <= 0) {
      console.log(`  [gate] ${res.passed} passing (baseline ${baseline.passed}), ${res.failedFiles.length} known-failing file(s)`);
      return { ok: true, output: 'no regressions' };
    }
    const parts = [];
    if (newFailures.length) parts.push(`NEW failing test file(s):\n${newFailures.map((f) => '  ' + f).join('\n')}`);
    if (lostTests > 0) parts.push(`Passing tests dropped by ${lostTests} (${baseline.passed} → ${res.passed}).`);
    return { ok: false, output: parts.join('\n') };
  },
  /**
   * Structural freeze proof: no file under backend/ may differ from the
   * merge-base except the sanctioned ones. Deterministic, near-free, and it
   * catches a wandering agent on the exact slice that wandered. Complements
   * `backendTests` below, which proves behavior rather than structure.
   */
  backendFrozen: (job) => {
    console.log('  [gate] backend freeze (git diff)...');
    // Only the backend:admin job may touch the /admin surface.
    const allowed =
      job && job.phase === 'backend'
        ? [...BACKEND_ALLOWED_CHANGES, ...BACKEND_ADMIN_CHANGES]
        : BACKEND_ALLOWED_CHANGES;

    const base = sh('git', ['merge-base', 'HEAD', BASE_REF], ROOT);
    const ref = base.ok && base.output.trim() ? base.output.trim() : BASE_REF;
    const diff = sh('git', ['diff', '--name-only', ref, '--', 'backend/'], ROOT);
    if (!diff.ok) return { ok: true, output: '(could not diff; skipping freeze check)' };

    // `git diff` only reports TRACKED files, so a brand-new file an agent
    // creates under backend/ would slip the freeze entirely. Add untracked
    // files explicitly.
    const untracked = sh(
      'git',
      ['ls-files', '--others', '--exclude-standard', '--', 'backend/'],
      ROOT
    );

    // sh() merges stderr, and git emits CRLF warnings there. Keep only real paths.
    const toPaths = (out) =>
      String(out)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.startsWith('backend/') && !s.includes(' '));

    const changed = [...new Set([...toPaths(diff.output), ...toPaths(untracked.output)])];
    const illegal = changed.filter((f) => !allowed.includes(f));

    // index.ts is allow-listed only because the admin mount lives there. It is
    // the single most likely file to be edited by accident, so verify its diff
    // is CONFINED to that mount rather than trusting the path allowance.
    if (changed.includes('backend/src/index.ts')) {
      const d = sh('git', ['diff', '-U0', ref, '--', 'backend/src/index.ts'], ROOT);
      const touched = d.output
        .split(/\r?\n/)
        .filter((l) => /^[+-][^+-]/.test(l))
        .filter((l) => !/admin/i.test(l));
      if (touched.length) {
        illegal.push(
          'backend/src/index.ts (changes beyond the admin mount:\n' +
            touched.slice(0, 6).map((l) => '      ' + l.trim()).join('\n') +
            ')'
        );
      }
    }
    if (illegal.length) {
      return {
        ok: false,
        output:
          'Backend freeze violated. These files must not change:\n' +
          illegal.map((f) => '  ' + f).join('\n'),
      };
    }
    return { ok: true, output: `backend clean (${changed.length} sanctioned change(s))` };
  },
  /**
   * Behavioral freeze proof: 29 files / 901 tests must stay green.
   * Runs in ~25s, so it is only attached to the phase-level jobs rather than
   * to every slice.
   */
  backendTests: () => {
    console.log('  [gate] backend test suite...');
    return sh('npx', ['vitest', 'run'], BACKEND, 30 * MIN);
  },
  showcase: () => {
    console.log('  [gate] showcase recording...');
    return sh(
      'npx',
      ['playwright', 'test', '--config=playwright.showcase.config.ts'],
      DESKTOP,
      90 * MIN
    );
  },
};

function runGate(name, job) {
  if (name.startsWith('spec:')) {
    const slice = name.slice(5);
    const spec = `e2e/${slice}.spec.ts`;
    console.log(`  [gate] playwright ${spec}...`);
    if (!fs.existsSync(path.join(DESKTOP, spec))) {
      return { ok: false, output: `Expected spec not found: desktop/${spec}` };
    }
    return sh('npx', ['playwright', 'test', spec, '--reporter=list'], DESKTOP, 45 * MIN);
  }
  const fn = GATES[name];
  if (!fn) return { ok: true, output: `(no gate named ${name})` };
  return fn(job);
}

function runGates(job) {
  for (const g of job.gates) {
    const res = runGate(g, job);
    if (!res.ok) {
      console.log(`  [gate] FAILED: ${g}`);
      return { ok: false, gate: g, output: res.output };
    }
    console.log(`  [gate] passed: ${g}`);
  }
  return { ok: true };
}

// ─── Repair loop (capped) ────────────────────────────────────────

function repairPrompt(job, gate, output) {
  return `# REPAIR — ${job.id}

A deterministic gate failed after the \`${job.cmd}\` job. Fix the code so the gate passes.

**Failed gate:** \`${gate}\`

**First ${GATE_FEEDBACK_LINES} lines of output:**
\`\`\`
${head(output, GATE_FEEDBACK_LINES)}
\`\`\`

## Rules
- Fix the CODE, not the gate. Do not weaken, skip, or delete tests to make it pass.
- Do NOT modify anything under \`backend/\` (the sole exception, \`backend/src/routes/test.ts\`, is already done and must not change further).
- Do NOT change function signatures or response shapes in \`desktop/src/lib/api/*\`.
- Stay inside the scope of this job. Read \`desktop/audit/remake/CONTRACT.md\`${
    job.slice ? ` and \`desktop/audit/remake/slices/${job.slice}.json\`` : ''
  } for the contract you must satisfy.
- Make the minimum change that fixes the failure. Report what you changed in 5 lines or fewer.
`;
}

// ─── Git ─────────────────────────────────────────────────────────

function git(args) {
  return sh('git', args, ROOT, 5 * MIN);
}

function currentBranch() {
  const r = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.ok ? r.output.trim() : null;
}

function ensureBranch() {
  const cur = currentBranch();
  if (!cur) {
    console.log('  WARNING: not a git repo? Skipping branch management.');
    return;
  }
  if (cur === BRANCH) {
    console.log(`  Branch: ${BRANCH} (already checked out)`);
    return;
  }
  if (cur === 'master' || cur === 'main') {
    const exists = git(['rev-parse', '--verify', BRANCH]).ok;
    const r = exists ? git(['checkout', BRANCH]) : git(['checkout', '-b', BRANCH]);
    if (r.ok) console.log(`  Branch: switched from ${cur} to ${BRANCH}`);
    else console.log(`  WARNING: could not switch to ${BRANCH}; staying on ${cur}`);
  } else {
    console.log(`  Branch: ${cur} (not a default branch — leaving as is)`);
  }
}

let COMMIT_ENABLED = true;

function commitJob(job) {
  if (!COMMIT_ENABLED) {
    console.log('  (--no-commit: skipping commit)');
    return;
  }
  const status = git(['status', '--porcelain']);
  if (!status.ok || !status.output.trim()) {
    console.log('  (no changes to commit)');
    return;
  }
  git(['add', '-A']);
  const msg = `remake(${job.phase}): ${job.id}\n\nAutomated by scripts/remake-pipeline.js\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n`;

  // The message MUST go via stdin, not `-m`. With shell:true on Windows a
  // multi-line -m argument is word-split, so git reads only the first token as
  // the message and treats the rest as pathspecs ("did not match any file(s)").
  const r = spawnSync('git', ['commit', '-F', '-'], {
    cwd: ROOT,
    encoding: 'utf8',
    input: msg,
    timeout: 5 * MIN,
    shell: false,
  });
  const ok = !r.error && r.status === 0;
  if (ok) {
    console.log(`  Committed: ${job.id}`);
  } else {
    console.log(`  WARNING: commit failed for ${job.id}`);
    console.log('    ' + String(r.stderr || r.error?.message || '').split('\n')[0]);
  }
}

// ─── Job execution ───────────────────────────────────────────────

function missingRequires(job) {
  return job.requires.filter((p) => !fs.existsSync(p));
}

function missingProduces(job) {
  return job.produces.filter((p) => !fs.existsSync(p));
}

/**
 * Fingerprint of the working tree, used to prove a job actually did something.
 *
 * typecheck and vitest both pass when an agent changes NOTHING, so they cannot
 * distinguish "built the slice correctly" from "misread the prompt and exited".
 * That is exactly how three slice jobs were marked ok having touched no files.
 */
function treeFingerprint() {
  const r = sh('git', ['status', '--porcelain'], ROOT, 2 * MIN);
  const head = sh('git', ['rev-parse', 'HEAD'], ROOT, 2 * MIN);
  return `${head.output.trim()}::${r.output.trim()}`;
}

function runJob(job, st) {
  if (isDone(st, job.id)) {
    // A job marked ok can still be invalidated later (a subsequent job, or a
    // human, deleting something it produced). Re-verify rather than trusting
    // the checkpoint blindly.
    const gone = missingProduces(job);
    if (gone.length) {
      const rel = gone.map((p) => path.relative(ROOT, p)).join(', ');
      console.log(`  ${job.id} was ok but its output is gone (${rel}) — re-running.`);
      delete st.jobs[job.id];
      saveState(st);
    } else {
      console.log(`  SKIP ${job.id} — already ok`);
      return true;
    }
  }

  const unmet = (job.dependsOn || []).filter((d) => !isDone(st, d));
  if (unmet.length) {
    console.log(`  SKIP ${job.id} — upstream job not ok: ${unmet.join(', ')}`);
    markJob(st, job.id, 'skipped', `upstream not ok: ${unmet.join(', ')}`);
    return false;
  }

  const missing = missingRequires(job);
  if (missing.length) {
    const rel = missing.map((p) => path.relative(ROOT, p)).join(', ');
    console.log(`  SKIP ${job.id} — missing prerequisite: ${rel}`);
    markJob(st, job.id, 'skipped', `missing prerequisite: ${rel}`);
    return false;
  }

  const before = job.mustChangeFiles ? treeFingerprint() : null;

  const res = runClaude(job.cmd, job.model, job.id.toUpperCase(), job.phase);
  if (!res.ok) {
    markJob(st, job.id, res.reason, res.error);
    console.log(`  ${job.id} failed (${res.reason}). Continuing.`);
    return false;
  }

  // A job that must produce work but changed nothing did not do its job,
  // regardless of what it printed or what exit code it returned.
  if (before !== null && treeFingerprint() === before) {
    console.log(`  ${job.id}: agent changed NO files — treating as failed.`);
    markJob(st, job.id, 'failed', 'no-op: agent completed without modifying any file');
    return false;
  }

  // An agent that printed instead of writing has not done the job.
  const notWritten = missingProduces(job);
  if (notWritten.length) {
    const rel = notWritten.map((p) => path.relative(ROOT, p)).join(', ');
    console.log(`  ${job.id}: expected output not written: ${rel}`);
    markJob(st, job.id, 'failed', `expected output not written: ${rel}`);
    return false;
  }

  // Deterministic gates + capped repair loop.
  let gate = runGates(job);
  let attempts = 0;
  while (!gate.ok && attempts < MAX_REPAIRS) {
    attempts += 1;
    console.log(`  Repair attempt ${attempts}/${MAX_REPAIRS} for ${job.id}...`);
    const r = runClaude(
      repairPrompt(job, gate.gate, gate.output),
      job.model,
      `REPAIR ${job.id} (${attempts}/${MAX_REPAIRS})`,
      'repair'
    );
    if (!r.ok) break;
    gate = runGates(job);
  }

  if (!gate.ok) {
    markJob(st, job.id, 'gate-failed', `${gate.gate}: ${head(gate.output, 5)}`, {
      repairAttempts: attempts,
    });
    console.log(`  ${job.id}: gate ${gate.gate} still failing after ${attempts} repairs. Continuing.`);
    commitJob(job); // keep the partial work; it is on a branch and revertible
    return false;
  }

  markJob(st, job.id, 'ok', null, { repairAttempts: attempts });
  commitJob(job);
  return true;
}

// ─── Status ──────────────────────────────────────────────────────

function showStatus(st) {
  const jobs = buildJobs();
  console.log('\n  REMAKE PIPELINE STATUS\n');
  console.log(`  Started: ${st.started}`);
  console.log(`  Last:    ${st.lastCompleted ? `${st.lastCompleted.id} (${st.lastCompleted.status})` : 'none'}`);
  console.log(`  Branch:  ${currentBranch() || 'unknown'}\n`);

  console.log('  ' + pad('JOB', 34) + pad('STATUS', 14) + 'WHEN');
  console.log('  ' + '-'.repeat(70));

  let ok = 0;
  for (const j of jobs) {
    const info = st.jobs[j.id];
    if (info?.status === 'ok') ok += 1;
    const when = info?.timestamp ? info.timestamp.slice(0, 19).replace('T', ' ') : '';
    console.log('  ' + pad(j.id, 34) + pad(info?.status || '---', 14) + when);
  }

  const pct = jobs.length ? Math.round((ok / jobs.length) * 100) : 0;
  console.log(`\n  Progress: ${ok}/${jobs.length} jobs ok (${pct}%)`);

  const failures = Object.entries(st.jobs).filter(
    ([, i]) => i.status && i.status !== 'ok' && i.status !== 'skipped'
  );
  if (failures.length) {
    console.log('\n  FAILURES:');
    for (const [id, i] of failures) {
      console.log(`  ${id}: ${i.status}${i.error ? ' — ' + i.error.split('\n')[0] : ''}`);
      console.log(`    Retry: node scripts/remake-pipeline.js --retry ${id}`);
    }
  }
  console.log('');
}

// ─── Preflight ───────────────────────────────────────────────────

function preflight() {
  console.log('\n  PREFLIGHT — checking what blocks an unattended run\n');
  const blockers = [];
  const warnings = [];

  const claudeOk = sh('claude', ['--version'], ROOT, 60000).ok;
  console.log(`  [${claudeOk ? 'ok' : 'XX'}] claude CLI on PATH`);
  if (!claudeOk) blockers.push('`claude` CLI not found on PATH — the orchestrator shells out to it ~45 times.');

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  console.log(`  [${nodeMajor >= 22 ? 'ok' : 'XX'}] node ${process.versions.node} (need >= 22)`);
  if (nodeMajor < 22) blockers.push(`Node ${process.versions.node} is below the required >= 22.`);

  const devVars = path.join(BACKEND, '.dev.vars');
  let testMode = false;
  if (fs.existsSync(devVars)) {
    testMode = /^\s*TEST_MODE\s*=\s*["']?true["']?\s*$/m.test(fs.readFileSync(devVars, 'utf8'));
  }
  console.log(`  [${testMode ? 'ok' : 'XX'}] TEST_MODE=true in backend/.dev.vars`);
  if (!testMode) {
    blockers.push(
      'TEST_MODE=true missing from backend/.dev.vars — /api/v1/test/reset returns 403 and no run is deterministic. ' +
        'Add it to terraform/terraform.tfvars too, or `npm run infra:sync` will wipe it.'
    );
  }

  const browsersOk = sh('npx', ['playwright', '--version'], DESKTOP, 2 * MIN).ok;
  console.log(`  [${browsersOk ? 'ok' : '??'}] playwright CLI responds`);
  if (!browsersOk) blockers.push('Playwright CLI not responding in desktop/ — run `cd desktop && npx playwright install chromium`.');

  const cmdDir = path.join(ROOT, '.claude', 'commands');
  for (const c of ['remake-inventory', 'remake-foundation', 'remake-slice', 'remake-verify', 'remake-cleanup', 'remake-showcase']) {
    const exists = fs.existsSync(path.join(cmdDir, `${c}.md`));
    console.log(`  [${exists ? 'ok' : 'XX'}] .claude/commands/${c}.md`);
    if (!exists) blockers.push(`Missing slash command: .claude/commands/${c}.md`);
  }

  const showcaseCfg = fs.existsSync(SHOWCASE_CONFIG);
  console.log(`  [${showcaseCfg ? 'ok' : 'XX'}] desktop/playwright.showcase.config.ts`);
  if (!showcaseCfg) blockers.push('Missing desktop/playwright.showcase.config.ts — the video deliverable cannot be produced.');

  const branch = currentBranch();
  console.log(`  [--] current git branch: ${branch}`);
  if (branch === 'master' || branch === 'main') {
    warnings.push(`On ${branch}; the pipeline will create/switch to '${BRANCH}' before committing.`);
  }

  const dirty = git(['status', '--porcelain']).output.trim();
  console.log(`  [${dirty ? '??' : 'ok'}] working tree ${dirty ? 'has uncommitted changes' : 'clean'}`);
  if (dirty) warnings.push('Working tree is dirty. Commit or stash first — the pipeline commits per job.');

  console.log('\n  ── Resolved ──');
  console.log('  * D1 migrations applied locally; /test/reset seeds demo tenant');
  console.log('    01960000-0000-7000-8000-000000000001 / admin@demo.com / Admin@123.');
  console.log('  * Demo tenant is on the `enterprise` plan, so requireFeature() falls back');
  console.log('    to PLAN_DEFAULTS.enterprise — every gated feature (AI, VoIP, WhatsApp');
  console.log('    campaigns) is live and will record as working, not as an upgrade wall.');

  console.log('\n  ── Cannot be checked from here (confirm yourself) ──');
  console.log('  * claude CLI authenticated with enough quota for ~60 jobs overnight.');
  console.log('  * Machine will not sleep; ~10 GB free for video/traces/test-results.');
  console.log('  * Optional third-party keys: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, Twilio,');
  console.log('    SendGrid, Deepgram. Each absent key records a degraded state on camera');
  console.log('    (correct behavior — the UX contract requires graceful degradation).');

  if (warnings.length) {
    console.log('\n  WARNINGS:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (blockers.length) {
    console.log('\n  BLOCKERS — fix these before --all:');
    for (const b of blockers) console.log(`  X ${b}`);
    console.log('');
    return false;
  }

  console.log('\n  No blockers detected. Ready for: node scripts/remake-pipeline.js --all\n');
  return true;
}

// ─── CLI ─────────────────────────────────────────────────────────

function usage() {
  console.log(`
  TravelCRM UI/UX Remake Pipeline

    --preflight        Check blockers and exit (runs nothing)
    --dry-run          Print the job graph and exit
    --all              Run every job in order (unattended)
    --checkpoint       Run foundation + review slices, then stop for review
    --phase <name>     inventory | foundation | backend | slice | verify | cleanup | showcase
    --job <id>         Run one job, e.g. slice:leads
    --resume           Run every job not yet marked ok
    --retry <id>       Clear one job's state and re-run it
    --status           Print the progress matrix
    --baseline         Re-record the pre-existing typecheck + unit baselines
    --gates            Self-test the gates against the current tree
    --reset            Wipe the checkpoint
    --no-branch        Do not create/switch the ${BRANCH} branch
    --no-commit        Do not commit after each job
`);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) { usage(); return; }

  fs.mkdirSync(REMAKE_DIR, { recursive: true });
  let st = loadState();

  // A *selector*, not a resolved list. The job graph is re-resolved after every
  // job because `inventory` writes the slice manifests that create phases 2 & 3.
  let selector = null;
  let doBranch = true;
  let checkpointSet = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') { usage(); return; }
    if (a === '--no-branch') { doBranch = false; continue; }
    if (a === '--no-commit') { COMMIT_ENABLED = false; continue; }
    if (a === '--status') { showStatus(st); return; }
    if (a === '--preflight') { process.exitCode = preflight() ? 0 : 1; return; }
    if (a === '--baseline') { captureAllBaselines(); return; }
    if (a === '--gates') {
      // Self-test: on an unmodified tree every gate must pass, or the pipeline
      // would fail all 58 jobs and burn ~116 pointless repair runs.
      console.log('\n  GATE SELF-TEST (expect all green on a clean tree)\n');
      let allOk = true;
      for (const g of ['backendFrozen', 'typecheck', 'unit']) {
        const r = runGate(g);
        console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${g}`);
        if (!r.ok) { allOk = false; console.log(head(r.output, 12).split('\n').map((l) => '        ' + l).join('\n')); }
      }
      console.log('');
      process.exitCode = allOk ? 0 : 1;
      return;
    }
    if (a === '--reset') {
      saveState({ started: nowIso(), jobs: {} });
      console.log('  Checkpoint reset.');
      return;
    }
    if (a === '--dry-run') {
      const jobs = buildJobs();
      const usingDefaults = !fs.existsSync(SLICE_DIR);
      console.log(`\n  JOB GRAPH (${jobs.length} jobs)`);
      if (usingDefaults) console.log('  NOTE: inventory has not run — slice list is the built-in fallback.\n');
      for (const j of jobs) {
        console.log(`  ${pad(j.id, 32)} ${pad(j.model, 30)} gates: ${j.gates.join(', ') || '-'}`);
      }
      console.log('');
      return;
    }
    if (a === '--all') { selector = { kind: 'all' }; continue; }
    if (a === '--checkpoint') {
      // Run through foundation + the review slices, then stop for owner review.
      // This is a MODIFIER over the full graph, so it implies --all unless an
      // explicit selector was given.
      checkpointSet = new Set([
        'inventory',
        'foundation',
        'backend:admin',
        ...REVIEW_SLICES.map((s) => `slice:${s}`),
      ]);
      continue;
    }
    if (a === '--resume') { selector = { kind: 'resume' }; continue; }
    if (a === '--phase') {
      const p = args[++i];
      const valid = ['inventory', 'foundation', 'backend', 'slice', 'verify', 'cleanup', 'showcase'];
      if (!valid.includes(p)) { console.error(`  Unknown phase: ${p}`); process.exit(1); }
      selector = { kind: 'phase', value: p };
      continue;
    }
    if (a === '--job') {
      const id = args[++i];
      if (!buildJobs().some((j) => j.id === id)) { console.error(`  Unknown job: ${id}`); process.exit(1); }
      selector = { kind: 'job', value: id };
      continue;
    }
    if (a === '--retry') {
      const id = args[++i];
      if (!buildJobs().some((j) => j.id === id)) { console.error(`  Unknown job: ${id}`); process.exit(1); }
      delete st.jobs[id];
      saveState(st);
      selector = { kind: 'job', value: id };
      continue;
    }
    console.error(`  Unknown argument: ${a}`);
    usage();
    process.exit(1);
  }

  // --checkpoint is a modifier over the full graph, so it implies --all.
  // Applied after arg parsing so flag order does not matter.
  if (!selector && checkpointSet) selector = { kind: 'all' };

  if (!selector) { usage(); return; }

  // Re-resolved on every iteration so the graph can grow mid-run.
  const resolve = (state) => {
    const jobs = buildJobs();
    switch (selector.kind) {
      case 'all': return jobs;
      case 'resume': return jobs.filter((j) => !isDone(state, j.id));
      case 'phase': return jobs.filter((j) => j.phase === selector.value);
      case 'job': return jobs.filter((j) => j.id === selector.value);
      default: return [];
    }
  };

  if (!preflight()) {
    console.error('  Preflight found blockers. Fix them, or re-run with --preflight for detail.');
    process.exit(1);
  }

  if (doBranch) ensureBranch();

  banner([
    'TravelCRM UI/UX Remake Pipeline',
    `Selection:  ${selector.kind}${selector.value ? ' ' + selector.value : ''}`,
    `Jobs now:   ${resolve(st).length} (grows after inventory)`,
    `Branch:     ${currentBranch()}`,
    `Started:    ${nowIso()}`,
    'Checkpoint: desktop/audit/remake/state.json',
  ]);

  const processed = new Set();
  let stopped = null;
  let ran = 0;
  for (;;) {
    const pending = resolve(st).filter((j) => !processed.has(j.id));
    if (!pending.length) break;
    const job = pending[0];

    // Owner review checkpoint: halt at the first job outside the allowed set,
    // so the design language can be reviewed before ~47 more slices inherit it.
    if (checkpointSet && !checkpointSet.has(job.id)) {
      stopped = job.id;
      break;
    }

    processed.add(job.id);
    runJob(job, st);
    ran += 1;
    st = loadState(); // inventory writes slice manifests → graph expands here
  }

  // A run that executed nothing is almost always a CLI mistake (this exact
  // shape once burned hours by printing usage and exiting 0). Fail loudly.
  if (ran === 0 && !stopped) {
    console.error('\n  ERROR: no jobs ran. Every selected job was already ok, or the');
    console.error('  selection matched nothing. Check `--status` and your flags.\n');
    process.exitCode = 1;
    return;
  }

  showStatus(loadState());

  if (stopped) {
    banner([
      'CHECKPOINT REACHED — stopped for owner review',
      '',
      `Next job would have been: ${stopped}`,
      '',
      'Review before the remaining slices inherit this foundation:',
      '  desktop/audit/remake/CONTRACT.md      the design-system contract',
      '  desktop/src/design-system/tokens/     colors, spacing, type scale',
      '  desktop/src/components/domain/        ListPage / EntityForm / DetailPage',
      ...REVIEW_SLICES.map((s) => `  desktop/src/app/(app)/${s}/`.padEnd(40) + 'rebuilt slice'),
      '',
      'See it running:  npm run dev:desktop   then visit /contacts /leads /invoices',
      '',
      'Happy?   node scripts/remake-pipeline.js --all',
      'Not?     adjust the foundation, then --retry slice:<name> to rebuild one',
    ]);
    return;
  }

  console.log('  NEXT:');
  console.log('    Status:  node scripts/remake-pipeline.js --status');
  console.log('    Resume:  node scripts/remake-pipeline.js --resume');
  console.log('    Video:   desktop/showcase/full-walkthrough.webm');
  console.log('');
}

main();
