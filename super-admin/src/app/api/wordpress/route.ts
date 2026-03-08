import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/wordpress — List all WordPress sites
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    const countResult = await db.prepare('SELECT COUNT(*) as cnt FROM wordpress_sites').first<{ cnt: number }>();
    const total = countResult?.cnt || 0;

    const result = await db.prepare(`
      SELECT wp.*, t.company_name as tenant_name, t.subdomain as tenant_slug
      FROM wordpress_sites wp
      LEFT JOIN tenants t ON t.id = wp.tenant_id
      ORDER BY wp.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return NextResponse.json({
      sites: result.results || [],
      totalPages: Math.ceil(total / limit),
      page,
      total,
    });
  } catch (err) {
    console.error('List WP sites error:', err);
    return NextResponse.json({ sites: [], totalPages: 1, page: 1, total: 0 });
  }
}
