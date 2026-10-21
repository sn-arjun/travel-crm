/** Film role-view-only: Leela Fernandes (view only, added by film-prep --demo) (studio/clips/role-view-only.json). */
import { asUser, beat, expect, glance, openRow, recordFilm, scrollSteps, settle, VIEW_ONLY, visit } from './film-kit';

const test = asUser(VIEW_ONLY.email);

test('film:role-view-only', async ({ page, context }, testInfo) => {
  test.setTimeout(15 * 60_000);
  await recordFilm(page, context, 'role-view-only', testInfo, async () => {
    await page.goto('/leads');
    await settle(page, 1500);

    await beat(page, 'vo-browse', async () => {
      await expect(page.getByRole('button', { name: /New Lead/ })).toHaveCount(0);
      await openRow(page, /.+/, /\/leads\/[^/]+$/);
      await scrollSteps(page, 1, 300);
      await visit(page, '/contacts');
      await glance(page, page.locator('table tbody tr').first(), 600);
    });

    await beat(page, 'vo-invoice', async () => {
      await visit(page, '/invoices');
      await openRow(page, /.+/, /\/invoices\/[^/]+$/);
      await scrollSteps(page, 1, 300);
    });
  });
});
