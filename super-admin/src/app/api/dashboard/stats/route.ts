import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const [tenantStats, revenueStats, planDist, lastMonthTenants, churnStats] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) as trial,
          SUM(CASE WHEN status IN ('expired', 'suspended') THEN 1 ELSE 0 END) as expired
        FROM tenants
      `).first<{ total: number; active: number; trial: number; expired: number }>(),

      db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) as mrr,
          COALESCE(SUM(amount), 0) as total_revenue
        FROM subscriptions
      `).first<{ mrr: number; total_revenue: number }>(),

      db.prepare(`
        SELECT plan, COUNT(*) as count
        FROM tenants
        GROUP BY plan
      `).all<{ plan: string; count: number }>(),

      db.prepare(`
        SELECT COUNT(*) as count FROM tenants
        WHERE created_at < date('now', 'start of month')
      `).first<{ count: number }>(),

      db.prepare(`
        SELECT COUNT(*) as count FROM tenants
        WHERE status = 'cancelled'
        AND updated_at >= date('now', '-30 days')
      `).first<{ count: number }>(),
    ]);

    const currentTotal = tenantStats?.total || 0;
    const lastMonthTotal = lastMonthTenants?.count || 0;
    const growthRate = lastMonthTotal > 0
      ? Math.round(((currentTotal - lastMonthTotal) / lastMonthTotal) * 100)
      : 0;

    const churnRate = currentTotal > 0
      ? Math.round(((churnStats?.count || 0) / currentTotal) * 100)
      : 0;

    return NextResponse.json({
      tenantStats: tenantStats || { total: 0, active: 0, trial: 0, expired: 0 },
      revenueStats: revenueStats || { mrr: 0, total_revenue: 0 },
      planDistribution: planDist?.results || [],
      growthRate,
      churnRate,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return NextResponse.json({
      tenantStats: { total: 0, active: 0, trial: 0, expired: 0 },
      revenueStats: { mrr: 0, total_revenue: 0 },
      planDistribution: [],
      growthRate: 0,
      churnRate: 0,
    });
  }
}
