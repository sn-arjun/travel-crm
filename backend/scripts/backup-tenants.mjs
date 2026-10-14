#!/usr/bin/env node
/**
 * Logical backup of the master database and every agency database (see docs/ops/BACKUPS.md).
 *
 *   node scripts/backup-tenants.mjs --local  [--config <file>] [--out <dir>] [--dry-run] [--verify]
 *   node scripts/backup-tenants.mjs --remote --env <dev|staging|production> [--out <dir>] [--bucket travelcrm-backups]
 *                                   [--no-upload] [--dry-run]
 *   node scripts/backup-tenants.mjs --restore <file.sql|.sql.gz> --db <database name> [--config <file>] [--persist-to <dir>]
 *
 * Backup: a logical, data-only dump (INSERT statements generated with SQLite quote(), paged) of master and
 * each TENANT_DB_* entry of the generated config (.wrangler-e2e.toml / .wrangler.local.toml locally,
 * .wrangler.<env>.toml remotely), gzipped, plus manifest.json (sizes, sha256). `wrangler d1 export` is NOT
 * used: it refuses databases that contain FTS5 virtual tables, and every agency database has them. FTS
 * tables are rebuilt by their triggers when the rows are replayed into a database that already has the
 * schema (apply migrations first: node scripts/migrate-tenants.mjs, or d1 migrations apply). With --remote the .sql.gz files are uploaded to the R2 bucket with
 * `wrangler r2 object put <bucket>/<UTC date>/<file>`.
 * --verify (local): restores the first agency's export into a FRESH local database state and compares the
 * table list and row counts with the source.
 * --restore: replays a dump into a database that already has the schema with `wrangler d1 execute --file`;
 * with --persist-to the local state lives in that directory (a fresh pool database; migrations are applied
 * to it first), otherwise the default local state is used.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function die(msg) {
  console.error(`backup-tenants: ${msg}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const a = { mode: null, env: null, out: null, dryRun: false, verify: false, config: null, bucket: 'travelcrm-backups', upload: true, restore: null, db: null, persistTo: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--local') a.mode = 'local';
    else if (k === '--remote') a.mode = 'remote';
    else if (k === '--env') a.env = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--verify') a.verify = true;
    else if (k === '--config') a.config = argv[++i];
    else if (k === '--bucket') a.bucket = argv[++i];
    else if (k === '--no-upload') a.upload = false;
    else if (k === '--restore') a.restore = argv[++i];
    else if (k === '--db') a.db = argv[++i];
    else if (k === '--persist-to') a.persistTo = argv[++i];
    else die(`Unknown argument: ${k}`);
  }
  return a;
}

/** Same approach as migrate-tenants.mjs: databases come from the top-level [[d1_databases]] of the generated config. */
export function readDatabases(file) {
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
  return dbs
    .filter((d) => d.binding === 'MASTER_DB' || /^TENANT_DB_/.test(d.binding ?? ''))
    .map((d) => ({ binding: d.binding, name: d.database_name }));
}

function wrangler(args, { capture = false } = {}) {
  const r = spawnSync('npx', ['wrangler', ...args], {
    cwd: backendDir,
    encoding: 'utf8',
    shell: isWin,
    env: { ...process.env, CI: '1' },
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) die(`wrangler ${args.slice(0, 3).join(' ')} failed:\n${(r.stderr || '') + (r.stdout || '')}`);
  return capture ? r.stdout : '';
}

/** Table list and row counts of a database, via `d1 execute --json`. */
function snapshot(dbName, configName, { persistTo } = {}) {
  const persist = persistTo ? ['--persist-to', persistTo] : [];
  const tables = runSqlFile(dbName, ['--local'], configName, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name;", persist);
  const names = (tables[0] ?? []).map((r) => r.name);
  const counts = {};
  if (names.length) {
    // one statement per table (a compound SELECT over ~100 tables exceeds SQLite's term limit)
    const sets = runSqlFile(dbName, ['--local'], configName, names.map((n) => `SELECT '${n}' AS t, COUNT(*) AS n FROM "${n}";`).join(' '), persist);
    for (const set of sets) for (const r of set) counts[r.t] = r.n;
  }
  return { names, counts };
}

const NL = String.fromCharCode(10);
const PAGE_ROWS = 2000;
const QUERY_ROW_BUDGET = 4000;

/** Runs a SQL file with `d1 execute --json` and returns one result array per statement. */
function runSqlFile(dbName, flags, configName, sql, extra = []) {
  const tmp = path.join(backendDir, '.dryrun', `q-${process.pid}.sql`);
  mkdirSync(path.dirname(tmp), { recursive: true });
  writeFileSync(tmp, sql);
  try {
    const out = wrangler(['d1', 'execute', dbName, ...flags, '-c', configName, ...extra, '--file', tmp, '--json'], { capture: true });
    return JSON.parse(out).map((r) => r.results ?? []);
  } finally {
    rmSync(tmp, { force: true });
  }
}

const qid = (n) => `"${String(n).replace(/"/g, '""')}"`;

/** Dump every ordinary table (not FTS virtual tables, their shadow tables, d1 bookkeeping or sqlite_ internals) as INSERT statements. */
export function dumpDatabase(dbName, flags, configName) {
  const [cols, virtuals] = runSqlFile(dbName, flags, configName, [
    "SELECT m.name AS t, p.name AS col, p.pk AS pk, (m.sql LIKE '%WITHOUT ROWID%') AS wr FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type='table' AND m.sql NOT LIKE 'CREATE VIRTUAL%' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name NOT LIKE 'd1_migrations%' ORDER BY m.name, p.cid;",
    "SELECT name FROM sqlite_master WHERE sql LIKE 'CREATE VIRTUAL%';",
  ].join(' '), []);
  const virtualNames = virtuals.map((v) => v.name);
  const tables = new Map();
  for (const c of cols) {
    if (virtualNames.some((v) => c.t.startsWith(`${v}_`))) continue; // FTS shadow table
    if (!tables.has(c.t)) tables.set(c.t, { cols: [], pk: [], rowid: !c.wr });
    const t = tables.get(c.t);
    t.cols.push(c.col);
    if (c.pk > 0) t.pk.push(c.col);
  }
  const names = [...tables.keys()];
  const lines = [`-- TravelCRM logical backup of ${dbName} at ${new Date().toISOString()}`, '-- Data only: restore into a database that already has the schema (migrations applied).', 'PRAGMA defer_foreign_keys = true;'];
  if (names.length === 0) return lines.join(NL) + NL;

  const counts = runSqlFile(dbName, flags, configName, names.map((n) => `SELECT '${n}' AS t, COUNT(*) AS n FROM ${qid(n)};`).join(' '), []).map((set) => set[0]);
  const pieces = [];
  for (const { t, n } of counts) for (let off = 0; off < n; off += PAGE_ROWS) pieces.push({ t, off, rows: Math.min(PAGE_ROWS, n - off) });

  let batch = [];
  let budget = 0;
  const flush = () => {
    if (!batch.length) return;
    const sql = batch
      .map(({ t, off }, i) => {
        const info = tables.get(t);
        const order = info.rowid ? 'rowid' : (info.pk.length ? info.pk.map(qid).join(', ') : '1');
        const expr = info.cols.map((c) => `quote(${qid(c)})`).join(" || ',' || ");
        const colList = info.cols.map(qid).join(', ');
        return `SELECT 'INSERT OR REPLACE INTO ${qid(t).replace(/'/g, "''")} (${colList.replace(/'/g, "''")}) VALUES (' || ${expr} || ');' AS stmt FROM (SELECT * FROM ${qid(t)} ORDER BY ${order} LIMIT ${PAGE_ROWS} OFFSET ${off})`;
      })
      .map((q) => q + ';')
      .join(' ');
    for (const set of runSqlFile(dbName, flags, configName, sql, [])) for (const r of set) lines.push(r.stmt);
    batch = [];
    budget = 0;
  };
  for (const p of pieces) {
    batch.push(p);
    budget += p.rows;
    if (budget >= QUERY_ROW_BUDGET || batch.length >= 25) flush();
  }
  flush();
  return lines.join(NL) + NL;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function restore(file, dbName, configName, persistTo) {
  let sqlFile = path.resolve(process.cwd(), file);
  if (!existsSync(sqlFile)) die(`restore file not found: ${file}`);
  if (sqlFile.endsWith('.gz')) {
    const plain = sqlFile.slice(0, -3);
    writeFileSync(plain, gunzipSync(readFileSync(sqlFile)));
    sqlFile = plain;
  }
  wrangler(['d1', 'execute', dbName, '--local', '-c', configName, ...(persistTo ? ['--persist-to', persistTo] : []), '--file', sqlFile]);
}

function main() {
  const a = parseArgs(process.argv.slice(2));

  if (a.restore) {
    if (!a.db) die('--restore needs --db <database name>');
    const configName = a.config ?? (existsSync(path.join(backendDir, '.wrangler-e2e.toml')) ? '.wrangler-e2e.toml' : '.wrangler.local.toml');
    restore(a.restore, a.db, configName, a.persistTo);
    console.log(`backup-tenants: restored ${a.restore} into ${a.db}${a.persistTo ? ` (state ${a.persistTo})` : ''}`);
    return;
  }

  if (!a.mode) die('give --local or --remote --env <env>');
  if (a.mode === 'remote' && !['dev', 'staging', 'production'].includes(a.env ?? '')) die('--remote needs --env dev|staging|production');

  const configName = a.config ?? (a.mode === 'remote'
    ? `.wrangler.${a.env}.toml`
    : existsSync(path.join(backendDir, '.wrangler-e2e.toml')) ? '.wrangler-e2e.toml' : '.wrangler.local.toml');
  const configPath = path.resolve(backendDir, configName);
  if (!existsSync(configPath)) {
    die(`${configName} not found. Local: node scripts/gen-wrangler.mjs --env local (or start a fix-stack). Remote: node scripts/gen-wrangler.mjs --env ${a.env} --from-d1-remote`);
  }
  const dbs = readDatabases(configPath);
  if (!dbs.some((d) => d.binding === 'MASTER_DB')) die(`no MASTER_DB in ${configName}`);

  const day = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(process.cwd(), a.out ?? path.join(backendDir, '.dryrun', 'backups'));
  const remoteFlags = a.mode === 'local' ? ['--local'] : ['--remote', '--env', a.env];

  console.log(`backup-tenants: ${a.mode}${a.env ? ` (${a.env})` : ''}, config ${configName}, ${dbs.length} database(s) -> ${outDir}`);
  for (const d of dbs) {
    console.log(`  ${d.binding === 'MASTER_DB' ? 'master' : 'agency'}  ${d.name}  [${d.binding}]  -> ${d.name}.sql.gz${a.mode === 'remote' && a.upload ? `  -> r2://${a.bucket}/${day}/` : ''}`);
  }
  if (a.dryRun) {
    console.log('backup-tenants: dry run, nothing exported');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), mode: a.mode, env: a.env, databases: [] };
  for (const d of dbs) {
    const sqlPath = path.join(outDir, `${d.name}.sql`);
    writeFileSync(sqlPath, dumpDatabase(d.name, remoteFlags, configName));
    const raw = readFileSync(sqlPath);
    const gz = gzipSync(raw);
    const gzPath = `${sqlPath}.gz`;
    writeFileSync(gzPath, gz);
    rmSync(sqlPath, { force: true });
    manifest.databases.push({ binding: d.binding, name: d.name, file: path.basename(gzPath), sqlBytes: raw.length, gzBytes: statSync(gzPath).size, sha256: sha256(gz) });
    console.log(`  exported ${d.name}: ${raw.length} bytes sql, ${gz.length} bytes gz`);
    if (a.mode === 'remote' && a.upload) {
      wrangler(['r2', 'object', 'put', `${a.bucket}/${day}/${path.basename(gzPath)}`, '--file', gzPath, '--remote', '-c', configName, '--env', a.env]);
    }
  }
  const manifestPath = path.join(outDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (a.mode === 'remote' && a.upload) {
    wrangler(['r2', 'object', 'put', `${a.bucket}/${day}/manifest.json`, '--file', manifestPath, '--remote', '-c', configName, '--env', a.env]);
  }
  console.log(`backup-tenants: wrote ${manifest.databases.length} backup(s) and manifest.json to ${outDir}`);

  if (a.verify) {
    if (a.mode !== 'local') die('--verify only works with --local');
    const target = manifest.databases.find((d) => d.binding !== 'MASTER_DB') ?? manifest.databases[0];
    const fresh = path.join(backendDir, '.dryrun', 'restore-state');
    rmSync(fresh, { recursive: true, force: true });
    const before = snapshot(target.name, configName);
    // a fresh pool database: apply the schema (migrations) to it, then replay the dump
    wrangler(['d1', 'migrations', 'apply', target.name, '--local', '-c', configName, '--persist-to', fresh]);
    restore(path.join(outDir, target.file), target.name, configName, fresh);
    const after = snapshot(target.name, configName, { persistTo: fresh });
    const same = JSON.stringify(before) === JSON.stringify(after) && before.names.length > 0;
    console.log(`backup-tenants: verify ${target.name}: ${before.names.length} tables, ${Object.values(before.counts).reduce((x, y) => x + y, 0)} rows in source; restored copy ${same ? 'MATCHES' : 'DIFFERS'}`);
    rmSync(fresh, { recursive: true, force: true });
    if (!same) die('restored database does not match the source');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
