/** Film role-sales-manager: Rahul Nair (sales manager) (studio/clips/role-sales-manager.json). */
import { asUser, beat, clickOn, ensureUnassignedLead, expect, findOne, glance, hoverOn, pause, pickSelect, recordFilm, scrollSteps, settle, staffEmail, typeInto, visit } from './film-kit';

const test = asUser(staffEmail('rahul'));

test('film:role-sales-manager', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'role-sales-manager', testInfo, async () => {
    await page.goto('/leads');
    await settle(page, 1500);

    await beat(page, 'sm-pipeline', async () => {
      await pickSelect(page, page.getByRole('combobox', { name: 'Filter by status' }), 'Negotiation');
      await settle(page, 1200);
      await glance(page, page.locator('table tbody tr').first(), 700);
      await glance(page, page.locator('table tbody tr').nth(1), 700);
    });

    await ensureUnassignedLead();
    await beat(page, 'sm-assign', async () => {
      await page.goto('/leads/unassigned');
      await settle(page, 1200);
      const row = page.locator('table tbody tr').first();
      await hoverOn(page, row, 500);
      await clickOn(page, row.locator('button[aria-label="Assign"]'));
      const asg = page.getByRole('dialog');
      await clickOn(page, asg.getByRole('combobox').first());
      await typeInto(page, page.getByPlaceholder(/Search team/i), 'Sneha');
      await settle(page, 600);
      await clickOn(page, page.getByRole('option').filter({ hasText: 'Sneha Iyer' }).first());
      await clickOn(page, asg.getByRole('button', { name: 'Assign' }).last());
      await expect(page.getByText(/lead\(s\) assigned/)).toBeVisible();
    });

    await beat(page, 'sm-margin', async () => {
      const it = await findOne('/itineraries?limit=50', (x) => !!x.id);
      await page.goto(`/itineraries/${it.id}`);
      await settle(page, 1300);
      await clickOn(page, page.getByRole('tab', { name: 'Costs' }));
      await pause(page, 1500);
    });

    await beat(page, 'sm-report', async () => {
      await page.goto('/reports/sales'); // the Team report refuses the sales manager role (product bug, see report): the sales report shows revenue per consultant
      await settle(page, 1800);
      await glance(page, page.getByRole('combobox', { name: /Date range|Period/i }), 700);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'sm-export', async () => {
      await visit(page, '/leads');
      const dl = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
      await clickOn(page, page.getByRole('button', { name: /Export/ }).first());
      const menu = page.getByRole('menuitem', { name: /CSV|Excel/ }).first();
      if (await menu.isVisible().catch(() => false)) await clickOn(page, menu);
      await dl;
      await pause(page, 600);
    });
  });
});
