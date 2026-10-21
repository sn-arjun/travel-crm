import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import {
  bankFieldsFor,
  bankPrintLines,
  formatIban,
  isValidBic,
  isValidIban,
  isValidRoutingNumber,
  isValidSixDigitCode,
  normalizeBankDetails,
  validateBankDetails,
} from '../src/utils/bank-details';

// R140-B6: bank details shaped by the agency's country.

describe('field sets per country (design 4.4)', () => {
  it('India: IFSC and UPI', () => {
    expect(bankFieldsFor('IN')).toEqual(['accountName', 'accountNumber', 'ifsc', 'bankName', 'branch', 'upiId']);
  });
  it('United Kingdom: sort code, account number, IBAN, BIC', () => {
    expect(bankFieldsFor('GB')).toEqual(['accountName', 'sortCode', 'accountNumber', 'iban', 'bic']);
  });
  it('EU, EEA and Switzerland: IBAN, BIC, bank; no IFSC or UPI', () => {
    for (const c of ['NL', 'DE', 'FR', 'IE', 'NO', 'CH']) {
      expect(bankFieldsFor(c)).toEqual(['accountName', 'iban', 'bic', 'bankName']);
    }
  });
  it('United States: routing number, account number, SWIFT', () => {
    expect(bankFieldsFor('US')).toEqual(['accountName', 'routingNumber', 'accountNumber', 'swift']);
  });
  it('Australia: BSB and account number', () => {
    expect(bankFieldsFor('AU')).toEqual(['accountName', 'bsb', 'accountNumber']);
  });
  it('Gulf: IBAN and SWIFT', () => {
    for (const c of ['AE', 'SA', 'QA']) expect(bankFieldsFor(c)).toEqual(['accountName', 'iban', 'swift']);
  });
  it('anywhere else: IBAN or account number, SWIFT', () => {
    expect(bankFieldsFor('BR')).toEqual(['accountName', 'iban', 'accountNumber', 'swift']);
    expect(bankFieldsFor('')).toEqual(['accountName', 'iban', 'accountNumber', 'swift']);
    expect(bankFieldsFor(null)).toEqual(['accountName', 'iban', 'accountNumber', 'swift']);
  });
  it('IFSC and UPI appear for India only', () => {
    for (const c of ['NL', 'GB', 'US', 'AU', 'AE', 'BR', '']) {
      expect(bankFieldsFor(c)).not.toContain('ifsc');
      expect(bankFieldsFor(c)).not.toContain('upiId');
    }
  });
});

describe('validators', () => {
  it('IBAN mod-97: valid NL, DE, GB (spaces and case allowed)', () => {
    expect(isValidIban('NL91ABNA0417164300')).toBe(true);
    expect(isValidIban('NL91 ABNA 0417 1643 00')).toBe(true);
    expect(isValidIban('nl91abna0417164300')).toBe(true);
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('GB29 NWBK 6016 1331 9268 19')).toBe(true);
  });
  it('IBAN mod-97: a wrong digit, a short value and a non-IBAN are rejected', () => {
    expect(isValidIban('NL91ABNA0417164301')).toBe(false);
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidIban('GB29NWBK60161331926818')).toBe(false);
    expect(isValidIban('NL91')).toBe(false);
    expect(isValidIban('1234567890')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });
  it('groups an IBAN in fours', () => {
    expect(formatIban('NL91ABNA0417164300')).toBe('NL91 ABNA 0417 1643 00');
    expect(formatIban('nl91 abna 0417 1643 00')).toBe('NL91 ABNA 0417 1643 00');
  });
  it('BIC or SWIFT: 8 or 11 characters', () => {
    expect(isValidBic('ABNANL2A')).toBe(true);
    expect(isValidBic('ABNANL2AXXX')).toBe(true);
    expect(isValidBic('abnanl2a')).toBe(true);
    expect(isValidBic('ABNANL2')).toBe(false);
    expect(isValidBic('ABNANL2AX')).toBe(false);
    expect(isValidBic('1234NL2A')).toBe(false);
  });
  it('UK sort code and AU BSB: 6 digits', () => {
    expect(isValidSixDigitCode('60-16-13')).toBe(true);
    expect(isValidSixDigitCode('601613')).toBe(true);
    expect(isValidSixDigitCode('062-000')).toBe(true);
    expect(isValidSixDigitCode('60161')).toBe(false);
    expect(isValidSixDigitCode('60-16-1A')).toBe(false);
  });
  it('US routing number: 9 digits with the ABA checksum', () => {
    expect(isValidRoutingNumber('021000021')).toBe(true);
    expect(isValidRoutingNumber('011401533')).toBe(true);
    expect(isValidRoutingNumber('021000022')).toBe(false);
    expect(isValidRoutingNumber('02100002')).toBe(false);
  });
});

describe('stored shape', () => {
  it('reads the old keys: accountHolderName, ifsc and the separate upi_id', () => {
    expect(normalizeBankDetails({ bankName: 'State Bank', accountNumber: '123', ifsc: 'sbin0001234', accountHolderName: 'Acme Travels', branch: '' }, 'acme@upi')).toEqual({
      bankName: 'State Bank',
      accountNumber: '123',
      ifsc: 'SBIN0001234',
      accountName: 'Acme Travels',
      upiId: 'acme@upi',
    });
  });
  it('keeps the new keys and stores the IBAN compact', () => {
    expect(normalizeBankDetails({ accountName: 'Reisbureau BV', iban: 'nl91 abna 0417 1643 00', bic: 'abnanl2a' })).toEqual({
      accountName: 'Reisbureau BV',
      iban: 'NL91ABNA0417164300',
      bic: 'ABNANL2A',
    });
  });
  it('validates only the fields of the country', () => {
    expect(validateBankDetails('NL', { iban: 'NL91ABNA0417164301' })).toMatch(/IBAN/);
    expect(validateBankDetails('NL', { iban: 'NL91ABNA0417164300', bic: 'ABNANL2' })).toMatch(/BIC/);
    expect(validateBankDetails('GB', { sortCode: '12-34' })).toMatch(/Sort code/);
    expect(validateBankDetails('AU', { bsb: '12' })).toMatch(/BSB/);
    expect(validateBankDetails('US', { routingNumber: '123456789' })).toMatch(/Routing/);
    expect(validateBankDetails('AE', { swift: 'XX' })).toMatch(/SWIFT/);
    // an IBAN is not checked for an Indian agency (the field is not part of its set), IFSC is accepted
    expect(validateBankDetails('IN', { iban: 'garbage', ifsc: 'SBIN0001234' })).toBeNull();
    expect(validateBankDetails('NL', { accountName: 'x' })).toBeNull();
  });
  it('prints only the filled fields of the country, IBAN grouped in fours', () => {
    const lines = bankPrintLines('NL', { accountName: 'Reisbureau BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', ifsc: 'SBIN0001234', upiId: 'x@upi' });
    expect(lines).toEqual([
      { field: 'accountName', label: 'Account name', value: 'Reisbureau BV' },
      { field: 'iban', label: 'IBAN', value: 'NL91 ABNA 0417 1643 00' },
      { field: 'bic', label: 'BIC', value: 'ABNANL2A' },
    ]);
  });
});

// ── Routes ───────────────────────────────────────────────────

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const LOCALE_KEYS = ['country', 'company_country', 'currency', 'locale', 'tax_system', 'bank_details', 'upi_id', 'vat_rate', 'default_tax_type', 'default_tax_rate'];

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function setAgency(values: Record<string, string>): Promise<void> {
  await testEnv.MASTER_DB.prepare(`DELETE FROM settings WHERE key IN (${LOCALE_KEYS.map(() => '?').join(',')})`).bind(...LOCALE_KEYS).run();
  for (const [k, v] of Object.entries(values)) {
    await testEnv.MASTER_DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(k, v, new Date().toISOString()).run();
  }
}

describe('R140-B6 invoice defaults and invoices', () => {
  let admin = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
  });

  it('a Dutch agency: an invalid IBAN is rejected, a valid IBAN and BIC are saved and read back', async () => {
    await setAgency({ country: 'NL', currency: 'EUR', locale: 'nl-NL', tax_system: 'vat', vat_rate: '21' });
    const bad = await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { accountName: 'Reisbureau BV', iban: 'NL91ABNA0417164301', bic: 'ABNANL2A' } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error?.message ?? '').toMatch(/IBAN/);

    const badBic = await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { iban: 'NL91ABNA0417164300', bic: 'ABN' } });
    expect(badBic.status).toBe(400);

    const ok = await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { accountName: 'Reisbureau BV', iban: 'NL91 ABNA 0417 1643 00', bic: 'abnanl2a', bankName: 'ABN AMRO' } });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const got = ((await (await call('GET', '/settings/invoice-defaults', admin)).json()) as any).data;
    expect(got.bank_details).toEqual({ accountName: 'Reisbureau BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', bankName: 'ABN AMRO' });
  });

  it('an Indian agency: IFSC is accepted, upi_id is kept and read', async () => {
    await setAgency({ country: 'IN', currency: 'INR', locale: 'en-IN' });
    const ok = await call('PUT', '/settings/invoice-defaults', admin, {
      bank_details: { accountName: 'Acme Travels', accountNumber: '1234567890', ifsc: 'SBIN0001234', bankName: 'State Bank of India', upiId: 'acme@upi' },
    });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const got = ((await (await call('GET', '/settings/invoice-defaults', admin)).json()) as any).data;
    expect(got.bank_details).toMatchObject({ ifsc: 'SBIN0001234', upiId: 'acme@upi', accountName: 'Acme Travels' });
    expect(got.upi_id).toBe('acme@upi');
  });

  it('old keys still read: accountHolderName, ifsc and a separate upi_id', async () => {
    await setAgency({ country: 'IN', bank_details: JSON.stringify({ bankName: 'HDFC', accountNumber: '99', ifsc: 'HDFC0000001', accountHolderName: 'Old Travels' }), upi_id: 'old@upi' });
    const got = ((await (await call('GET', '/settings/invoice-defaults', admin)).json()) as any).data;
    expect(got.bank_details).toEqual({ bankName: 'HDFC', accountNumber: '99', ifsc: 'HDFC0000001', accountName: 'Old Travels', upiId: 'old@upi' });
  });

  it('a UK agency validates its sort code', async () => {
    await setAgency({ country: 'GB', currency: 'GBP', locale: 'en-GB' });
    const bad = await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { sortCode: '12-34', accountNumber: '12345678' } });
    expect(bad.status).toBe(400);
    const ok = await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { sortCode: '60-16-13', accountNumber: '31926819' } });
    expect(ok.status).toBe(200);
  });

  it('an invoice keeps the agency bank details it was issued with, and reads them back with the country', async () => {
    await setAgency({ country: 'NL', currency: 'EUR', locale: 'nl-NL', tax_system: 'vat', vat_rate: '21' });
    expect(
      (await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { accountName: 'Reisbureau BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A' } })).status,
    ).toBe(200);
    const contact = await call('POST', '/contacts', admin, { name: 'Bank Buyer', phone: '9000009001', type: 'customer' });
    const contactId = ((await contact.json()) as any).data.id;
    const created = await call('POST', '/invoices', admin, { contactId, items: [{ description: 'Tour', quantity: 1, rate: 1000 }] });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as any).data.id;
    const stored = (await testEnv.MASTER_DB.prepare('SELECT bank_details FROM invoices WHERE id = ?').bind(id).first()) as any;
    expect(JSON.parse(stored.bank_details)).toEqual({ accountName: 'Reisbureau BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A' });

    // later changes to the agency's details do not rewrite an issued invoice
    await call('PUT', '/settings/invoice-defaults', admin, { bank_details: { accountName: 'Other BV', iban: 'DE89370400440532013000', bic: 'COBADEFF' } });
    const detail = ((await (await call('GET', `/invoices/${id}`, admin)).json()) as any).data;
    expect(JSON.parse(detail.bank_details).iban).toBe('NL91ABNA0417164300');
    expect(detail.bank_country).toBe('NL');
  });
});
