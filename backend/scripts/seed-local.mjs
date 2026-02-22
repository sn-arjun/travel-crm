/**
 * Local development seed script.
 * Creates a demo tenant + admin user in the local D1 database.
 *
 * Usage (from backend/ directory):
 *   node scripts/seed-local.mjs
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

// ── Fixed dev IDs (stable so re-running is idempotent) ────────────────────
// Must be valid RFC 4122 UUID format (8-4-4-4-12 with hyphens) so that
// z.string().uuid() validation passes on the backend.
const TENANT_ID  = '01960000-0000-7000-8000-000000000001';
const USER_ID    = '01960000-0000-7000-8000-000000000002';
const TU_ID      = '01960000-0000-7000-8000-000000000003'; // tenant_users row

const EMAIL    = 'admin@demo.com';
const PASSWORD = 'Admin@123';
const NAME     = 'Admin User';
const COMPANY  = 'Demo Travel Agency';
const SUBDOMAIN = 'demo';

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
  console.log('📥 Applying seed to local D1 (travelcrm-master) …');
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
  unlinkSync(tmpFile);
}
