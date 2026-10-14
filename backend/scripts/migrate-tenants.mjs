#!/usr/bin/env node
/**
 * Roll database migrations across the master database and every agency database.
 *
 *   node scripts/migrate-tenants.mjs --local [--config <file>] [--dry-run] [--canary <tenantId|binding|db name|pool number>]
 *   node scripts/migrate-tenants.mjs --remote --env <dev|staging|production> [--dry-run] [--canary <...>]
 *
 * Order: master (drizzle/master) first, then the canary agency database, then the rest in groups of 10.
 * Stops at the first failure and prints which databases are done. Agency databases are read from the
 * [[d1_databases]] entries (binding TENANT_DB_*) of the generated config: .wrangler.local.toml (pool
 * databases) or .wrangler.<env>.toml (made by gen-wrangler from the registry).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GROUP_SIZE = 10;
const isWin = process.platform === 'win32';

function die(msg) {
  console.error(`migrate-tenants: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let mode = null;
let env = null;
let dryRun = false;
let canary = null;
let configOverride = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--local') mode = 'local';
  else if (a === '--remote') mode = 'remote';
  else if (a === '--env') env = args[++i];
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--canary') canary = args[++i];
  else if (a === '--config') configOverride = args[++i];
  else die(`Unknown argument: ${a}`);
}
if (!mode) die('give --local or --remote --env <env>');
if (mode === 'remote' && !['dev', 'staging', 'production'].includes(env ?? '')) die('--remote needs --env dev|staging|production');

const configName = configOverride ?? (mode === 'local' ? '.wrangler.local.toml' : `.wrangler.${env}.toml`);
const configPath = path.resolve(backendDir, configName);

if (!existsSync(configPath)) {
  if (mode === 'local' && !configOverride) {
    console.log(`migrate-tenants: ${configName} missing, generating it`);
    const r = spawnSync(process.execPath, [path.join(backendDir, 'scripts', 'gen-wrangler.mjs'), '--env', 'local'], { stdio: 'inherit' });
    if (r.status !== 0) die('gen-wrangler failed');
  } else {
    die(`${configName} not found. Generate it with: node scripts/gen-wrangler.mjs --env ${env} --registry <registry.json>`);
  }
}

/** Agency databases from the top-level [[d1_databases]] entries (everything before an [env.*] table). */
function readTenantDatabases(file) {
  const text = readFileSync(file, 'utf8').split(/\r?\n/);
  const stop = text.findIndex((l) => /^\[env\./.test(l) || /^\[\[env\./.test(l));
  const lines = stop === -1 ? text : text.slice(0, stop);
  const dbs = [];
  let cur = null;
  for (const line of lines) {
    if (/^\s*\[\[d1_databases\]\]/.test(line)) {
      cur = {};
      dbs.push(cur);
    } else if (/^\s*\[/.test(line)) {
      cur = null;
    } else if (cur) {
      const m = line.match(/^\s*(binding|database_name|database_id)\s*=\s*"([^"]*)"/);
      if (m) cur[m[1]] = m[2];
    }
  }
  return dbs.filter((d) => /^TENANT_DB_/.test(d.binding ?? '')).map((d) => ({ binding: d.binding, name: d.database_name }));
}

const tenants = readTenantDatabases(configPath);
if (tenants.length === 0) console.warn('migrate-tenants: warning - no agency databases found in the config; only master will be migrated');

function matchesCanary(t, key) {
  const hex = key.replace(/-/g, '').toLowerCase();
  return t.binding === key || t.name === key || t.binding === `TENANT_DB_${hex}` || t.binding === `TENANT_DB_POOL_${key}`;
}
let canaryDb = tenants[0] ?? null;
if (canary) {
  canaryDb = tenants.find((t) => matchesCanary(t, canary)) ?? null;
  if (!canaryDb) die(`canary "${canary}" is not in ${configName}`);
}
const rest = tenants.filter((t) => t !== canaryDb);
const groups = [];
for (let i = 0; i < rest.length; i += GROUP_SIZE) groups.push(rest.slice(i, i + GROUP_SIZE));

const wranglerArgs = (dbName) => [
  'wrangler', 'd1', 'migrations', 'apply', dbName,
  mode === 'local' ? '--local' : '--remote',
  '-c', configName,
  ...(mode === 'remote' ? ['--env', env] : []),
];

console.log(`migrate-tenants: ${mode}${env ? ` (${env})` : ''}, config ${configName}`);
console.log('  1. master:  travelcrm-master  (drizzle/master)');
console.log(`  2. canary:  ${canaryDb ? `${canaryDb.name}  [${canaryDb.binding}]` : '(none)'}`);
console.log(`  3. the rest: ${rest.length} database(s) in ${groups.length} group(s) of up to ${GROUP_SIZE}`);
groups.forEach((g, i) => console.log(`     group ${i + 1}: ${g.map((t) => t.name).join(', ')}`));
if (dryRun) {
  console.log('migrate-tenants: dry run, nothing applied');
  process.exit(0);
}

const done = [];
function runOne(db) {
  return new Promise((resolve) => {
    const child = spawn('npx', wranglerArgs(db.name), {
      cwd: backendDir,
      env: { ...process.env, CI: '1' },
      shell: isWin,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function step(label, dbs, parallel) {
  const results = [];
  if (parallel) results.push(...(await Promise.all(dbs.map(runOne))));
  else for (const db of dbs) results.push(await runOne(db));
  let failed = false;
  results.forEach((r, i) => {
    const name = dbs[i].name;
    if (r.code === 0) {
      done.push(name);
      console.log(`  ok   ${label}: ${name}`);
    } else {
      failed = true;
      console.error(`  FAIL ${label}: ${name}\n${r.out.split(/\r?\n/).slice(-15).join('\n')}`);
    }
  });
  if (failed) {
    console.error(`migrate-tenants: stopped at the first failure. Done so far (${done.length}): ${done.join(', ') || '(none)'}`);
    process.exit(1);
  }
}

await step('master', [{ name: 'travelcrm-master' }], false);
if (canaryDb) await step('canary', [canaryDb], false);
for (const [i, g] of groups.entries()) await step(`group ${i + 1}`, g, mode === 'remote');
console.log(`migrate-tenants: all ${done.length} database(s) migrated`);
