import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { AIRouter, AiUnavailableError } from '../src/services/ai-router';
import { AiQuotaExceededError, getCreditBalance } from '../src/services/ai-credits';
import { creditClassFor, estimateCostUsd, CREDIT_WEIGHTS } from '../src/services/ai-pricing';

const testEnv = env as any;
const TENANT = 'credits-tenant';
// Seeded catalogue allowances (migration 0015, plan_allowances.ai_credits)
const PLAN_AI_CREDITS = { trial: 2000, basic: 1000, pro: 15000, enterprise: 25000 };

/** A Workers AI binding that answers without spending anything. */
function fakeAi(reply: Record<string, unknown>) {
  const calls: Array<{ model: string }> = [];
  return { calls, run: async (model: string) => { calls.push({ model }); return reply; } };
}

/** Pass null for a router that is not tied to a tenant. */
function routerWith(ai: unknown, tenantId: string | null = TENANT) {
  return new AIRouter({ ...testEnv, ANTHROPIC_API_KEY: '', AI: ai } as any, undefined, tenantId ?? undefined);
}

async function setTenant(plan: string) {
  await testEnv.MASTER_DB.batch([
    testEnv.MASTER_DB.prepare('DELETE FROM tenant_usage_caps WHERE tenant_id = ?').bind(TENANT),
    testEnv.MASTER_DB.prepare(
      `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'Credits Co', 'credits-co', ?, 'active')`,
    ).bind(TENANT, plan),
  ]);
}

async function setCap(limit: number, used: number) {
  await testEnv.MASTER_DB.prepare(
    `INSERT OR REPLACE INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period)
     VALUES ('credits-cap', ?, 'ai_credits_per_month', ?, ?, 'monthly')`,
  ).bind(TENANT, limit, used).run();
}

describe('AI pricing', () => {
  it('costs a call from the model price list, Workers AI included', () => {
    // 1,300 in / 300 out on Llama 3.3 70B: 1300 * 0.293 + 300 * 2.253 = 1056.8 per million
    expect(estimateCostUsd('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1300, 300)).toBeCloseTo(0.0010568, 7);
    expect(estimateCostUsd('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)).toBeCloseTo(6, 6);
  });

  it('never reports an unknown model as free', () => {
    expect(estimateCostUsd('some-new-model', 1000, 1000)).toBeGreaterThan(0);
  });

  it('maps tasks to credit classes', () => {
    expect(creditClassFor('sentiment')).toBe('read');
    expect(creditClassFor('extraction')).toBe('understand');
    expect(creditClassFor('passport_ocr')).toBe('scan');
    expect(creditClassFor('itinerary_generation')).toBe('create');
  });
});

describe('AI credits', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    await setTenant('pro');
  });

  it('creates the monthly allowance from the plan the first time it is needed', async () => {
    expect(await getCreditBalance(testEnv.MASTER_DB, TENANT)).toEqual({ limit: PLAN_AI_CREDITS.pro, used: 0, remaining: PLAN_AI_CREDITS.pro });
    const row = await testEnv.MASTER_DB
      .prepare(`SELECT cap_value, reset_period FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = 'ai_credits_per_month'`)
      .bind(TENANT)
      .first();
    expect(row).toEqual({ cap_value: PLAN_AI_CREDITS.pro, reset_period: 'monthly' });
  });

  it('gives each plan its own allowance', async () => {
    await setTenant('enterprise');
    expect((await getCreditBalance(testEnv.MASTER_DB, TENANT)).limit).toBe(PLAN_AI_CREDITS.enterprise);
  });

  it('charges by class after a successful call and records real cost', async () => {
    const ai = fakeAi({ response: '{"ok":true}', usage: { prompt_tokens: 1300, completion_tokens: 300 } });
    const router = routerWith(ai);

    const result = await router.route('extraction', 'Hi, family of four to Kerala', 'Extract');
    expect(result).toMatchObject({ inputTokens: 1300, outputTokens: 300, provider: 'cloudflare' });
    expect(result.cost).toBeGreaterThan(0);
    expect(result.cost).toBeCloseTo(estimateCostUsd(result.model, 1300, 300), 9);

    await router.route('daily_briefing', 'metrics', 'Brief');
    const balance = await getCreditBalance(testEnv.MASTER_DB, TENANT);
    expect(balance.used).toBe(CREDIT_WEIGHTS.understand + CREDIT_WEIGHTS.create);
  });

  it('falls back to a length estimate when the model reports no usage', async () => {
    const result = await routerWith(fakeAi({ response: 'abcdefgh' })).route('extraction', '12345678', 'abcd');
    expect(result).toMatchObject({ inputTokens: 3, outputTokens: 2 });
  });

  it('does not charge when the provider fails', async () => {
    const router = routerWith({ run: async () => { throw new Error('down'); } });
    await expect(router.route('extraction', 'x', 'y')).rejects.toBeInstanceOf(AiUnavailableError);
    expect((await getCreditBalance(testEnv.MASTER_DB, TENANT)).used).toBe(0);
  });

  it('refuses a call the tenant cannot afford, without reaching the provider', async () => {
    await setCap(PLAN_AI_CREDITS.pro, PLAN_AI_CREDITS.pro - CREDIT_WEIGHTS.understand + 1); // 4 left: not enough for an "understand" call
    const ai = fakeAi({ response: 'never' });
    const router = routerWith(ai);

    const refused = router.route('extraction', 'x', 'y');
    await expect(refused).rejects.toBeInstanceOf(AiQuotaExceededError);
    await expect(refused).rejects.toMatchObject({ status: 429 });
    expect(ai.calls).toHaveLength(0);

    // A cheaper class still fits in what is left.
    await router.route('sentiment', 'x', 'y');
    expect(ai.calls).toHaveLength(1);
  });

  it('does not meter a router built without a tenant', async () => {
    await routerWith(fakeAi({ response: 'ok' }), null).route('extraction', 'x', 'y');
    const rows = await testEnv.MASTER_DB.prepare(`SELECT id FROM tenant_usage_caps WHERE tenant_id = ?`).bind(TENANT).all();
    expect(rows.results).toHaveLength(0);
  });
});
