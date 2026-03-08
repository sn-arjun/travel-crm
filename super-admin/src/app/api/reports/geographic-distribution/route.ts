import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET(_request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const result = await db.prepare(`
      SELECT
        COALESCE(json_extract(settings, '$.country'), 'Unknown') as country,
        COUNT(*) as tenant_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM tenants
      WHERE status != 'deleted'
      GROUP BY country
      ORDER BY tenant_count DESC
    `).all<{ country: string; tenant_count: number; active_count: number }>();

    return NextResponse.json({
      distribution: result.results || [],
      total: (result.results || []).reduce((s, r) => s + r.tenant_count, 0),
    });
  } catch (err) {
    console.error('Geographic distribution error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
