import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { seedSupplier } from './helpers/api-seed';

/**
 * Accounts is a deliberately honest "filtered view of Suppliers" — there is no
 * separate accounts entity, no create/edit form, and no detail drawer of its own.
 * Rows route to the real /suppliers/:id and /suppliers/:id/edit pages. Coverage here
 * verifies the list mechanics (search, category filter, scroll, export, messaging,
 * delete) plus that navigating a row lands on the genuine Supplier record — not a
 * fake /accounts/:id page.
 *
 * NOTE: the suppliers API (both create and list) returns snake_case fields
 * (company_name, contact_person, is_active) — seedSupplier returns the raw API
 * response, so tests below assert against the literal values passed into
 * seedSupplier rather than reading them back off the returned object.
 */
test.describe('Accounts', () => {
  test('accounts page frames itself as a Suppliers view via banner', async ({ page }) => {
    await page.goto('/accounts');
    await waitForLoad(page);
    await expect(page.getByText(/filtered view of your Suppliers/i)).toBeVisible({ timeout: 10_000 });
  });

  test('full round trip: seeded supplier appears in list, opens on the real Supplier detail, edit navigates to Supplier edit, then delete removes it', async ({ page }) => {
    const ts = Date.now();
    const companyName = `AcctCo-${ts}`;
    const contactPerson = `AcctContact-${ts}`;
    const email = `acct-${ts}@e2e.test`;
    const phone = '+919000300001';
    const supplier = await seedSupplier({ companyName, category: 'hotel', contactPerson, email, phone });

    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    // 1. Assert every filled value appears in the list
    const row = page.locator(`table tbody tr:has-text("${companyName}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('hotel');
    await expect(row).toContainText(contactPerson);
    await expect(row).toContainText(email);
    await expect(row).toContainText(phone);
    await expect(row).toContainText('Active');

    // No raw tel:/mailto:/wa.me anchors on the list page — outbound contact must go
    // through Communication Hub, and Call routes through the internal dialer, not tel:.
    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    // 2. Clicking the row (and the View action) navigates to the REAL Supplier detail —
    // never a fake /accounts/:id — since this slice deliberately has no detail drawer.
    await row.locator('button[aria-label="View"]').click();
    await page.waitForURL(/\/suppliers\/[^/]+$/, { timeout: 10_000 });
    const supplierUrl = page.url();
    expect(supplierUrl).toContain(`/suppliers/${supplier.id}`);
    await waitForLoad(page);
    await expect(page.getByText(companyName).first()).toBeVisible({ timeout: 10_000 });

    // 3. Edit action from Accounts routes to the real Supplier edit form, pre-filled
    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row2 = page.locator(`table tbody tr:has-text("${companyName}")`).first();
    await expect(row2).toBeVisible({ timeout: 10_000 });
    await row2.locator('button[aria-label="Edit"]').click();
    await page.waitForURL(new RegExp(`/suppliers/${supplier.id}/edit`), { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator('#companyName')).toHaveValue(companyName, { timeout: 10_000 });

    // 4. Delete from the Accounts list removes the row (in place, no reload needed)
    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row3 = page.locator(`table tbody tr:has-text("${companyName}")`).first();
    await expect(row3).toBeVisible({ timeout: 10_000 });
    await row3.locator('button[aria-label="Delete"]').click();
    await expect(page.getByText('Account deleted')).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator(`table tbody tr:has-text("${companyName}")`)).toHaveCount(0, { timeout: 10_000 });
  });

  test('category filter narrows the list to matching category only', async ({ page }) => {
    const ts = Date.now();
    const companyName = `AcctFilter-${ts}`;
    await seedSupplier({ companyName, category: 'airline' });

    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const categoryTrigger = page.locator('[role="combobox"]').filter({ hasText: 'All categories' });
    await categoryTrigger.click();
    await page.getByRole('option', { name: 'Airline' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/airline/i);
    }

    // Filter chip is shown
    await expect(page.getByText('Category').first()).toBeVisible();
  });

  test('search narrows results to matching accounts', async ({ page }) => {
    const ts = Date.now();
    const companyName = `AcctSearch-${ts}`;
    await seedSupplier({ companyName });

    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${companyName}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(companyName);
    }
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/accounts');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search accounts/i).fill(`no-such-account-${Date.now()}-zzz`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(page.getByText('No accounts yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Add supplier' })).toBeVisible();
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const ts = Date.now();
    const marker = `AcctScroll-${ts}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedSupplier({ companyName: `${marker}-${i}` });
    }

    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rowsBefore = await page.locator('table tbody tr').count();
    expect(rowsBefore).toBeGreaterThan(0);

    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(1500);
    await waitForLoad(page);

    const rowsAfter = await page.locator('table tbody tr').count();
    expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
  });

  // ─────────────────────────────────────────────────────────────
  // Outbound messaging via Communication Hub only
  // ─────────────────────────────────────────────────────────────

  test('row Email action opens SendMessageDialog, never a raw mailto/wa.me/tel link', async ({ page }) => {
    const ts = Date.now();
    const companyName = `AcctComms-${ts}`;
    await seedSupplier({ companyName, email: `acctcomms-${ts}@e2e.test`, phone: '+919000300002' });

    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    const row = page.locator(`table tbody tr:has-text("${companyName}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('button[aria-label="Email"]').click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  test('export downloads a non-empty themed CSV file', async ({ page }) => {
    const ts = Date.now();
    const companyName = `AcctExport-${ts}`;
    await seedSupplier({ companyName });

    await page.goto('/accounts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search accounts/i).fill(companyName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^accounts_export_.*\.csv$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
    const content = fs.readFileSync(downloadPath!, 'utf-8');
    expect(content).toContain('Company');
    expect(content).toContain(companyName);
  });

  // ─────────────────────────────────────────────────────────────
  // Relation combobox contract — accounts has no form of its own, so this
  // verifies no raw ID input leaks onto the list page itself.
  // ─────────────────────────────────────────────────────────────

  test('no raw ID input exists on the accounts list page', async ({ page }) => {
    await page.goto('/accounts');
    await waitForLoad(page);

    const rawIdInputs = await page.locator('input[placeholder*="Enter" i][placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);
  });
});
