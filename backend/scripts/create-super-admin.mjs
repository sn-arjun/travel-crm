#!/usr/bin/env node
/**
 * Create the first (or another) super admin. The ONLY way to create one: there is no seed route and no default
 * credential anywhere (R111).
 *
 *   node scripts/create-super-admin.mjs --local  --email you@example.com --name "Your Name"
 *   echo "a long fresh passphrase" | node scripts/create-super-admin.mjs --remote --email you@example.com --name "You" --password-stdin
 *
 * Options
 *   --local | --remote   REQUIRED, which MASTER_DB to write (wrangler d1 execute --local / --remote)
 *   --config <toml>      wrangler config to use (for example .wrangler.production.toml); default wrangler.toml
 *   --db <name>          D1 database name, default travelcrm-master
 *   --email, --name      prompted for when missing (and a terminal is attached)
 *   --role               super_admin (default), support or viewer
 *   --password-stdin     read the password from the first line of stdin instead of prompting
 *
 * The password is read from a hidden prompt or stdin, must be at least 12 characters, is hashed with bcrypt here and
 * is never printed or written to disk (only the hash goes into a temporary SQL file that is deleted afterwards).
 * An existing email is never overwritten.
 */

import bcrypt from 'bcryptjs';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { uuidv7 } from 'uuidv7';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

function flag(name) {
  return argv.includes(`--${name}`);
}
function option(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function fail(message) {
  console.error(`create-super-admin: ${message}`);
  process.exit(1);
}

const local = flag('local');
const remote = flag('remote');
if (local === remote) fail('pass exactly one of --local or --remote');

const role = option('role') ?? 'super_admin';
if (!['super_admin', 'support', 'viewer'].includes(role)) fail('--role must be super_admin, support or viewer');

const dbName = option('db') ?? 'travelcrm-master';
const config = option('config');
const interactive = process.stdin.isTTY && process.stdout.isTTY;

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

let email = option('email');
let name = option('name');
if (!email) {
  if (!interactive) fail('--email is required when no terminal is attached');
  email = await ask('Email: ');
}
if (!name) {
  if (!interactive) fail('--name is required when no terminal is attached');
  name = await ask('Name: ');
}
email = (email ?? '').trim().toLowerCase();
name = (name ?? '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('that does not look like an email address');
if (!name) fail('name is required');

let password;
if (flag('password-stdin')) {
  password = readFileSync(0, 'utf8').split(/\r?\n/)[0];
} else {
  if (!interactive) fail('no terminal: pass --password-stdin and pipe the password in');
  password = await ask('Password (min 12 characters): ', { hidden: true });
  const again = await ask('Repeat password: ', { hidden: true });
  if (password !== again) fail('the passwords do not match');
}
if (!password || password.length < 12) fail('the password must be at least 12 characters');

const sqlText = (v) => `'${String(v).replace(/'/g, "''")}'`;
const hash = bcrypt.hashSync(password, 10);
password = '';

// INSERT only: the unique index on email makes an existing super admin a hard error instead of an overwrite.
const sql = `INSERT INTO super_admins (id, email, name, password_hash, role, is_active)
VALUES (${sqlText(uuidv7())}, ${sqlText(email)}, ${sqlText(name)}, ${sqlText(hash)}, ${sqlText(role)}, 1);
`;

const tmpDir = join(backendDir, '.dryrun');
mkdirSync(tmpDir, { recursive: true });
const tmpName = join('.dryrun', `.create-super-admin-${process.pid}.sql`);
writeFileSync(join(backendDir, tmpName), sql, 'utf8');

const args = ['wrangler', 'd1', 'execute', dbName, local ? '--local' : '--remote', ...(config ? ['-c', config] : []), `--file=${tmpName}`];
try {
  // shell: true is needed for npx on Windows; every argument here is built from validated flags, never from the password.
  execFileSync('npx', args, { cwd: backendDir, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  console.log(`Super admin created: ${email} (${role}) in ${dbName} (${local ? 'local' : 'remote'}).`);
  console.log('Sign in with POST /api/v1/admin/auth/login. Make sure SUPER_ADMIN_JWT_SECRET (32+ characters) is set on the Worker.');
} catch {
  fail('wrangler failed (an existing email, a missing migration or a wrong --config are the usual causes)');
} finally {
  try {
    unlinkSync(join(backendDir, tmpName));
  } catch {
    // already gone
  }
}
