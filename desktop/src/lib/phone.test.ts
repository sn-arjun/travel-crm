import { describe, expect, it } from 'vitest';
import { formatPhone, joinPhone, splitPhone, toE164 } from './phone';

describe('splitPhone', () => {
  it('splits E.164', () => {
    expect(splitPhone('+919820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
    expect(splitPhone('+971501234567')).toEqual({ countryCode: '+971', national: '501234567' });
  });
  it('reads legacy digit-only values as Indian', () => {
    expect(splitPhone('9820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
    expect(splitPhone('09820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
    expect(splitPhone('919820144562')).toEqual({ countryCode: '+91', national: '9820144562' });
  });
  it('handles empty', () => {
    expect(splitPhone(null)).toEqual({ countryCode: '+91', national: '' });
  });
});

describe('joinPhone', () => {
  it('builds E.164 and drops the trunk zero', () => {
    expect(joinPhone('+91', '98201 44562')).toBe('+919820144562');
    expect(joinPhone('+44', '07911 123456')).toBe('+447911123456');
    expect(joinPhone('+91', '')).toBe('');
  });
});

describe('toE164', () => {
  it('normalises legacy and E.164 values', () => {
    expect(toE164('9820144562')).toBe('+919820144562');
    expect(toE164('+919820144562')).toBe('+919820144562');
    expect(toE164('')).toBe('');
  });
});

describe('formatPhone', () => {
  it('groups Indian numbers', () => {
    expect(formatPhone('+919820144562')).toBe('+91 98201 44562');
    expect(formatPhone('9820144562')).toBe('+91 98201 44562');
  });
  it('keeps other countries readable', () => {
    expect(formatPhone('+971501234567')).toBe('+971 501234567');
    expect(formatPhone('')).toBe('');
  });
});
