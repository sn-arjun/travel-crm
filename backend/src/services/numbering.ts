/**
 * Invoice Numbering Service
 * Generates auto-increment invoice numbers with financial year support
 */

type InvoiceType = 'tax_invoice' | 'proforma' | 'receipt' | 'credit_note' | 'debit_note';

interface NumberingResult {
  invoiceNumber: string;
  lastNumber: number;
}

/**
 * Get the current financial year (for Indian fiscal year)
 * April 1 - March 31
 */
export function getCurrentFinancialYear(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // If before April, FY is previous year - current year
  // Otherwise FY is current year - next year
  if (month < 3) {
    // Jan, Feb, Mar -> FY 2023-24
    return `${year - 1}-${year % 100}`;
  } else {
    // Apr onwards -> FY 2024-25
    return `${year}-${(year + 1) % 100}`;
  }
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

/**
 * Generate invoice number using atomic counter in settings table
 *
 * Format examples:
 * INV-2024-0001 (tax invoice)
 * PI-2024-0001 (proforma)
 * CN-2024-0001 (credit note)
 * DN-2024-0001 (debit note)
 */
export async function generateInvoiceNumber(
  tenantDb: D1Database,
  type: InvoiceType,
  tenantSettings?: Record<string, unknown>
): Promise<NumberingResult> {
  const fy = getCurrentFinancialYear();
  const prefix = getPrefix(type);
  const settingKey = `last_${getSettingKeyForType(type)}_number_${fy}`;

  // Get current counter or start at 0
  let lastNumber = 0;
  try {
    const result = await tenantDb
      .prepare('SELECT value FROM settings WHERE key = ?1')
      .bind(settingKey)
      .first<{ value: string }>();

    if (result?.value) {
      lastNumber = parseInt(result.value, 10) || 0;
    }
  } catch (_) {
    // Key doesn't exist yet, start at 0
  }

  // Increment and format
  const nextNumber = lastNumber + 1;
  const formattedNumber = String(nextNumber).padStart(4, '0');
  const invoiceNumber = `${prefix}-${fy}-${formattedNumber}`;

  // Atomic update: insert or update setting
  try {
    await tenantDb
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
         value = ?2,
         updated_at = datetime('now')`
      )
      .bind(settingKey, String(nextNumber))
      .run();
  } catch (error) {
    console.error('Error updating invoice number counter:', error);
    throw new Error(`Failed to generate invoice number: ${error}`);
  }

  return {
    invoiceNumber,
    lastNumber: nextNumber,
  };
}

/**
 * Reset invoice number for a new financial year
 */
export async function resetInvoiceNumber(
  tenantDb: D1Database,
  type: InvoiceType
): Promise<void> {
  const fy = getCurrentFinancialYear();
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
 * Get the prefix for invoice type
 */
function getPrefix(type: InvoiceType): string {
  const prefixes: Record<InvoiceType, string> = {
    tax_invoice: 'INV',
    proforma: 'PI',
    receipt: 'RCP',
    credit_note: 'CN',
    debit_note: 'DN',
  };
  return prefixes[type] || 'INV';
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
