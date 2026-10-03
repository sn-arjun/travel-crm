#!/usr/bin/env node
/**
 * Gate runner for the fix batches (FIX-PLAN section 5).
 *
 *   node scripts/fix-gates.mjs <BATCH_ID> [--slot N] [--skip typecheck,specs,...]
 *
 * Loads audit/fix/batches/<BATCH_ID>-*.json and runs the gates it enables, in this order:
 *   typecheck, unit, lint, build, backendTests, flutter, specs, layoutProbe
 * Results go to audit/fix/gates/<BATCH_ID>.json as { <gate>: { status, durationMs, tail } } where `tail`
 * is the LAST 80 lines of the gate's output. Full logs and probe output land in audit/fix/probe/ (gitignored).
 * Exit code 1 when any gate fails.
 *
 * specs / layoutProbe need a running stack for the slot (`node scripts/fix-stack.mjs up --slot N`); the URLs come
 * from audit/fix/stack/slot<N>.json. When the `build` gate runs while that stack is up, the stack is restarted
 * afterwards (`up --no-build`) so it serves the fresh build.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(desktopDir, '..');
const backendDir = path.join(repoRoot, 'backend');
const fixDir = path.join(desktopDir, 'audit', 'fix');
const gatesDir = path.join(fixDir, 'gates');
const probeDir = path.join(fixDir, 'probe');
const GATE_ORDER = ['typecheck', 'unit', 'lint', 'build', 'backendTests', 'flutter', 'specs', 'layoutProbe'];

// ── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const batchId = argv.shift();
let slot = 0;
let skip = new Set();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--slot') slot = Number(argv[++i]);
  else if (argv[i] === '--skip') skip = new Set((argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  else usage(`Unknown argument: ${argv[i]}`);
}
if (!batchId || !/^B\d{2}$/.test(batchId)) usage('Batch id required, e.g. B00');
function usage(msg) {
  console.error(`fix-gates: ${msg}\nUsage: node scripts/fix-gates.mjs <BATCH_ID> [--slot N] [--skip a,b]`);
  process.exit(2);
}

const batchFile = readdirSync(path.join(fixDir, 'batches')).find((f) => f.startsWith(`${batchId}-`) && f.endsWith('.json'));
if (!batchFile) usage(`No batch file ${batchId}-*.json in audit/fix/batches`);
const batch = JSON.parse(readFileSync(path.join(fixDir, 'batches', batchFile), 'utf8'));
const gates = batch.gates ?? {};
const baseline = JSON.parse(readFileSync(path.join(fixDir, 'gate-baseline.json'), 'utf8'));
mkdirSync(gatesDir, { recursive: true });
mkdirSync(probeDir, { recursive: true });

const slotFile = path.join(fixDir, 'stack', `slot${slot}.json`);
const readSlot = () => {
  try {
    return JSON.parse(readFileSync(slotFile, 'utf8'));
  } catch {
    return null;
  }
};
const toPosix = (p) => p.split(path.sep).join('/');
// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');

// ── process helpers ─────────────────────────────────────────
/** Locate an installed package by walking up from desktop/ (workspaces hoist to the repo root). */
function packageDir(pkg, from = desktopDir) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...pkg.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`package not installed: ${pkg}`);
  }
}
function binScript(pkg, bin, from = desktopDir) {
  const dir = packageDir(pkg, from);
  const meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const rel = typeof meta.bin === 'string' ? meta.bin : meta.bin?.[bin];
  if (!rel) throw new Error(`${pkg} has no bin ${bin}`);
  return path.join(dir, rel);
}

/** Run a command, capture combined output, tee it to a log file. Resolves { code, output }. */
function run(cmd, args, { cwd = desktopDir, env = {}, logName, shell = false } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0', ...env },
      shell,
      windowsHide: true,
    });
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('error', (e) => chunks.push(Buffer.from(`spawn error: ${e.message}\n`)));
    child.on('close', (code) => {
      const output = stripAnsi(Buffer.concat(chunks).toString('utf8'));
      if (logName) writeFileSync(path.join(probeDir, logName), output);
      resolve({ code: code ?? 1, output });
    });
  });
}
const node = (script, args, opts) => run(process.execPath, [script, ...args], opts);
const lastLines = (text, n = 80) => text.replace(/\s+$/, '').split(/\r?\n/).slice(-n).join('\n');

// ── gates ───────────────────────────────────────────────────
/** Each gate returns { ok, output }. */
const impl = {
  async typecheck() {
    const { output } = await node(binScript('typescript', 'tsc'), ['--noEmit'], { logName: `${batchId}-typecheck.log` });
    const errLines = output.split(/\r?\n/).filter((l) => /\berror TS\d+/.test(l));
    const srcErrors = [];
    let other = 0;
    for (const l of errLines) {
      const file = toPosix(l.split('(')[0]);
      if (file.startsWith('src/') && !/\.test\.[cm]?[jt]sx?$/.test(file)) srcErrors.push(l);
      else other++;
    }
    const lines = [`tsc: ${errLines.length} errors - ${srcErrors.length} in app src (must be ${baseline.tscSrcErrors ?? 0}), ${other} in tests/e2e/other (baseline ${baseline.tscTestErrors})`];
    const ok = srcErrors.length <= (baseline.tscSrcErrors ?? 0) && other <= baseline.tscTestErrors;
    if (!ok) lines.push(...srcErrors.slice(0, 40), '--- tsc tail ---', lastLines(output, 30));
    return { ok, output: lines.join('\n') };
  },

  async unit() {
    const outFile = path.join('audit', 'fix', 'gates', `${batchId}-vitest.json`);
    const { code, output } = await node(binScript('vitest', 'vitest'), ['run', '--reporter=json', `--outputFile=${outFile}`], {
      logName: `${batchId}-unit.log`,
    });
    let json;
    try {
      json = JSON.parse(readFileSync(path.join(desktopDir, outFile), 'utf8'));
    } catch {
      return { ok: false, output: `vitest produced no JSON report (exit ${code})\n${lastLines(output)}` };
    }
    const allowed = new Set(baseline.vitestFailingFiles ?? []);
    const failing = (json.testResults ?? [])
      .filter((r) => r.status === 'failed')
      .map((r) => toPosix(path.relative(desktopDir, r.name)));
    const unexpected = failing.filter((f) => !allowed.has(f));
    const fixed = [...allowed].filter((f) => !failing.includes(f));
    const lines = [
      `vitest: ${json.numPassedTests} passed / ${json.numFailedTests} failed tests; ${failing.length} failing files (baseline ${allowed.size})`,
    ];
    if (unexpected.length) lines.push('NEW failing files:', ...unexpected.map((f) => '  - ' + f));
    if (fixed.length) lines.push('Baseline files now passing (ratchet candidates):', ...fixed.map((f) => '  + ' + f));
    return { ok: unexpected.length === 0, output: lines.join('\n') };
  },

  async lint() {
    const a = await node(path.join(desktopDir, 'scripts', 'lint-gate.mjs'), [], { logName: `${batchId}-lint.log` });
    let output = a.output;
    let ok = a.code === 0;
    if (Array.isArray(gates.lintZero) && gates.lintZero.length) {
      const z = await node(path.join(desktopDir, 'scripts', 'lint-gate.mjs'), ['--zero', ...gates.lintZero], {
        logName: `${batchId}-lint-zero.log`,
      });
      output += `\n--- --zero ${gates.lintZero.join(' ')} ---\n${z.output}`;
      ok = ok && z.code === 0;
    }
    return { ok, output };
  },

  async build() {
    const s = readSlot();
    const env = s?.apiUrl ? { NEXT_PUBLIC_API_URL: s.apiUrl } : {};
    const r = await run('npm', ['run', 'build'], { env, shell: isWin, logName: `${batchId}-build.log` });
    let output = r.output;
    if (r.code === 0 && s) {
      // A running stack serves the old .next - restart it onto the fresh build.
      const stack = path.join(desktopDir, 'scripts', 'fix-stack.mjs');
      await node(stack, ['down', '--slot', String(slot)]);
      const up = await node(stack, ['up', '--slot', String(slot), '--no-build']);
      output += `\n--- stack restart (up --no-build) exit ${up.code} ---\n${lastLines(up.output, 15)}`;
      if (up.code !== 0) return { ok: false, output };
    }
    return { ok: r.code === 0, output };
  },

  async backendTests() {
    // Resolve vitest from backend/ (what `npx vitest` there uses): the Workers pool needs its own vitest version.
    const { code, output } = await node(binScript('vitest', 'vitest', backendDir), ['run'], {
      cwd: backendDir,
      logName: `${batchId}-backend.log`,
    });
    const files = /Test Files\s+(.*)/.exec(output)?.[1] ?? '';
    const tests = /\n\s*Tests\s+(.*)/.exec(output)?.[1] ?? '';
    const failedFiles = Number(/(\d+) failed/.exec(files)?.[1] ?? 0);
    const passed = Number(/(\d+) passed/.exec(tests)?.[1] ?? 0);
    const min = baseline.backendPassedMin ?? 0;
    const ok = failedFiles === 0 && passed >= min && code === 0;
    return { ok, output: `Test Files ${files}\nTests ${tests}\nrequire: 0 failed files, passed >= ${min}; exit ${code}\n${ok ? '' : lastLines(output, 60)}` };
  },

  async flutter() {
    const dir = path.join(repoRoot, 'packages', 'driver_app').replace(/\//g, '\\');
    const ps = 'C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe';
    const script = `cd '${dir}'; flutter analyze; if ($LASTEXITCODE -ne 0) { exit 1 }; flutter test; exit $LASTEXITCODE`;
    const { code, output } = await run(ps, ['-NoProfile', '-Command', script], { logName: `${batchId}-flutter.log` });
    const issues = /\b\d+ issues? found/i.test(output);
    return { ok: code === 0 && !issues, output };
  },

  async specs() {
    const s = readSlot();
    if (!s) return { ok: false, output: `No stack for slot ${slot} (audit/fix/stack/slot${slot}.json missing). Run: node scripts/fix-stack.mjs up --slot ${slot}` };
    let files = gates.specs.map((f) => f.replace(/^desktop\//, ''));
    if (files.length === 1 && files[0] === 'ALL') files = allSpecFiles();
    // e2e/.auth is gitignored, so a fresh worktree lacks it and the setup project fails reading its storage state.
    const authState = path.join(desktopDir, 'e2e', '.auth', 'admin.json');
    if (!existsSync(authState)) {
      mkdirSync(path.dirname(authState), { recursive: true });
      writeFileSync(authState, JSON.stringify({ cookies: [], origins: [] }));
    }
    const jsonName = path.join('audit', 'fix', 'probe', `${batchId}-playwright.json`);
    const { code, output } = await node(binScript('@playwright/test', 'playwright'), ['test', ...files, '--reporter=line,json'], {
      env: { E2E_BASE_URL: s.webUrl, E2E_API_URL: s.apiUrl, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonName },
      logName: `${batchId}-specs.log`,
    });
    let report;
    try {
      report = JSON.parse(readFileSync(path.join(desktopDir, jsonName), 'utf8'));
    } catch {
      return { ok: code === 0, output: `No Playwright JSON report (exit ${code})\n${lastLines(output)}` };
    }
    const failures = [];
    const walk = (suite) => {
      for (const sp of suite.specs ?? []) if (sp.ok === false) failures.push({ key: `${path.basename(sp.file)}:${sp.line}`, title: sp.title });
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites ?? []) walk(suite);

    const allowed = new Set();
    let allowBaseline = false;
    for (const entry of gates.allowedSpecFailures ?? []) {
      let cur = null;
      let found = false;
      for (const m of entry.matchAll(/([\w.-]+\.spec\.ts)?:(\d+)/g)) {
        if (m[1]) cur = m[1];
        if (cur) {
          allowed.add(`${cur}:${m[2]}`);
          found = true;
        }
      }
      if (!found) allowBaseline = true; // free-text entry: tolerate failures already in the e2e baseline
    }
    if (allowBaseline) {
      try {
        const base = JSON.parse(readFileSync(path.join(desktopDir, baseline.e2eBaseline), 'utf8'));
        for (const f of base.failures ?? []) {
          const m = /([\w.-]+\.spec\.ts):(\d+)/.exec(f.test ?? '');
          if (m) allowed.add(`${m[1]}:${m[2]}`);
        }
      } catch {
        /* no baseline file */
      }
    }
    const unexpected = failures.filter((f) => !allowed.has(f.key));
    const lines = [
      `playwright: ${report.stats?.expected ?? 0} passed, ${report.stats?.unexpected ?? 0} failed, ${report.stats?.flaky ?? 0} flaky, ${report.stats?.skipped ?? 0} skipped; ${failures.length - unexpected.length} failure(s) tolerated`,
    ];
    if (unexpected.length) lines.push('UNEXPECTED failures:', ...unexpected.map((f) => `  - ${f.key}  ${f.title}`));
    return { ok: unexpected.length === 0, output: lines.join('\n') + '\n' + lastLines(output, 30) };
  },

  async layoutProbe() {
    const s = readSlot();
    if (!s) return { ok: false, output: `No stack for slot ${slot} (audit/fix/stack/slot${slot}.json missing). Run: node scripts/fix-stack.mjs up --slot ${slot}` };
    const { routes, warnings } = await resolveProbeRoutes(gates.layoutProbe, s.apiUrl);
    if (routes.length === 0) return { ok: false, output: `No routes to probe\n${warnings.join('\n')}` };
    const routesFile = path.join('audit', 'fix', 'probe', `${batchId}-routes.json`);
    writeFileSync(path.join(desktopDir, routesFile), JSON.stringify(routes, null, 2));
    const r = await node(path.join(desktopDir, 'scripts', 'layout-probe.mjs'), [
      '--routes-file', routesFile,
      '--out', path.join('audit', 'fix', 'probe', batchId),
      '--slot', String(slot),
    ], { logName: `${batchId}-layout.log` });
    return { ok: r.code === 0, output: (warnings.length ? warnings.join('\n') + '\n' : '') + r.output };
  },
};

// ── specs / probe route helpers ─────────────────────────────
function allSpecFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'showcase' && name !== 'helpers' && name !== '.auth') walk(p);
      } else if (/\.spec\.ts$/.test(name)) out.push(toPosix(path.relative(desktopDir, p)));
    }
  };
  walk(path.join(desktopDir, 'e2e'));
  return out;
}

/** Frontend list prefix -> API list endpoint, where they differ. Everything else uses the prefix itself. */
const LIST_ENDPOINTS = {
  '/communication': '/contacts',
  '/communication/calls': '/calls',
  '/communication/templates': '/message-templates',
  '/ai/lead-score': '/leads',
  '/marketing/flyers/templates': '/marketing/flyer-templates',
  '/marketing/whatsapp': '/whatsapp-campaigns',
  '/super-admin/tenants': '/admin/tenants',
};

function pageRoutesUnderApp() {
  const root = path.join(desktopDir, 'src', 'app', '(app)');
  const out = [];
  const walk = (dir, segs) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p, /^\(.*\)$/.test(name) ? segs : [...segs, name]);
      else if (name === 'page.tsx') out.push('/' + segs.join('/'));
    }
  };
  walk(root, []);
  return out.sort();
}

async function resolveProbeRoutes(spec, apiUrl) {
  const warnings = [];
  let candidates = spec;
  if (Array.isArray(spec) && spec.length === 1 && spec[0] === 'ALL') candidates = pageRoutesUnderApp();
  const placeholder = /<[A-Za-z]+>|\[[A-Za-z]+\]/;
  if (!candidates.some((r) => placeholder.test(r))) return { routes: candidates, warnings };

  let token = null;
  try {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.com', password: 'Admin@123', tenantId: '01960000-0000-7000-8000-000000000001' }),
    });
    token = (await res.json())?.data?.accessToken ?? null;
  } catch (e) {
    warnings.push(`warning: cannot log in to ${apiUrl} to resolve ids (${e.message})`);
  }
  const cachePath = path.join(fixDir, 'probe-ids.json');
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    /* no cache yet */
  }
  const get = async (endpoint) => {
    const res = await fetch(`${apiUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const firstId = (json) => {
    const d = json?.data;
    const list = Array.isArray(d) ? d : (d?.items ?? d?.data ?? d?.results ?? d?.rows ?? null);
    return Array.isArray(list) && list[0]?.id ? String(list[0].id) : null;
  };

  const routes = [];
  for (let route of candidates) {
    let ok = true;
    for (let m = placeholder.exec(route); m; m = placeholder.exec(route)) {
      const prefix = route.slice(0, m.index).replace(/\/$/, '');
      const endpoint = LIST_ENDPOINTS[prefix] ?? prefix;
      const key = `${apiUrl}${endpoint}`;
      let id = null;
      if (token) {
        if (cache[key]) {
          const check = await get(`${endpoint}/${cache[key]}`).catch(() => ({ status: 0 }));
          if (check.status === 200) id = cache[key];
        }
        if (!id) {
          const list = await get(`${endpoint}?limit=1`).catch(() => ({ status: 0, json: {} }));
          id = list.status === 200 ? firstId(list.json) : null;
        }
      }
      if (!id) {
        warnings.push(`warning: skipped ${route} - no record found via ${endpoint}?limit=1`);
        ok = false;
        break;
      }
      cache[key] = id;
      route = route.slice(0, m.index) + id + route.slice(m.index + m[0].length);
    }
    if (ok) routes.push(route);
  }
  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
  } catch {
    /* cache is best effort */
  }
  return { routes, warnings };
}

// ── main ────────────────────────────────────────────────────
const enabled = (g) => {
  const v = gates[g];
  if (g === 'specs' || g === 'layoutProbe') return Array.isArray(v) && v.length > 0;
  return Boolean(v);
};

const results = {};
let failed = false;
for (const g of GATE_ORDER) {
  if (!enabled(g)) {
    results[g] = { status: 'skipped', durationMs: 0, tail: 'not enabled for this batch' };
    continue;
  }
  if (skip.has(g)) {
    results[g] = { status: 'skipped', durationMs: 0, tail: 'skipped via --skip' };
    continue;
  }
  console.log(`[fix-gates ${batchId}] running ${g} ...`);
  const t0 = Date.now();
  let r;
  try {
    r = await impl[g]();
  } catch (e) {
    r = { ok: false, output: `gate crashed: ${e.stack ?? e.message}` };
  }
  results[g] = { status: r.ok ? 'pass' : 'fail', durationMs: Date.now() - t0, tail: lastLines(r.output, 80) };
  if (!r.ok) failed = true;
  console.log(`[fix-gates ${batchId}] ${g}: ${results[g].status} (${(results[g].durationMs / 1000).toFixed(1)}s)`);
}

writeFileSync(path.join(gatesDir, `${batchId}.json`), JSON.stringify(results, null, 2) + '\n');

console.log(`\n${batchId} gate summary`);
console.log('gate'.padEnd(14) + 'status'.padEnd(10) + 'time');
for (const g of GATE_ORDER) {
  console.log(g.padEnd(14) + results[g].status.padEnd(10) + `${(results[g].durationMs / 1000).toFixed(1)}s`);
}
for (const g of GATE_ORDER) {
  if (results[g].status === 'fail') console.log(`\n--- ${g} tail ---\n${results[g].tail}`);
}
console.log(`\nwrote ${toPosix(path.relative(desktopDir, path.join(gatesDir, `${batchId}.json`)))}`);
process.exit(failed ? 1 : 0);
