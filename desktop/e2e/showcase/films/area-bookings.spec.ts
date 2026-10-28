/** Film area-bookings: vouchers and visas (studio/clips/area-bookings.json). Signed in as operations (Deepa Thomas). */
import * as D from '../demo-data';
import { asUser, beat, clickOn, expect, focus, glance, hoverOn, openRow, pause, pickDateTime, pickRelation, pickSelect, recordFilm, scrollSteps, settle, staffEmail, typeInto, visit } from './film-kit';

const test = asUser(staffEmail('deepa'));
const labelField = (page: import('@playwright/test').Page, label: RegExp) => page.locator('label', { hasText: label }).locator('..');

test('film:area-bookings', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'area-bookings', testInfo, async () => {
    await page.goto('/vouchers');
    await settle(page, 1500);

    await beat(page, 'vouchers-list', async () => {
      await scrollSteps(page, 1, 300);
      await glance(page, page.locator('table tbody tr').first(), 800);
    });

    await beat(page, 'vouchers-new', async () => {
      await page.goto('/vouchers/new');
      await settle(page, 900);
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: 'Select lead' }).first(), /Search leads/i, 'Goa Christmas', /Goa Christmas Homecoming/);
      await pickSelect(page, page.locator('#voucherType'), 'Transport');
      await pickSelect(page, page.locator('#vehicleType'), 'Innova');
      await pickDateTime(page, page.getByRole('button', { name: /Pick date & time/ }), D.day(83), 13, 0);
      await typeInto(page, page.locator('#driverName'), 'Abdul Rasheed');
      await typeInto(page, page.locator('#driverPhone'), '+91 94471 23456');
      await typeInto(page, page.locator('#pickupLocation'), 'Goa International Airport (Dabolim)');
      await typeInto(page, page.locator('#dropLocation'), 'Candolim Sands Resort');
      await typeInto(page, page.locator('#title'), 'Airport transfer: Fernandes family');
      await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.waitForURL(/\/vouchers\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'vouchers-status', async () => {
      const sent = page.getByRole('button', { name: /Mark as sent/i });
      await focus(page, 'mark-sent', sent);
      await clickOn(page, sent);
      await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /Confirm/i }));
      await expect(page.getByText(/^sent$/i).first()).toBeVisible();
      await hoverOn(page, page.getByText(/^sent$/i).first(), 900);
    });

    await beat(page, 'vouchers-pdf', async () => {
      await glance(page, page.getByRole('combobox', { name: /Language/i }).or(page.getByLabel(/Language/i)), 1000);
      await glance(page, page.getByRole('button', { name: /PDF|Download/ }), 800);
      await glance(page, page.getByRole('button', { name: /Send/ }), 800);
    });

    await beat(page, 'visa-dashboard', async () => {
      await page.goto('/visa/dashboard');
      await settle(page, 1300);
      await glance(page, page.getByText('Docs Collecting').first(), 900);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'visa-new', async () => {
      await visit(page, '/visa');
      await page.goto('/visa/new');
      await settle(page, 900);
      await clickOn(page, labelField(page, /^Traveller\s*\*?$/).getByRole('combobox'));
      await typeInto(page, page.getByPlaceholder(/search by name or passport/i), 'Ishaan');
      await settle(page, 700);
      await clickOn(page, page.getByRole('option', { name: /Ishaan Chatterjee/ }).first());
      await clickOn(page, labelField(page, /^Destination Country\s*\*?$/).getByRole('combobox'));
      await typeInto(page, page.getByPlaceholder(/search countries/i), 'France');
      await clickOn(page, page.getByRole('option', { name: 'France', exact: true }));
      await clickOn(page, labelField(page, /^Visa Type\s*\*?$/).getByRole('combobox'));
      await pause(page, 300);
      await clickOn(page, page.getByRole('option', { name: 'Tourist', exact: true }));
      await clickOn(page, page.getByRole('button', { name: 'Create Application' }));
      await page.waitForURL('**/visa', { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'visa-docs', async () => {
      await openRow(page, 'Not Started', /\/visa\/[^/]+$/);
      const docs = page.locator('button').filter({ hasText: /passport|photo/i });
      await clickOn(page, docs.first());
      await settle(page, 700);
      await clickOn(page, docs.nth(1));
      await settle(page, 700);
    });
  });
});
