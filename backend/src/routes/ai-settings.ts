/**
 * AI Settings Routes — Feature flag management, usage caps, and provider status.
 *
 * GET  /ai/settings           — Get AI settings (features, usage, provider status)
 * PUT  /ai/settings/features  — Toggle AI feature flags (admin only)
 * GET  /ai/settings/usage     — Get usage quotas and remaining counts
 * GET  /ai/settings/provider  — Get active AI provider info
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, error, forbidden } from '../utils/response';
import { getTenantFeatures, PLAN_DEFAULTS } from '../middleware/feature-gate';
import { AIRouter } from '../services/ai-router';

const aiSettingsRoutes = new Hono<AppContext>();

// All 22 AI feature keys
const AI_FEATURE_KEYS = [
  // Pro tier (8)
  'ai_copilot', 'ai_call_summary', 'ai_lead_scoring', 'ai_message_compose',
  'ai_itinerary_generate', 'ai_cost_estimation', 'ai_ocr', 'ai_search',
  // Enterprise tier (14)
  'ai_dialer_cards', 'ai_vehicle_recommend', 'ai_driver_recommend',
  'ai_expense_analysis', 'ai_margin_insights', 'ai_payment_prediction',
  'ai_visa_intelligence', 'ai_campaign_content', 'ai_campaign_optimize',
  'ai_follow_up_suggest', 'ai_churn_prediction', 'ai_daily_briefing',
  'ai_supplier_negotiate', 'ai_coaching',
] as const;

// Usage cap keys for AI features
const AI_USAGE_CAP_KEYS = [
  'ai_actions_per_day',
  'ai_tokens_per_month',
  'whatsapp_messages_per_month',
  'email_sends_per_month',
  'sms_per_month',
  'voip_minutes_per_month',
] as const;

// ── GET /ai/settings ─────────────────────────────────────

aiSettingsRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const masterDb = c.env.MASTER_DB;
  const db = c.get('tenantDb');
  const env = c.env;

  // Get tenant features
  const tenantFeatures = await getTenantFeatures(masterDb, tenantId);

  // Get usage caps
  const caps = await masterDb.prepare(
    'SELECT cap_key, cap_value, current_usage, reset_period, last_reset_at FROM tenant_usage_caps WHERE tenant_id = ?',
  ).bind(tenantId).all();

  const usageCaps: Record<string, any> = {};
  for (const row of (caps.results || []) as any[]) {
    usageCaps[row.cap_key] = {
      limit: row.cap_value,
      used: row.current_usage,
      remaining: Math.max(0, row.cap_value - row.current_usage),
      resetPeriod: row.reset_period,
      lastResetAt: row.last_reset_at,
      percentUsed: row.cap_value > 0 ? Math.round((row.current_usage / row.cap_value) * 100) : 0,
    };
  }

  // Get AI usage summary for current period
  const usageSummary = await db.prepare(`
    SELECT
      COUNT(*) as total_requests,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost_estimate), 0) as total_cost,
      COALESCE(AVG(duration_ms), 0) as avg_duration_ms
    FROM ai_usage_log
    WHERE created_at >= date('now', '-30 days')
  `).first<Record<string, number>>();

  // Get provider status
  const router = new AIRouter(env);
  const providerStatus = router.getProviderStatus();

  // Build AI feature map with enabled/disabled + tier info
  const aiFeatures = AI_FEATURE_KEYS.map((key) => {
    const isEnabled = tenantFeatures.features.includes(key);
    const isOverridden = key in tenantFeatures.overrides;
    const proFeatures = PLAN_DEFAULTS.pro || [];
    const tier = proFeatures.includes(key) ? 'pro' : 'enterprise';

    return {
      key,
      enabled: isEnabled,
      tier,
      overridden: isOverridden,
    };
  });

  return success(c, {
    plan: tenantFeatures.plan,
    aiFeatures,
    usageCaps,
    usageSummary: {
      totalRequests: usageSummary?.total_requests ?? 0,
      totalInputTokens: usageSummary?.total_input_tokens ?? 0,
      totalOutputTokens: usageSummary?.total_output_tokens ?? 0,
      totalCost: usageSummary?.total_cost ?? 0,
      avgDurationMs: Math.round(usageSummary?.avg_duration_ms ?? 0),
    },
    provider: providerStatus,
  });
});

// ── PUT /ai/settings/features — Admin only ───────────────

const updateFeaturesSchema = z.object({
  features: z.record(z.string(), z.boolean()),
});

aiSettingsRoutes.put('/features', zValidator('json', updateFeaturesSchema), async (c) => {
  const role = c.get('role');
  if (role !== 'admin') {
    return forbidden(c, 'Only admins can modify AI feature settings');
  }

  const tenantId = c.get('tenantId');
  const masterDb = c.env.MASTER_DB;
  const { features } = c.req.valid('json');

  // Get current plan to validate — can't enable features above plan tier
  const tenant = await masterDb.prepare(
    'SELECT plan FROM tenants WHERE id = ?',
  ).bind(tenantId).first<{ plan: string }>();
  const plan = tenant?.plan || 'trial';
  const planDefaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.trial;

  const updated: Record<string, boolean> = {};
  const denied: string[] = [];

  for (const [featureKey, enabled] of Object.entries(features)) {
    // Can always disable features
    // Can only enable features that are within the plan tier (or via explicit upgrade)
    if (enabled && !planDefaults.includes(featureKey)) {
      denied.push(featureKey);
      continue;
    }

    // Upsert the flag (no updated_at column in schema)
    await masterDb.prepare(`
      INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (tenant_id, feature_key) DO UPDATE
      SET is_enabled = ?
    `).bind(
      `${tenantId}_${featureKey}`,
      tenantId,
      featureKey,
      enabled ? 1 : 0,
      enabled ? 1 : 0,
    ).run();

    updated[featureKey] = enabled;
  }

  return success(c, {
    updated,
    denied: denied.length > 0 ? denied : undefined,
    deniedReason: denied.length > 0 ? `These features require a higher plan: ${denied.join(', ')}` : undefined,
  });
});

// ── GET /ai/settings/usage ───────────────────────────────

aiSettingsRoutes.get('/usage', async (c) => {
  const tenantId = c.get('tenantId');
  const masterDb = c.env.MASTER_DB;
  const db = c.get('tenantDb');

  // Get all usage caps
  const caps = await masterDb.prepare(
    'SELECT cap_key, cap_value, current_usage, reset_period, last_reset_at FROM tenant_usage_caps WHERE tenant_id = ?',
  ).bind(tenantId).all();

  const quotas = (caps.results || []).map((row: any) => ({
    key: row.cap_key,
    limit: row.cap_value,
    used: row.current_usage,
    remaining: Math.max(0, row.cap_value - row.current_usage),
    resetPeriod: row.reset_period,
    lastResetAt: row.last_reset_at,
    percentUsed: row.cap_value > 0 ? Math.round((row.current_usage / row.cap_value) * 100) : 0,
    isExhausted: row.current_usage >= row.cap_value,
  }));

  // Get usage breakdown by task type (last 30 days)
  const breakdown = await db.prepare(`
    SELECT task_type, model_name,
      COUNT(*) as request_count,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost_estimate), 0) as total_cost
    FROM ai_usage_log
    WHERE created_at >= date('now', '-30 days')
    GROUP BY task_type, model_name
    ORDER BY request_count DESC
  `).all();

  // Get daily trend (last 7 days)
  const dailyTrend = await db.prepare(`
    SELECT date(created_at) as day,
      COUNT(*) as requests,
      COALESCE(SUM(cost_estimate), 0) as cost
    FROM ai_usage_log
    WHERE created_at >= date('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day
  `).all();

  return success(c, {
    quotas,
    breakdown: (breakdown.results || []).map((r: any) => ({
      taskType: r.task_type,
      modelName: r.model_name,
      requestCount: r.request_count,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCost: r.total_cost,
    })),
    dailyTrend: (dailyTrend.results || []).map((r: any) => ({
      day: r.day,
      requests: r.requests,
      cost: r.cost,
    })),
  });
});

// ── GET /ai/settings/provider ────────────────────────────

aiSettingsRoutes.get('/provider', async (c) => {
  const router = new AIRouter(c.env);
  const status = router.getProviderStatus();

  // Sample a few task configs to show what provider each uses
  const taskProviders: Record<string, string> = {};
  const sampleTasks = [
    'extraction', 'itinerary', 'communication', 'nl_query',
    'passport_ocr', 'lead_scoring', 'daily_briefing',
  ] as const;

  for (const task of sampleTasks) {
    const config = router.getModelConfig(task);
    taskProviders[task] = `${config.provider}/${config.model}`;
  }

  return success(c, {
    ...status,
    taskRouting: taskProviders,
  });
});

// ── GET /ai/settings/features/check/:featureKey ─────────

aiSettingsRoutes.get('/features/check/:featureKey', async (c) => {
  const tenantId = c.get('tenantId');
  const masterDb = c.env.MASTER_DB;
  const featureKey = c.req.param('featureKey');

  const tenantFeatures = await getTenantFeatures(masterDb, tenantId);
  const isEnabled = tenantFeatures.features.includes(featureKey);

  return success(c, {
    featureKey,
    enabled: isEnabled,
    plan: tenantFeatures.plan,
  });
});

export default aiSettingsRoutes;
