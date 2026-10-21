#!/usr/bin/env node
/**
 * Serve the super admin console (super-admin/) next to a local fix-stack slot, for the platform-owner, plans and website films.
 * fix-stack.mjs does not start the console; this does, against the same API, on web port + 5 (slot 2 -> http://localhost:3125).
 *
 *   node scripts/showcase/console-up.mjs up   [--slot N] [--no-build]
 *   node scripts/showcase/console-up.mjs down [--slot N]
 *
 * The console verifies operator tokens with SUPER_ADMIN_JWT_SECRET. A TEST_MODE API without that secret signs them with
 * `${JWT_SECRET}:super-admin-test-only` (backend/src/services/admin/session.ts), so the same value is derived here from
 * backend/.dev.vars and passed to the console process only (never printed, never written to disk).
 * Local only: no wrangler, no deploy, nothing account-touching.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const consoleDir = path.join(root, 'super-admin');
const work = path.join(root, 'desktop/showcase/.work');
const [cmd, ...rest] = process.argv.slice(2);
const slot = rest.includes('--slot') ? Number(rest[rest.indexOf('--slot') + 1]) : 0;
const noBuild = rest.includes('--no-build');
const port = 3105 + 10 * slot;
const apiUrl = `http://localhost:${8787 + 10 * slot}/api/v1`;
const pidFile = path.join(work, `console-slot${slot}.json`);
const isWin = process.platform === 'win32';
const log = (m) => console.log(`[console slot ${slot}] ${m}`);

function devVar(name) {
  const file = path.join(root, 'backend/.dev.vars');
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"(.*)"$/, '$1') : null;
}

async function up() {
  const jwt = devVar('SUPER_ADMIN_JWT_SECRET') || (devVar('JWT_SECRET') ? `${devVar('JWT_SECRET')}:super-admin-test-only` : null);
  if (!jwt || jwt.length < 32) throw new Error('cannot derive the console secret from backend/.dev.vars (JWT_SECRET missing)');
  const env = { ...process.env, BACKEND_API_URL: apiUrl, SUPER_ADMIN_JWT_SECRET: jwt, NEXT_TELEMETRY_DISABLED: '1', PORT: String(port) };
  delete env.ENVIRONMENT;
  fs.mkdirSync(work, { recursive: true });
  if (!noBuild) {
    log('building the console (next build)');
    const b = spawnSync('npx', ['next', 'build'], { cwd: consoleDir, env, stdio: 'inherit', shell: isWin });
    if (b.status !== 0) throw new Error(`console build failed (${b.status})`);
  }
  const out = fs.openSync(path.join(work, `console-slot${slot}.log`), 'a');
  const child = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: consoleDir, env, stdio: ['ignore', out, out], shell: isWin, detached: !isWin, windowsHide: true });
  child.unref();
  fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port, apiUrl }, null, 2));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://localhost:${port}/login`); if (r.status < 500) { log(`up at http://localhost:${port} (API ${apiUrl})`); console.log(`E2E_CONSOLE_URL=http://localhost:${port}`); return; } } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`console did not answer on :${port} (see ${path.relative(root, path.join(work, `console-slot${slot}.log`))})`);
}

function down() {
  if (!fs.existsSync(pidFile)) { log('not running'); return; }
  const { pid } = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  if (isWin) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { /* gone */ } }
  fs.rmSync(pidFile, { force: true });
  log('stopped');
}

try {
  if (cmd === 'up') await up();
  else if (cmd === 'down') down();
  else { console.error('usage: console-up.mjs up|down [--slot N] [--no-build]'); process.exit(2); }
} catch (e) { console.error(`[console] ${e.message}`); process.exit(1); }
