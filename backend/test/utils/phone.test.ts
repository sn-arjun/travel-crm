import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryByIso, isPlausibleNational, significantNumber, splitE164 } from '../../src/utils/countries';
import { normalizePhone, phoneLookupVariants } from '../../src/utils/phone';
import { checkMobileNumber } from '../../src/services/metering/otp-limits';
import { findContactByPhone } from '../../src/services/call-routing';

describe('normalizePhone by the agency country', () => {
  it('UK: 07xxx becomes +447...', () => {
    expect(normalizePhone('07911 123456', 'GB')).toBe('+447911123456');
    expect(normalizePhone('7911123456', 'GB')).toBe('+447911123456');
    expect(normalizePhone('447911123456', 'GB')).toBe('+447911123456');
    expect(normalizePhone('+44 7911 123456', 'GB')).toBe('+447911123456');
  });

  it('UAE: 05x becomes +9715...', () => {
    expect(normalizePhone('050 123 4567', 'AE')).toBe('+971501234567');
    expect(normalizePhone('501234567', 'AE')).toBe('+971501234567');
    expect(normalizePhone('971501234567', 'AE')).toBe('+971501234567');
  });

  it('US: ten digits become +1...', () => {
    expect(normalizePhone('(415) 555-0132', 'US')).toBe('+14155550132');
    expect(normalizePhone('14155550132', 'US')).toBe('+14155550132');
    expect(normalizePhone('1-415-555-0132', 'US')).toBe('+14155550132');
  });

  it('Singapore: eight digits become +65...', () => {
    expect(normalizePhone('9123 4567', 'SG')).toBe('+6591234567');
    expect(normalizePhone('6591234567', 'SG')).toBe('+6591234567');
  });

  it('India is unchanged', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('09876543210', 'IN')).toBe('+919876543210');
    expect(normalizePhone('919876543210', 'IN')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('0091 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('12345678')).toBe('+12345678');
    expect(normalizePhone('')).toBe('');
  });

  it('ambiguous input follows the tenant default, an explicit + never does', () => {
    expect(normalizePhone('4155550132', 'IN')).toBe('+914155550132');
    expect(normalizePhone('4155550132', 'US')).toBe('+14155550132');
    expect(normalizePhone('+14155550132', 'IN')).toBe('+14155550132');
    expect(normalizePhone('+447911123456', 'AE')).toBe('+447911123456');
    expect(normalizePhone('00447911123456', 'IN')).toBe('+447911123456');
    expect(normalizePhone('0065 9123 4567', 'IN')).toBe('+6591234567');
  });

  it('keeps the leading zero where it belongs to the number (Italy)', () => {
    expect(normalizePhone('06 6982 1234', 'IT')).toBe('+390669821234');
  });

  it('NANP territories take seven or ten digits', () => {
    expect(normalizePhone('6845551234', 'AS')).toBe('+16845551234');
    expect(normalizePhone('5551234', 'AS')).toBe('+16845551234');
  });

  it('an unknown default country falls back to the launch market', () => {
    expect(normalizePhone('9876543210', 'ZZ')).toBe('+919876543210');
  });

});

describe('phoneLookupVariants', () => {
  it('lists e164, national number and digits for any country', () => {
    expect(phoneLookupVariants('9876543210')).toEqual(['+919876543210', '9876543210', '919876543210']);
    expect(phoneLookupVariants('07911 123456', 'GB')).toEqual(['+447911123456', '7911123456', '447911123456']);
    expect(phoneLookupVariants('050 123 4567', 'AE')).toEqual(['+971501234567', '501234567', '971501234567']);
    expect(phoneLookupVariants('')).toEqual([]);
  });
});

describe('country table', () => {
  it('covers over 200 countries with unique ISO codes and sane length ranges', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.dial).toMatch(/^[1-9]\d{0,3}$/);
      expect(c.min).toBeGreaterThan(0);
      expect(c.min).toBeLessThanOrEqual(c.max);
      expect(c.max).toBeLessThanOrEqual(17);
    }
    for (const iso of ['IN', 'GB', 'AE', 'US', 'SG', 'AU', 'DE', 'FR', 'SA', 'LK', 'NP']) expect(countryByIso(iso)).toBeDefined();
  });

  it('splits E.164 by the longest calling code', () => {
    expect(splitE164('+971501234567')).toMatchObject({ country: { iso: 'AE' }, national: '501234567' });
    expect(splitE164('+16845551234')).toMatchObject({ country: { iso: 'AS' }, national: '5551234' });
    expect(splitE164('+14155550132')).toMatchObject({ country: { iso: 'US' }, national: '4155550132' });
    expect(splitE164('+6591234567')).toMatchObject({ country: { iso: 'SG' }, national: '91234567' });
  });

  it('judges national numbers by the country length range', () => {
    expect(isPlausibleNational(countryByIso('IN')!, '98201 44562')).toBe(true);
    expect(isPlausibleNational(countryByIso('IN')!, '982014456')).toBe(false);
    expect(isPlausibleNational(countryByIso('GB')!, '07911 123456')).toBe(true);
    expect(isPlausibleNational(countryByIso('SG')!, '9123 4567')).toBe(true);
  });
});

describe('significantNumber', () => {
  it('is the national number, the same however the number was typed', () => {
    expect(significantNumber('07911 123456', 'GB')).toBe('7911123456');
    expect(significantNumber('+44 7911 123456', 'IN')).toBe('7911123456');
    expect(significantNumber('+91 98201 44562', 'GB')).toBe('9820144562');
    expect(significantNumber('09820144562', 'IN')).toBe('9820144562');
    expect(significantNumber('')).toBe('');
  });
});

describe('checkMobileNumber', () => {
  it('keeps the India rule: ten digits starting 6 to 9', () => {
    expect(checkMobileNumber('9876543210')).toEqual({ ok: true, e164: '+919876543210' });
    expect(checkMobileNumber('9876543210', 'IN')).toEqual({ ok: true, e164: '+919876543210' });
    expect(checkMobileNumber('1234567890', 'IN').ok).toBe(false);
    expect(checkMobileNumber('+911234567890').ok).toBe(false);
  });
  it('reads numbers without a country code in the agency country', () => {
    expect(checkMobileNumber('07911 123456', 'GB')).toEqual({ ok: true, e164: '+447911123456' });
    expect(checkMobileNumber('050 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
  });
});

describe('call routing matches contacts by the national number', () => {
  function fakeDb() {
    const bound: unknown[] = [];
    const db = {
      prepare: () => ({
        bind: (...args: unknown[]) => {
          bound.push(...args);
          return { first: async () => null };
        },
      }),
    } as unknown as D1Database;
    return { db, bound };
  }

  it('Indian callers still match on their ten digits', async () => {
    for (const phone of ['+91 98201 44562', '09820144562', '9820144562', '919820144562']) {
      const { db, bound } = fakeDb();
      await findContactByPhone(db, phone, 'IN');
      expect(bound).toEqual(['%9820144562']);
    }
  });

  it('UK, UAE and US callers match their own national numbers', async () => {
    const cases: Array<[string, string, string]> = [
      ['+44 7911 123456', 'IN', '%7911123456'],
      ['07911 123456', 'GB', '%7911123456'],
      ['+971 50 123 4567', 'IN', '%501234567'],
      ['050 123 4567', 'AE', '%501234567'],
      ['+1 (415) 555-0132', 'IN', '%4155550132'],
    ];
    for (const [phone, country, expected] of cases) {
      const { db, bound } = fakeDb();
      await findContactByPhone(db, phone, country);
      expect(bound).toEqual([expected]);
    }
  });
});
