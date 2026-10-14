#!/usr/bin/env node
/** Self-test for backup-tenants.mjs --dry-run: node scripts/backup-tenants.selftest.mjs */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), 'backup-selftest-'));
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };
try {
  const cfg = path.join(tmp, 'local.toml');
  const g = spawnSync(process.execPath, [path.join(here, 'gen-wrangler.mjs'), '--env', 'local', '--pool', '3', '--out', cfg], { encoding: 'utf8' });
  check(g.status === 0, 'local config generated');
  const r = spawnSync(process.execPath, [path.join(here, 'backup-tenants.mjs'), '--local', '--dry-run', '--config', cfg, '--out', path.join(tmp, 'out')], { encoding: 'utf8' });
  const out = r.stdout.split(/\r?\n/);
  check(r.status === 0, 'dry run exits 0');
  check(out.some((l) => /master\s+travelcrm-master/.test(l)), 'plan lists the master database');
  check(out.filter((l) => /agency\s+travelcrm-tenant-pool-\d/.test(l)).length === 3, 'plan lists the 3 pool databases');
  check(/nothing exported/.test(r.stdout), 'dry run exports nothing');
  const bad = spawnSync(process.execPath, [path.join(here, 'backup-tenants.mjs'), '--remote', '--dry-run'], { encoding: 'utf8' });
  check(bad.status !== 0, '--remote without --env is refused');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures === 0 ? 'backup-tenants self-test: ALL PASSED' : `backup-tenants self-test: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
