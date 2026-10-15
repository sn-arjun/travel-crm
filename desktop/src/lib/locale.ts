/**
 * Active display locale (R202): the currency, number/date locale and time zone that money and dates are shown in.
 *
 * One module store, set from the login response's tenant summary (agency settings with the user's own locale and
 * time zone already applied by the API) and again after settings are saved. `formatCurrency` and the date helpers
 * read it when a caller passes nothing. Nothing in here assumes a country: until a session sets it, the store
 * holds a neutral placeholder (USD, the browser's language, the viewer's own time zone).
 */
import { useSyncExternalStore } from 'react';

export interface LocaleContext {
  /** ISO 4217 code, e.g. INR, GBP, AED, USD. */
  currency: string;
  /** BCP 47 tag, e.g. en-IN, en-GB, ar-AE, en-US. */
  locale: string;
  /** IANA zone name. '' = the viewer's own system zone (before a session sets one). */
  timeZone: string;
  /** ISO 3166-1 alpha-2 of the agency, '' when unknown. */
  country: string;
  /** ISO 3166-1 alpha-2 used to read phone numbers typed without a country code. */
  phoneDefaultCountry: string;
}

/** The tenant summary the API returns on auth responses (extra fields ignored). */
export interface TenantLocaleSource {
  currency?: string | null;
  locale?: string | null;
  timezone?: string | null;
  country?: string | null;
  phoneDefaultCountry?: string | null;
}

function systemLocale(): string {
  try {
    const tag = typeof navigator !== 'undefined' ? navigator.language : '';
    if (tag && Intl.getCanonicalLocales(tag).length === 1) return tag;
  } catch {
    // fall through
  }
  return 'en-US';
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidLocaleTag(tag: string | null | undefined): tag is string {
  if (!tag) return false;
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

function isValidCurrencyCode(code: string | null | undefined): code is string {
  if (!code || !/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

const initial = (): LocaleContext => ({
  currency: 'USD',
  locale: systemLocale(),
  timeZone: '',
  country: '',
  phoneDefaultCountry: '',
});

let current: LocaleContext = initial();
const listeners = new Set<() => void>();

export function getLocaleContext(): LocaleContext {
  return current;
}

/** Merge the given fields (invalid ones are ignored) into the store and notify subscribers. */
export function setLocaleContext(next: Partial<LocaleContext>): void {
  const merged: LocaleContext = { ...current };
  if (isValidCurrencyCode(next.currency)) merged.currency = next.currency.toUpperCase();
  if (isValidLocaleTag(next.locale)) merged.locale = next.locale;
  if (next.timeZone !== undefined && (next.timeZone === '' || isValidTimeZone(next.timeZone))) merged.timeZone = next.timeZone;
  if (next.country !== undefined) merged.country = next.country.toUpperCase();
  if (next.phoneDefaultCountry !== undefined) merged.phoneDefaultCountry = next.phoneDefaultCountry.toUpperCase();
  if (
    merged.currency === current.currency && merged.locale === current.locale && merged.timeZone === current.timeZone &&
    merged.country === current.country && merged.phoneDefaultCountry === current.phoneDefaultCountry
  ) return;
  current = merged;
  listeners.forEach((l) => l());
}

/** Set the store from a tenant summary (login, token refresh, settings save). A null summary resets it (logout). */
export function setLocaleFromTenant(tenant: TenantLocaleSource | null | undefined): void {
  if (!tenant) {
    resetLocaleContext();
    return;
  }
  setLocaleContext({
    currency: tenant.currency ?? undefined,
    // A session saved before R202 has a currency but no locale; an INR agency keeps its en-IN look.
    locale: tenant.locale ?? (tenant.currency === 'INR' ? 'en-IN' : undefined),
    timeZone: tenant.timezone ?? undefined,
    country: tenant.country ?? undefined,
    phoneDefaultCountry: tenant.phoneDefaultCountry ?? undefined,
  });
}

export function resetLocaleContext(): void {
  const fresh = initial();
  current = fresh;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: re-renders when the active locale changes. */
export function useLocale(): LocaleContext {
  return useSyncExternalStore(subscribe, getLocaleContext, getLocaleContext);
}

/** True when compact amounts are written in lakh and crore (English, India only). */
export function usesLakhCrore(locale: string): boolean {
  return /^en-IN$/i.test(locale);
}
