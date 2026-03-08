import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/audit-log
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const action = request.nextUrl.searchParams.get('action') || '';
    const entityType = request.nextUrl.searchParams.get('entity_type') || '';
    const limit = 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (action) { conditions.push('al.action = ?'); params.push(action); }
    if (entityType) { conditions.push('al.entity_type = ?'); params.push(entityType); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.prepare(
      `SELECT COUNT(*) as cnt FROM super_admin_audit_log al ${where}`
    ).bind(...params).first<{ cnt: number }>();
    const total = countResult?.cnt || 0;

    const result = await db.prepare(`
      SELECT al.*, sa.name as admin_name, sa.email as admin_email
      FROM super_admin_audit_log al
      LEFT JOIN super_admins sa ON sa.id = al.admin_id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return NextResponse.json({
      entries: result.results || [],
      totalPages: Math.ceil(total / limit),
      page,
    });
  } catch (err) {
    console.error('Audit log error:', err);
    return NextResponse.json({ entries: [], totalPages: 1, page: 1 });
  }
}
