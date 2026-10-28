import { afterEach, describe, expect, it } from 'vitest';
import { getLocaleContext, intlLocaleOf, resetLocaleContext, setLocaleFromTenant } from './locale';
import { formatExactCurrency, formatLocaleDate, formatLocaleNumber, formatWholeCurrency } from './format';
import { currencyName, currencyOptions, setUiLanguage, timezoneLabel, timezoneOptions } from './locale-options';

afterEach(() => {
  resetLocaleContext();
  setUiLanguage('en');
});

describe('Arabic locales keep Latin digits (R211 decision)', () => {
  it('adds the Latin numbering system to Arabic tags and leaves other tags alone', () => {
    expect(intlLocaleOf('ar-AE')).toBe('ar-AE-u-nu-latn');
    expect(intlLocaleOf('ar')).toBe('ar-u-nu-latn');
    expect(intlLocaleOf('ar-SA')).toBe('ar-SA-u-nu-latn');
    expect(intlLocaleOf('ar-SA-u-ca-gregory')).toBe('ar-SA-u-ca-gregory-nu-latn');
    expect(intlLocaleOf('ar-SA-u-nu-arab')).toBe('ar-SA-u-nu-arab');
    for (const tag of ['en-IN', 'en-GB', 'hi-IN', 'fr-FR', 'arn-CL']) expect(intlLocaleOf(tag)).toBe(tag);
  });

  it('keeps the agency locale as saved and exposes the Intl tag next to it', () => {
    setLocaleFromTenant({ currency: 'SAR', locale: 'ar-SA', timezone: 'Asia/Riyadh', country: 'SA' });
    expect(getLocaleContext()).toMatchObject({ locale: 'ar-SA', intlLocale: 'ar-SA-u-nu-latn' });
  });

  it('prints no Arabic-Indic digits for ar-SA or ar-EG money, numbers and dates', () => {
    for (const locale of ['ar-SA', 'ar-EG', 'ar-AE']) {
      setLocaleFromTenant({ currency: 'AED', locale, timezone: 'Asia/Dubai' });
      const shown = [
        formatWholeCurrency(1234567),
        formatExactCurrency(-1500.5),
        formatLocaleNumber(9876543.21),
        formatLocaleDate('2026-10-15', { day: 'numeric', month: 'short', year: 'numeric' }),
      ].join(' ');
      expect(shown, locale).not.toMatch(/[٠-٩۰-۹]/);
      expect(shown, locale).toMatch(/1,234,567/);
      expect(shown, locale).toMatch(/2026/);
    }
  });

  it('still writes the Arabic month names and the dirham sign', () => {
    setLocaleFromTenant({ currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai' });
    expect(formatLocaleDate('2026-10-15', { day: 'numeric', month: 'long', year: 'numeric' })).toContain('أكتوبر');
    expect(formatExactCurrency(10)).toMatch(/[؀-ۿ]/);
  });
});

describe('currency and time zone names follow the interface language', () => {
  it('English keeps the fixed names', () => {
    expect(currencyName('AED')).toBe('UAE Dirham');
    expect(timezoneLabel('Asia/Dubai')).toBe('Asia/Dubai (GST)');
    expect(currencyOptions('AED').find((o) => o.value === 'USD')).toEqual({ value: 'USD', label: 'US Dollar (USD)' });
  });

  it('Arabic shows Arabic names with the code, and the zone id after the localized zone name', () => {
    setUiLanguage('ar');
    expect(currencyName('AED')).toMatch(/[؀-ۿ]/);
    expect(currencyOptions().every((o) => o.label.endsWith(`(${o.value})`))).toBe(true);
    const label = timezoneLabel('Asia/Dubai');
    expect(label).toMatch(/[؀-ۿ]/);
    expect(label).toContain('(Asia/Dubai)');
    expect(timezoneOptions('Asia/Dubai').find((o) => o.value === 'Asia/Dubai')?.label).toBe(label);
  });

  it('an unknown code or zone falls back to itself', () => {
    setUiLanguage('ar');
    expect(timezoneLabel('Not/AZone')).toBe('Not/AZone');
    expect(currencyName('ZZZ')).toBeTruthy();
  });
});
