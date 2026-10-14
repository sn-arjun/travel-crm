#!/usr/bin/env node
/**
 * Self-test for gen-wrangler.mjs (Node, because workerd tests have no child_process or fs).
 *   node scripts/gen-wrangler.selftest.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gen = path.join(here, 'gen-wrangler.mjs');
const sample = path.join(here, 'fixtures', 'registry.sample.json');
const tmp = mkdtempSync(path.join(tmpdir(), 'gen-wrangler-'));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

function run(args, env = {}) {
  return spawnSync(process.execPath, [gen, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

try {
  const out = path.join(tmp, 'prod.toml');
  const ids = {
    CF_D1_MASTER_ID: 'd0000000-0000-4000-8000-000000000001',
    CF_KV_CACHE_ID: 'e0000000000000000000000000000001',
    CF_KV_SESSIONS_ID: 'e0000000000000000000000000000002',
    CF_KV_REPORT_CACHE_ID: 'e0000000000000000000000000000003',
  };
  const r = run(['--env', 'production', '--registry', sample, '--out', out], ids);
  check(r.status === 0, `production generation exits 0 ${r.status === 0 ? '' : r.stderr}`);
  const t = readFileSync(out, 'utf8').split(/\r?\n/);
  const text = t.join('\n');
  const envStart = t.findIndex((l) => /^\[env\.production\]/.test(l));
  check(envStart > 0, 'has an [env.production] section');
  const envText = t.slice(envStart).join('\n');
  const topText = t.slice(0, envStart).join('\n');

  const tenantDbs = (s) => (s.match(/binding = "TENANT_DB_[^"]+"/g) ?? []).length;
  check(tenantDbs(topText) === 3, 'top level has 3 tenant D1 entries');
  check(tenantDbs(envText) === 3, '[env.production] has 3 tenant D1 entries');

  const needBindings = [
    'MASTER_DB', 'FILE_STORAGE', 'CACHE', 'SESSIONS', 'REPORT_CACHE', 'REALTIME',
    'EMAIL_QUEUE', 'SMS_QUEUE', 'PUSH_NOTIFICATION_QUEUE', 'WP_PROVISION_QUEUE', 'IMPORT_QUEUE', 'EXPORT_QUEUE',
    'IMPORT_DL_QUEUE', 'EXPORT_DL_QUEUE', 'CAMPAIGN_QUEUE', 'CAMPAIGN_DL_QUEUE',
    'AI_EXTRACTION_QUEUE', 'AI_EXTRACTION_DLQ', 'TENANT_JOBS_QUEUE',
  ];
  for (const b of needBindings) {
    const re = new RegExp(`(binding|name) = "${b}"`);
    check(re.test(envText), `[env.production] contains ${b}`);
  }
  check(/\[env\.production\.vars\][^[]*TENANCY_MODE = "multi"/.test(envText), '[env.production.vars] TENANCY_MODE = "multi"');
  check(/\[env\.production\.observability\][^[]*enabled = true/.test(envText), 'observability enabled in env section');
  check(/\[\[env\.production\.ratelimits\]\][^[]*API_RATE_LIMITER/.test(envText) && /UPLOAD_RATE_LIMITER/.test(envText) && /\[\[ratelimits\]\]/.test(topText), 'rate limiting bindings generated at top level and in env section');
  check(/head_sampling_rate = 1/.test(envText), 'observability head_sampling_rate = 1');
  check(/\[env\.production\.triggers\]/.test(envText), 'cron triggers repeated in env section');
  check(/migrations_dir = "drizzle\/master"/.test(envText), 'MASTER_DB uses drizzle/master');
  check(!/a0000000-/.test(text), 'no a0000000- placeholder when CF_* ids are set');

  const noIds = path.join(tmp, 'prod-noids.toml');
  const r2 = run(['--env', 'production', '--registry', sample, '--out', noIds], { CF_D1_MASTER_ID: '', CF_KV_CACHE_ID: '', CF_KV_SESSIONS_ID: '', CF_KV_REPORT_CACHE_ID: '' });
  check(r2.status === 0 && /a0000000-/.test(readFileSync(noIds, 'utf8')), 'without CF_* ids the placeholders remain (predeploy guard catches them)');

  const bad = run(['--env', 'production', '--out', path.join(tmp, 'x.toml')]);
  check(bad.status !== 0, 'production without a registry is refused');

  const loc = path.join(tmp, 'local.toml');
  const r3 = run(['--env', 'local', '--pool', '3', '--single', '--out', loc]);
  const lt = readFileSync(loc, 'utf8');
  check(r3.status === 0 && tenantDbs(lt) === 3 && /TENANCY_MODE = "single"/.test(lt) && !/^\[env\./m.test(lt), 'local --pool 3 --single: 3 pool DBs, single mode, no env section');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures === 0 ? 'gen-wrangler self-test: ALL PASSED' : `gen-wrangler self-test: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
