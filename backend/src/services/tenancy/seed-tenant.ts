import { hashPassword } from '../../utils/password';
import { generateId } from '../../utils/uuid';
import type { ProvisionTarget, TenantProvisioner } from './provisioner';

export interface SeedOptions {
  adminEmail: string;
  adminName: string;
  company: string;
  country: string;
  currency: string;
  timezone: string;
  taxSystem: string;
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS; // no look-alikes (0 O 1 l I)

function pick(chars: string): string {
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % chars.length);
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return chars[buf[0] % chars.length];
  }
}

/** 16 letters and digits from crypto.getRandomValues, with at least one lower, upper and digit. */
export function generateTemporaryPassword(length = 16): string {
  for (;;) {
    let out = '';
    for (let i = 0; i < length; i++) out += pick(ALL);
    if (/[a-z]/.test(out) && /[A-Z]/.test(out) && /\d/.test(out)) return out;
  }
}

/**
 * Seed a freshly migrated agency database: the admin user (bcrypt hash, must change the password)
 * and the default settings. Automation recipes are static definitions the app enables on first use
 * (services/automation/recipes.ts), so there is nothing to insert for them.
 * Returns the temporary password; the caller delivers it once and never stores it.
 */
export async function seedTenant(
  provisioner: TenantProvisioner,
  target: ProvisionTarget,
  opts: SeedOptions,
): Promise<{ userId: string; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = generateId();
  const now = new Date().toISOString();

  const settingRows: [string, string][] = [
    ['company_name', opts.company],
    ['company_email', opts.adminEmail],
    ['country', opts.country],
    ['currency', opts.currency],
    ['timezone', opts.timezone],
    ['tax_system', opts.taxSystem],
    ['onboarding_completed', 'false'],
  ];

  await provisioner.execute(target, [
    {
      sql: `INSERT INTO users (id, email, name, password_hash, role, is_active, must_change_password, invite_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'admin', 1, 1, 'active', ?, ?)`,
      params: [userId, opts.adminEmail.toLowerCase(), opts.adminName, passwordHash, now, now],
    },
    ...settingRows.map(([key, value]) => ({
      sql: `INSERT OR REPLACE INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)`,
      params: [key, value, userId, now],
    })),
  ]);

  return { userId, temporaryPassword };
}
