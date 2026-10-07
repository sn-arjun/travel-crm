/**
 * Invoice Numbering Service
 * Generates auto-increment document numbers with financial year support and tenant-configurable prefixes
 */

import { DEFAULT_TIMEZONE, getTenantTimeZone, localDateString } from '../utils/tz';

export type InvoiceType = 'tax_invoice' | 'proforma' | 'receipt' | 'credit_note' | 'debit_note';

interface NumberingResult {
  invoiceNumber: string;
  lastNumber: number;
}

export interface NumberingConfig {
  prefixes: Record<InvoiceType, string>;
  fyStartMonth: number;
  padding: number;
  includeFy: boolean;
}

const DEFAULT_PREFIXES: Record<InvoiceType, string> = {
  tax_invoice: 'INV',
  proforma: 'PI',
  receipt: 'RCP',
  credit_note: 'CN',
  debit_note: 'DN',
};

/** key inside the settings.numbering_config JSON (written by PUT /settings/numbering) for each document type */
const PREFIX_CONFIG_KEYS: Record<InvoiceType, string> = {
  tax_invoice: 'invoice_prefix',
  proforma: 'proforma_prefix',
  receipt: 'receipt_prefix',
  credit_note: 'credit_note_prefix',
  debit_note: 'debit_note_prefix',
};

/**
 * Get the current financial year label.
 * Default (Indian fiscal year) runs April 1 - March 31 -> "2026-27".
 * A tenant can start the year in another month (fyStartMonth); a January start gives a plain calendar year "2026".
 */
export function getCurrentFinancialYear(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
  fyStartMonth: number = 4,
): string {
  // the financial year rolls over at local midnight on the 1st of the start month, not at UTC midnight
  const [year, monthOneBased] = localDateString(timeZone, now).split('-').map(Number);
  const fyStartYear = monthOneBased >= fyStartMonth ? year : year - 1;
  return fyStartMonth === 1 ? String(fyStartYear) : `${fyStartYear}-${(fyStartYear + 1) % 100}`;
}

/**
 * Get the financial year from a date string
 */
export function getFinancialYearFromDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth();
  const year = date.getFullYear();

  if (month < 3) {
    return `${year - 1}-${year % 100}`;
  } else {
    return `${year}-${(year + 1) % 100}`;
  }
}

/** Keep prefixes safe inside a document number: letters, digits, dash, slash, underscore (max 16). */
function cleanPrefix(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace(/[^A-Za-z0-9/_-]/g, '').replace(/^[-/_]+|[-/_]+$/g, '').slice(0, 16);
  return cleaned || fallback;
}

/** Read the tenant's numbering settings (settings.numbering_config); anything missing falls back to the defaults. */
export async function getNumberingConfig(tenantDb: D1Database): Promise<NumberingConfig> {
  const config: NumberingConfig = { prefixes: { ...DEFAULT_PREFIXES }, fyStartMonth: 4, padding: 4, includeFy: true };
  try {
    const row = await tenantDb
      .prepare(`SELECT value FROM settings WHERE key = 'numbering_config'`)
      .first<{ value: string }>();
    if (!row?.value) return config;
    const raw = JSON.parse(row.value) as Record<string, unknown>;
    for (const type of Object.keys(DEFAULT_PREFIXES) as InvoiceType[]) {
      config.prefixes[type] = cleanPrefix(raw[PREFIX_CONFIG_KEYS[type]], DEFAULT_PREFIXES[type]);
    }
    const start = Number(raw.fy_start_month);
    if (Number.isInteger(start) && start >= 1 && start <= 12) config.fyStartMonth = start;
    const padding = Number(raw.padding);
    if (Number.isInteger(padding) && padding >= 1 && padding <= 10) config.padding = padding;
    if (raw.include_fy === false || raw.include_fy === 'false') config.includeFy = false;
  } catch {
    // missing / malformed config -> defaults
  }
  return config;
}

/**
 * Generate a document number using an atomic per-type, per-financial-year counter in the settings table.
 *
 * Default format (no numbering settings): INV-2026-27-0001 / PI- / CN- / DN- / RCP-.
 * With settings: <prefix>-<fy>-<seq padded>, e.g. SH-INV-2026-27-0001.
 * The counter does not depend on the prefix, so changing the prefix continues the sequence.
 */
export async function generateInvoiceNumber(
  tenantDb: D1Database,
  type: InvoiceType,
  _tenantSettings?: Record<string, unknown>
): Promise<NumberingResult> {
  const config = await getNumberingConfig(tenantDb);
  const fy = getCurrentFinancialYear(await getTenantTimeZone(tenantDb), new Date(), config.fyStartMonth);
  const prefix = config.prefixes[type] || getPrefix(type);
  const settingKey = `last_${getSettingKeyForType(type)}_number_${fy}`;

  // another document type configured with the same prefix could already own a number - skip past it
  for (let attempt = 0; attempt < 100; attempt++) {
    let nextNumber: number;
    try {
      // atomic increment: concurrent callers each receive a distinct value
      const row = await tenantDb
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?1, '1', datetime('now'))
           ON CONFLICT(key) DO UPDATE SET
             value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT),
             updated_at = datetime('now')
           RETURNING value`
        )
        .bind(settingKey)
        .first<{ value: string }>();
      nextNumber = parseInt(row?.value ?? '1', 10) || 1;
    } catch (error) {
      console.error('Error updating invoice number counter:', error);
      throw new Error(`Failed to generate invoice number: ${error}`);
    }

    const seq = String(nextNumber).padStart(config.padding, '0');
    const invoiceNumber = config.includeFy ? `${prefix}-${fy}-${seq}` : `${prefix}-${seq}`;

    const clash = await tenantDb
      .prepare('SELECT 1 AS x FROM invoices WHERE invoice_number = ?1 LIMIT 1')
      .bind(invoiceNumber)
      .first();
    if (!clash) return { invoiceNumber, lastNumber: nextNumber };
  }
  throw new Error('Failed to generate a unique invoice number');
}

/**
 * Reset invoice number for a new financial year
 */
export async function resetInvoiceNumber(
  tenantDb: D1Database,
  type: InvoiceType
): Promise<void> {
  const config = await getNumberingConfig(tenantDb);
  const fy = getCurrentFinancialYear(await getTenantTimeZone(tenantDb), new Date(), config.fyStartMonth);
  const settingKey = `last_${getSettingKeyForType(type)}_number_${fy}`;

  try {
    await tenantDb
      .prepare('DELETE FROM settings WHERE key = ?1')
      .bind(settingKey)
      .run();
  } catch (error) {
    console.error('Error resetting invoice number:', error);
    throw new Error(`Failed to reset invoice number: ${error}`);
  }
}

/**
 * Get the default prefix for invoice type
 */
function getPrefix(type: InvoiceType): string {
  return DEFAULT_PREFIXES[type] || 'INV';
}

/**
 * Get the settings key for tracking invoice type
 */
function getSettingKeyForType(type: InvoiceType): string {
  const keys: Record<InvoiceType, string> = {
    tax_invoice: 'invoice',
    proforma: 'proforma',
    receipt: 'receipt',
    credit_note: 'credit_note',
    debit_note: 'debit_note',
  };
  return keys[type] || 'invoice';
}
