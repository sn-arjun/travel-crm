import { signSuperAdminToken } from '../../src/services/admin/session';

/**
 * Test helper (R111): register a super admin in MASTER_DB.super_admins and return a real super admin token for it
 * (the same token POST /admin/auth/login issues). The password hash is a placeholder unless one is given.
 */
export async function superAdminToken(
  env: any,
  admin: { id: string; email: string; name?: string; role?: string; passwordHash?: string },
): Promise<string> {
  const name = admin.name ?? 'Test Super Admin';
  const role = admin.role ?? 'super_admin';
  await env.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)`)
    .bind(admin.id, admin.email, name, admin.passwordHash ?? 'unused', role)
    .run();
  const issued = await signSuperAdminToken(env, { id: admin.id, email: admin.email, name, role });
  if (!issued) throw new Error('super admin secret unavailable in this test environment');
  return issued.token;
}
