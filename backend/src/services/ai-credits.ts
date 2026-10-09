/**
 * AI credit metering (MASTER_DB.tenant_usage_caps, cap_key = ai_credits_per_month).
 *
 * Every tenant has a monthly allowance from its plan. The row is created on first use,
 * so a tenant can never be unmetered just because nobody seeded a cap for it.
 */

import { HTTPException } from 'hono/http-exception';
import { generateId } from '../utils/uuid';
import {
  AI_CREDITS_CAP_KEY,
  CREDIT_WEIGHTS,
  DEFAULT_PLAN_AI_CREDITS,
  PLAN_AI_CREDITS,
  type AiCreditClass,
} from './ai-pricing';

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

/** Read the tenant's credit cap, creating it from the plan allowance when missing. */
export async function getCreditBalance(masterDb: D1Database, tenantId: string): Promise<CreditBalance> {
  let cap = await masterDb
    .prepare('SELECT cap_value, current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?')
    .bind(tenantId, AI_CREDITS_CAP_KEY)
    .first<{ cap_value: number; current_usage: number }>();

  if (!cap) {
    const tenant = await masterDb.prepare('SELECT plan FROM tenants WHERE id = ?').bind(tenantId).first<{ plan: string }>();
    const allowance = PLAN_AI_CREDITS[tenant?.plan ?? ''] ?? DEFAULT_PLAN_AI_CREDITS;
    // The unique (tenant_id, cap_key) index makes a concurrent first use harmless.
    await masterDb
      .prepare(
        `INSERT OR IGNORE INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period, last_reset_at)
         VALUES (?, ?, ?, ?, 0, 'monthly', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      )
      .bind(generateId(), tenantId, AI_CREDITS_CAP_KEY, allowance)
      .run();
    cap = { cap_value: allowance, current_usage: 0 };
  }

  return {
    limit: cap.cap_value,
    used: cap.current_usage,
    remaining: Math.max(0, cap.cap_value - cap.current_usage),
  };
}

/** Throws AiQuotaExceededError when the tenant cannot afford one call of this class. */
export async function assertCredits(masterDb: D1Database, tenantId: string, creditClass: AiCreditClass): Promise<void> {
  const balance = await getCreditBalance(masterDb, tenantId);
  if (balance.remaining < CREDIT_WEIGHTS[creditClass]) throw new AiQuotaExceededError();
}

/** Charge one successful call. Never throws: a metering failure must not fail the request it follows. */
export async function chargeCredits(masterDb: D1Database, tenantId: string, creditClass: AiCreditClass): Promise<void> {
  try {
    await masterDb
      .prepare(
        `UPDATE tenant_usage_caps
         SET current_usage = current_usage + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE tenant_id = ? AND cap_key = ?`,
      )
      .bind(CREDIT_WEIGHTS[creditClass], tenantId, AI_CREDITS_CAP_KEY)
      .run();
  } catch (err) {
    console.error('[ai-credits] charge failed:', err);
  }
}
