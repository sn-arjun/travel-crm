/**
 * Login-code abuse limits (R110). A login code costs real money (Twilio Verify, about 12.90 INR each), so beyond
 * the agency's monthly code allowance (meterUsage 'otp') every request is limited:
 *
 *   - per phone number: 3 per 10 minutes and 10 per day
 *   - per IP address:   20 per hour
 *   - only mobile numbers; premium-rate and landline-range numbers are rejected before anything is sent
 *
 * Requests are recorded in otp_requests (master, migration 0016) with a SHA-256 hash of the number, never the number.
 * The limits are identical whether or not the account exists, so they cannot be used to find out which numbers are
 * registered. Under TEST_MODE the limits are 20 times looser so the e2e suite can log in repeatedly.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { isTestMode } from '../../utils/test-mode';
import { normalizePhone } from '../../utils/phone';

export type OtpPurpose = 'login' | 'driver_login';

export const OTP_LIMITS = {
  perDestination10Min: 3,
  perDestinationDay: 10,
  perIpHour: 20,
} as const;

const PREMIUM_PREFIXES = [
  /^\+1(900|976)/,
  /^\+449/,
  /^\+49(900|137|180)/,
  /^\+3389/,
  /^\+34(80|90)/,
  /^\+3989/,
  /^\+61190/,
  /^\+(878|882|883|979)/,
];

export type MobileCheck = { ok: true; e164: string } | { ok: false; message: string };

/** Mobile numbers only. Anything else is rejected with the same message, whatever the reason. */
export function checkMobileNumber(raw: string): MobileCheck {
  const bad: MobileCheck = { ok: false, message: 'Enter a valid mobile number, including the country code.' };
  const trimmed = (raw ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return bad;
  const e164 = normalizePhone(trimmed);
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return bad;
  if (PREMIUM_PREFIXES.some((re) => re.test(e164))) return bad;
  // India: mobile numbers are ten digits starting 6 to 9 (anything else is a landline or a service number).
  if (e164.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(e164)) return bad;
  return { ok: true, e164 };
}

export async function hashDestination(e164: string): Promise<string> {
  const data = new TextEncoder().encode(e164.replace(/\D/g, ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface OtpLimitHit {
  retryAfterSecs: number;
  message: string;
}

async function countSince(env: Env, column: 'destination_hash' | 'ip', value: string, sinceMs: number): Promise<{ n: number; oldest: string | null }> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const row = await env.MASTER_DB
    .prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM otp_requests WHERE ${column} = ? AND created_at > ?`)
    .bind(value, since)
    .first<{ n: number; oldest: string | null }>();
  return { n: Number(row?.n ?? 0), oldest: row?.oldest ?? null };
}

function retryAfter(oldest: string | null, windowMs: number): number {
  if (!oldest) return Math.ceil(windowMs / 1000);
  return Math.max(1, Math.ceil((new Date(oldest).getTime() + windowMs - Date.now()) / 1000));
}

/**
 * Check the abuse limits for one login-code request and, when it passes, record it. Returns null when allowed,
 * or the limit that was hit (answer 429 with Retry-After).
 */
export async function checkAndRecordOtpRequest(
  env: Env,
  params: { tenantId: string | null; e164: string; ip: string | null; purpose: OtpPurpose },
): Promise<OtpLimitHit | null> {
  const mult = isTestMode(env) ? 20 : 1;
  const hash = await hashDestination(params.e164);

  const tenMin = 10 * 60_000;
  const day = 24 * 3600_000;
  const hour = 3600_000;

  const d10 = await countSince(env, 'destination_hash', hash, tenMin);
  if (d10.n >= OTP_LIMITS.perDestination10Min * mult) {
    const secs = retryAfter(d10.oldest, tenMin);
    return { retryAfterSecs: secs, message: `Too many login code requests for this number. Try again in ${Math.ceil(secs / 60)} minute(s).` };
  }
  const dDay = await countSince(env, 'destination_hash', hash, day);
  if (dDay.n >= OTP_LIMITS.perDestinationDay * mult) {
    const secs = retryAfter(dDay.oldest, day);
    return { retryAfterSecs: secs, message: 'Too many login code requests for this number today. Try again tomorrow or sign in with your password.' };
  }
  if (params.ip && params.ip !== 'unknown') {
    const ip = await countSince(env, 'ip', params.ip, hour);
    if (ip.n >= OTP_LIMITS.perIpHour * mult) {
      const secs = retryAfter(ip.oldest, hour);
      return { retryAfterSecs: secs, message: `Too many login code requests from this network. Try again in ${Math.ceil(secs / 60)} minute(s).` };
    }
  }

  await env.MASTER_DB
    .prepare('INSERT INTO otp_requests (id, tenant_id, destination_hash, ip, purpose) VALUES (?, ?, ?, ?, ?)')
    .bind(generateId(), params.tenantId, hash, params.ip && params.ip !== 'unknown' ? params.ip : null, params.purpose)
    .run();
  return null;
}

/** Shared wording for the cap refusal of a login code: the person is sent to the password. */
export const OTP_CAP_MESSAGE =
  'Login codes are not available for this agency right now. Please sign in with your password; your administrator has been notified.';
