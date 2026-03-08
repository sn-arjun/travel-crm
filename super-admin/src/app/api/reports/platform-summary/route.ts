import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET(_request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    // Aggregate from usage snapshots (latest per tenant)
    const summary = await db.prepare(`
      SELECT
        COALESCE(SUM(us.leads_count), 0) as total_leads,
        COALESCE(SUM(us.contacts_count), 0) as total_contacts,
        COALESCE(SUM(us.users_count), 0) as total_users,
        COALESCE(SUM(us.invoices_count), 0) as total_invoices,
        COALESCE(ROUND(AVG(us.leads_count), 1), 0) as avg_leads_per_tenant,
        COUNT(DISTINCT us.tenant_id) as tenant_count
      FROM (
        SELECT tenant_id, leads_count, contacts_count, users_count, invoices_count,
          ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY snapshot_date DESC) as rn
        FROM tenant_usage_snapshots
      ) us WHERE us.rn = 1
    `).first<Record<string, number>>();

    const revenue = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM subscription_payments WHERE status = 'success'
    `).first<{ total: number }>();

    // Tenant counts by status
    const statusCounts = await db.prepare(`
      SELECT status, COUNT(*) as cnt FROM tenants GROUP BY status
    `).all<{ status: string; cnt: number }>();

    // Tenant counts by plan
    const planCounts = await db.prepare(`
      SELECT plan, COUNT(*) as cnt FROM tenants GROUP BY plan
    `).all<{ plan: string; cnt: number }>();

    return NextResponse.json({
      ...(summary || {}),
      total_revenue: revenue?.total || 0,
      by_status: Object.fromEntries((statusCounts.results || []).map((r) => [r.status, r.cnt])),
      by_plan: Object.fromEntries((planCounts.results || []).map((r) => [r.plan, r.cnt])),
    });
  } catch (err) {
    console.error('Platform summary error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
