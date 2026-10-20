#!/usr/bin/env node
/**
 * Self-test for gen-wrangler.mjs (Node, because workerd tests have no child_process or fs).
 *   node scripts/gen-wrangler.selftest.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  // R131: email sending binding and provider settings
  check(/\[\[send_email\]\]\s*\r?\nname = "EMAIL"/.test(topText) && /\[\[env\.production\.send_email\]\]\s*\r?\nname = "EMAIL"/.test(envText), 'send_email binding EMAIL at top level and in env section');
  check(!/send_email[^[]*remote\s*=\s*true/.test(text), 'send_email binding is never remote');
  check(/\[vars\][^[]*EMAIL_SYSTEM_PROVIDER = "sendgrid"/.test(topText) && !/EMAIL_INBOUND_DOMAIN/.test(text), 'EMAIL_SYSTEM_PROVIDER defaults to sendgrid; no inbound domain unless set');
  const cfOut = path.join(tmp, 'prod-cf.toml');
  const rcf = run(['--env', 'production', '--registry', sample, '--out', cfOut], { EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL_INBOUND_DOMAIN: 'In.Example.com' });
  const cfText = readFileSync(cfOut, 'utf8');
  check(rcf.status === 0 && /EMAIL_SYSTEM_PROVIDER = "cloudflare"/.test(cfText) && /EMAIL_INBOUND_DOMAIN = "in\.example\.com"/.test(cfText), 'EMAIL_SYSTEM_PROVIDER=cloudflare and EMAIL_INBOUND_DOMAIN (lower-cased) reach [vars]');
  check(run(['--env', 'production', '--registry', sample, '--out', path.join(tmp, 'm.toml')], { EMAIL_SYSTEM_PROVIDER: 'mock' }).status !== 0, 'EMAIL_SYSTEM_PROVIDER=mock is refused outside local');
  check(run(['--env', 'production', '--registry', sample, '--out', path.join(tmp, 's.toml')], { EMAIL_SYSTEM_PROVIDER: 'ses' }).status !== 0, 'an unknown EMAIL_SYSTEM_PROVIDER is refused');

  const bad = run(['--env', 'production', '--out', path.join(tmp, 'x.toml')]);
  check(bad.status !== 0, 'production without a registry is refused');

  const loc = path.join(tmp, 'local.toml');
  const r3 = run(['--env', 'local', '--pool', '3', '--single', '--out', loc]);
  const lt = readFileSync(loc, 'utf8');
  check(r3.status === 0 && tenantDbs(lt) === 3 && /TENANCY_MODE = "single"/.test(lt) && !/^\[env\./m.test(lt), 'local --pool 3 --single: 3 pool DBs, single mode, no env section');

  // ---- first deploy from an empty registry, and the explicit config (--from-d1-remote) ----
  const fake = path.join(here, 'fixtures', 'fake-wrangler.mjs');
  const log = path.join(tmp, 'wrangler-calls.jsonl');
  const remoteEnv = { ...ids, GEN_WRANGLER_BIN: fake, FAKE_WRANGLER_LOG: log };
  const lines = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)) : []);

  const first = path.join(tmp, 'first.toml');
  const r4 = run(['--env', 'production', '--from-d1-remote', '--out', first], { ...remoteEnv, FAKE_WRANGLER_ROWS: '[]' });
  check(r4.status === 0, `first deploy: empty registry exits 0 ${r4.status === 0 ? '' : r4.stderr}`);
  const ft = readFileSync(first, 'utf8');
  check(tenantDbs(ft) === 0 && /binding = "MASTER_DB"/.test(ft) && ft.includes(ids.CF_D1_MASTER_ID), 'first deploy: config holds MASTER_DB with the real master id and no agencies');
  check(!/a0000000-/.test(ft), 'first deploy: no placeholder master id');
  const call = lines()[0];
  check(!!call && call.args[call.args.indexOf('-c') + 1] === first, 'wrangler is given the generated config explicitly with -c');
  check(!!call && call.args.includes('--env') && call.args[call.args.indexOf('--env') + 1] === 'production', 'wrangler is given --env production');
  check(!!call && call.cfg.includes(ids.CF_D1_MASTER_ID) && !/a0000000-/.test(call.cfg), 'the config wrangler reads has the real master id, not wrangler.toml placeholder');

  const second = path.join(tmp, 'second.toml');
  const rows = JSON.stringify([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', db_binding: 'TENANT_DB_aaaa0000', d1_database_id: 'f0000000-0000-4000-8000-000000000001', status: 'active' }]);
  const r5 = run(['--env', 'production', '--from-d1-remote', '--out', second], { ...remoteEnv, FAKE_WRANGLER_ROWS: rows });
  check(r5.status === 0 && tenantDbs(readFileSync(second, 'utf8')) === 2, 'registry with one agency: tenant D1 entry present at top level and in [env.production]');

  const r6 = run(['--env', 'production', '--from-d1-remote', '--out', path.join(tmp, 'noid.toml')], { ...remoteEnv, CF_D1_MASTER_ID: '' });
  check(r6.status !== 0 && /CF_D1_MASTER_ID/.test(r6.stderr), '--from-d1-remote without CF_D1_MASTER_ID is refused');

  const r7 = run(['--env', 'production', '--from-d1-remote', '--out', path.join(tmp, 'nt.toml')], { ...remoteEnv, FAKE_WRANGLER_FAIL: 'D1_ERROR: no such table: tenants' });
  check(r7.status !== 0 && /master migrations/.test(r7.stderr), 'missing tenants table explains that master migrations come first');

  const r8 = run(['--env', 'staging', '--from-d1-remote', '--dry-run', '--out', path.join(tmp, 'dry.toml')], ids);
  check(r8.status === 0 && /-c /.test(r8.stdout) && /--env staging/.test(r8.stdout), 'dry-run prints the command with -c and --env');

  // ---- domain placeholder: one definition, everything else derived ----
  const dom = path.join(tmp, 'dom.toml');
  run(['--env', 'production', '--registry', sample, '--out', dom], { ...ids, DOMAIN: 'acme.test', APP_URL: '', API_URL: '', CORS_ORIGINS: '', EMAIL_FROM: '' });
  const dt = readFileSync(dom, 'utf8');
  check(dt.includes("CORS_ORIGINS = \"https://app.acme.test,https://acme.test,https://www.acme.test\""), "CORS_ORIGINS defaults to the web app and landing origins of DOMAIN");
  check(dt.includes("APP_URL = \"https://app.acme.test\"") && dt.includes("API_URL = \"https://api.acme.test\"") && dt.includes("EMAIL_FROM = \"noreply@acme.test\""), "APP_URL, API_URL and EMAIL_FROM derive from DOMAIN");
  const dflt = path.join(tmp, 'dflt.toml');
  run(['--env', 'production', '--registry', sample, '--out', dflt], { ...ids, DOMAIN: '', APP_URL: '', API_URL: '', CORS_ORIGINS: '', EMAIL_FROM: '' });
  check(dt.includes("TENANT_PROVISIONER = \"cloudflare\"") && dt.includes("CF_WORKER_SCRIPT_NAME = \"travelcrm-api\"") && dt.includes("API_PUBLIC_URL = \"https://api.acme.test\"") && dt.includes("ALLOW_LOOPBACK_ORIGINS = \"true\""), "plain settings (provisioner, worker name, API_PUBLIC_URL, loopback) are written to [vars], not left to secrets");
  check(readFileSync(dflt, "utf8").includes("https://app.YOUR-DOMAIN.example"), "without DOMAIN the clearly marked YOUR-DOMAIN.example placeholder is used");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures === 0 ? 'gen-wrangler self-test: ALL PASSED' : `gen-wrangler self-test: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
