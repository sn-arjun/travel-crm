/** Film role-accountant: Vikram Rao (accountant) (studio/clips/role-accountant.json). */
import { asUser, beat, clickOn, glance, openRow, pause, pickRelation, pickSelect, recordFilm, scrollSteps, search, settle, staffEmail, typeInto, visit } from './film-kit';

const test = asUser(staffEmail('vikram'));

test('film:role-accountant', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'role-accountant', testInfo, async () => {
    await page.goto('/invoices');
    await settle(page, 1500);

    await beat(page, 'acc-overdue', async () => {
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /All status/ }), 'Overdue');
      await settle(page, 1200);
      await glance(page, page.locator('table tbody tr').first(), 900);
    });

    await beat(page, 'acc-ageing', async () => {
      await page.goto('/reports/financial');
      await settle(page, 1800);
      await clickOn(page, page.getByRole('tab', { name: 'Receivables' }));
      await settle(page, 1200);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'acc-payment', async () => {
      await page.goto('/payments/new');
      await settle(page, 900);
      await typeInto(page, page.locator('input[inputmode="decimal"]'), '20000');
      await pickSelect(page, page.locator('#paymentMethod'), 'Bank Transfer');
      await typeInto(page, page.locator('#reference'), 'UTR 362100733419');
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Search invoices/ }), /search/i, 'Neha', /Neha Kapoor/);
      await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.waitForURL(/\/payments(\/[^/]+)?$/, { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'acc-hsn', async () => {
      await page.goto('/invoices/new');
      await settle(page, 1000);
      const hsn = page.getByRole('combobox', { name: /HSN|SAC/i }).or(page.getByPlaceholder(/HSN|SAC/i)).first();
      if (await hsn.isVisible().catch(() => false)) { await clickOn(page, hsn); await pause(page, 1200); await page.keyboard.press('Escape'); }
      await glance(page, page.getByText(/HSN|SAC/).first(), 900);
    });

    await beat(page, 'acc-supplier', async () => {
      await visit(page, '/suppliers');
      await search(page, /Search suppliers/i, 'Lakes');
      await openRow(page, 'Lakes & Lagoons', /\/suppliers\/[^/]+$/);
      const pay = page.getByRole('button', { name: /Record payment|Add payment/ }).first();
      if (await pay.isVisible().catch(() => false)) {
        await clickOn(page, pay);
        const dlg = page.getByRole('dialog');
        await typeInto(page, dlg.locator('input[inputmode="decimal"], input[type="number"]').first(), '42000');
        const ref = dlg.locator('#reference, input[name="reference"]').first();
        if (await ref.isVisible().catch(() => false)) await typeInto(page, ref, 'NEFT 88213409');
        await clickOn(page, dlg.getByRole('button', { name: /Save|Record/ }).last());
        await settle(page, 1000);
      }
      await scrollSteps(page, 1, 350);
    });
  });
});
