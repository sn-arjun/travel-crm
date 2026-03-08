import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const result = await db.prepare(`
      SELECT
        t.id,
        t.company_name,
        t.plan,
        t.status,
        COUNT(tu.id) as user_count
      FROM tenants t
      LEFT JOIN tenant_users tu ON t.id = tu.tenant_id AND tu.is_active = 1
      GROUP BY t.id
      ORDER BY user_count DESC
      LIMIT 10
    `).all<{
      id: string;
      company_name: string;
      plan: string;
      status: string;
      user_count: number;
    }>();

    return NextResponse.json({ tenants: result.results || [] });
  } catch (err) {
    console.error('Top tenants error:', err);
    return NextResponse.json({ tenants: [] });
  }
}
