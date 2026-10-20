import { describe, expect, it } from 'vitest';
import {
  formatCalendarDay,
  formatExactCurrency,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleNumber,
  formatLocaleTime,
  formatPdfMoney,
  formatTightCurrency,
  formatWholeCurrency,
} from './format';
import { currencyCodes, currencyLabel, currencyOptions, currencySymbol, timezoneOptions } from './locale-options';
import { setLocaleContext } from './locale';

const uk = () => setLocaleContext({ currency: 'GBP', locale: 'en-GB', timeZone: 'Europe/London', country: 'GB', phoneDefaultCountry: 'GB' });
const us = () => setLocaleContext({ currency: 'USD', locale: 'en-US', timeZone: 'America/New_York', country: 'US', phoneDefaultCountry: 'US' });

describe('formatLocaleNumber', () => {
  it('uses lakh grouping only for an en-IN agency', () => {
    expect(formatLocaleNumber(1234567)).toBe('12,34,567'); // test-setup agency is en-IN
    uk();
    expect(formatLocaleNumber(1234567)).toBe('1,234,567');
  });

  it('treats missing and non-finite values as zero', () => {
    expect(formatLocaleNumber(null)).toBe('0');
    expect(formatLocaleNumber(Number.NaN)).toBe('0');
  });
});

describe('money', () => {
  it('formatExactCurrency keeps the paise and follows the agency', () => {
    expect(formatExactCurrency(1500)).toBe('₹1,500.00');
    uk();
    expect(formatExactCurrency(1500)).toBe('£1,500.00');
  });

  it('a document currency wins over the agency default', () => {
    uk();
    expect(formatExactCurrency(1500, 'USD', 'en-US')).toBe('$1,500.00');
    expect(formatWholeCurrency(1500.4, 'EUR', 'de-DE')).toContain('1.500');
  });

  it('formatWholeCurrency drops decimals', () => {
    expect(formatWholeCurrency(1500.49)).toBe('₹1,500');
  });

  it('formatTightCurrency writes lakh and crore for en-IN and compact notation elsewhere', () => {
    expect(formatTightCurrency(150000)).toBe('₹1.5L');
    expect(formatTightCurrency(25000000)).toBe('₹2.5Cr');
    expect(formatTightCurrency(45000)).toBe('₹45K');
    expect(formatTightCurrency(-45000)).toBe('-₹45K');
    expect(formatTightCurrency(999)).toBe('₹999');
    uk();
    expect(formatTightCurrency(150000)).toBe('£150K');
    expect(formatTightCurrency(2500000)).toBe('£2.5M');
    expect(formatTightCurrency(150000)).not.toMatch(/L|Cr/);
  });

  it('formatPdfMoney writes a code where the PDF font has no symbol', () => {
    expect(formatPdfMoney(150000)).toBe('Rs. 1,50,000');
    uk();
    expect(formatPdfMoney(1500)).toBe('GBP 1,500');
    expect(formatPdfMoney(1500, 'USD')).toBe('USD 1,500');
  });
});

describe('dates and times', () => {
  it('formats a calendar date in the agency locale without moving the day', () => {
    uk();
    expect(formatLocaleDate('2026-10-15', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('15/10/2026');
    us();
    expect(formatLocaleDate('2026-10-15', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('10/15/2026');
  });

  it('shows a timestamp with a zone in the user zone', () => {
    uk();
    expect(formatLocaleTime('2026-07-01T12:00:00Z', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('13:00'); // BST
    us();
    expect(formatLocaleTime('2026-07-01T12:00:00Z', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('08:00'); // EDT
    setLocaleContext({ timeZone: 'Asia/Kolkata', locale: 'en-IN' });
    expect(formatLocaleTime('2026-07-01T12:00:00Z', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('17:30');
  });

  it('leaves a zone-less wall-clock time where it is', () => {
    us();
    expect(formatLocaleTime('2026-10-07 14:45', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('14:45');
  });

  it('formatLocaleDateTime combines both and handles empty input', () => {
    uk();
    expect(formatLocaleDateTime('2026-07-01T12:00:00Z', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })).toContain('13:00');
    expect(formatLocaleDateTime(null)).toBe('');
    expect(formatLocaleDate('not a date')).toBe('');
  });

  it('formatCalendarDay formats a local-parts Date as is', () => {
    uk();
    expect(formatCalendarDay(new Date(2026, 9, 15), { day: 'numeric', month: 'short', year: 'numeric' })).toBe('15 Oct 2026');
  });
});

describe('pick-lists', () => {
  it('offers the agency currency first, then a set, with a record value always present', () => {
    uk();
    const codes = currencyCodes();
    expect(codes[0]).toBe('GBP');
    expect(codes).toContain('INR');
    expect(new Set(codes).size).toBe(codes.length);
    expect(currencyCodes('XOF')).toContain('XOF');
    expect(currencyOptions('GBP')[0]).toEqual({ value: 'GBP', label: 'British Pound (GBP)' });
  });

  it('offers the agency time zone first and keeps unknown zones', () => {
    uk();
    expect(timezoneOptions()[0]).toEqual({ value: 'Europe/London', label: 'Europe/London (GMT)' });
    expect(timezoneOptions('Pacific/Fiji').some((o) => o.value === 'Pacific/Fiji')).toBe(true);
  });

  it('labels a currency with its symbol in the active locale', () => {
    uk();
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencyLabel('GBP')).toBe('GBP (£)');
    expect(currencySymbol('USD', 'en-US')).toBe('$');
  });
});
