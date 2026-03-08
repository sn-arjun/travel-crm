import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const result = await db.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count
      FROM tenants
      WHERE created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `).all<{ month: string; count: number }>();

    // Fill in missing months with 0
    const months: { month: string; count: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const found = result.results.find((r) => r.month === key);
      months.push({ month: label, count: found?.count || 0 });
    }

    return NextResponse.json({ months });
  } catch (err) {
    console.error('Dashboard growth error:', err);
    return NextResponse.json({ months: [] });
  }
}
