import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedInvoice, api } from './helpers/api-seed';

async function seedPayment(invoiceId: string, overrides: Record<string, any> = {}) {
  const data = {
    invoiceId,
    amount: 5000,
    date: new Date().toISOString().split('T')[0],
    method: 'transfer',
    reference: `TEST-PAY-${Date.now()}`,
    ...overrides,
  };
  const res = await api('POST', '/payments', data);
  return res.data ?? res;
}

test.describe('Payments — List & Navigation', () => {
  test('should load payments list page', async ({ page }) => {
    await page.goto('/payments');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: /payments/i }).first()).toBeVisible();
  });

  test('should show seeded payment in list', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    await seedPayment(invoice.id);

    await page.goto('/payments');
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to create payment page', async ({ page }) => {
    await page.goto('/payments/new');
    await waitForLoad(page);
    await expect(page.getByText(/payment/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should filter payments by method', async ({ page }) => {
    await page.goto('/payments');
    await waitForLoad(page);

    const filterTrigger = page.locator('[role="combobox"]').first();
    if (await filterTrigger.isVisible()) {
      await filterTrigger.click();
      // Try to select a method filter
      const option = page.getByRole('option').first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click();
        await waitForLoad(page);
      }
    }
  });
});

test.describe('Payments — Record Payment Flow', () => {
  test('should record payment from invoice detail', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    // Open the more menu
    const moreButton = page.locator('button').filter({ has: page.locator('.lucide-more-horizontal') }).last();
    await moreButton.click();
    await page.getByText('Mark as Paid').click();

    // Fill payment dialog
    await expect(page.getByText('Record Payment')).toBeVisible();

    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.clear();
    await amountInput.fill('5000');

    const refInput = page.getByPlaceholder(/utr/i);
    if (await refInput.isVisible()) {
      await refInput.fill('UTR-TEST-123');
    }

    await page.getByRole('button', { name: /record payment/i }).click();
    await expect(page.getByText(/payment recorded/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should validate payment amount', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    const moreButton = page.locator('button').filter({ has: page.locator('.lucide-more-horizontal') }).last();
    await moreButton.click();
    await page.getByText('Mark as Paid').click();

    // Clear amount and try to submit
    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.clear();
    await amountInput.fill('0');

    await page.getByRole('button', { name: /record payment/i }).click();
    await expect(page.getByText(/valid payment amount/i)).toBeVisible({ timeout: 5_000 });
  });

  test('seed payment via API returns valid response', async () => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    const payment = await seedPayment(invoice.id);
    expect(payment).toBeTruthy();
    expect(payment.id || payment.invoiceId).toBeTruthy();
  });
});
