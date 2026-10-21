/**
 * Film plans: Basic vs Pro vs Enterprise on three real agencies (studio/clips/plans.json, docs/PRICING.md).
 * Multi-agency stack started with FIX_STACK_CALLING_COUNTRIES=GB,US,AU,SG (so India and the UAE have no calling), agencies from
 * film-prep --agencies (B, C) and the platform-owner film (A; or film-prep --agencies --with-a). Billing is the mock gateway.
 * Switching agency between scenes happens off camera (a fresh API session written to the app's storage, then a reload); the cut
 * puts a title card over each switch.
 */
import type { Page } from '@playwright/test';

import { agency, allowHttp, anonymous as test, API_URL, BASE_URL, beat, clickOn, expect, focus, glance, outbox, pause, recordFilm, scrollSteps, settle, typeInto, type FilmAgency } from './film-kit';

async function useAgency(page: Page, a: FilmAgency): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password: a.password, tenantId: a.tenantId }) });
  const d = ((await res.json()) as { data?: { accessToken?: string; refreshToken?: string; user?: unknown; tenant?: unknown } }).data;
  if (!d?.accessToken) throw new Error(`login failed for ${a.companyName}`);
  const value = JSON.stringify({ state: { accessToken: d.accessToken, refreshToken: d.refreshToken, isAuthenticated: true, user: d.user, tenant: d.tenant }, version: 0 });
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((v) => window.localStorage.setItem('travelcrm-auth', v), value);
  await page.goto(`${BASE_URL}/dashboard`);
  await settle(page, 1200);
}

/** Fill Basic's five seats off camera (owner + four accepted invitations), so the sixth invite on camera hits the limit. */
async function fillSeats(a: FilmAgency): Promise<void> {
  const login = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password: a.password, tenantId: a.tenantId }) });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const people = [['Isha Deshmukh', 'sales_manager'], ['Varun Patil', 'salesperson'], ['Neel Joshi', 'operations'], ['Smita Kale', 'accountant']] as const;
  for (const [name, role] of people) {
    const email = `${name.toLowerCase().replace(' ', '.')}@example.com`;
    const r = await fetch(`${API_URL}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email, name, role }) });
    if (r.status === 409) continue; // already there from an earlier take
    const invite = ((await r.json()) as { data?: { inviteToken?: string } }).data?.inviteToken
      ?? (await outbox(email)).find((m) => m.template === 'invite_user')?.text.match(/setup-account\?token=([A-Za-z0-9-]+)/)?.[1];
    if (!invite) continue; // seat limit already reached
    await fetch(`${API_URL}/auth/setup-account`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: invite, name, password: 'Skyline-Team-2026' }) });
  }
}

test.beforeAll(async () => {
  await fillSeats(agency('A'));
});

test('film:plans', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  const A = agency('A'), B = agency('B'), C = agency('C');
  // the locked features and the seat limit answer 402/403 on purpose (upgrade prompts are what this film shows)
  allowHttp(/\/api\/v1\/(marketing\/whatsapp|whatsapp|chatbot|ai)(\/|\?|$)/, [403]);
  allowHttp(/\/api\/v1\/users(\?|$)/, [402, 403, 409]);
  await recordFilm(page, context, 'plans', testInfo, async () => {
    await useAgency(page, A);

    await beat(page, 'basic-locked', async () => {
      await page.goto('/marketing/whatsapp');
      await settle(page, 1300);
      const prompt = page.locator('text=/upgrade|not on your plan/i').first();
      await expect(prompt).toBeVisible({ timeout: 20_000 });
      await focus(page, 'upgrade', prompt, { dwellMs: 900 });
      await page.goto('/chatbot');
      await settle(page, 1200);
      await glance(page, page.locator('text=/upgrade|not on your plan/i').first(), 900);
    }, { refusalShown: true });

    await beat(page, 'seat-limit', async () => {
      await page.goto('/settings/team');
      await settle(page, 1200);
      await clickOn(page, page.getByRole('button', { name: 'Invite user' }).first());
      const inv = page.getByRole('dialog');
      await typeInto(page, inv.locator('#invite-name'), 'Aarti Pawar');
      await typeInto(page, inv.locator('#invite-email'), 'aarti.pawar@example.com');
      await clickOn(page, inv.locator('#invite-role'));
      await clickOn(page, page.getByRole('option', { name: 'Salesperson' }));
      await clickOn(page, inv.getByRole('button', { name: 'Send invitation' }));
      await glance(page, page.locator('text=/upgrade|extra user|seat/i').first(), 1500);
      await page.keyboard.press('Escape');
    }, { refusalShown: true });

    await beat(page, 'billing', async () => {
      await page.goto('/settings/billing');
      await settle(page, 1400);
      await glance(page, page.getByTestId('billing-current'), 800);
      const more = page.getByTestId('billing-buy-more');
      await focus(page, 'buy-more', more);
      await clickOn(page, more);
      await pause(page, 1600);
      await page.keyboard.press('Escape');
    });

    await beat(page, 'checkout', async () => {
      // the payment page opens with window.open(..., 'noopener'): such a tab is a new page of the context, not a popup of this page
      const started = page.waitForResponse((r) => r.url().endsWith("/billing/checkout") && r.request().method() === 'POST', { timeout: 20_000 });
      const opened = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      await clickOn(page, page.getByTestId('billing-pay'));
      const url = ((await (await started).json()) as { data?: { url?: string } }).data?.url;
      // product observation (local stack): the mock gateway builds its payment URL from the request host without the port, so the tab the
      // app opens cannot load. The take plays the same payment page on the API's own address.
      await (await opened)?.close().catch(() => undefined);
      if (url) {
        const fixed = new URL(url);
        fixed.protocol = new URL(API_URL).protocol;
        fixed.host = new URL(API_URL).host;
        const p = await context.newPage();
        await p.goto(fixed.toString()).catch(() => undefined);
        await p.waitForTimeout(1500);
        await p.close().catch(() => undefined);
      }
      await pause(page, 1500); // the gateway tells the server; give it a moment before the page is refreshed
      await page.reload();
      await settle(page, 1500);
      const inv = page.getByTestId('billing-invoices');
      await inv.scrollIntoViewIfNeeded().catch(() => undefined);
      await glance(page, inv.getByText(/PINV-/).first(), 1200);
    });

    await useAgency(page, B);
    await beat(page, 'pro-uk', async () => {
      await page.goto('/marketing/whatsapp');
      await settle(page, 1300);
      await expect(page.locator('text=/not on your plan/i')).toHaveCount(0);
      await page.goto('/communication/calls');
      await settle(page, 1200);
      await page.goto('/chatbot');
      await settle(page, 1200);
      await glance(page, page.locator('text=/upgrade|not on your plan/i').first(), 900);
    }, { refusalShown: true });

    await useAgency(page, C);
    await beat(page, 'enterprise-uae', async () => {
      await page.goto('/chatbot');
      await settle(page, 1300);
      await expect(page.locator('text=/not on your plan/i')).toHaveCount(0);
      await page.goto('/settings/chatbot');
      await settle(page, 1200);
      await scrollSteps(page, 1, 300);
      await page.goto('/settings/billing');
      await settle(page, 1200);
      await glance(page, page.getByTestId('billing-current'), 800);
    });
  });
});
