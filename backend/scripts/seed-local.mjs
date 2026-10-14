/**
 * Local development seed script: demo tenant + admin user.
 *
 * Usage (from backend/):
 *   node scripts/seed-local.mjs [--multi] [--config <wrangler toml>]
 *
 * Prerequisite: databases are migrated (master schema in travelcrm-master, tenant schema in the
 * tenant database) - `npm run db:migrate` or `fix-stack up` does this; this script no longer applies SQL by hand.
 *   single mode (default): the tenant schema lives in travelcrm-master too; db_binding stays NULL.
 *   --multi:               the demo tenant gets db_binding TENANT_DB_POOL_1 and its admin user is inserted
 *                          into travelcrm-tenant-pool-1.
 *
 * Login after seeding:
 *   Email:    admin@demo.com
 *   Password: Admin@123
 */

import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');

const argv = process.argv.slice(2);
const MULTI = argv.includes('--multi');
const cfgIdx = argv.indexOf('--config');
const CONFIG = cfgIdx >= 0 ? argv[cfgIdx + 1] : null;
const cfgArg = CONFIG ? ` -c "${CONFIG}"` : '';
const POOL_BINDING = 'TENANT_DB_POOL_1';
const POOL_DB_NAME = 'travelcrm-tenant-pool-1';

// ── Fixed dev IDs (stable so re-running is idempotent) ────────────────────
const TENANT_ID  = '01960000-0000-7000-8000-000000000001';
const USER_ID    = '01960000-0000-7000-8000-000000000002';
const TU_ID      = '01960000-0000-7000-8000-000000000003';

const EMAIL    = 'admin@demo.com';
const PASSWORD = 'Admin@123';
const NAME     = 'Admin User';
const COMPANY  = 'Demo Travel Agency';
const SUBDOMAIN = 'demo';

// ── Hash password and seed data ────────────────────────────────────────────
console.log('Hashing password ...');
const hash = bcrypt.hashSync(PASSWORD, 10);

const masterSql = `
-- Clean up any old rows (delete children before parents for FK compliance)
DELETE FROM tenant_users WHERE email     = '${EMAIL}';
DELETE FROM tenants      WHERE subdomain = '${SUBDOMAIN}';

INSERT INTO tenants
  (id, company_name, subdomain, d1_database_id, db_binding, plan, status, max_users)
VALUES
  ('${TENANT_ID}', '${COMPANY}', '${SUBDOMAIN}', NULL, ${MULTI ? `'${POOL_BINDING}'` : 'NULL'}, 'pro', 'active', 50);

INSERT INTO tenant_users
  (id, tenant_id, email, user_id, role, is_active)
VALUES
  ('${TU_ID}', '${TENANT_ID}', '${EMAIL}', '${USER_ID}', 'admin', 1);
`;

const tenantSql = `
DELETE FROM users WHERE email = '${EMAIL}';
INSERT INTO users
  (id, email, name, password_hash, role, department, is_active)
VALUES
  ('${USER_ID}', '${EMAIL}', '${NAME}', '${hash}', 'admin', 'Management', 1);
`;

function execSql(dbName, sql, tmpName) {
  const tmpFile = join(backendDir, tmpName);
  writeFileSync(tmpFile, sql, 'utf8');
  try {
    execSync(`npx wrangler d1 execute ${dbName} --local${cfgArg} --file="${tmpName}"`, { stdio: 'inherit', cwd: backendDir });
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

console.log(`Seeding demo data (${MULTI ? 'multi-tenant: users in ' + POOL_DB_NAME : 'single-tenant: one database'}) ...`);
if (MULTI) {
  execSql('travelcrm-master', masterSql, '.seed-local-master-tmp.sql');
  execSql(POOL_DB_NAME, tenantSql, '.seed-local-tenant-tmp.sql');
} else {
  // Single mode: the tenant schema lives in travelcrm-master too.
  execSql('travelcrm-master', masterSql + tenantSql, '.seed-local-tmp.sql');
}
console.log('Local database seeded.');
console.log('   Company  : ' + COMPANY);
console.log('   Subdomain: ' + SUBDOMAIN);
console.log('   Email    : ' + EMAIL);
console.log('   Password : ' + PASSWORD);
console.log('   Role     : Admin');
console.log('   Mode     : ' + (MULTI ? `multi (db_binding ${POOL_BINDING})` : 'single'));
