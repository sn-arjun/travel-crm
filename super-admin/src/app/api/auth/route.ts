import { NextRequest, NextResponse } from 'next/server';
import {
  signJwt,
  verifyPassword,
  hashPassword,
  createSession,
  destroySession,
  generateUUIDv7,
} from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const JWT_SECRET = process.env.JWT_SECRET || 'super-admin-dev-secret-change-in-production';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

// POST /api/auth — Login
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Check brute-force lockout
    const recentFailures = await db.prepare(`
      SELECT COUNT(*) as cnt FROM super_admin_login_log
      WHERE ip_address = ? AND success = 0
      AND created_at > datetime('now', '-${LOCKOUT_WINDOW_MINUTES} minutes')
    `).bind(ip).first<{ cnt: number }>();

    if (recentFailures && recentFailures.cnt >= MAX_LOGIN_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again in 30 minutes.' },
        { status: 429 }
      );
    }

    // Look up admin in D1
    const admin = await db.prepare(
      'SELECT id, email, name, password_hash, role, is_active FROM super_admins WHERE email = ?'
    ).bind(email).first<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      role: string;
      is_active: number;
    }>();

    if (!admin || !admin.is_active) {
      await logAttempt(db, null, ip, userAgent, false);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      await logAttempt(db, admin.id, ip, userAgent, false);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generate JWT
    const token = await signJwt(
      {
        admin_id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      JWT_SECRET
    );

    // Log successful login
    await logAttempt(db, admin.id, ip, userAgent, true);

    // Update last_login_at
    await db.prepare("UPDATE super_admins SET last_login_at = datetime('now') WHERE id = ?")
      .bind(admin.id).run();

    // Set httpOnly cookie
    await createSession(token);

    return NextResponse.json({
      success: true,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/auth — Logout
export async function DELETE() {
  await destroySession();
  return NextResponse.json({ success: true });
}

// GET /api/auth — Get current admin (me)
export async function GET() {
  try {
    const { getSessionPayload } = await import('@/lib/session');
    const payload = await getSessionPayload();
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const admin = await db.prepare(
      'SELECT id, email, name, role, last_login_at, created_at FROM super_admins WHERE id = ?'
    ).bind(payload.admin_id).first();

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    return NextResponse.json(admin);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

async function logAttempt(
  db: D1Database,
  adminId: string | null,
  ip: string,
  userAgent: string,
  success: boolean
): Promise<void> {
  await db.prepare(
    'INSERT INTO super_admin_login_log (id, admin_id, ip_address, user_agent, success) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateUUIDv7(), adminId, ip, userAgent, success ? 1 : 0).run();
}
