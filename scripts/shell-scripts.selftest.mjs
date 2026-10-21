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
const REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUPER_ADMIN_JWT_SECRET', 'CREDENTIALS_KEYS', 'CF_ACCOUNT_ID', 'CF_API_TOKEN', 'SENDGRID_API_KEY'];
const OPTIONAL = [
  'HEALTH_TOKEN', 'SENDGRID_WEBHOOK_PUBLIC_KEY', 'INBOUND_EMAIL_SECRET', 'UNSUB_SECRET',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID', 'TWILIO_SMS_FROM_NUMBER', 'TWILIO_WHATSAPP_FROM_NUMBER',
  'WHATSAPP_META_TOKEN', 'WHATSAPP_META_APP_SECRET', 'WHATSAPP_META_VERIFY_TOKEN',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
  'PROVISIONER_SECRET', 'ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY', 'GOOGLE_MAPS_API_KEY', 'TURNSTILE_SECRET', 'ERROR_REPORTER_DSN',
];
const NEVER = ['BILLING_MOCK_SECRET', 'TEST_MODE', 'PLATFORM_GST_RATE', 'VOIP_CALLING_COUNTRIES', 'SUPER_ADMIN_EMAIL', 'OCI_PROVISIONER_URL', 'WP_SITES_DOMAIN', 'BILLING_GRACE_DAYS'];
const blank = Object.fromEntries([...REQUIRED, ...OPTIONAL, ...NEVER].map((n) => [n, '']));
const bash = (args, env = {}) => spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, ...blank, ...env } });
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
  const reqEnv = Object.fromEntries(REQUIRED.filter((n) => n !== 'JWT_SECRET' && n !== 'CF_ACCOUNT_ID' && n !== 'SENDGRID_API_KEY').map((n) => [n, `ENV-VALUE-${n}`]));
  const r = bash([fwd(push), '--dry-run', '--env', 'production', '--file', fwd(values)], { BACKEND_DIR: fwd(backend), ...reqEnv });
  const out = `${r.stdout}${r.stderr}`;
  check(r.status === 0, `dry run exits 0 and survives the first push (no set -e counter bug) ${r.status === 0 ? '' : out}`);
  check(out.includes('.wrangler.production.toml'), 'dry run names the generated config path');
  check(['JWT_SECRET', 'SENDGRID_API_KEY', 'TWILIO_AUTH_TOKEN', 'CF_ACCOUNT_ID', 'CF_API_TOKEN'].every((n) => out.includes(`would push ${n}`)), 'dry run lists the real secrets that have values');
  check(!/SECRET-VALUE|ENV-VALUE|acc123/.test(out), 'dry run never prints a value');
  const pushed = (out.match(/would push (\S+)/g) ?? []).map((l) => l.replace('would push ', ''));
  check(pushed.length === 8, `dry run lists exactly the 8 secrets with values (got ${pushed.length})`);
  const plain = ['APP_URL', 'CORS_ORIGINS', 'QUOTES_URL', 'API_PUBLIC_URL', 'EMAIL_FROM', 'ALLOW_LOOPBACK_ORIGINS', 'TENANT_PROVISIONER', 'PLIVO_AUTH_ID', 'FCM_SERVER_KEY', 'PLATFORM_GST_RATE', 'VOIP_CALLING_COUNTRIES', 'SUPER_ADMIN_EMAIL', 'OCI_PROVISIONER_URL', 'WP_SITES_DOMAIN', 'BILLING_GRACE_DAYS', 'BILLING_MOCK_SECRET', 'TEST_MODE'];
  check(plain.every((n) => !out.includes(n)), 'plain settings, mock secret, test mode and unused providers are not on the list');
  check(/skip\s+ANTHROPIC_API_KEY/.test(out), 'empty optional values are skipped');
  check(!/cloudflare_api_token|should-not-be-pushed/.test(out) && !/would push CF_API_TOKEN/.test(bash([fwd(push), '--dry-run', '--file', fwd(values)], { BACKEND_DIR: fwd(backend) }).stdout), 'CF_API_TOKEN never falls back to the file deploy token');

  // names: every secret is on the list (optional ones show as skip when empty)
  const empty = path.join(tmp, 'empty.tfvars');
  writeFileSync(empty, '\n');
  const none = bash([fwd(push), '--dry-run', '--env', 'production', '--file', fwd(empty)], { BACKEND_DIR: fwd(backend) });
  const noneOut = `${none.stdout}${none.stderr}`;
  check(none.status === 1 && /Stopped/.test(noneOut), 'dry run with no values at all: required secrets missing is fatal (exit 1)');
  check([...REQUIRED, ...OPTIONAL].every((n) => noneOut.includes(n)), `dry run with no values lists all ${REQUIRED.length + OPTIONAL.length} secret names`);
  check(REQUIRED.every((n) => new RegExp(`MISSING ${n} \\(required\\)`).test(noneOut)) && OPTIONAL.every((n) => new RegExp(`skip\\s+${n} \\(optional`).test(noneOut)), 'missing required are marked MISSING, missing optional are skip');
  check(!/would push|ENV-VALUE/.test(noneOut), 'nothing would be pushed while a required secret is missing');
  const part = bash([fwd(push), '--dry-run', '--partial', '--env', 'production', '--file', fwd(empty)], { BACKEND_DIR: fwd(backend), STRIPE_SECRET_KEY: 'sk_test_ENV-VALUE-STRIPE' });
  check(part.status === 0 && /would push STRIPE_SECRET_KEY/.test(part.stdout) && !/ENV-VALUE/.test(part.stdout), '--partial: a top-up run pushes just the secrets that have values, required missing is not fatal');
  const never = bash([fwd(push), '--dry-run', '--partial', '--env', 'production', '--file', fwd(empty)], { BACKEND_DIR: fwd(backend), BILLING_MOCK_SECRET: 'mock-ENV-VALUE', TEST_MODE: 'true' });
  check(!/would push (BILLING_MOCK_SECRET|TEST_MODE)/.test(never.stdout) && /ignore BILLING_MOCK_SECRET/.test(never.stdout) && !/ENV-VALUE/.test(never.stdout), 'BILLING_MOCK_SECRET and TEST_MODE are never pushed');
  const ph = bash([fwd(push), '--dry-run', '--partial', '--env', 'production', '--file', fwd(empty)], { BACKEND_DIR: fwd(backend), SENDGRID_API_KEY: 'SG.xxxxxxxxxxxxxxxxxxxx', JWT_SECRET: 'local-dev-jwt-secret-change-me-0123' });
  check(!/would push (SENDGRID_API_KEY|JWT_SECRET)/.test(ph.stdout), 'example placeholder values are treated as missing');

  const real = bash([fwd(push), '--env', 'production', '--file', fwd(values)], { BACKEND_DIR: fwd(backend), ...reqEnv });
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
