import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { AIRouter, AiUnavailableError } from '../src/services/ai-router';

/**
 * B36 — honest AI-unavailable handling. The vitest environment has NO Workers AI binding and no
 * Anthropic key, so every AI endpoint must answer 503 AI_UNAVAILABLE (never 200 with stub text) and
 * must not consume usage quota.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const AI_MESSAGE = 'AI is not configured for this workspace yet.';

async function call(method: string, path: string, token: string | null, body?: unknown, withEnv: any = testEnv) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    withEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let adminToken = '';

async function usageOf(): Promise<number | null> {
  const row = await testEnv.MASTER_DB
    .prepare('SELECT current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?')
    .bind(TENANT_ID, 'ai_actions_per_day')
    .first();
  return row ? (row.current_usage as number) : null;
}

async function expectUnavailable(res: Response) {
  expect(res.status).toBe(503);
  const body: any = await res.json();
  expect(body.success).toBe(false);
  expect(body.error.code).toBe('AI_UNAVAILABLE');
  expect(body.error.message).toBe(AI_MESSAGE);
  expect(JSON.stringify(body)).not.toContain('Cloudflare AI not available');
}

describe('B36 — AI unavailable (no provider configured)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const ctx = createExecutionContext();
    const reset = await worker.fetch(
      new Request('http://localhost/api/v1/test/reset', { method: 'POST' }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(reset.status).toBe(200);

    const login = await call('POST', '/auth/login', null, {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: TENANT_ID,
    });
    expect(login.status).toBe(200);
    adminToken = ((await login.json()) as any).data.accessToken;

    // ai_intelligence is an enterprise-tier feature; grant it explicitly so /ai/intelligence/* is reachable.
    await testEnv.MASTER_DB
      .prepare("INSERT OR REPLACE INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('b36-flag', ?, 'ai_intelligence', 1)")
      .bind(TENANT_ID)
      .run();
  });

  it('the test environment really has no AI binding', () => {
    expect(testEnv.AI).toBeUndefined();
  });

  const postCases: Array<[string, string, unknown]> = [
    ['extract-lead', '/ai/extract-lead', { text: 'Rahul wants Goa for 4 people in May' }],
    ['parse-whatsapp', '/ai/parse-whatsapp', { message: 'Hi, need a Kerala trip for 6 people' }],
    ['generate-itinerary', '/ai/generate-itinerary', { prompt: 'A 3 day family trip to Goa for 4 people' }],
    ['compose-message', '/ai/compose-message', { channel: 'email', purpose: 'follow_up', tone: 'casual' }],
    ['nl-query', '/ai/intelligence/nl-query', { query: 'How many leads did we win last month?' }],
    ['briefing', '/ai/bi/briefings/generate', { type: 'daily' }],
    ['health-score', '/ai/bi/health-score/calculate', {}],
  ];

  for (const [name, path, body] of postCases) {
    it(`POST ${path} (${name}) returns 503 AI_UNAVAILABLE`, async () => {
      const res = await call('POST', path, adminToken, body);
      if (res.status === 400) {
        // Fail loudly if the request body in this test is out of date with the validator.
        throw new Error(`Test body rejected by validator: ${JSON.stringify(await res.json())}`);
      }
      await expectUnavailable(res);
    });
  }

it('GET /ai/bi/cash-flow-forecast returns 503 AI_UNAVAILABLE', async () => {    await expectUnavailable(await call('GET', '/ai/bi/cash-flow-forecast', adminToken));  });

  it('does not consume ai_actions_per_day quota on a 503', async () => {
    const now = new Date().toISOString();
    await testEnv.MASTER_DB
      .prepare(
        `INSERT OR REPLACE INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period, last_reset_at)
         VALUES (?, ?, 'ai_actions_per_day', 100, 7, 'daily', ?)`,
      )
      .bind('b36-cap-row', TENANT_ID, now)
      .run();

    const res = await call('POST', '/ai/extract-lead', adminToken, { text: 'Priya wants Kerala for 2 in June' });
    await expectUnavailable(res);
    expect(await usageOf()).toBe(7);
  });

  // Endpoints that mix SQL aggregates with AI commentary keep the real data and flag the missing commentary.
  const dataCases: Array<[string, string, string[]]> = [
    ['destination-profitability', '/ai/bi/destination-profitability', ['rawData']],
    ['team-performance', '/ai/bi/team-performance', ['rawData']],
    ['lost-deal-analysis', '/ai/bi/lost-deal-analysis', ['rawByReason', 'rawByStatus']],
  ];
  for (const [name, path, rawKeys] of dataCases) {
    it(`GET ${path} (${name}) returns 200 with real data, null AI text and aiUnavailable:true`, async () => {
      const before = await usageOf();
      const res = await call('GET', path, adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.aiUnavailable).toBe(true);
      for (const k of rawKeys) expect(Array.isArray(body.data[k])).toBe(true);
      expect(body.data.provider).toBeNull();
      expect(JSON.stringify(body)).not.toContain('Cloudflare AI not available');
      expect(await usageOf()).toBe(before);
    });
  }

  it('GET /ai/settings reports truthful provider flags and available:false', async () => {
    const res = await call('GET', '/ai/settings', adminToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.provider.cloudflare).toBe(false);
    expect(body.data.provider.anthropic).toBe(false);
    expect(body.data.provider.available).toBe(false);
  });

  it('GET /ai/settings reports available:true when a Workers AI binding exists', async () => {
    const withAi = { ...testEnv, AI: { run: async () => ({ response: '{}' }) } };
    const res = await call('GET', '/ai/settings', adminToken, undefined, withAi);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.provider.cloudflare).toBe(true);
    expect(body.data.provider.available).toBe(true);
  });
});

describe('B36 — AIRouter provider detection', () => {
  const bare = { ...testEnv, AI: undefined, ANTHROPIC_API_KEY: undefined };

  it('route() throws AiUnavailableError without a binding or key', async () => {
    const router = new AIRouter(bare);
    await expect(router.route('extraction', 'x', 'y')).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(router.routeVision('passport_ocr', 'AAAA', 'image/jpeg', 'x')).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('route() throws AiUnavailableError when the AI binding fails to run', async () => {
    const router = new AIRouter({ ...bare, AI: { run: async () => { throw new Error('local mode'); } } });
    await expect(router.route('extraction', 'x', 'y')).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('getProviderStatus reflects the binding and the Anthropic key', () => {
    expect(new AIRouter(bare).getProviderStatus()).toMatchObject({ cloudflare: false, anthropic: false, available: false });
    expect(new AIRouter({ ...bare, AI: { run: async () => ({}) } }).getProviderStatus()).toMatchObject({ cloudflare: true, available: true });
    expect(new AIRouter({ ...bare, ANTHROPIC_API_KEY: 'key' }).getProviderStatus()).toMatchObject({
      cloudflare: false,
      anthropic: true,
      available: true,
      defaultProvider: 'anthropic',
    });
  });
});
