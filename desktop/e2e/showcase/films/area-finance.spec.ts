/** Film area-finance: invoices, payments, payment links, notes, defaults (studio/clips/area-finance.json). Demo admin. */
import { asUser, beat, clickOn, expect, focus, glance, hoverOn, openRow, pause, pickRelation, pickSelect, recordFilm, scrollSteps, search, settle, typeInto, visit } from './film-kit';

const test = asUser();

test('film:area-finance', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-finance', testInfo, async () => {
    await page.goto('/invoices');
    await settle(page, 1500);

    await beat(page, 'inv-list', async () => {
      const status = page.getByRole('combobox').filter({ hasText: /All status/ });
      await focus(page, 'status-filter', status);
      await pickSelect(page, status, 'Overdue');
      await settle(page, 1200);
      await glance(page, page.locator('table tbody tr').filter({ hasText: 'Karan Malhotra' }).first(), 800);
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /Overdue/ }), /All status/);
      await settle(page, 700);
    });

    await beat(page, 'inv-new', async () => {
      await page.goto('/invoices/new');
      await settle(page, 1000);
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Select (a )?(contact|customer)/i }).first(), /Search/i, 'Tanvi', /Tanvi Deshpande/);
      await typeInto(page, page.getByPlaceholder(/Flight tickets|e\.g\./i).first(), 'Bali Island Bliss: 5N, villa with pool');
      await typeInto(page, page.locator('input[placeholder="0"]').first(), '168000');
      await pause(page, 500);
      const totals = page.getByText(/Total/).last();
      await focus(page, 'totals', totals);
      await clickOn(page, page.getByRole('button', { name: /^Save/ }).first());
      await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'inv-detail', async () => {
      await scrollSteps(page, 1, 350);
      await page.mouse.wheel(0, -800);
      await pause(page, 300);
      await clickOn(page, page.getByRole('button', { name: 'More actions' }));
      const dl = page.waitForEvent('download', { timeout: 30_000 });
      await clickOn(page, page.getByRole('menuitem', { name: 'Download PDF' }));
      await dl;
      await pause(page, 600);
    });

    await beat(page, 'inv-send', async () => {
      await clickOn(page, page.getByRole('button', { name: /Send message|Send invoice|Send/ }).first());
      const msg = page.getByRole('dialog');
      await clickOn(page, msg.getByText('WhatsApp', { exact: true }).first());
      await settle(page, 800);
      await pause(page, 1300);
      await page.keyboard.press('Escape');
      await pause(page, 400);
    });

    await beat(page, 'inv-paylink', async () => {
      await page.goto('/invoices');
      await settle(page, 1000);
      await search(page, /Search invoices/i, 'Neha');
      await openRow(page, 'Neha Kapoor', /\/invoices\/[^/]+$/);
      const card = page.getByText('Pay online').first();
      await card.scrollIntoViewIfNeeded();
      await focus(page, 'pay-online', card);
      await pause(page, 1200);
      await page.goto('/settings/integrations');
      await settle(page, 1200);
      await glance(page, page.getByText(/Razorpay|Stripe/).first(), 1100);
    });

    await beat(page, 'inv-actions', async () => {
      await visit(page, '/invoices');
      const row = page.locator('table tbody tr').filter({ hasText: 'Ritu Sharma' }).first();
      await hoverOn(page, row, 500);
      await openRow(page, 'Ritu Sharma', /\/invoices\/[^/]+$/);
      await clickOn(page, page.getByRole('button', { name: 'More actions' }));
      await glance(page, page.getByRole('menuitem', { name: /Duplicate/ }), 700);
      await glance(page, page.getByRole('menuitem', { name: /Void/ }), 700);
      await page.keyboard.press('Escape');
      await visit(page, '/invoices');
      const boxes = page.locator('table tbody tr input[type="checkbox"], table tbody tr [role="checkbox"]');
      if (await boxes.count()) { await clickOn(page, boxes.nth(0)); await clickOn(page, boxes.nth(1)); await glance(page, page.getByRole('button', { name: /PDF/ }), 900); await clickOn(page, boxes.nth(0)); await clickOn(page, boxes.nth(1)); }
    });

    await beat(page, 'payments', async () => {
      await page.goto('/payments/new');
      await settle(page, 900);
      await typeInto(page, page.locator('input[inputmode="decimal"]'), '25000');
      await pickSelect(page, page.locator('#paymentMethod'), 'Bank Transfer');
      await typeInto(page, page.locator('#reference'), 'UTR 362100512208');
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Search invoices/ }), /search/i, 'Siddharth', /Siddharth Rao/);
      await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.waitForURL(/\/payments(\/[^/]+)?$/, { timeout: 20_000 });
      await settle(page, 1100);
    });

    await beat(page, 'notes', async () => {
      await page.goto('/credit-notes/new');
      await settle(page, 900);
      await pickRelation(page, page.locator('button[role="combobox"]').filter({ hasText: 'Select an invoice' }), 'Search invoices...', 'Arjun', /Arjun Mehta/);
      await typeInto(page, page.locator('#reason'), 'Sunset cruise cancelled due to weather');
      await typeInto(page, page.locator('input[placeholder*="Flight tickets"]').first(), 'Kumarakom sunset cruise: refund');
      await typeInto(page, page.locator('input[placeholder="0"]').first(), '3600');
      await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.waitForURL('**/credit-notes', { timeout: 20_000 });
      await settle(page, 900);
      await page.goto('/debit-notes');
      await settle(page, 1000);
    });

    await beat(page, 'inv-defaults', async () => {
      await page.goto('/settings/invoice-defaults');
      await settle(page, 1300);
      await scrollSteps(page, 1, 350);
      await page.goto('/settings/numbering');
      await settle(page, 1200);
      await expect(page.locator('#invoicePrefix')).toHaveValue('SH-INV');
    });
  });
});
