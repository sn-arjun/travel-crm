/**
 * Feature Gate Middleware — Check tenant feature flags before allowing access.
 *
 * Reads from tenant_feature_flags in MASTER_DB.
 * If a flag is explicitly disabled -> 403.
 * If no flag row exists, falls back to the plan's features in the plan catalogue (plan_features, R109).
 *
 * 22 AI Feature Keys (from PRD v2):
 *   Pro:        ai_copilot, ai_call_summary, ai_lead_scoring, ai_message_compose,
 *               ai_itinerary_generate, ai_cost_estimation, ai_ocr, ai_search
 *   Enterprise: ai_dialer_cards, ai_vehicle_recommend, ai_driver_recommend,
 *               ai_expense_analysis, ai_margin_insights, ai_payment_prediction,
 *               ai_visa_intelligence, ai_campaign_content, ai_campaign_optimize,
 *               ai_follow_up_suggest, ai_churn_prediction, ai_daily_briefing,
 *               ai_supplier_negotiate, ai_coaching
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { asCatalogueEnv, getCatalogue, planFeaturesFrom, type MasterRef } from '../services/plans/catalogue';

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
        return c.json({
          error: `Feature "${featureKey}" is not enabled for your plan.`,
          featureKey,
          upgrade: true,
        }, 403);
      }
      return next();
    }

    // 2. Fall back to plan defaults
    const tenant = await masterDb.prepare(
      'SELECT plan FROM tenants WHERE id = ?',
    ).bind(tenantId).first<{ plan: string }>();

    const plan = tenant?.plan || 'trial';
    const defaults = planFeaturesFrom(await getCatalogue(c.env), plan);

    if (!defaults.includes(featureKey)) {
      return c.json({
        error: `Feature "${featureKey}" is not available on your "${plan}" plan. Please upgrade.`,
        featureKey,
        currentPlan: plan,
        upgrade: true,
      }, 403);
    }

    return next();
  };
}

/**
 * Check multiple features at once — returns the first missing feature or passes.
 */
export function requireFeatures(...featureKeys: string[]): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json({ error: 'Tenant not identified' }, 403);

    const masterDb = c.env.MASTER_DB;
    const tenant = await masterDb.prepare(
      'SELECT plan FROM tenants WHERE id = ?',
    ).bind(tenantId).first<{ plan: string }>();

    const plan = tenant?.plan || 'trial';
    const defaults = planFeaturesFrom(await getCatalogue(c.env), plan);

    for (const featureKey of featureKeys) {
      // Check explicit override
      const override = await masterDb.prepare(
        'SELECT is_enabled FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?',
      ).bind(tenantId, featureKey).first<{ is_enabled: number }>();

      if (override) {
        if (!override.is_enabled) {
          return c.json({
            error: `Feature "${featureKey}" is not enabled for your plan.`,
            featureKey,
            upgrade: true,
          }, 403);
        }
        continue;
      }

      if (!defaults.includes(featureKey)) {
        return c.json({
          error: `Feature "${featureKey}" is not available on your "${plan}" plan. Please upgrade.`,
          featureKey,
          currentPlan: plan,
          upgrade: true,
        }, 403);
      }
    }

    return next();
  };
}

/**
 * Get all enabled features for a tenant (used by frontend to show/hide UI).
 */
export async function getTenantFeatures(
  ref: MasterRef,
  tenantId: string,
): Promise<{ plan: string; features: string[]; overrides: Record<string, boolean> }> {
  const masterDb = asCatalogueEnv(ref).MASTER_DB;
  const tenant = await masterDb.prepare(
    'SELECT plan FROM tenants WHERE id = ?',
  ).bind(tenantId).first<{ plan: string }>();

  const plan = tenant?.plan || 'trial';
  const defaults = planFeaturesFrom(await getCatalogue(ref), plan);

  // Get all explicit overrides
  const overrideRows = await masterDb.prepare(
    'SELECT feature_key, is_enabled FROM tenant_feature_flags WHERE tenant_id = ?',
  ).bind(tenantId).all();

  const overrides: Record<string, boolean> = {};
  const features = new Set(defaults);

  for (const row of (overrideRows.results || []) as any[]) {
    overrides[row.feature_key] = !!row.is_enabled;
    if (row.is_enabled) {
      features.add(row.feature_key);
    } else {
      features.delete(row.feature_key);
    }
  }

  return {
    plan,
    features: Array.from(features),
    overrides,
  };
}
