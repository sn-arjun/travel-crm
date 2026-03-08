import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/support/tickets
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const status = request.nextUrl.searchParams.get('status') || '';
    const priority = request.nextUrl.searchParams.get('priority') || '';
    const limit = 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) { conditions.push('st.status = ?'); params.push(status); }
    if (priority) { conditions.push('st.priority = ?'); params.push(priority); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.prepare(
      `SELECT COUNT(*) as cnt FROM support_tickets st ${where}`
    ).bind(...params).first<{ cnt: number }>();
    const total = countResult?.cnt || 0;

    const result = await db.prepare(`
      SELECT st.*, t.company_name as tenant_name, sa.name as assignee_name
      FROM support_tickets st
      LEFT JOIN tenants t ON t.id = st.tenant_id
      LEFT JOIN super_admins sa ON sa.id = st.assigned_to
      ${where}
      ORDER BY
        CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        st.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    // Stats
    const stats = await db.prepare(`
      SELECT status, COUNT(*) as cnt FROM support_tickets GROUP BY status
    `).all<{ status: string; cnt: number }>();

    return NextResponse.json({
      tickets: result.results || [],
      totalPages: Math.ceil(total / limit),
      page,
      stats: Object.fromEntries((stats.results || []).map((r) => [r.status, r.cnt])),
    });
  } catch (err) {
    console.error('List tickets error:', err);
    return NextResponse.json({ tickets: [], totalPages: 1, page: 1, stats: {} });
  }
}
