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
 *   APP_URL, API_URL, CORS_ORIGINS, EMAIL_FROM.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENVS = ['local', 'dev', 'staging', 'production'];
const PLACEHOLDER_MASTER = 'a0000000-0000-0000-0000-000000000001';

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

function registryFromD1Remote(dryRun) {
  const args = ['wrangler', 'd1', 'execute', 'travelcrm-master', '--remote', '--json', '--command', REMOTE_QUERY];
  if (dryRun) {
    console.log(`gen-wrangler (dry-run): would run: npx ${args.map((x) => (x.includes(' ') ? q(x) : x)).join(' ')}`);
    return null;
  }
  const r = spawnSync('npx', args.map((x) => (process.platform === 'win32' && x.includes(' ') ? q(x) : x)), {
    cwd: backendDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) die(`wrangler d1 execute failed:\n${r.stderr || r.stdout}`);
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

  const appUrl = process.env.APP_URL || (env === 'local' ? 'http://localhost:3000' : 'https://app.travelcrm.example');
  const apiUrl = process.env.API_URL || (env === 'local' ? 'http://localhost:8787' : 'https://api.travelcrm.example');
  const vars = [
    '[vars]',
    `ENVIRONMENT = ${q(env === 'local' ? 'development' : env)}`,
    `TENANCY_MODE = ${q(single ? 'single' : 'multi')}`,
    `APP_URL = ${q(appUrl)}`,
    `API_URL = ${q(apiUrl)}`,
    `CORS_ORIGINS = ${q(process.env.CORS_ORIGINS || appUrl)}`,
    `EMAIL_FROM = ${q(process.env.EMAIL_FROM || 'noreply@travelcrm.example')}`,
  ].join('\n');

  const bodyBlocks = [...d1.map((text) => ({ text })), ...blocks.slice(1), { text: vars }];
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
  if (args.env !== 'local') {
    if (args.fromD1) {
      const rows = registryFromD1Remote(args.dryRun);
      if (rows === null) return;
      registry = normaliseRegistry(rows);
    } else if (args.registry) {
      registry = normaliseRegistry(JSON.parse(readFileSync(path.resolve(process.cwd(), args.registry), 'utf8')));
    } else {
      die('non-local environments need --registry <json> or --from-d1-remote');
    }
  }
  const outFile = args.out ? path.resolve(process.cwd(), args.out) : path.join(backendDir, `.wrangler.${args.env}.toml`);
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
