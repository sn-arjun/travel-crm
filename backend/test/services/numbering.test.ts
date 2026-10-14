import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { getCurrentFinancialYear, getFinancialYearFromDate, generateInvoiceNumber } from '../../src/services/numbering';

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

describe('generateInvoiceNumber and the yearly reset', () => {
  const db = (env as any).MASTER_DB as D1Database;

  beforeAll(async () => {
    await applyD1Migrations(db, (env as any).TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    await db.prepare("DELETE FROM settings WHERE key LIKE 'last_invoice_number%' OR key = 'numbering_config'").run();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.prepare("DELETE FROM settings WHERE key LIKE 'last_invoice_number%' OR key = 'numbering_config'").run();
  });

  async function configure(cfg: Record<string, unknown>) {
    await db.prepare("INSERT INTO settings (key, value) VALUES ('numbering_config', ?1)").bind(JSON.stringify(cfg)).run();
  }

  async function numberOn(date: string): Promise<string> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(date));
    const { invoiceNumber } = await generateInvoiceNumber(db, 'tax_invoice');
    vi.useRealTimers();
    return invoiceNumber;
  }

  it('with reset_yearly true and an April start, the first number of FY 2026-27 is 0001', async () => {
    await configure({ reset_yearly: true, fy_start_month: 4 });
    expect(await numberOn('2026-03-30T10:00:00Z')).toBe('INV-2025-26-0001');
    expect(await numberOn('2026-03-31T10:00:00Z')).toBe('INV-2025-26-0002');
    expect(await numberOn('2026-04-02T10:00:00Z')).toBe('INV-2026-27-0001');
  });

  it('with reset_yearly false the sequence continues into the new financial year', async () => {
    await configure({ reset_yearly: false, fy_start_month: 4 });
    expect(await numberOn('2026-03-30T10:00:00Z')).toBe('INV-2025-26-0001');
    expect(await numberOn('2026-03-31T10:00:00Z')).toBe('INV-2025-26-0002');
    expect(await numberOn('2026-04-02T10:00:00Z')).toBe('INV-2026-27-0003');
  });

  it('switching reset_yearly off mid-year carries on from the counter already in use', async () => {
    await configure({ reset_yearly: true });
    expect(await numberOn('2026-05-01T10:00:00Z')).toBe('INV-2026-27-0001');
    expect(await numberOn('2026-05-02T10:00:00Z')).toBe('INV-2026-27-0002');
    await db.prepare("UPDATE settings SET value = ?1 WHERE key = 'numbering_config'").bind(JSON.stringify({ reset_yearly: false })).run();
    expect(await numberOn('2026-05-03T10:00:00Z')).toBe('INV-2026-27-0003');
  });
});
