import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

// GET /api/announcements
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    const countResult = await db.prepare('SELECT COUNT(*) as cnt FROM announcements').first<{ cnt: number }>();
    const total = countResult?.cnt || 0;

    const result = await db.prepare(`
      SELECT a.*, sa.name as admin_name
      FROM announcements a
      LEFT JOIN super_admins sa ON sa.id = a.created_by
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return NextResponse.json({
      announcements: result.results || [],
      totalPages: Math.ceil(total / limit),
      page,
    });
  } catch (err) {
    console.error('List announcements error:', err);
    return NextResponse.json({ announcements: [], totalPages: 1, page: 1 });
  }
}

// POST /api/announcements
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      title: string;
      body: string;
      target: string;
      targetTenantIds?: string[];
      priority: string;
      expiresAt?: string;
    };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const adminId = request.headers.get('x-admin-id') || 'system';
    const id = generateUUIDv7();

    await db.prepare(`
      INSERT INTO announcements (id, title, body, target, target_tenant_ids, priority, expires_at, created_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).bind(
      id,
      body.title,
      body.body,
      body.target || 'all',
      body.targetTenantIds ? JSON.stringify(body.targetTenantIds) : null,
      body.priority || 'info',
      body.expiresAt || null,
      adminId
    ).run();

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('Create announcement error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
