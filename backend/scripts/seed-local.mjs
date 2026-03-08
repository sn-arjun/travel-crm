/**
 * Local development seed script.
 * Creates master schema tables + demo tenant + admin user in the local D1 database.
 *
 * Usage (from backend/ directory):
 *   node scripts/seed-local.mjs
 *
 * Prerequisites:
 *   npx wrangler d1 migrations apply travelcrm-master --local
 *   (this applies the tenant schema from drizzle/tenant/)
 *
 * Login after seeding:
 *   Email:    admin@demo.com
 *   Password: Admin@123
 */

import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');

// ── Fixed dev IDs (stable so re-running is idempotent) ────────────────────
const TENANT_ID  = '01960000-0000-7000-8000-000000000001';
const USER_ID    = '01960000-0000-7000-8000-000000000002';
const TU_ID      = '01960000-0000-7000-8000-000000000003';

const EMAIL    = 'admin@demo.com';
const PASSWORD = 'Admin@123';
const NAME     = 'Admin User';
const COMPANY  = 'Demo Travel Agency';
const SUBDOMAIN = 'demo';

// ── Step 1: Apply master schema (drizzle/master/) ─────────────────────────
// wrangler.toml only points migrations_dir at drizzle/tenant/, so master
// tables (tenants, tenant_users, subscriptions, etc.) are never created
// by `wrangler d1 migrations apply`. We apply them here.
console.log('📦 Applying master schema (drizzle/master/) …');

const masterDir = join(backendDir, 'drizzle', 'master');
const masterFiles = readdirSync(masterDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

let masterSql = '';
for (const file of masterFiles) {
  masterSql += readFileSync(join(masterDir, file), 'utf8') + '\n';
}

const masterTmpFile = join(backendDir, '.seed-master-schema-tmp.sql');
writeFileSync(masterTmpFile, masterSql, 'utf8');

try {
  execSync(
    `npx wrangler d1 execute travelcrm-master --local --file=".seed-master-schema-tmp.sql"`,
    { stdio: 'inherit', cwd: backendDir },
  );
  console.log('   Master schema applied.');
} catch (e) {
  // Tables may already exist from a previous run — that's OK
  console.log('   Master schema already exists (or partially applied). Continuing…');
} finally {
  try { unlinkSync(masterTmpFile); } catch {}
}

// ── Step 2: Hash password and seed data ───────────────────────────────────
console.log('🔑 Hashing password …');
const hash = bcrypt.hashSync(PASSWORD, 10);

const sql = `
-- Clean up any old rows (delete children before parents for FK compliance)
DELETE FROM tenant_users WHERE email     = '${EMAIL}';
DELETE FROM tenants      WHERE subdomain = '${SUBDOMAIN}';
DELETE FROM users        WHERE email     = '${EMAIL}';

-- Master schema seed
INSERT INTO tenants
  (id, company_name, subdomain, d1_database_id, plan, status, max_users)
VALUES
  ('${TENANT_ID}', '${COMPANY}', '${SUBDOMAIN}', NULL, 'pro', 'active', 50);

INSERT INTO tenant_users
  (id, tenant_id, email, user_id, role, is_active)
VALUES
  ('${TU_ID}', '${TENANT_ID}', '${EMAIL}', '${USER_ID}', 'admin', 1);

-- Tenant schema seed (shares MASTER_DB in local dev when d1_database_id IS NULL)
INSERT INTO users
  (id, email, name, password_hash, role, department, is_active)
VALUES
  ('${USER_ID}', '${EMAIL}', '${NAME}', '${hash}', 'admin', 'Management', 1);
`;

const tmpFile = join(backendDir, '.seed-local-tmp.sql');
writeFileSync(tmpFile, sql, 'utf8');

try {
  console.log('📥 Seeding demo data …');
  execSync(
    `npx wrangler d1 execute travelcrm-master --local --file=".seed-local-tmp.sql"`,
    { stdio: 'inherit', cwd: backendDir },
  );
  console.log('\n✅ Local database seeded!\n');
  console.log('   Company : ' + COMPANY);
  console.log('   Subdomain: ' + SUBDOMAIN);
  console.log('   Email   : ' + EMAIL);
  console.log('   Password: ' + PASSWORD);
  console.log('   Role    : Admin\n');
} finally {
  try { unlinkSync(tmpFile); } catch {}
}
