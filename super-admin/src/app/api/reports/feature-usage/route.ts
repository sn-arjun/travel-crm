import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const ALL_FEATURES = [
  'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
  'marketing_flyers', 'visa_management', 'supplier_management', 'advanced_reports',
  'api_access', 'custom_domain', 'white_label', 'priority_support',
];

const PLAN_DEFAULTS: Record<string, string[]> = {
  free: ['visa_management', 'supplier_management'],
  trial: ['visa_management', 'supplier_management'],
  starter: ['visa_management', 'supplier_management'],
  pro: [
    'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
    'marketing_flyers', 'visa_management', 'supplier_management', 'advanced_reports',
  ],
  enterprise: [...ALL_FEATURES],
};

export async function GET(_request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    // Get all tenants with their plans
    const tenants = await db.prepare(
      'SELECT id, plan FROM tenants WHERE status != ?'
    ).bind('deleted').all<{ id: string; plan: string }>();

    const totalTenants = tenants.results?.length || 0;

    // Get explicit overrides
    const overrides = await db.prepare(
      'SELECT tenant_id, feature_key, is_enabled FROM tenant_feature_flags'
    ).all<{ tenant_id: string; feature_key: string; is_enabled: number }>();

    const overrideMap: Record<string, Record<string, boolean>> = {};
    for (const o of overrides.results || []) {
      if (!overrideMap[o.tenant_id]) overrideMap[o.tenant_id] = {};
      overrideMap[o.tenant_id][o.feature_key] = o.is_enabled === 1;
    }

    // Calculate how many tenants have each feature enabled
    const featureCounts: Record<string, number> = {};
    for (const f of ALL_FEATURES) featureCounts[f] = 0;

    for (const t of tenants.results || []) {
      const planDefaults = PLAN_DEFAULTS[t.plan] || PLAN_DEFAULTS.free;
      const tOverrides = overrideMap[t.id] || {};

      for (const f of ALL_FEATURES) {
        const enabled = f in tOverrides ? tOverrides[f] : planDefaults.includes(f);
        if (enabled) featureCounts[f]++;
      }
    }

    const features = ALL_FEATURES.map((f) => ({
      feature: f,
      enabled_count: featureCounts[f],
      total_tenants: totalTenants,
      adoption_pct: totalTenants > 0 ? Math.round((featureCounts[f] / totalTenants) * 100) : 0,
    })).sort((a, b) => b.adoption_pct - a.adoption_pct);

    return NextResponse.json({ features, total_tenants: totalTenants });
  } catch (err) {
    console.error('Feature usage error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
