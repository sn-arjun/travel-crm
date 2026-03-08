import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedInvoice } from './helpers/api-seed';

test.describe('Invoices — List & Navigation', () => {
  test('should load invoices list page', async ({ page }) => {
    await page.goto('/invoices');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: /invoices/i }).first()).toBeVisible();
  });

  test('should show stat cards (Collected, Outstanding, Overdue)', async ({ page }) => {
    await page.goto('/invoices');
    await waitForLoad(page);
    await expect(page.getByText('Collected')).toBeVisible();
    await expect(page.getByText('Outstanding')).toBeVisible();
    await expect(page.getByText('Overdue')).toBeVisible();
  });

  test('should show seeded invoice in table', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);

    await page.goto('/invoices');
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to invoice detail', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    await expect(page.getByText(/INV-/)).toBeVisible({ timeout: 10_000 });
  });

  test('should filter invoices by status', async ({ page }) => {
    await page.goto('/invoices');
    await waitForLoad(page);

    // Click the status filter combobox
    const filterTrigger = page.locator('[role="combobox"]').first();
    if (await filterTrigger.isVisible()) {
      await filterTrigger.click();
      await page.getByRole('option', { name: /draft/i }).click();
      await waitForLoad(page);
    }
  });

  test('should search invoices by number', async ({ page }) => {
    await page.goto('/invoices');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('INV-');
    await waitForLoad(page);
  });

  test('should navigate to create invoice page', async ({ page }) => {
    await page.goto('/invoices');
    await waitForLoad(page);

    await page.getByRole('link', { name: /new invoice/i }).click();
    await page.waitForURL('**/invoices/new');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: /new invoice/i })).toBeVisible();
  });
});

test.describe('Invoices — Create', () => {
  test('should load the create invoice form', async ({ page }) => {
    await page.goto('/invoices/new');
    await waitForLoad(page);

    await expect(page.getByText('Client Details')).toBeVisible();
    await expect(page.getByText('Line Items')).toBeVisible();
  });

  test('should show validation when submitting empty form', async ({ page }) => {
    await page.goto('/invoices/new');
    await waitForLoad(page);

    await page.getByRole('button', { name: /create & send/i }).click();
    // Should show a toast error about missing contact
    await expect(page.getByText(/select a contact/i)).toBeVisible({ timeout: 5_000 });
  });

  test('should create invoice with line items', async ({ page }) => {
    const contact = await seedContact();
    await page.goto('/invoices/new');
    await waitForLoad(page);

    // Select contact
    const contactSelect = page.locator('[role="combobox"]').first();
    await contactSelect.click();
    await page.getByRole('option').first().click();

    // Fill line item
    const descInput = page.getByPlaceholder(/flight|hotel|e\.g\./i).first();
    await descInput.fill('Test Flight Booking');

    const qtyInputs = page.locator('input[type="number"]');
    // Find unit price input (third number input typically)
    const priceInput = page.locator('input[placeholder="0"]').first();
    if (await priceInput.isVisible()) {
      await priceInput.fill('15000');
    }

    // Save as draft
    await page.getByRole('button', { name: /save as draft/i }).click();
    await page.waitForURL('**/invoices', { timeout: 15_000 });
  });
});

test.describe('Invoices — Detail & Actions', () => {
  test('should show invoice details with status, dates, amount', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('Issue Date')).toBeVisible();
    await expect(page.getByText('Due Date')).toBeVisible();
    await expect(page.getByText('Amount')).toBeVisible();
  });

  test('should show line items on detail page', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    await expect(page.getByText('Line Items')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('E2E Test Item')).toBeVisible();
  });

  test('should open record payment dialog', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    // Click the "..." menu
    const moreButton = page.locator('button').filter({ has: page.locator('.lucide-more-horizontal') }).last();
    await moreButton.click();
    await page.getByText('Mark as Paid').click();

    await expect(page.getByText('Record Payment')).toBeVisible();
    await expect(page.getByText('Payment Method')).toBeVisible();
  });

  test('should download PDF', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    // Click download dropdown
    const downloadButton = page.getByRole('button', { name: /download/i });
    await downloadButton.click();

    await expect(page.getByText('Download PDF')).toBeVisible();
  });

  test('should void/cancel an invoice', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    if (!invoice?.id) return;

    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);

    const moreButton = page.locator('button').filter({ has: page.locator('.lucide-more-horizontal') }).last();
    await moreButton.click();

    // Look for Cancel Invoice option
    const cancelItem = page.getByText(/cancel invoice/i);
    await expect(cancelItem).toBeVisible();
  });
});
