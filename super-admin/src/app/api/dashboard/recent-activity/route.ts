import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    // Query from super_admin_login_log as activity source for now
    // Will be replaced with a proper audit_log table in TICKET-352
    const result = await db.prepare(`
      SELECT
        l.id,
        l.admin_id,
        COALESCE(a.name, 'System') as admin_name,
        CASE WHEN l.success = 1 THEN 'login' ELSE 'failed_login' END as action,
        l.ip_address,
        l.created_at
      FROM super_admin_login_log l
      LEFT JOIN super_admins a ON l.admin_id = a.id
      ORDER BY l.created_at DESC
      LIMIT 20
    `).all<{
      id: string;
      admin_id: string;
      admin_name: string;
      action: string;
      ip_address: string;
      created_at: string;
    }>();

    // Also get recent tenant activity
    const tenantActivity = await db.prepare(`
      SELECT
        id,
        'tenant_created' as action,
        company_name as description,
        created_at
      FROM tenants
      ORDER BY created_at DESC
      LIMIT 10
    `).all<{
      id: string;
      action: string;
      description: string;
      created_at: string;
    }>();

    // Merge and sort by created_at
    const activities = [
      ...(result.results || []).map((l) => ({
        id: l.id,
        action: l.action,
        description: l.action === 'login'
          ? `${l.admin_name} logged in`
          : `Failed login attempt from ${l.ip_address}`,
        timestamp: l.created_at,
        actor: l.admin_name,
      })),
      ...(tenantActivity.results || []).map((t) => ({
        id: t.id,
        action: t.action,
        description: `Tenant "${t.description}" created`,
        timestamp: t.created_at,
        actor: 'System',
      })),
    ].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 20);

    return NextResponse.json({ activities });
  } catch (err) {
    console.error('Recent activity error:', err);
    return NextResponse.json({ activities: [] });
  }
}
