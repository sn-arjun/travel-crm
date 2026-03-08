import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { PLAN_LIMITS, type Plan } from '@/lib/constants';

// GET /api/subscriptions/:id — Subscription detail with payment history
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const sub = await db.prepare(`
      SELECT s.*, t.company_name as tenant_name, t.subdomain as tenant_slug
      FROM subscriptions s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE s.id = ?
    `).bind(id).first();

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const payments = await db.prepare(`
      SELECT * FROM subscription_payments
      WHERE subscription_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(id).all();

    return NextResponse.json({
      subscription: sub,
      payments: payments.results || [],
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/subscriptions/:id — Change plan
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { plan: string };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const newPlan = body.plan as Plan;
    const planInfo = PLAN_LIMITS[newPlan];
    if (!planInfo) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const sub = await db.prepare('SELECT id, tenant_id FROM subscriptions WHERE id = ?')
      .bind(id).first<{ id: string; tenant_id: string }>();

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    await db.batch([
      db.prepare(
        "UPDATE subscriptions SET plan = ?, amount = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(newPlan, planInfo.price, id),
      db.prepare(
        "UPDATE tenants SET plan = ?, max_users = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(newPlan, planInfo.maxUsers, sub.tenant_id),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Change plan error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
