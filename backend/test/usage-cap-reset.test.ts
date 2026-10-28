import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { resetUsageCaps, incrementUsage, usageCapPeriodKey } from '../src/middleware/usage-cap';

const testEnv = env as any;
const T_DAILY = '0196a105-0000-7000-8000-0000000000d1';
const T_MONTHLY = '0196a105-0000-7000-8000-0000000000d2';

async function usage(tenantId: string, capKey: string) {
  return testEnv.MASTER_DB
    .prepare('SELECT current_usage, period_key FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?')
    .bind(tenantId, capKey)
    .first() as Promise<{ current_usage: number; period_key: string | null }>;
}

async function setUsage(tenantId: string, capKey: string, n: number) {
  await testEnv.MASTER_DB
    .prepare('UPDATE tenant_usage_caps SET current_usage = ? WHERE tenant_id = ? AND cap_key = ?')
    .bind(n, tenantId, capKey)
    .run();
}

describe('usage cap reset happens once per period', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    for (const [id, sub] of [[T_DAILY, 'capd'], [T_MONTHLY, 'capm']]) {
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, ?, ?, 'pro', 'active')`)
        .bind(id, `Cap ${sub}`, `cap-${sub}`)
        .run();
    }
    await testEnv.MASTER_DB.prepare('DELETE FROM tenant_usage_caps WHERE tenant_id IN (?, ?)').bind(T_DAILY, T_MONTHLY).run();
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period) VALUES (?, ?, 'ai_actions_per_day', 1000, 900, 'daily')`)
      .bind('0196a105-1111-7000-8000-0000000000d1', T_DAILY)
      .run();
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period) VALUES (?, ?, 'sms_per_month', 500, 450, 'monthly')`)
      .bind('0196a105-1111-7000-8000-0000000000d2', T_MONTHLY)
      .run();
  });

  it('computes UTC period keys', () => {
    expect(usageCapPeriodKey('daily', new Date('2026-10-14T23:59:59Z'))).toBe('2026-10-14');
    expect(usageCapPeriodKey('monthly', new Date('2026-10-31T23:59:59Z'))).toBe('2026-10');
  });

  it('daily: five resets in one UTC day reset once and keep later increments', async () => {
    const day1 = new Date('2026-10-14T00:30:00Z');
    expect((await resetUsageCaps(testEnv.MASTER_DB, 'daily', day1))).toBeGreaterThanOrEqual(1);
    expect((await usage(T_DAILY, 'ai_actions_per_day')).current_usage).toBe(0);
    expect((await usage(T_DAILY, 'ai_actions_per_day')).period_key).toBe('2026-10-14');

    await incrementUsage(testEnv.MASTER_DB, T_DAILY, 'ai_actions_per_day', 7);
    for (const minutes of [5, 10, 15, 20]) {
      const again = await resetUsageCaps(testEnv.MASTER_DB, 'daily', new Date(day1.getTime() + minutes * 60000));
      expect(again).toBe(0);
    }
    expect((await usage(T_DAILY, 'ai_actions_per_day')).current_usage).toBe(7);
  });

  it('daily: a new UTC day resets again', async () => {
    await setUsage(T_DAILY, 'ai_actions_per_day', 40);
    await resetUsageCaps(testEnv.MASTER_DB, 'daily', new Date('2026-10-15T00:30:00Z'));
    const row = await usage(T_DAILY, 'ai_actions_per_day');
    expect(row.current_usage).toBe(0);
    expect(row.period_key).toBe('2026-10-15');
  });

  it('monthly: resets only when the month key changes, never all day on the 1st', async () => {
    await resetUsageCaps(testEnv.MASTER_DB, 'monthly', new Date('2026-10-01T00:30:00Z'));
    expect((await usage(T_MONTHLY, 'sms_per_month')).period_key).toBe('2026-10');
    await incrementUsage(testEnv.MASTER_DB, T_MONTHLY, 'sms_per_month', 11);
    // a hundred more ticks later on the 1st and on other days of October change nothing
    for (const iso of ['2026-10-01T00:35:00Z', '2026-10-01T13:00:00Z', '2026-10-02T00:30:00Z', '2026-10-31T00:30:00Z']) {
      expect(await resetUsageCaps(testEnv.MASTER_DB, 'monthly', new Date(iso))).toBe(0);
    }
    expect((await usage(T_MONTHLY, 'sms_per_month')).current_usage).toBe(11);

    await resetUsageCaps(testEnv.MASTER_DB, 'monthly', new Date('2026-11-01T00:30:00Z'));
    const row = await usage(T_MONTHLY, 'sms_per_month');
    expect(row.current_usage).toBe(0);
    expect(row.period_key).toBe('2026-11');
  });

  it('a daily reset does not touch monthly caps and the reverse', async () => {
    await setUsage(T_MONTHLY, 'sms_per_month', 99);
    await resetUsageCaps(testEnv.MASTER_DB, 'daily', new Date('2026-12-02T00:30:00Z'));
    expect((await usage(T_MONTHLY, 'sms_per_month')).current_usage).toBe(99);
  });

  it('the daily cron resets caps once however many times it fires in a day', async () => {
    await setUsage(T_DAILY, 'ai_actions_per_day', 500);
    const sent: unknown[] = [];
    const fakeEnv = { ...testEnv, TENANT_JOBS_QUEUE: { sendBatch: async (m: unknown[]) => { sent.push(...m); } } };
    const scheduledTime = Date.UTC(2027, 0, 5, 0, 30);
    const fire = async (offsetMs: number) => {
      const ctx = createExecutionContext();
      await (worker as any).scheduled({ cron: '30 0 * * *', scheduledTime: scheduledTime + offsetMs }, fakeEnv, ctx);
      await waitOnExecutionContext(ctx);
    };
    await fire(0);
    expect((await usage(T_DAILY, 'ai_actions_per_day')).current_usage).toBe(0);
    await incrementUsage(testEnv.MASTER_DB, T_DAILY, 'ai_actions_per_day', 3);
    await fire(60_000);
    await fire(120_000);
    expect((await usage(T_DAILY, 'ai_actions_per_day')).current_usage).toBe(3);
  });

  it('the 5-minute cron never resets caps', async () => {
    await setUsage(T_DAILY, 'ai_actions_per_day', 123);
    const fakeEnv = { ...testEnv, TENANT_JOBS_QUEUE: { sendBatch: async () => {} } };
    const ctx = createExecutionContext();
    await (worker as any).scheduled({ cron: '*/5 * * * *', scheduledTime: Date.UTC(2027, 0, 6, 0, 30) }, fakeEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect((await usage(T_DAILY, 'ai_actions_per_day')).current_usage).toBe(123);
  });
});
