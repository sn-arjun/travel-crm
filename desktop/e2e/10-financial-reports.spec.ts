import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedInvoice, api } from './helpers/api-seed';

test.describe('Financial Reports', () => {
  test('should load financial reports page', async ({ page }) => {
    await page.goto('/reports/financial');
    await waitForLoad(page);
    await expect(page.getByText(/financial|reports/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should fetch outstanding data via API', async () => {
    // Seed some data first
    const contact = await seedContact();
    await seedInvoice(contact.id);

    const res = await api('GET', '/reports/outstanding');
    expect(res.data).toBeTruthy();
  });

  test('should fetch ageing data via API', async () => {
    const contact = await seedContact();
    await seedInvoice(contact.id);

    const res = await api('GET', '/reports/ageing');
    expect(res.data).toBeTruthy();
  });

  test('should fetch invoice summary via API', async () => {
    const res = await api('GET', '/invoices/summary');
    expect(res.data).toBeTruthy();
  });

  test('should fetch dashboard with financial stats via API', async () => {
    const res = await api('GET', '/reports/dashboard');
    expect(res.data).toBeTruthy();
  });
});

test.describe('HSN Codes', () => {
  test('should list pre-loaded HSN/SAC codes', async () => {
    const res = await api('GET', '/hsn-codes');
    expect(res.data).toBeTruthy();
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('should search HSN codes', async () => {
    const res = await api('GET', '/hsn-codes?search=travel');
    expect(res.data).toBeTruthy();
  });

  test('should create custom HSN code', async () => {
    const res = await api('POST', '/hsn-codes', {
      code: `E2E${Date.now()}`,
      description: 'E2E test HSN code',
      category: 'test',
    });
    expect(res.data).toBeTruthy();
  });
});

test.describe('Invoice Settings', () => {
  test('should fetch invoice defaults', async () => {
    const res = await api('GET', '/settings/invoice-defaults');
    expect(res.data).toBeTruthy();
  });

  test('should fetch numbering config', async () => {
    const res = await api('GET', '/settings/numbering');
    expect(res.data).toBeTruthy();
  });

  test('should update numbering config', async () => {
    const res = await api('PUT', '/settings/numbering', {
      invoice_prefix: 'INV',
      fy_start_month: 4,
      reset_yearly: true,
    });
    expect(res.data).toBeTruthy();
  });
});
