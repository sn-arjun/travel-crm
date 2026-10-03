#!/usr/bin/env node
/**
 * Isolated local stack launcher for the fix batches.
 *
 *   node scripts/fix-stack.mjs up     [--slot N] [--reset-db] [--no-build]
 *   node scripts/fix-stack.mjs down   [--slot N]
 *   node scripts/fix-stack.mjs status [--slot N]
 *
 * Slot N -> API port 8787 + 10N, web port 3100 + 10N.
 * `up` starts `wrangler dev` (TEST_MODE, outbound providers blanked) against the checkout's local D1,
 * builds the desktop app with NEXT_PUBLIC_API_URL pointing at that API (unless --no-build) and serves it
 * with `next start`. Pids/ports are written to audit/fix/stack/slot<N>.json, logs next to it.
 * The local D1 lives in backend/.wrangler/state; it is created, migrated and seeded when missing or with --reset-db.
 */
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.resolve(desktopDir, '..', 'backend');
const stackDir = path.join(desktopDir, 'audit', 'fix', 'stack');

// ── args ────────────────────────────────────────────────────
const [command, ...rest] = process.argv.slice(2);
let slot = 0;
let resetDb = false;
let noBuild = false;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--slot') slot = Number(rest[++i]);
  else if (rest[i] === '--reset-db') resetDb = true;
  else if (rest[i] === '--no-build') noBuild = true;
  else die(`Unknown argument: ${rest[i]}`);
}
if (!['up', 'down', 'status'].includes(command) || !Number.isInteger(slot) || slot < 0) {
  die('Usage: fix-stack.mjs up|down|status [--slot N] [--reset-db] [--no-build]');
}
const apiPort = 8787 + 10 * slot;
const webPort = 3100 + 10 * slot;
const apiUrl = `http://localhost:${apiPort}/api/v1`;
const webUrl = `http://localhost:${webPort}`;
const slotFile = path.join(stackDir, `slot${slot}.json`);

function die(msg) {
  console.error(`fix-stack: ${msg}`);
  process.exit(1);
}
const log = (msg) => console.log(`[fix-stack slot ${slot}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readSlot() {
  try {
    return JSON.parse(readFileSync(slotFile, 'utf8'));
  } catch {
    return null;
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

async function waitFor(url, label, timeoutMs, okStatus = (s) => s >= 200 && s < 400) {
  const end = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (okStatus(res.status)) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e?.cause?.code ?? e?.message ?? String(e);
    }
    await sleep(1000);
  }
  throw new Error(`${label} did not become ready at ${url} within ${timeoutMs / 1000}s (last: ${last})`);
}

function killTree(pid) {
  if (!pid) return;
  if (isWin) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}

/** Kill whatever still LISTENS on a port (orphans such as workerd that escaped the tree kill). */
function killListeners(port) {
  if (isWin) {
    const out = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout ?? '';
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (/LISTENING/i.test(line) && new RegExp(`[:.]${port}\\s`).test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== '0') pids.add(pid);
      }
    }
    for (const pid of pids) killTree(pid);
  } else {
    const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout ?? '';
    for (const pid of out.split(/\s+/).filter(Boolean)) killTree(Number(pid));
  }
}

function spawnLogged(cmd, args, { cwd, env, logName }) {
  mkdirSync(stackDir, { recursive: true });
  const fd = openSync(path.join(stackDir, logName), 'w');
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    shell: isWin,
    windowsHide: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  closeSync(fd);
  return child.pid;
}

function runSync(cmd, args, { cwd, env, logName }) {
  mkdirSync(stackDir, { recursive: true });
  const fd = openSync(path.join(stackDir, logName), 'w');
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: isWin,
    windowsHide: true,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  return r.status ?? 1;
}

function tailLog(logName, n = 40) {
  try {
    return readFileSync(path.join(stackDir, logName), 'utf8').split(/\r?\n/).slice(-n).join('\n');
  } catch {
    return '(no log)';
  }
}

/** backend/.wrangler-e2e.toml = wrangler.toml minus the [ai] section (same logic as playwright.config.ts). */
function writeE2eWranglerConfig() {
  const lines = readFileSync(path.join(backendDir, 'wrangler.toml'), 'utf8').split(/\r?\n/);
  const out = [];
  let skip = false;
  for (const line of lines) {
    if (/^\s*\[/.test(line)) skip = /^\s*\[ai\]/.test(line);
    if (!skip) out.push(line);
  }
  writeFileSync(path.join(backendDir, '.wrangler-e2e.toml'), out.join('\n'));
}

// ── commands ────────────────────────────────────────────────
async function down(quiet = false) {
  const s = readSlot();
  if (s) {
    killTree(s.webPid);
    killTree(s.apiPid);
  }
  await sleep(500);
  killListeners(webPort);
  killListeners(apiPort);
  rmSync(slotFile, { force: true });
  if (!quiet) log(`down (API :${apiPort}, web :${webPort})`);
}

async function status() {
  const s = readSlot();
  const check = async (url, ok) => {
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
      return ok(r.status) ? `up (${r.status})` : `unhealthy (${r.status})`;
    } catch {
      return 'down';
    }
  };
  log(`slot file: ${s ? 'present' : 'absent'}`);
  log(`API ${apiUrl}/health -> ${await check(`${apiUrl}/health`, (c) => c === 200)}`);
  log(`web ${webUrl}/login -> ${await check(`${webUrl}/login`, (c) => c >= 200 && c < 400)}`);
}

async function up() {
  if (readSlot() || (await portInUse(apiPort)) || (await portInUse(webPort))) {
    log('stale or running stack found for this slot - shutting it down first');
    await down(true);
    await sleep(1000);
  }
  for (const p of [apiPort, webPort]) {
    if (await portInUse(p)) die(`port ${p} is busy and could not be freed`);
  }

  // (1) wrangler config without [ai]
  writeE2eWranglerConfig();

  // (2) local D1: create + migrate + seed when missing or --reset-db
  const d1Dir = path.join(backendDir, '.wrangler', 'state', 'v3', 'd1');
  if (resetDb || !existsSync(d1Dir)) {
    log(resetDb ? 'resetting local D1' : 'no local D1 yet - creating it');
    rmSync(d1Dir, { recursive: true, force: true });
    let code = runSync(
      'npx',
      ['wrangler', 'd1', 'migrations', 'apply', 'travelcrm-master', '--local', '-c', '.wrangler-e2e.toml'],
      { cwd: backendDir, env: { CI: '1' }, logName: `slot${slot}-migrate.log` },
    );
    if (code !== 0) {
      rmSync(d1Dir, { recursive: true, force: true }); // never leave a half-migrated DB behind
      die(`migrations failed (exit ${code}):\n${tailLog(`slot${slot}-migrate.log`)}`);
    }
    code = runSync('node', ['scripts/seed-local.mjs'], {
      cwd: backendDir,
      env: { CI: '1' },
      logName: `slot${slot}-seed.log`,
    });
    if (code !== 0) {
      rmSync(d1Dir, { recursive: true, force: true });
      die(`seed failed (exit ${code}):\n${tailLog(`slot${slot}-seed.log`)}`);
    }
  }

  // (3) API
  log(`starting API on :${apiPort}`);
  const apiPid = spawnLogged(
    'npx',
    [
      'wrangler', 'dev', '--port', String(apiPort), '-c', '.wrangler-e2e.toml',
      '--var', 'TEST_MODE:true',
      '--var', 'SENDGRID_API_KEY:',
      '--var', 'TWILIO_ACCOUNT_SID:',
      '--var', 'TWILIO_AUTH_TOKEN:',
      '--var', 'TWILIO_VERIFY_SERVICE_SID:',
    ],
    { cwd: backendDir, env: {}, logName: `slot${slot}-api.log` },
  );
  writeFileSync(slotFile, JSON.stringify({ slot, apiPid, webPid: null, apiPort, webPort, apiUrl, webUrl }, null, 2));
  try {
    await waitFor(`${apiUrl}/health`, 'API', 90_000, (s) => s === 200);
  } catch (e) {
    const t = tailLog(`slot${slot}-api.log`);
    await down(true);
    die(`${e.message}\n--- slot${slot}-api.log (tail) ---\n${t}`);
  }

  // (4) build
  const webEnv = { NEXT_PUBLIC_API_URL: apiUrl };
  if (!noBuild) {
    log('building desktop (npm run build)');
    const code = runSync('npm', ['run', 'build'], { cwd: desktopDir, env: webEnv, logName: `slot${slot}-build.log` });
    if (code !== 0) {
      const t = tailLog(`slot${slot}-build.log`, 60);
      await down(true);
      die(`build failed (exit ${code})\n--- slot${slot}-build.log (tail) ---\n${t}`);
    }
  } else if (!existsSync(path.join(desktopDir, '.next', 'BUILD_ID'))) {
    await down(true);
    die('--no-build given but desktop/.next has no production build');
  }

  // (5) web
  log(`starting web on :${webPort}`);
  const webPid = spawnLogged('npx', ['next', 'start', '-p', String(webPort)], {
    cwd: desktopDir,
    env: webEnv,
    logName: `slot${slot}-web.log`,
  });
  writeFileSync(slotFile, JSON.stringify({ slot, apiPid, webPid, apiPort, webPort, apiUrl, webUrl }, null, 2));
  try {
    await waitFor(`${webUrl}/login`, 'web', 60_000);
  } catch (e) {
    const t = tailLog(`slot${slot}-web.log`);
    await down(true);
    die(`${e.message}\n--- slot${slot}-web.log (tail) ---\n${t}`);
  }

  // (6) done
  log(`up - API pid ${apiPid}, web pid ${webPid}`);
  console.log(`E2E_BASE_URL=${webUrl} E2E_API_URL=${apiUrl}`);
}

if (command === 'up') await up();
else if (command === 'down') await down();
else await status();
