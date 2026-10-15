/**
 * Where calling is offered (owner decision 2026-10-15, ADR-001): the platform resells Twilio numbers and
 * minutes only where Twilio can serve them. An agency whose country is not on the allow-list gets no calling:
 * the call endpoints answer 403 CALLING_NOT_AVAILABLE_IN_COUNTRY and the desktop hides the calling UI.
 *
 * The allow-list is configuration: VOIP_CALLING_COUNTRIES (comma-separated ISO 3166 alpha-2 codes).
 * Default GB,US,AU,SG; DE and MY are added in the second wave by setting the variable, no code change.
 * '*' means every country and is honoured outside production only (local stacks, demos).
 *
 * The agency's country is the one in its settings (`country` / `company_country`, R202). An agency that has
 * not set one is treated as not available: calling cannot be resold to a place we do not know.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext, Env } from '../../types';
import { loadLocaleContext } from '../../utils/money';

export const DEFAULT_CALLING_COUNTRIES: readonly string[] = ['GB', 'US', 'AU', 'SG'];

export const CALLING_NOT_AVAILABLE_CODE = 'CALLING_NOT_AVAILABLE_IN_COUNTRY';

export interface CallingAllowList {
  /** Every country allowed (non-production only). */
  all: boolean;
  countries: string[];
}

/** The configured allow-list. Unreadable entries are ignored; an empty configuration falls back to the default. */
export function callingAllowList(env: Pick<Env, 'VOIP_CALLING_COUNTRIES' | 'ENVIRONMENT'>): CallingAllowList {
  const raw = (env.VOIP_CALLING_COUNTRIES ?? '').trim();
  if (raw === '*' && env.ENVIRONMENT !== 'production') return { all: true, countries: [] };
  const countries = raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return { all: false, countries: countries.length > 0 ? [...new Set(countries)] : [...DEFAULT_CALLING_COUNTRIES] };
}

export interface CallingAvailability {
  available: boolean;
  /** The agency's country, '' when it has not set one. */
  country: string;
  allowedCountries: string[];
  reason: 'ok' | 'country_not_set' | 'country_not_supported';
}

/** Pure: is calling offered to an agency in `country`? */
export function callingAvailabilityFor(country: string, list: CallingAllowList): CallingAvailability {
  const normalized = (country || '').toUpperCase();
  const base = { country: normalized, allowedCountries: list.countries };
  if (list.all) return { ...base, available: true, reason: 'ok' };
  if (!normalized) return { ...base, available: false, reason: 'country_not_set' };
  return list.countries.includes(normalized)
    ? { ...base, available: true, reason: 'ok' }
    : { ...base, available: false, reason: 'country_not_supported' };
}

/** Is calling offered to this agency (database = the agency's own)? */
export async function callingAvailability(env: Env, db: D1Database): Promise<CallingAvailability> {
  const locale = await loadLocaleContext(db);
  return callingAvailabilityFor(locale.country, callingAllowList(env));
}

/** Middleware for the call and VoIP-settings routes: 403 CALLING_NOT_AVAILABLE_IN_COUNTRY outside the allow-list. */
export function requireCallingCountry(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const availability = await callingAvailability(c.env, c.get('tenantDb'));
    if (!availability.available) {
      const message =
        availability.reason === 'country_not_set'
          ? 'Set your agency country in Settings to use calling.'
          : 'Calling is not available for agencies in your country yet.';
      const details = { code: CALLING_NOT_AVAILABLE_CODE, country: availability.country, reason: availability.reason };
      return c.json({ success: false, error: { message, code: CALLING_NOT_AVAILABLE_CODE, details } }, 403);
    }
    return next();
  };
}
