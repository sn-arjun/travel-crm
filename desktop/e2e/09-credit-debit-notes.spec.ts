import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedInvoice, api } from './helpers/api-seed';

async function seedCreditNote(invoiceId: string, overrides: Record<string, any> = {}) {
  const data = {
    invoiceId,
    reason: 'E2E test credit note',
    items: [{ description: 'Test refund', quantity: 1, rate: 1000 }],
    ...overrides,
  };
  const res = await api('POST', '/credit-notes', data);
  return res.data ?? res;
}

async function seedDebitNote(invoiceId: string, overrides: Record<string, any> = {}) {
  const data = {
    invoiceId,
    reason: 'E2E test debit note',
    items: [{ description: 'Additional charge', quantity: 1, rate: 500 }],
    ...overrides,
  };
  const res = await api('POST', '/debit-notes', data);
  return res.data ?? res;
}

test.describe('Credit Notes', () => {
  test('should create credit note via API', async () => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    const cn = await seedCreditNote(invoice.id);
    expect(cn).toBeTruthy();
    expect(cn.id || cn.invoiceNumber).toBeTruthy();
  });

  test('should list credit notes via API', async () => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    await seedCreditNote(invoice.id);

    const res = await api('GET', '/credit-notes');
    expect(res.data).toBeTruthy();
  });
});

test.describe('Debit Notes', () => {
  test('should create debit note via API', async () => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    const dn = await seedDebitNote(invoice.id);
    expect(dn).toBeTruthy();
    expect(dn.id || dn.invoiceNumber).toBeTruthy();
  });

  test('should list debit notes via API', async () => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    await seedDebitNote(invoice.id);

    const res = await api('GET', '/debit-notes');
    expect(res.data).toBeTruthy();
  });
});
