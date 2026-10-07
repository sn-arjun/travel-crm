/** Walkthrough part 3: Revenue (chapters 10-13): invoices, payments, credit and debit notes, vouchers. */
import { expect, test } from './showcase-fixtures';
import * as D from './demo-data';
import { assertClean, chapter, clickOn, dwell, hoverOn, nav, openRow, recordPart, say, search, settle, typeInto } from './walkthrough-kit';
import { pause, pickDateTime, pickRelation, pickSelect } from './showcase-helpers';

test('wt3: invoices, payments, credit and debit notes, vouchers (chapters 10-13)', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordPart(page, context, 'wt3', testInfo, async () => {
    await page.goto('/invoices');
    await settle(page, 1500);

    // ── 10 Invoices ──
    await chapter(page, 10, 'Invoices', 'GST invoices, reminders and PDFs');
    await pickSelect(page, page.getByRole('combobox').filter({ hasText: /All status/ }), 'Overdue');
    await settle(page, 1500);
    await say(page, 'Overdue invoices surface themselves — remind in two clicks', 3200);
    const od = page.locator('table tbody tr').filter({ hasText: 'Karan Malhotra' }).first();
    await openRow(page, 'Karan Malhotra', /\/invoices\/[^/]+$/);
    await dwell(page, 1500);
    await clickOn(page, page.getByRole('button', { name: /Send message/ }).first());
    const msg = page.getByRole('dialog');
    await clickOn(page, msg.getByText('WhatsApp', { exact: true }).first());
    await settle(page, 900);
    await dwell(page, 1500);
    await say(page, 'Pick a template, preview it, send through the hub', 3000);
    await page.keyboard.press('Escape');
    await pause(page, 500);
    void od;
    await page.goto('/invoices');
    await settle(page, 1300);
    await search(page, /Search invoices/i, 'Ritu');
    await openRow(page, 'Ritu Sharma', /\/invoices\/[^/]+$/);
    await clickOn(page, page.getByRole('button', { name: 'Edit', exact: true }));
    await page.waitForURL(/\/invoices\/[^/]+\/edit$/);
    await settle(page, 1300);
    await clickOn(page, page.getByRole('button', { name: /Add Item/i }));
    await typeInto(page, page.getByPlaceholder(/Flight tickets|e\.g\./i).last(), 'Travel insurance (2 travellers)');
    await typeInto(page, page.locator('input[placeholder="0"]').last(), '1800');
    await say(page, 'Add a line and the totals recalculate', 2800);
    await clickOn(page, page.getByRole('button', { name: /^Save/ }));
    await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 20_000 });
    await settle(page, 1500);
    await clickOn(page, page.getByRole('button', { name: 'More actions' }));
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await clickOn(page, page.getByRole('menuitem', { name: 'Download PDF' }));
    await dl;
    await dwell(page, 1500);
    await assertClean(page, 'ch10');

    // ── 11 Payments ──
    await chapter(page, 11, 'Payments', 'Every rupee matched to its invoice');
    await nav(page, '/payments');
    await say(page, 'Every rupee in, matched to its invoice', 2800);
    await page.goto('/payments/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('input[inputmode="decimal"]'), '25000');
    await pickSelect(page, page.locator('#paymentMethod'), 'Bank Transfer');
    await typeInto(page, page.locator('#reference'), 'UTR 362100512208');
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Search invoices/ }), /search/i, 'Siddharth', /Siddharth Rao/);
    await assertClean(page, 'ch11 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL(/\/payments(\/[^/]+)?$/, { timeout: 20_000 });
    await settle(page, 1500);
    await say(page, 'Balances and statuses update the moment it is saved', 3000);
    await assertClean(page, 'ch11');

    // ── 12 Credit & debit notes ──
    await chapter(page, 12, 'Credit & debit notes', 'Adjustments that stay GST-compliant');
    await nav(page, '/credit-notes');
    await page.goto('/credit-notes/new');
    await settle(page, 1000);
    await pickRelation(page, page.locator('button[role="combobox"]').filter({ hasText: 'Select an invoice' }), 'Search invoices...', 'Arjun', /Arjun Mehta/);
    await typeInto(page, page.locator('#reason'), 'Sunset cruise cancelled due to weather');
    await typeInto(page, page.locator('input[placeholder*="Flight tickets"]').first(), 'Kumarakom sunset cruise — refund');
    await typeInto(page, page.locator('input[placeholder="0"]').first(), '3600');
    await say(page, 'Issue a credit note against a paid invoice', 2800);
    await assertClean(page, 'ch12 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL('**/credit-notes', { timeout: 20_000 });
    await settle(page, 1500);
    await nav(page, '/debit-notes');
    await say(page, 'Adjustments stay GST-compliant and traceable', 2800);
    await assertClean(page, 'ch12');

    // ── 13 Vouchers ──
    await chapter(page, 13, 'Vouchers', 'Branded vouchers for every booking');
    await nav(page, '/vouchers');
    await page.goto('/vouchers/new');
    await settle(page, 1000);
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: 'Select lead' }).first(), /Search leads/i, 'Goa Christmas', /Goa Christmas Homecoming/);
    await pickSelect(page, page.locator('#voucherType'), 'Transport');
    await pickSelect(page, page.locator('#vehicleType'), 'Innova');
    await pickDateTime(page, page.getByRole('button', { name: /Pick date & time/ }), D.day(83), 13, 0);
    await typeInto(page, page.locator('#driverName'), 'Abdul Rasheed');
    await typeInto(page, page.locator('#driverPhone'), '+91 94471 23456');
    await typeInto(page, page.locator('#pickupLocation'), 'Goa International Airport (Dabolim)');
    await typeInto(page, page.locator('#dropLocation'), 'Candolim Sands Resort');
    await typeInto(page, page.locator('#title'), 'Airport transfer — Fernandes family');
    await say(page, 'Branded vouchers for hotels, transfers, flights, activities', 3000);
    await assertClean(page, 'ch13 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL(/\/vouchers\/[^/]+$/, { timeout: 20_000 });
    await settle(page, 1500);
    await clickOn(page, page.getByRole('button', { name: /Mark as sent/i }));
    await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /Confirm/i }));
    await expect(page.getByText(/^sent$/i).first()).toBeVisible();
    await hoverOn(page, page.getByText(/^sent$/i).first(), 1500);
    await assertClean(page, 'ch13');
  });
});
