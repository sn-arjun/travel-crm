/**
 * Per-country calling policy and the "no calling on trials" switch (R304).
 *
 * Two layers decide whether an agency may have calling:
 *   1. the allow-list in configuration (VOIP_CALLING_COUNTRIES, country-gate.ts), which hides the calling UI and
 *      403s the call endpoints;
 *   2. the master table call_country_policy, which says how a country is served (resell, bridge, own_account) or
 *      that it is not offered, and whether buying a number there needs approved documents (KYC).
 * An agency may enable calling and buy numbers only when both allow it. The one exception is the non-production
 * wildcard VOIP_CALLING_COUNTRIES='*' (local stacks and demos), which skips the table's "not offered" so a demo
 * agency in any country can try the flow; production refuses '*' (country-gate.ts).
 *
 * The trial switch is the platform setting voip_calling_on_trial ('1' = allowed). Default: no calling on trials
 * (ADR-001 section 7; the owner has not confirmed it yet, so the super admin can change it).
 */

import type { Env } from '../../types';
import { callingAllowList, callingAvailabilityFor } from './country-gate';

export type CallPosition = 'resell' | 'bridge' | 'own_account' | 'not_offered';
export const CALL_POSITIONS: readonly CallPosition[] = ['resell', 'bridge', 'own_account', 'not_offered'];

export interface CountryPolicy {
  country: string;
  position: CallPosition;
  provider: string | null;
  kycRequired: boolean;
  notes: string | null;
}

export const TRIAL_CALLING_SETTING = 'voip_calling_on_trial';

export async function getCountryPolicy(env: Pick<Env, 'MASTER_DB'>, country: string): Promise<CountryPolicy | null> {
  const code = (country || '').trim().toUpperCase();
  if (!code) return null;
  const row = await env.MASTER_DB
    .prepare('SELECT country, position, provider, kyc_required, notes FROM call_country_policy WHERE country = ?')
    .bind(code)
    .first<{ country: string; position: CallPosition; provider: string | null; kyc_required: number; notes: string | null }>();
  return row ? { country: row.country, position: row.position, provider: row.provider, kycRequired: !!row.kyc_required, notes: row.notes } : null;
}

export async function listCountryPolicies(env: Pick<Env, 'MASTER_DB'>): Promise<CountryPolicy[]> {
  const rows = await env.MASTER_DB
    .prepare('SELECT country, position, provider, kyc_required, notes FROM call_country_policy ORDER BY country')
    .all<{ country: string; position: CallPosition; provider: string | null; kyc_required: number; notes: string | null }>();
  return (rows.results ?? []).map((r) => ({ country: r.country, position: r.position, provider: r.provider, kycRequired: !!r.kyc_required, notes: r.notes }));
}

export async function getPlatformSetting(env: Pick<Env, 'MASTER_DB'>, key: string): Promise<string | null> {
  const row = await env.MASTER_DB.prepare('SELECT value FROM platform_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setPlatformSetting(env: Pick<Env, 'MASTER_DB'>, key: string, value: string, actor?: string | null): Promise<void> {
  await env.MASTER_DB
    .prepare(
      `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(key, value, actor ?? null)
    .run();
}

/** Is calling allowed on free trials? Default no. */
export async function callingAllowedOnTrial(env: Pick<Env, 'MASTER_DB'>): Promise<boolean> {
  return (await getPlatformSetting(env, TRIAL_CALLING_SETTING)) === '1';
}

export type CallingRefusal =
  | 'country_not_set'
  | 'country_not_supported'
  | 'country_not_offered'
  | 'trial_not_allowed';

export interface CallingDecision {
  allowed: boolean;
  reason: CallingRefusal | null;
  country: string;
  policy: CountryPolicy | null;
  message: string | null;
}

const MESSAGES: Record<CallingRefusal, string> = {
  country_not_set: 'Set your agency country in Settings to use calling.',
  country_not_supported: 'Calling is not available for agencies in your country yet.',
  country_not_offered: 'Calling is not offered in your country.',
  trial_not_allowed: 'Calling is not included in the free trial. Choose a plan to turn it on.',
};

/**
 * May an agency in `country`, on plan `plan`, have calling (a sub-account and numbers)? Pure policy; whether the
 * agency actually has an account is separate (voip_accounts).
 */
export async function decideCalling(
  env: Env,
  input: { country: string | null | undefined; plan: string | null | undefined; tenantStatus?: string | null },
): Promise<CallingDecision> {
  const list = callingAllowList(env);
  const availability = callingAvailabilityFor(input.country ?? '', list);
  const country = availability.country;
  const policy = country ? await getCountryPolicy(env, country) : null;
  const refuse = (reason: CallingRefusal): CallingDecision => ({ allowed: false, reason, country, policy, message: MESSAGES[reason] });

  if (!availability.available) return refuse(availability.reason === 'country_not_set' ? 'country_not_set' : 'country_not_supported');
  if (!list.all && policy && policy.position === 'not_offered') return refuse('country_not_offered');
  if (!list.all && !policy) return refuse('country_not_supported');

  const onTrial = input.plan === 'trial' || input.tenantStatus === 'trial';
  if (onTrial && !(await callingAllowedOnTrial(env))) return refuse('trial_not_allowed');

  return { allowed: true, reason: null, country, policy, message: null };
}
