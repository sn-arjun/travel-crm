#!/usr/bin/env node
/**
 * Self-test for scripts/push-secrets.sh and scripts/sync-config.sh (R125). No network, no wrangler call.
 *   node scripts/shell-scripts.selftest.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const push = path.join(here, 'push-secrets.sh');
const sync = path.join(here, 'sync-config.sh');
const tmp = mkdtempSync(path.join(tmpdir(), 'shell-selftest-'));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};
const bash = (args, env = {}) =>
  spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, JWT_SECRET: '', SENDGRID_API_KEY: '', ...env } });
const fwd = (p) => p.split(path.sep).join('/');

try {
  const values = path.join(tmp, 'values.tfvars');
  writeFileSync(
    values,
    [
      'jwt_secret = "SECRET-VALUE-JWT-1234567890"',
      'sendgrid_api_key = "SG.SECRET-VALUE-SENDGRID"',
      'twilio_auth_token = "SECRET-VALUE-TWILIO"',
      'cloudflare_account_id = "acc123"',
      'app_url = "https://app.should-not-be-pushed.test"',
      'cors_origins = "https://should-not-be-pushed.test"',
      'quotes_url = "https://should-not-be-pushed.test"',
      'api_public_url = "https://should-not-be-pushed.test"',
      'plivo_auth_id = "should-not-be-pushed"',
      'fcm_server_key = "should-not-be-pushed"',
      'anthropic_api_key = ""',
      '',
    ].join('\n'),
  );
  const backend = path.join(tmp, 'backend');
  const r = bash([fwd(push), '--dry-run', '--env', 'production', '--file', fwd(values)], { BACKEND_DIR: fwd(backend) });
  const out = `${r.stdout}${r.stderr}`;
  check(r.status === 0, `dry run exits 0 and survives the first push (no set -e counter bug) ${r.status === 0 ? '' : out}`);
  check(out.includes('.wrangler.production.toml'), 'dry run names the generated config path');
  check(['JWT_SECRET', 'SENDGRID_API_KEY', 'TWILIO_AUTH_TOKEN', 'CF_ACCOUNT_ID'].every((n) => out.includes(`would push ${n}`)), 'dry run lists the real secrets that have values');
  check(!/SECRET-VALUE|acc123/.test(out), 'dry run never prints a value');
  const pushed = (out.match(/would push (\S+)/g) ?? []).map((l) => l.replace('would push ', ''));
  check(pushed.length === 4, `dry run lists exactly the 4 secrets with values (got ${pushed.length})`);
  const plain = ['APP_URL', 'CORS_ORIGINS', 'QUOTES_URL', 'API_PUBLIC_URL', 'EMAIL_FROM', 'ALLOW_LOOPBACK_ORIGINS', 'TENANT_PROVISIONER', 'PLIVO_AUTH_ID', 'FCM_SERVER_KEY'];
  check(plain.every((n) => !out.includes(n)), 'plain settings and unused providers are not on the list');
  check(/skip\s+ANTHROPIC_API_KEY/.test(out), 'empty values are skipped');

  const real = bash([fwd(push), '--env', 'production', '--file', fwd(values)], { BACKEND_DIR: fwd(backend) });
  check(real.status === 1 && /not found/.test(real.stderr), 'a real run without the generated config is refused');
  const badEnv = bash([fwd(push), '--env', 'prod', '--dry-run']);
  check(badEnv.status === 2, 'unknown environment is refused');

  const pushSrc = readFileSync(push, 'utf8');
  check(/-c "\$CONFIG" --env "\$ENV_NAME"/.test(pushSrc) && !/\(\(\s*\w+\+\+\s*\)\)/.test(pushSrc), 'script passes -c <generated config> --env and has no ((X++)) counters');

  const syncSrc = readFileSync(sync, 'utf8').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
  check(!/sed\s+-i|>\s*"?\$BACKEND_DIR|\.dev\.vars|cat\s*>/.test(syncSrc), 'sync-config.sh writes nothing (no .dev.vars, no sed on wrangler.toml)');
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  check(!('deploy' in pkg.scripts) && !('infra' in pkg.scripts), 'root package.json has no one-shot deploy / infra (terraform auto-approve) scripts');
  check(!/--registry|from-d1-remote/.test(pkg.scripts['deploy:api'] ?? '') && !/gen:wrangler/.test(pkg.scripts['deploy:api'] ?? ''), 'deploy:api no longer runs the generator without a registry');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures === 0 ? 'shell-scripts self-test: ALL PASSED' : `shell-scripts self-test: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
