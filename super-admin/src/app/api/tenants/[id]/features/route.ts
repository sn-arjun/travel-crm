import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

const ALL_FEATURES = [
  // Operations
  'fleet_management', 'driver_app', 'visa_management', 'supplier_management',
  // Communication
  'bulk_sms', 'bulk_whatsapp', 'bulk_email',
  // Marketing & Reports
  'marketing_flyers', 'advanced_reports',
  // Advanced
  'api_access', 'custom_domain', 'white_label', 'priority_support',
  // AI & VoIP
  'voip_calling', 'ai_assistant', 'ai_chatbot', 'ai_intelligence',
  'ai_extraction', 'whatsapp_campaigns',
] as const;

const PLAN_DEFAULTS: Record<string, string[]> = {
  free: ['visa_management', 'supplier_management'],
  trial: [
    'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
    'marketing_flyers', 'visa_management', 'supplier_management',
    'voip_calling', 'ai_assistant', 'ai_extraction',
  ],
  starter: ['visa_management', 'supplier_management', 'bulk_sms', 'bulk_email'],
  pro: [
    'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
    'marketing_flyers', 'visa_management', 'supplier_management', 'advanced_reports',
    'voip_calling', 'ai_assistant', 'ai_extraction',
  ],
  enterprise: [...ALL_FEATURES],
};

// GET /api/tenants/:id/features
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const result = await db.prepare(
      'SELECT feature_key, is_enabled FROM tenant_feature_flags WHERE tenant_id = ?'
    ).bind(id).all<{ feature_key: string; is_enabled: number }>();

    // Get tenant plan for defaults
    const tenant = await db.prepare('SELECT plan FROM tenants WHERE id = ?')
      .bind(id).first<{ plan: string }>();

    const plan = tenant?.plan || 'free';
    const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free;
    const overrides = Object.fromEntries(
      (result.results || []).map((r) => [r.feature_key, r.is_enabled === 1])
    );

    // Merge: use override if exists, otherwise use plan default
    const features = ALL_FEATURES.map((key) => ({
      key,
      enabled: key in overrides ? overrides[key] : defaults.includes(key),
      isOverride: key in overrides,
    }));

    return NextResponse.json({ features, plan });
  } catch (err) {
    console.error('Get features error:', err);
    return NextResponse.json({ features: [], plan: 'free' });
  }
}

// PUT /api/tenants/:id/features — Bulk update
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { features: Record<string, boolean> };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const adminId = request.headers.get('x-admin-id') || 'system';

    const stmts = Object.entries(body.features).map(([key, enabled]) =>
      db.prepare(`
        INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
          is_enabled = excluded.is_enabled, updated_by = excluded.updated_by
      `).bind(generateUUIDv7(), id, key, enabled ? 1 : 0, adminId)
    );

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update features error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tenants/:id/features — Reset to plan defaults
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    await db.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ?').bind(id).run();

    return NextResponse.json({ success: true, message: 'Reset to plan defaults' });
  } catch (err) {
    console.error('Reset features error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
