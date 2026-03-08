/**
 * Feature Gate Middleware — Check tenant feature flags before allowing access.
 *
 * Reads from tenant_feature_flags in MASTER_DB.
 * If a flag is explicitly disabled → 403.
 * If no flag row exists, falls back to plan-based defaults.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';

const PLAN_DEFAULTS: Record<string, string[]> = {
  trial: [
    'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
    'marketing_flyers', 'visa_management', 'supplier_management',
    'voip_calling', 'ai_assistant', 'ai_extraction',
  ],
  starter: [
    'visa_management', 'supplier_management', 'bulk_sms', 'bulk_email',
  ],
  pro: [
    'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
    'marketing_flyers', 'visa_management', 'supplier_management', 'advanced_reports',
    'voip_calling', 'ai_assistant', 'ai_extraction',
  ],
  enterprise: [
    'fleet_management', 'driver_app', 'bulk_sms', 'bulk_whatsapp', 'bulk_email',
    'marketing_flyers', 'visa_management', 'supplier_management', 'advanced_reports',
    'api_access', 'custom_domain', 'white_label', 'priority_support',
    'voip_calling', 'ai_assistant', 'ai_chatbot', 'ai_intelligence',
    'ai_extraction', 'whatsapp_campaigns',
  ],
};

export function requireFeature(featureKey: string): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json({ error: 'Tenant not identified' }, 403);

    const masterDb = c.env.MASTER_DB;

    // 1. Check for explicit override
    const override = await masterDb.prepare(
      'SELECT is_enabled FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?',
    ).bind(tenantId, featureKey).first<{ is_enabled: number }>();

    if (override) {
      if (!override.is_enabled) {
        return c.json({ error: `Feature "${featureKey}" is not enabled for your plan.` }, 403);
      }
      return next();
    }

    // 2. Fall back to plan defaults
    const tenant = await masterDb.prepare(
      'SELECT plan FROM tenants WHERE id = ?',
    ).bind(tenantId).first<{ plan: string }>();

    const plan = tenant?.plan || 'trial';
    const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.trial;

    if (!defaults.includes(featureKey)) {
      return c.json({ error: `Feature "${featureKey}" is not available on your "${plan}" plan. Please upgrade.` }, 403);
    }

    return next();
  };
}
