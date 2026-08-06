import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCurrentFinancialYear, getFinancialYearFromDate } from '../../src/services/numbering';

describe('getCurrentFinancialYear', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return current-next year format for April onwards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-04-15'));

    const result = getCurrentFinancialYear();
    expect(result).toBe('2025-26');
  });

  it('should return previous-current year format for January', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));

    const result = getCurrentFinancialYear();
    expect(result).toBe('2024-25');
  });

  it('should return previous-current year format for February', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-15'));

    const result = getCurrentFinancialYear();
    expect(result).toBe('2024-25');
  });

  it('should return previous-current year format for March', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-31'));

    const result = getCurrentFinancialYear();
    expect(result).toBe('2024-25');
  });

  it('should handle April 1 (start of new FY)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-04-01'));

    const result = getCurrentFinancialYear();
    expect(result).toBe('2025-26');
  });

  it('should handle December 31 (end of calendar year)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-31'));

    const result = getCurrentFinancialYear();
    expect(result).toBe('2025-26');
  });

  it('should handle century boundary (year 2100)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2100-06-15'));

    const result = getCurrentFinancialYear();
    // 2100 % 100 = 0, next year = 2101 % 100 = 1 (no zero padding)
    expect(result).toBe('2100-1');
  });

  it('should handle year 2099 in January', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-15'));

    // Jan 2099 = FY 2098-99
    const result = getCurrentFinancialYear();
    expect(result).toBe('2098-99');
  });
});

describe('getFinancialYearFromDate', () => {
  it('should return correct FY for April date', () => {
    expect(getFinancialYearFromDate('2025-04-15')).toBe('2025-26');
  });

  it('should return correct FY for January date', () => {
    expect(getFinancialYearFromDate('2025-01-15')).toBe('2024-25');
  });

  it('should return correct FY for March date', () => {
    expect(getFinancialYearFromDate('2025-03-31')).toBe('2024-25');
  });

  it('should return correct FY for December date', () => {
    expect(getFinancialYearFromDate('2025-12-25')).toBe('2025-26');
  });

  it('should handle ISO date strings', () => {
    expect(getFinancialYearFromDate('2025-06-15T10:30:00Z')).toBe('2025-26');
  });

  it('should handle April 1 (start of new FY)', () => {
    expect(getFinancialYearFromDate('2025-04-01')).toBe('2025-26');
  });

  it('should handle March 31 (end of FY)', () => {
    expect(getFinancialYearFromDate('2025-03-31')).toBe('2024-25');
  });

  it('should match getCurrentFinancialYear for the same date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const current = getCurrentFinancialYear();
    const fromDate = getFinancialYearFromDate('2025-06-15');

    expect(current).toBe(fromDate);

    vi.useRealTimers();
  });
});
