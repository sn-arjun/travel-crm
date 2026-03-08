import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const result = await db.prepare(`
      SELECT
        strftime('%Y-%m', start_date) as month,
        COALESCE(SUM(amount), 0) as amount
      FROM subscriptions
      WHERE status = 'active'
      AND start_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', start_date)
      ORDER BY month ASC
    `).all<{ month: string; amount: number }>();

    // Fill in missing months with 0
    const months: { month: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const found = result.results.find((r) => r.month === key);
      months.push({ month: label, amount: found?.amount || 0 });
    }

    return NextResponse.json({ months });
  } catch (err) {
    console.error('Dashboard revenue error:', err);
    return NextResponse.json({ months: [] });
  }
}
