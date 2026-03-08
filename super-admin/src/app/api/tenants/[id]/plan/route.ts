import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

const PLAN_CONFIGS: Record<string, { maxUsers: number; label: string }> = {
  trial: { maxUsers: 5, label: 'Trial' },
  starter: { maxUsers: 5, label: 'Starter' },
  pro: { maxUsers: 20, label: 'Professional' },
  enterprise: { maxUsers: 999, label: 'Enterprise' },
};

// PUT /api/tenants/:id/plan — Change tenant plan (upgrade/downgrade)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      plan: string;
      resetFeatures?: boolean;
    };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const newPlan = body.plan;
    const config = PLAN_CONFIGS[newPlan];
    if (!config) {
      return NextResponse.json(
        { error: `Invalid plan: ${newPlan}. Valid: ${Object.keys(PLAN_CONFIGS).join(', ')}` },
        { status: 400 },
      );
    }

    // Get current tenant
    const tenant = await db.prepare('SELECT plan, status FROM tenants WHERE id = ?')
      .bind(id).first<{ plan: string; status: string }>();
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const oldPlan = tenant.plan;

    // Update tenant plan and max_users
    await db.prepare(
      `UPDATE tenants SET plan = ?, max_users = ?, status = 'active',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`
    ).bind(newPlan, config.maxUsers, id).run();

    // Optionally reset feature flags to new plan defaults
    if (body.resetFeatures !== false) {
      await db.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ?').bind(id).run();
    }

    // Update or create subscription record
    const sub = await db.prepare(
      'SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(id).first<{ id: string }>();

    if (sub) {
      await db.prepare(
        `UPDATE subscriptions SET plan = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?`
      ).bind(newPlan, sub.id).run();
    }

    // Audit log
    const adminId = request.headers.get('x-admin-id') || 'system';
    await db.prepare(
      `INSERT INTO super_admin_audit_log (id, admin_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'plan_change', 'tenant', ?, ?)`
    ).bind(
      generateUUIDv7(),
      adminId,
      id,
      JSON.stringify({ oldPlan, newPlan, maxUsers: config.maxUsers }),
    ).run();

    return NextResponse.json({
      success: true,
      message: `Plan changed from ${oldPlan} to ${newPlan}`,
      plan: newPlan,
      maxUsers: config.maxUsers,
    });
  } catch (err) {
    console.error('Plan change error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
