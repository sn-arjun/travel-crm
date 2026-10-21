/**
 * Film international: a UK agency (GBP, VAT, en-GB) and a UAE agency (AED) with Arabic right to left (studio/clips/international.json).
 * Multi-agency stack; agencies B and C from film-prep --agencies (each has a contact, a lead, an invoice and an advance).
 */
import type { Page } from '@playwright/test';

import { agency, anonymous as test, API_URL, BASE_URL, beat, clickOn, expect, focus, glance, openRow, pause, recordFilm, scrollSteps, settle, type FilmAgency } from './film-kit';

async function useAgency(page: Page, a: FilmAgency): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password: a.password, tenantId: a.tenantId }) });
  const d = ((await res.json()) as { data?: { accessToken?: string; refreshToken?: string; user?: unknown; tenant?: unknown } }).data;
  if (!d?.accessToken) throw new Error(`login failed for ${a.companyName}`);
  const value = JSON.stringify({ state: { accessToken: d.accessToken, refreshToken: d.refreshToken, isAuthenticated: true, user: d.user, tenant: d.tenant }, version: 0 });
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((v) => { window.localStorage.setItem('travelcrm-auth', v); window.localStorage.removeItem('travelcrm.uiLanguage'); }, value);
  await page.goto(`${BASE_URL}/dashboard`);
  await settle(page, 1300);
}
async function pickLanguage(page: Page, name: string): Promise<void> {
  await clickOn(page, page.locator('#profile-language'));
  await clickOn(page, page.getByRole('option', { name, exact: true }));
  await settle(page, 1200);
}

test('film:international', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  const B = agency('B'), C = agency('C');
  await recordFilm(page, context, 'international', testInfo, async () => {
    await useAgency(page, B);

    await beat(page, 'uk-money', async () => {
      await glance(page, page.getByText(/£/).first(), 900);
      await page.goto('/invoices');
      await settle(page, 1300);
      await glance(page, page.locator('table tbody tr').first(), 900);
    });

    await beat(page, 'uk-vat', async () => {
      await openRow(page, /.+/, /\/invoices\/[^/]+$/);
      const vat = page.getByText(/VAT/).first();
      await expect(vat).toBeVisible({ timeout: 15_000 });
      await focus(page, 'vat', vat, { dwellMs: 900 });
    });

    await beat(page, 'uk-phone', async () => {
      await page.goto('/contacts/new');
      await settle(page, 1000);
      await glance(page, page.getByText('+44').first(), 900);
      await clickOn(page, page.getByRole('combobox', { name: /country/i }).or(page.locator('button:has-text("+44")')).first());
      await pause(page, 1200);
      await page.keyboard.press('Escape');
    });

    await useAgency(page, C);
    await beat(page, 'uae-money', async () => {
      await page.goto('/invoices');
      await settle(page, 1300);
      await glance(page, page.getByText(/AED/).first(), 1000);
    });

    await beat(page, 'arabic', async () => {
      await page.goto('/settings/profile');
      await settle(page, 1100);
      await pickLanguage(page, 'العربية');
      await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
      await focus(page, 'sidebar', page.locator('aside').first(), { move: false });
      await page.goto('/dashboard');
      await settle(page, 1300);
      await page.goto('/leads');
      await settle(page, 1200);
      await page.goto('/contacts');
      await settle(page, 1200);
      await scrollSteps(page, 1, 300);
      await page.goto('/settings/profile');
      await settle(page, 900);
      await pickLanguage(page, 'English');
    });
  });
});
