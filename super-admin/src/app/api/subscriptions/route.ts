import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/subscriptions — List subscriptions with tenant info
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const url = new URL(request.url);

    const status = url.searchParams.get('status') || '';
    const plan = url.searchParams.get('plan') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let where = '1=1';
    const bindings: (string | number)[] = [];

    if (status) { where += ' AND s.status = ?'; bindings.push(status); }
    if (plan) { where += ' AND s.plan = ?'; bindings.push(plan); }

    const result = await db.prepare(`
      SELECT s.id, s.tenant_id, s.plan, s.amount, s.currency, s.billing_cycle,
             s.status, s.start_date, s.next_billing_date, s.trial_ends_at,
             s.payment_gateway, s.created_at,
             t.company_name as tenant_name, t.subdomain as tenant_slug
      FROM subscriptions s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE ${where}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const countResult = await db.prepare(
      `SELECT COUNT(*) as cnt FROM subscriptions s WHERE ${where}`
    ).bind(...bindings).first<{ cnt: number }>();

    const total = countResult?.cnt || 0;

    // Revenue summary
    const revenue = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) as mrr,
        COALESCE(SUM(CASE WHEN status = 'active' THEN amount * 12 ELSE 0 END), 0) as arr,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END) / NULLIF(COUNT(CASE WHEN status = 'active' THEN 1 END), 0), 2) ELSE 0 END as arpt
      FROM subscriptions
    `).first<{ mrr: number; arr: number; active_count: number; arpt: number }>();

    return NextResponse.json({
      subscriptions: result.results || [],
      total,
      page,
      totalPages: Math.ceil(total / limit),
      revenue: revenue || { mrr: 0, arr: 0, active_count: 0, arpt: 0 },
    });
  } catch (err) {
    console.error('List subscriptions error:', err);
    return NextResponse.json({
      subscriptions: [], total: 0, page: 1, totalPages: 0,
      revenue: { mrr: 0, arr: 0, active_count: 0, arpt: 0 },
    });
  }
}
