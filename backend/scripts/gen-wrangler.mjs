#!/usr/bin/env node
/**
 * Generate the Worker deploy / dev configuration from wrangler.base.toml and the agency registry.
 *
 *   node scripts/gen-wrangler.mjs --env <local|dev|staging|production>
 *        [--registry <json>] [--from-d1-remote [--dry-run]] [--pool N] [--single] [--out <file>]
 *
 * Writes backend/.wrangler.<env>.toml (gitignored). Wrangler does not inherit bindings into [env.*],
 * so for dev/staging/production the output repeats every binding inside a complete [env.<name>] section.
 * For --env local it also writes .wrangler.local-tenantschema.toml: the same config whose MASTER_DB points
 * at drizzle/tenant (tracked in d1_migrations_tenant) so single mode can hold both schemas in one database.
 *
 * Registry JSON: [{ tenantId, binding, databaseName, databaseId, status }]
 * Env vars (non-local): CF_D1_MASTER_ID, CF_KV_CACHE_ID, CF_KV_SESSIONS_ID, CF_KV_REPORT_CACHE_ID,
 *   Optional plain settings written to [vars]: ALLOW_LOOPBACK_ORIGINS (default true), CREDENTIALS_ACTIVE_KEY_ID (k1),
 *   EMAIL_FROM_NAME, PLATFORM_SUPPORT_EMAIL, QUOTES_URL, EMAIL_INBOUND_DOMAIN (R131: domain for reply+<token>@ addresses).
 *   EMAIL_SYSTEM_PROVIDER (sendgrid | cloudflare, default sendgrid; mock for local only) is always written. Also written: API_PUBLIC_URL, TENANT_PROVISIONER=cloudflare,
 *   CF_WORKER_SCRIPT_NAME.
 *   DOMAIN (the one place the public domain is set; APP_URL, API_URL, CORS_ORIGINS and EMAIL_FROM default
 *   from it), and the explicit overrides APP_URL, API_URL, CORS_ORIGINS, EMAIL_FROM.
 *
 * --from-d1-remote: FIRST writes the config with an EMPTY registry (real master id, no agencies), then
 *   reads the registry with `wrangler d1 execute ... -c <that file> [--env <env>]`, so the placeholder
 *   master id in backend/wrangler.toml is never used, then rewrites the file with the agencies found.
 *   First deploy from an empty registry therefore yields a valid config with zero agencies.
 *   GEN_WRANGLER_BIN=<script.mjs> replaces `npx wrangler` (used by the self-test).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENVS = ['local', 'dev', 'staging', 'production'];
const PLACEHOLDER_MASTER = 'a0000000-0000-0000-0000-000000000001';
// PLACEHOLDER DOMAIN: the owner has not chosen one yet. This is the ONLY place the backend toolchain names it;
// set DOMAIN in the environment (or APP_URL / API_URL / EMAIL_FROM directly) to override. See docs/GO-LIVE.md.
export const PLACEHOLDER_DOMAIN = 'YOUR-DOMAIN.example';

function die(msg) {
  console.error(`gen-wrangler: ${msg}`);
  process.exit(1);
}

const q = (s) => JSON.stringify(String(s));

/** Deterministic local database id for pool database N (never a real Cloudflare id). */
export function localPoolId(n) {
  return `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/**
 * Split TOML text into blocks. Block 0 holds the top-level keys; every later block starts at a
 * [table] / [[array]] header and carries the comment lines written directly above it.
 */
export function splitBlocks(toml) {
  const blocks = [{ header: null, lines: [] }];
  for (const line of toml.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      const prev = blocks[blocks.length - 1];
      const moved = [];
      while (prev.lines.length && /^\s*#/.test(prev.lines[prev.lines.length - 1])) moved.unshift(prev.lines.pop());
      blocks.push({ header: line.trim(), lines: [...moved, line] });
    } else {
      blocks[blocks.length - 1].lines.push(line);
    }
  }
  return blocks.map((b) => ({ header: b.header, text: b.lines.join('\n').replace(/^\s*\n/, '').replace(/\s+$/, '') }));
}

function prefixHeader(block, envName) {
  return block.text.replace(
    /^(\s*)(\[\[?)\s*([^\]\s]+)\s*(\]\]?)/m,
    (_m, ws, open, name, close) => `${ws}${open}env.${envName}.${name}${close}`,
  );
}

export function parseArgs(argv) {
  const a = { env: null, registry: null, pool: 4, single: false, fromD1: false, dryRun: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--env') a.env = argv[++i];
    else if (k === '--registry') a.registry = argv[++i];
    else if (k === '--pool') a.pool = Number(argv[++i]);
    else if (k === '--single') a.single = true;
    else if (k === '--from-d1-remote') a.fromD1 = true;
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--out') a.out = argv[++i];
    else die(`Unknown argument: ${k}`);
  }
  if (!ENVS.includes(a.env)) die(`--env must be one of ${ENVS.join(', ')}`);
  if (!Number.isInteger(a.pool) || a.pool < 1 || a.pool > 50) die('--pool must be an integer 1..50');
  return a;
}

export function bindingToDatabaseName(binding) {
  return `travelcrm-tenant-${binding.replace(/^TENANT_DB_/, '').toLowerCase().replace(/_/g, '-')}`;
}

export function normaliseRegistry(rows) {
  if (!Array.isArray(rows)) die('registry must be a JSON array');
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r || r.status === 'deleted') continue;
    if (!/^TENANT_DB_[A-Za-z0-9_]+$/.test(r.binding ?? '')) die(`registry entry has an invalid binding: ${JSON.stringify(r.binding)}`);
    if (!r.databaseId) die(`registry entry ${r.binding} has no databaseId`);
    if (seen.has(r.binding)) die(`duplicate binding in registry: ${r.binding}`);
    seen.add(r.binding);
    out.push({ ...r, databaseName: r.databaseName || bindingToDatabaseName(r.binding) });
  }
  return out;
}

const REMOTE_QUERY = 'SELECT id, db_binding, d1_database_id, status FROM tenants WHERE db_binding IS NOT NULL';

export function d1RemoteArgs(configFile, env) {
  return ['d1', 'execute', 'travelcrm-master', '--remote', '-c', configFile, ...(env === 'local' ? [] : ['--env', env]), '--json', '--command', REMOTE_QUERY];
}

function registryFromD1Remote(configFile, env, dryRun) {
  const wargs = d1RemoteArgs(configFile, env);
  if (dryRun) {
    console.log(`gen-wrangler (dry-run): would run: npx wrangler ${wargs.map((x) => (x.includes(' ') ? q(x) : x)).join(' ')}`);
    return null;
  }
  const bin = process.env.GEN_WRANGLER_BIN;
  const r = bin
    ? spawnSync(process.execPath, [bin, ...wargs], { cwd: backendDir, encoding: 'utf8' })
    : spawnSync('npx', ['wrangler', ...wargs.map((x) => (process.platform === 'win32' && x.includes(' ') ? q(x) : x))], {
        cwd: backendDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
  if (r.status !== 0) {
    const msg = `${r.stderr || ''}${r.stdout || ''}`;
    if (/no such table/i.test(msg)) die('the master database has no tenants table yet: run the master migrations first (docs/GO-LIVE.md phase 3), then re-run.');
    die(`wrangler d1 execute failed:
${msg}`);
  }
  const parsed = JSON.parse(r.stdout);
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((p) => p.results ?? []);
  return rows.map((x) => ({ tenantId: x.id, binding: x.db_binding, databaseId: x.d1_database_id, status: x.status }));
}

function replaceKvIds(baseText, env) {
  const ids = {
    CACHE: process.env.CF_KV_CACHE_ID,
    SESSIONS: process.env.CF_KV_SESSIONS_ID,
    REPORT_CACHE: process.env.CF_KV_REPORT_CACHE_ID,
  };
  return baseText.replace(/(binding = "(CACHE|SESSIONS|REPORT_CACHE)"\s*\r?\n\s*id = )"[^"]*"/g, (m, pre, name) =>
    env !== 'local' && ids[name] ? `${pre}${q(ids[name])}` : m,
  );
}

/** R131: provider of the platform's own system mail. 'sendgrid' unless EMAIL_SYSTEM_PROVIDER says otherwise; 'mock' is for local stacks only. */
export function emailSystemProvider(env) {
  const v = (process.env.EMAIL_SYSTEM_PROVIDER || 'sendgrid').trim().toLowerCase();
  if (!['sendgrid', 'cloudflare', 'mock'].includes(v)) die(`EMAIL_SYSTEM_PROVIDER must be sendgrid, cloudflare or mock (got ${v}).`);
  if (v === 'mock' && env !== 'local') die('EMAIL_SYSTEM_PROVIDER=mock is for local stacks only.');
  return v;
}

/** Build the full TOML text. `tenantSchemaMaster` points MASTER_DB at the tenant migrations (local single mode). */
export function buildConfig({ env, registry, pool, single, tenantSchemaMaster = false }) {
  const base = readFileSync(path.join(backendDir, 'wrangler.base.toml'), 'utf8');
  const blocks = splitBlocks(replaceKvIds(base, env));
  const top = blocks[0];

  const masterId = env === 'local' ? PLACEHOLDER_MASTER : process.env.CF_D1_MASTER_ID || PLACEHOLDER_MASTER;
  const d1 = [
    [
      '# --- D1 Databases (generated) ---',
      '[[d1_databases]]',
      'binding = "MASTER_DB"',
      'database_name = "travelcrm-master"',
      `database_id = ${q(masterId)}`,
      tenantSchemaMaster ? 'migrations_dir = "drizzle/tenant"' : 'migrations_dir = "drizzle/master"',
      ...(tenantSchemaMaster ? ['migrations_table = "d1_migrations_tenant"'] : []),
    ].join('\n'),
  ];
  let tenants = registry;
  if (env === 'local') {
    tenants = Array.from({ length: pool }, (_, i) => ({
      binding: `TENANT_DB_POOL_${i + 1}`,
      databaseName: `travelcrm-tenant-pool-${i + 1}`,
      databaseId: localPoolId(i + 1),
    }));
  }
  for (const t of tenants) {
    d1.push(
      [
        '[[d1_databases]]',
        `binding = ${q(t.binding)}`,
        `database_name = ${q(t.databaseName)}`,
        `database_id = ${q(t.databaseId)}`,
        'migrations_dir = "drizzle/tenant"',
      ].join('\n'),
    );
  }

  const domain = process.env.DOMAIN || PLACEHOLDER_DOMAIN;
  const appUrl = process.env.APP_URL || (env === 'local' ? 'http://localhost:3000' : `https://app.${domain}`);
  const apiUrl = process.env.API_URL || (env === 'local' ? 'http://localhost:8787' : `https://api.${domain}`);
  const vars = [
    '[vars]',
    `ENVIRONMENT = ${q(env === 'local' ? 'development' : env)}`,
    `TENANCY_MODE = ${q(single ? 'single' : 'multi')}`,
    `APP_URL = ${q(appUrl)}`,
    `API_URL = ${q(apiUrl)}`,
    `CORS_ORIGINS = ${q(process.env.CORS_ORIGINS || (env === "local" ? appUrl : `${appUrl},https://${domain},https://www.${domain}`))}`,
    `EMAIL_FROM = ${q(process.env.EMAIL_FROM || (env === 'local' ? 'noreply@travelcrm.example' : `noreply@${domain}`))}`,
  ];
  vars.push(`EMAIL_SYSTEM_PROVIDER = ${q(emailSystemProvider(env))}`);
  if (process.env.EMAIL_INBOUND_DOMAIN) vars.push(`EMAIL_INBOUND_DOMAIN = ${q(process.env.EMAIL_INBOUND_DOMAIN.trim().toLowerCase())}`);
  if (env !== 'local') {
    // Plain settings live here, not in secrets (scripts/push-secrets.sh pushes real secrets only).
    const workerName = env === 'production' ? 'travelcrm-api' : `travelcrm-api-${env}`;
    vars.push(
      `API_PUBLIC_URL = ${q(apiUrl)}`,
      `ALLOW_LOOPBACK_ORIGINS = ${q(process.env.ALLOW_LOOPBACK_ORIGINS || 'true')}`,
      `CREDENTIALS_ACTIVE_KEY_ID = ${q(process.env.CREDENTIALS_ACTIVE_KEY_ID || 'k1')}`,
      `TENANT_PROVISIONER = ${q('cloudflare')}`,
      `CF_WORKER_SCRIPT_NAME = ${q(workerName)}`,
    );
    for (const k of ['EMAIL_FROM_NAME', 'PLATFORM_SUPPORT_EMAIL', 'QUOTES_URL']) {
      if (process.env[k]) vars.push(`${k} = ${q(process.env[k])}`);
    }
  }
  const varsText = vars.join('\n');

  const bodyBlocks = [...d1.map((text) => ({ text })), ...blocks.slice(1), { text: varsText }];
  const parts = [
    `# AUTO-GENERATED by scripts/gen-wrangler.mjs --env ${env}. Do not edit; do not commit.\n# Source: wrangler.base.toml${env === 'local' ? '' : ' + agency registry'}`,
    top.text,
    ...bodyBlocks.map((b) => b.text),
  ];

  if (env !== 'local') {
    const name = env === 'production' ? 'travelcrm-api' : `travelcrm-api-${env}`;
    parts.push(`# --- Environment: ${env} (Wrangler does not inherit bindings, so every binding is repeated) ---`);
    parts.push(`[env.${env}]\nname = ${q(name)}`);
    for (const b of bodyBlocks) {
      if (/^\s*\[\[migrations\]\]/m.test(b.text)) continue; // migrations are inheritable
      parts.push(prefixHeader(b, env));
    }
  }
  return parts.filter((p) => p.trim() !== '').join('\n\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let registry = [];
  const outFile = args.out ? path.resolve(process.cwd(), args.out) : path.join(backendDir, `.wrangler.${args.env}.toml`);
  if (args.env !== 'local') {
    if (args.fromD1) {
      const master = process.env.CF_D1_MASTER_ID;
      if (!master || master === PLACEHOLDER_MASTER) {
        if (args.dryRun) console.log('gen-wrangler (dry-run): CF_D1_MASTER_ID is not set; a real run would stop here.');
        else die('--from-d1-remote needs CF_D1_MASTER_ID (the real master database id, terraform output d1_master_database_id).');
      }
      // Pass 1: base config with an empty registry, so wrangler reads the real master id, never wrangler.toml's placeholder.
      if (!args.dryRun) writeFileSync(outFile, buildConfig({ env: args.env, registry: [], pool: args.pool, single: args.single }));
      const rows = registryFromD1Remote(outFile, args.env, args.dryRun);
      if (rows === null) return;
      registry = normaliseRegistry(rows);
      if (registry.length === 0) console.log('gen-wrangler: the agency registry is empty (first deploy): the config will hold the master database only.');
    } else if (args.registry) {
      registry = normaliseRegistry(JSON.parse(readFileSync(path.resolve(process.cwd(), args.registry), 'utf8')));
    } else {
      die('non-local environments need --registry <json> or --from-d1-remote');
    }
  }
  writeFileSync(outFile, buildConfig({ env: args.env, registry, pool: args.pool, single: args.single }));
  const what = args.env === 'local' ? `${args.pool} pool databases` : `${registry.length} agencies`;
  console.log(`gen-wrangler: wrote ${outFile} (${args.env}, ${what}, TENANCY_MODE=${args.single ? 'single' : 'multi'})`);
  if (args.env === 'local') {
    const ts = path.join(backendDir, '.wrangler.local-tenantschema.toml');
    writeFileSync(ts, buildConfig({ env: 'local', registry, pool: args.pool, single: args.single, tenantSchemaMaster: true }));
    console.log(`gen-wrangler: wrote ${ts} (MASTER_DB -> drizzle/tenant, table d1_migrations_tenant)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
