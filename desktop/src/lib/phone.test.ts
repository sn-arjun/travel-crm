import { afterEach, describe, expect, it } from 'vitest';
import { COUNTRIES, countryByDial, countryByIso, flagOf, toE164 as toE164For } from './countries';
import { setLocaleContext } from './locale';
import { defaultCountryCode, formatPhone, joinPhone, phonePlaceholder, splitPhone, toE164 } from './phone';

// test-setup.ts sets an Indian agency (phoneDefaultCountry IN); tests that change it put it back
afterEach(() => setLocaleContext({ phoneDefaultCountry: 'IN' }));

describe('splitPhone', () => {
  it('splits E.164', () => {
    expect(splitPhone('+919820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
    expect(splitPhone('+971501234567')).toEqual({ countryCode: '+971', national: '501234567' });
  });
  it('splits E.164 of countries the old 30-code list did not have', () => {
    expect(splitPhone('+3538712345678')).toEqual({ countryCode: '+353', national: '8712345678' });
    expect(splitPhone('+16845551234')).toEqual({ countryCode: '+1684', national: '5551234' });
    expect(splitPhone('+4915112345678')).toEqual({ countryCode: '+49', national: '15112345678' });
  });
  it('reads legacy digit-only values as Indian', () => {
    expect(splitPhone('9820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
    expect(splitPhone('09820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
    expect(splitPhone('919820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
  });
  it('handles empty', () => {
    expect(splitPhone(null)).toEqual({ countryCode: '+91', national: '' });
  });
  it('reads digit-only values as numbers of the agency country', () => {
    setLocaleContext({ phoneDefaultCountry: 'GB' });
    expect(splitPhone('07911 123456')).toEqual({ countryCode: '+44', national: '7911123456' });
    expect(splitPhone('')).toEqual({ countryCode: '+44', national: '' });
    setLocaleContext({ phoneDefaultCountry: 'AE' });
    expect(splitPhone('050 123 4567')).toEqual({ countryCode: '+971', national: '501234567' });
    setLocaleContext({ phoneDefaultCountry: 'US' });
    expect(splitPhone('(415) 555-0132')).toEqual({ countryCode: '+1', national: '4155550132' });
    setLocaleContext({ phoneDefaultCountry: 'SG' });
    expect(splitPhone('9123 4567')).toEqual({ countryCode: '+65', national: '91234567' });
  });
  it('keeps an explicit country code whatever the agency country', () => {
    setLocaleContext({ phoneDefaultCountry: 'GB' });
    expect(splitPhone('+919820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
  });
  it('falls back to the agency code for short junk instead of guessing another country', () => {
    expect(splitPhone('98201')).toEqual({ countryCode: '+91', national: '98201' });
  });
});

describe('joinPhone', () => {
  it('builds E.164 and drops the trunk zero', () => {
    expect(joinPhone('+91', '98201 44562')).toBe('+919820144562');
    expect(joinPhone('+44', '07911 123456')).toBe('+447911123456');
    expect(joinPhone('+971', '050 123 4567')).toBe('+971501234567');
    expect(joinPhone('+91', '')).toBe('');
  });
  it('keeps the leading zero for Italy', () => {
    expect(joinPhone('+39', '06 6982 1234')).toBe('+390669821234');
  });
});

describe('toE164', () => {
  it('normalises legacy and E.164 values', () => {
    expect(toE164('9820144562')).toBe('+919820144562');
    expect(toE164('+919820144562')).toBe('+919820144562');
    expect(toE164('')).toBe('');
  });
  it('reads a typed number in the agency country', () => {
    setLocaleContext({ phoneDefaultCountry: 'GB' });
    expect(toE164('07911 123456')).toBe('+447911123456');
    setLocaleContext({ phoneDefaultCountry: 'AE' });
    expect(toE164('0501234567')).toBe('+971501234567');
  });
});

describe('formatPhone', () => {
  it('groups Indian numbers', () => {
    expect(formatPhone('+919820144562')).toBe('+91 98201 44562');
    expect(formatPhone('9820144562')).toBe('+91 98201 44562');
  });
  it('groups UK, UAE, US and Singapore numbers', () => {
    expect(formatPhone('+447911123456')).toBe('+44 7911 123456');
    expect(formatPhone('+971501234567')).toBe('+971 50 123 4567');
    expect(formatPhone('+14155550132')).toBe('+1 415 555 0132');
    expect(formatPhone('+6591234567')).toBe('+65 9123 4567');
  });
  it('keeps other countries readable', () => {
    expect(formatPhone('+3538712345678')).toBe('+353 8712345678');
    expect(formatPhone('')).toBe('');
  });
});

describe('country table', () => {
  it('lists every country the old picker had and many more', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    for (const iso of ['IN', 'US', 'GB', 'AE', 'SA', 'SG', 'TH', 'MY', 'AU', 'DE', 'FR', 'CN', 'JP', 'KR', 'RU', 'BR', 'ZA', 'NG', 'KE', 'ID', 'PH', 'VN', 'ES', 'IT', 'TR', 'EG', 'LK', 'NP', 'BD', 'PK']) {
      expect(countryByIso(iso)).toBeDefined();
    }
    expect(countryByIso('IE')?.dial).toBe('353');
    expect(countryByDial('+971')?.iso).toBe('AE');
  });
  it('builds flags and examples', () => {
    expect(flagOf('IN')).toBe('\u{1F1EE}\u{1F1F3}');
    expect(flagOf('xx1')).toBe('');
    expect(phonePlaceholder(countryByIso('IN'))).toBe('XXXXX XXXXX');
    expect(phonePlaceholder(countryByIso('SG'))).not.toBe('');
  });
  it('shares the normalisation rules with the backend', () => {
    expect(toE164For('07911 123456', 'GB')).toBe('+447911123456');
    expect(toE164For('050 123 4567', 'AE')).toBe('+971501234567');
    expect(toE164For('(415) 555-0132', 'US')).toBe('+14155550132');
    expect(toE164For('9123 4567', 'SG')).toBe('+6591234567');
    expect(toE164For('9876543210')).toBe('+919876543210');
  });
  it('defaults the picker to the agency country', () => {
    expect(defaultCountryCode()).toBe('+91');
    setLocaleContext({ phoneDefaultCountry: 'AE' });
    expect(defaultCountryCode()).toBe('+971');
    setLocaleContext({ phoneDefaultCountry: '' });
    expect(defaultCountryCode()).toBe('+91');
  });
});
