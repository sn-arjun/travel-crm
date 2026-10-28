/**
 * AI credit metering (MASTER_DB.tenant_usage_caps, cap_key = ai_credits_per_month).
 *
 * Every tenant has a monthly allowance from the plan catalogue (plan_allowances 'ai_credits') plus any AI credit
 * packs granted for the current month. The usage row is created on first use, so a tenant can never be unmetered
 * just because nobody seeded a cap for it; its cap_value is kept equal to the current allowance.
 */

import { HTTPException } from 'hono/http-exception';
import { generateId } from '../utils/uuid';
import { AI_CREDITS_CAP_KEY, CREDIT_WEIGHTS, type AiCreditClass } from './ai-pricing';
import { asCatalogueEnv, currentPeriodKey, getAllowance, type MasterRef } from './plans/catalogue';
import { checkUsageAlerts } from './metering/usage-alerts';
import type { Env } from '../types';

export const AI_QUOTA_EXCEEDED_MESSAGE =
  'This month\'s AI credits are used up. Automations that do not use AI keep running; ask your administrator to add credits.';

/** 429 through every error handler in the app (they all pass HTTPException < 500 through). */
export class AiQuotaExceededError extends HTTPException {
  readonly code = 'AI_QUOTA_EXCEEDED';
  constructor() {
    super(429, { message: AI_QUOTA_EXCEEDED_MESSAGE });
    this.name = 'AiQuotaExceededError';
  }
}

export interface CreditBalance {
  limit: number;
  used: number;
  remaining: number;
}

/** Read the tenant's credit balance. The limit is the catalogue allowance for this month, packs included. */
export async function getCreditBalance(ref: MasterRef, tenantId: string): Promise<CreditBalance> {
  const masterDb = asCatalogueEnv(ref).MASTER_DB;
  const allowance = await getAllowance(ref, tenantId, 'ai_credits');
  let cap = await masterDb
    .prepare('SELECT cap_value, current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?')
    .bind(tenantId, AI_CREDITS_CAP_KEY)
    .first<{ cap_value: number; current_usage: number }>();

  if (!cap) {
    // The unique (tenant_id, cap_key) index makes a concurrent first use harmless.
    await masterDb
      .prepare(
        `INSERT OR IGNORE INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period, last_reset_at, period_key)
         VALUES (?, ?, ?, ?, 0, 'monthly', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?)`,
      )
      .bind(generateId(), tenantId, AI_CREDITS_CAP_KEY, allowance, currentPeriodKey())
      .run();
    cap = { cap_value: allowance, current_usage: 0 };
  } else if (cap.cap_value !== allowance) {
    // A plan change, catalogue edit or pack grant moved the allowance: keep the stored value in step.
    await masterDb
      .prepare('UPDATE tenant_usage_caps SET cap_value = ? WHERE tenant_id = ? AND cap_key = ?')
      .bind(allowance, tenantId, AI_CREDITS_CAP_KEY)
      .run();
    cap = { cap_value: allowance, current_usage: cap.current_usage };
  }

  return {
    limit: cap.cap_value,
    used: cap.current_usage,
    remaining: Math.max(0, cap.cap_value - cap.current_usage),
  };
}

/** Throws AiQuotaExceededError when the tenant cannot afford one call of this class. */
export async function assertCredits(ref: MasterRef, tenantId: string, creditClass: AiCreditClass, units = 1): Promise<void> {
  const balance = await getCreditBalance(ref, tenantId);
  if (balance.remaining < CREDIT_WEIGHTS[creditClass] * units) throw new AiQuotaExceededError();
}

/** Charge one successful call. Never throws: a metering failure must not fail the request it follows. */
export async function chargeCredits(ref: MasterRef, tenantId: string, creditClass: AiCreditClass, units = 1): Promise<void> {
  try {
    await asCatalogueEnv(ref).MASTER_DB
      .prepare(
        `UPDATE tenant_usage_caps
         SET current_usage = current_usage + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE tenant_id = ? AND cap_key = ?`,
      )
      .bind(CREDIT_WEIGHTS[creditClass] * units, tenantId, AI_CREDITS_CAP_KEY)
      .run();
    // 80% / 100% alerts go through the same mechanism as the communication channels (needs the full Env).
    if (typeof (ref as D1Database).prepare !== 'function') {
      const balance = await getCreditBalance(ref, tenantId);
      await checkUsageAlerts(ref as unknown as Env, tenantId, {
        capKey: AI_CREDITS_CAP_KEY,
        label: 'AI credits',
        used: balance.used,
        allowance: balance.limit,
      });
    }
  } catch (err) {
    console.error('[ai-credits] charge failed:', err);
  }
}
