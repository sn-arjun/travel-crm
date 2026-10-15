import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
  getLocaleContext, resetLocaleContext, setLocaleContext, setLocaleFromTenant, useLocale, usesLakhCrore,
} from './locale';
import { formatCompactCurrency, formatCurrency } from './utils';
import { formatDisplayDate, formatDisplayDateTime } from './dates';

// 2026-10-06T19:30:00Z is 01:00 on 7 Oct in India, 20:30 on 6 Oct in London (BST), 23:30 on 6 Oct in Dubai,
// and 15:30 on 6 Oct in New York.
const TS = '2026-10-06T19:30:00Z';

describe('the store has no India default', () => {
  it('starts neutral until a session sets it', () => {
    resetLocaleContext();
    const ctx = getLocaleContext();
    expect(ctx.currency).toBe('USD');
    expect(ctx.currency).not.toBe('INR');
    expect(ctx.locale).not.toBe('en-IN');
    expect(ctx.timeZone).toBe('');
    expect(formatCurrency(1234.5)).toBe('$1,234.5');
  });

  it('ignores invalid values instead of storing them', () => {
    resetLocaleContext();
    setLocaleContext({ currency: 'nope', locale: 'x y', timeZone: 'Mars/Base' });
    expect(getLocaleContext()).toMatchObject({ currency: 'USD', timeZone: '' });
  });
});

describe('formatCurrency follows the active agency', () => {
  it('India: rupees with lakh grouping', () => {
    setLocaleFromTenant({ currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', country: 'IN' });
    expect(formatCurrency(1234567)).toBe('₹12,34,567');
  });
  it('UK: pounds, en-GB', () => {
    setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB' });
    expect(formatCurrency(1234567.5)).toBe('£1,234,567.5');
  });
  it('UAE: dirhams, ar-AE', () => {
    setLocaleFromTenant({ currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai', country: 'AE' });
    expect(formatCurrency(1500)).toBe(
      new Intl.NumberFormat('ar-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1500),
    );
  });
  it('US: dollars, en-US', () => {
    setLocaleFromTenant({ currency: 'USD', locale: 'en-US', timezone: 'America/New_York', country: 'US' });
    expect(formatCurrency(1234567.5)).toBe('$1,234,567.5');
  });
  it('explicit arguments still win (an invoice in another currency)', () => {
    setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB' });
    expect(formatCurrency(100, 'USD', 'en-US')).toBe('$100');
    expect(formatCurrency(100, 'EUR')).toContain('€');
  });
  it('a saved session without a locale keeps an INR agency on en-IN', () => {
    resetLocaleContext();
    setLocaleFromTenant({ currency: 'INR', timezone: 'Asia/Kolkata' });
    expect(getLocaleContext().locale).toBe('en-IN');
    resetLocaleContext();
    setLocaleFromTenant({ currency: 'GBP' });
    expect(getLocaleContext().locale).not.toBe('en-IN');
  });
  it('logout (null tenant) clears the agency locale', () => {
    setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB' });
    setLocaleFromTenant(null);
    expect(getLocaleContext().currency).toBe('USD');
  });
});

describe('compact lakh and crore only for en-IN', () => {
  it('en-IN writes L and Cr', () => {
    expect(usesLakhCrore('en-IN')).toBe(true);
    expect(formatCompactCurrency(250000, 'INR', 'en-IN')).toBe('₹2.5 L');
    expect(formatCompactCurrency(32000000, 'INR', 'en-IN')).toBe('₹3.2 Cr');
    expect(formatCompactCurrency(99999, 'INR', 'en-IN')).toBe('₹99,999');
  });
  it('other locales never say lakh or crore', () => {
    expect(usesLakhCrore('en-GB')).toBe(false);
    expect(formatCompactCurrency(250000, 'GBP', 'en-GB')).toBe('£250,000');
    expect(formatCompactCurrency(32000000, 'GBP', 'en-GB')).toBe('£32M');
    expect(formatCompactCurrency(32000000, 'USD', 'en-US')).toBe('$32M');
    expect(formatCompactCurrency(250000, 'INR', 'en-US')).not.toMatch(/ L| Cr/);
  });
  it('defaults come from the store', () => {
    setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB' });
    expect(formatCompactCurrency(32000000)).toBe('£32M');
    setLocaleFromTenant({ currency: 'INR', locale: 'en-IN' });
    expect(formatCompactCurrency(32000000)).toBe('₹3.2 Cr');
  });
});

describe('dates render in the active locale and user time zone', () => {
  it('India: 7 Oct 01:00 IST', () => {
    setLocaleFromTenant({ currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata' });
    expect(formatDisplayDate(TS)).toBe('7 Oct 2026');
    expect(formatDisplayDateTime(TS)).toBe('7 Oct 2026, 1:00 am');
  });
  it('UK: 6 Oct 20:30 BST', () => {
    setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London' });
    expect(formatDisplayDate(TS)).toBe('6 Oct 2026');
    expect(formatDisplayDateTime(TS)).toBe("6 Oct 2026, 20:30");
  });
  it('UAE agency, user in New York: the user zone wins', () => {
    setLocaleFromTenant({ currency: 'AED', locale: 'en-AE', timezone: 'Asia/Dubai' });
    expect(formatDisplayDateTime(TS)).toMatch(/11:30\s?pm$/);
    setLocaleContext({ timeZone: 'America/New_York' });
    expect(formatDisplayDateTime(TS)).toMatch(/3:30\s?pm$/);
  });
  it('US: month first', () => {
    setLocaleFromTenant({ currency: 'USD', locale: 'en-US', timezone: 'America/New_York' });
    expect(formatDisplayDate(TS)).toBe('Oct 6, 2026');
  });
  it('calendar dates and zone-less wall-clock times never move to another zone', () => {
    setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB', timezone: 'Pacific/Auckland' });
    expect(formatDisplayDate('2026-10-07')).toBe('7 Oct 2026');
    expect(formatDisplayDate('2026-10-07T00:00:00.000Z')).toBe('7 Oct 2026');
    expect(formatDisplayDateTime("2026-10-07 14:45")).toBe("7 Oct 2026, 14:45");
  });
});

describe('useLocale', () => {
  it('re-renders when the agency locale changes', () => {
    setLocaleFromTenant({ currency: 'INR', locale: 'en-IN' });
    const { result } = renderHook(() => useLocale());
    expect(result.current.currency).toBe('INR');
    act(() => {
      setLocaleFromTenant({ currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London' });
    });
    expect(result.current).toMatchObject({ currency: 'GBP', locale: 'en-GB', timeZone: 'Europe/London' });
  });
});

describe('the session layer sets the locale', () => {
  it('login, tenant update and logout drive the store', async () => {
    const { useAuthStore } = await import('@/stores/auth-store');
    const user = { id: 'u1' } as never;
    const tenant = {
      id: 't1', name: 'Acme UK', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB', phoneDefaultCountry: 'GB',
    } as never;
    useAuthStore.getState().setAuth({ accessToken: 'a', refreshToken: 'r', user, tenant });
    expect(getLocaleContext()).toMatchObject({ currency: 'GBP', locale: 'en-GB', timeZone: 'Europe/London', country: 'GB', phoneDefaultCountry: 'GB' });

    useAuthStore.getState().setTenant({ ...(tenant as object), timezone: 'Asia/Dubai', locale: 'ar-AE', currency: 'AED' } as never);
    expect(getLocaleContext()).toMatchObject({ currency: 'AED', locale: 'ar-AE', timeZone: 'Asia/Dubai' });

    useAuthStore.getState().logout();
    expect(getLocaleContext().currency).toBe('USD');
  });
});
