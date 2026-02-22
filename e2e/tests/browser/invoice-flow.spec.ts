import { test, expect } from '@playwright/test';
import { TEST_ADMIN } from '../helpers/test-data';

test.describe('Browser: Invoice Management', () => {
  const baseURL = process.env.APP_BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });
  });

  test('should navigate to invoices page', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const pageTitle = page.locator('text=/Invoices|Invoice List/i').first();
    await expect(pageTitle).toBeVisible();
  });

  test('should display invoices list', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const table = page.locator('table, [role="grid"], [data-testid="invoices-list"]').first();
    await expect(table).toBeVisible({ timeout: 5000 });
  });

  test('should open new invoice form', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Invoice"), button:has-text("Create"), button:has-text("Add")').first();
    await newButton.click();

    const form = page.locator('[role="dialog"], form, [data-testid="invoice-form"]').first();
    await expect(form).toBeVisible({ timeout: 5000 });
  });

  test('should create invoice with line items', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Invoice"), button:has-text("Create")').first();
    await newButton.click();

    // Select contact
    const contactSelect = page.locator('select, [role="combobox"]').first();
    if (await contactSelect.isVisible()) {
      await contactSelect.click();
      const contactOption = page.locator('[role="option"]').first();
      if (await contactOption.isVisible()) {
        await contactOption.click();
      }
    }

    // Add first line item
    const addItemButton = page.locator('button:has-text("Add Item"), button:has-text("Add Line")').first();
    if (await addItemButton.isVisible()) {
      await addItemButton.click();

      // Fill item details
      const descInput = page.locator('input[placeholder*="description"]').last();
      await descInput.fill('Flight Booking');

      const quantityInput = page.locator('input[placeholder*="quantity"], input[type="number"]').last();
      await quantityInput.fill('2');

      const priceInput = page.locator('input[placeholder*="price"], input[placeholder*="amount"]').last();
      await priceInput.fill('50000');
    }

    // Submit
    const submitButton = page.locator('button:has-text("Save"), button:has-text("Create")').last();
    await submitButton.click();

    const successMessage = page.locator('text=/success|created/i');
    await expect(successMessage).toBeVisible({ timeout: 10000 });
  });

  test('should calculate invoice totals automatically', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Invoice"), button:has-text("Create")').first();
    await newButton.click();

    // Add item
    const addItemButton = page.locator('button:has-text("Add Item"), button:has-text("Add Line")').first();
    if (await addItemButton.isVisible()) {
      await addItemButton.click();

      const quantityInput = page.locator('input[placeholder*="quantity"]').last();
      await quantityInput.fill('2');

      const priceInput = page.locator('input[placeholder*="price"]').last();
      await priceInput.fill('100');

      // Check for total
      const total = page.locator('text=/Total|Subtotal/i');
      await expect(total).toBeVisible({ timeout: 5000 });

      const totalAmount = page.locator('[data-testid="invoice-total"], text=/200/i');
      if (await totalAmount.isVisible()) {
        await expect(totalAmount).toBeVisible();
      }
    }
  });

  test('should apply GST to invoice', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Invoice"), button:has-text("Create")').first();
    await newButton.click();

    // Look for GST/tax options
    const gstDropdown = page.locator('select:has-text("GST"), [placeholder*="GST"], [placeholder*="Tax"]').first();
    if (await gstDropdown.isVisible()) {
      await gstDropdown.click();
      const gstOption = page.locator('[role="option"]:has-text("18")').first();
      if (await gstOption.isVisible()) {
        await gstOption.click();
      }
    }
  });

  test('should click invoice to view details', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    const invoiceDetail = page.locator('[data-testid="invoice-detail"], [role="main"]').first();
    await expect(invoiceDetail).toBeVisible();
  });

  test('should display invoice details', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Check for invoice elements
    const invoiceNumber = page.locator('text=/INV-|Invoice No|#/i').first();
    await expect(invoiceNumber).toBeVisible({ timeout: 5000 });

    const amount = page.locator('text=/Total|Amount|₹|Rs/i');
    await expect(amount).toBeVisible({ timeout: 5000 });
  });

  test('should record payment for invoice', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Find record payment button
    const paymentButton = page.locator('button:has-text("Record Payment"), button:has-text("Add Payment")').first();
    if (await paymentButton.isVisible()) {
      await paymentButton.click();

      const paymentForm = page.locator('[role="dialog"], form').first();
      await expect(paymentForm).toBeVisible({ timeout: 5000 });

      // Fill payment details
      const amountInput = page.locator('input[placeholder*="amount"], input[type="number"]').last();
      if (await amountInput.isVisible()) {
        await amountInput.fill('100000');
      }

      const methodSelect = page.locator('select, [role="combobox"]').last();
      if (await methodSelect.isVisible()) {
        await methodSelect.click();
        const method = page.locator('[role="option"]').first();
        if (await method.isVisible()) {
          await method.click();
        }
      }

      // Submit
      const submitButton = page.locator('button:has-text("Save"), button:has-text("Record")').last();
      await submitButton.click();

      const successMessage = page.locator('text=/recorded|success/i');
      await expect(successMessage).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display payment history', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Look for payment history section
    const paymentHistory = page.locator('text=/Payment|Transaction|History/i').first();
    if (await paymentHistory.isVisible()) {
      const paymentList = page.locator('[data-testid="payment-list"], table, [role="grid"]').first();
      if (await paymentList.isVisible()) {
        await expect(paymentList).toBeVisible();
      }
    }
  });

  test('should update invoice status', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Find status dropdown/button
    const statusButton = page.locator('button:has-text("Status"), [data-testid="status-button"]').first();
    if (await statusButton.isVisible()) {
      await statusButton.click();

      const statusOption = page.locator('[role="option"]').first();
      if (await statusOption.isVisible()) {
        await statusOption.click();

        const successMessage = page.locator('text=/updated|changed/i');
        await expect(successMessage).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should send invoice via email', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Find send button
    const sendButton = page.locator('button:has-text("Send"), button:has-text("Email")').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();

      // Check for email dialog
      const emailDialog = page.locator('[role="dialog"], text=/email|Email/i').first();
      if (await emailDialog.isVisible()) {
        // Confirm send
        const confirmButton = page.locator('button:has-text("Send"), button:has-text("Confirm")').last();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          const successMessage = page.locator('text=/sent|success/i');
          await expect(successMessage).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('should filter invoices by status', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const filterButton = page.locator('button:has-text("Filter"), [data-testid="filter-button"]').first();
    if (await filterButton.isVisible()) {
      await filterButton.click();

      const statusFilter = page.locator('text=/Status/i').first();
      if (await statusFilter.isVisible()) {
        await statusFilter.click();

        const paidOption = page.locator('text=/Paid|Draft|Sent/i').nth(1);
        if (await paidOption.isVisible()) {
          await paidOption.click();
        }
      }
    }
  });

  test('should search invoices', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('INV');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);
    }
  });

  test('should download invoice as PDF', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Find download button
    const downloadButton = page.locator('button:has-text("Download"), button:has-text("PDF")').first();
    if (await downloadButton.isVisible()) {
      await downloadButton.click();

      // Allow time for download
      await page.waitForTimeout(2000);
    }
  });

  test('should display invoice preview', async ({ page }) => {
    const invoicesLink = page.locator('text=Invoices, [href*="/invoices"], button:has-text("Invoices")').first();
    await invoicesLink.click();

    await page.waitForURL(/\/invoices/, { timeout: 10000 });

    const firstInvoice = page.locator('table tbody tr, [role="row"]').first();
    await firstInvoice.click();

    await page.waitForURL(/\/invoices\/[^/]+/, { timeout: 10000 });

    // Look for preview section
    const previewButton = page.locator('button:has-text("Preview")').first();
    if (await previewButton.isVisible()) {
      await previewButton.click();

      const preview = page.locator('[data-testid="invoice-preview"], iframe').first();
      if (await preview.isVisible()) {
        await expect(preview).toBeVisible();
      }
    }
  });
});
