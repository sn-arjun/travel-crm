/**
 * Feature Gate Middleware — decide whether a tenant may use a feature.
 *
 * Resolution (R127, services/features/resolve.ts), the same everywhere:
 *   1. the platform switch is off  -> 403 FEATURE_DISABLED, no upgrade offer
 *   2. else the agency override (tenant_feature_flags) -> on or off as set
 *   3. else the plan's features in the plan catalogue (plan_features, R109)
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

import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import type { MasterRef } from '../services/plans/catalogue';
import { resolveFeature, resolveTenantFeatures, type FeatureSource } from '../services/features/resolve';

export const FEATURE_DISABLED_CODE = 'FEATURE_DISABLED';

/** The 403 for a feature that resolved to off. A platform switch has its own code and no upgrade offer; the rest keep the upgrade answer. */
function refusal(c: Context<AppContext>, featureKey: string, source: FeatureSource, plan: string) {
  if (source === 'platform') {
    return c.json({ error: `Feature "${featureKey}" is currently switched off.`, code: FEATURE_DISABLED_CODE, featureKey, upgrade: false }, 403);
  }
  if (source === 'override') {
    return c.json({
      error: `Feature "${featureKey}" is not enabled for your plan.`,
      featureKey,
      upgrade: true,
    }, 403);
  }
  return c.json({
    error: `Feature "${featureKey}" is not available on your "${plan}" plan. Please upgrade.`,
    featureKey,
    currentPlan: plan,
    upgrade: true,
  }, 403);
}

export function requireFeature(featureKey: string): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json({ error: 'Tenant not identified' }, 403);
    const r = await resolveFeature(c.env, tenantId, featureKey);
    if (!r.enabled) return refusal(c, featureKey, r.source, r.plan);
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
    for (const featureKey of featureKeys) {
      const r = await resolveFeature(c.env, tenantId, featureKey);
      if (!r.enabled) return refusal(c, featureKey, r.source, r.plan);
    }
    return next();
  };
}

/**
 * Get all enabled features for a tenant (used by frontend to show/hide UI).
 * `sources` says where each listed feature's value comes from; `platformOff` lists the keys switched off platform-wide.
 */
export async function getTenantFeatures(
  ref: MasterRef,
  tenantId: string,
): Promise<{ plan: string; features: string[]; overrides: Record<string, boolean>; sources: Record<string, FeatureSource>; platformOff: string[] }> {
  const r = await resolveTenantFeatures(ref, tenantId);
  return {
    plan: r.plan,
    features: r.features.filter((f) => f.enabled).map((f) => f.key),
    overrides: r.overrides,
    sources: Object.fromEntries(r.features.map((f) => [f.key, f.source])),
    platformOff: r.features.filter((f) => f.source === 'platform').map((f) => f.key),
  };
}
