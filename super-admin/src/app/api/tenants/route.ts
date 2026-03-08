import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/tenants — List tenants with pagination, search, status filter
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const url = new URL(request.url);

    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let where = '1=1';
    const bindings: (string | number)[] = [];

    if (search) {
      where += ' AND (t.company_name LIKE ? OR t.subdomain LIKE ?)';
      bindings.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND t.status = ?';
      bindings.push(status);
    }

    const tenantsResult = await db.prepare(`
      SELECT t.id, t.company_name, t.subdomain, t.plan, t.status, t.max_users,
             t.settings, t.created_at,
             s.amount as monthly_amount, s.status as sub_status,
             (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id AND tu.is_active = 1) as user_count
      FROM tenants t
      LEFT JOIN subscriptions s ON t.id = s.tenant_id AND s.status IN ('active', 'trial')
      WHERE ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    const countResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM tenants t WHERE ${where}
    `).bind(...bindings).first<{ cnt: number }>();

    const total = countResult?.cnt || 0;

    // Parse settings to extract owner info
    const tenants = (tenantsResult.results || []).map((t: Record<string, unknown>) => {
      let ownerEmail = '';
      let ownerName = '';
      try {
        const settings = JSON.parse((t.settings as string) || '{}');
        ownerEmail = settings.ownerEmail || '';
        ownerName = settings.ownerName || '';
      } catch { /* ignore */ }
      return {
        id: t.id,
        company_name: t.company_name,
        subdomain: t.subdomain,
        plan: t.plan,
        status: t.status,
        owner_email: ownerEmail,
        owner_name: ownerName,
        user_count: t.user_count,
        monthly_amount: t.monthly_amount,
        created_at: t.created_at,
      };
    });

    return NextResponse.json({
      tenants,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('List tenants error:', err);
    return NextResponse.json({ tenants: [], total: 0, page: 1, totalPages: 0 });
  }
}

// POST /api/tenants — Create tenant (stub, use /api/tenants/provision instead)
export async function POST() {
  return NextResponse.json(
    { error: 'Use POST /api/tenants/provision for tenant creation' },
    { status: 400 }
  );
}
