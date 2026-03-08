import { NextResponse } from 'next/server';
import { hashPassword, generateUUIDv7 } from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// POST /api/auth/seed — Create initial super admin from env vars
// Only works if no super admins exist yet
export async function POST() {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const email = process.env.SUPER_ADMIN_EMAIL || 'admin@travelcrm.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123';

    // Check if any admin exists
    const existing = await db.prepare('SELECT COUNT(*) as cnt FROM super_admins').first<{ cnt: number }>();
    if (existing && existing.cnt > 0) {
      return NextResponse.json({ error: 'Super admin already exists' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const id = generateUUIDv7();

    await db.prepare(
      'INSERT INTO super_admins (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, email, 'Super Admin', passwordHash, 'super_admin').run();

    return NextResponse.json({
      success: true,
      message: `Super admin created: ${email}`,
    });
  } catch (err) {
    console.error('Seed error:', err);
    return NextResponse.json({ error: 'Failed to seed super admin' }, { status: 500 });
  }
}
