import { test, expect } from './fixtures';
import { API_URL } from './helpers/auth';
import { completeFirstLogin, createAgency, createSuperAdminToken, isMultiTenantStack, NEEDS_MULTI, request, signInViaUI } from './helpers/tenants';

// Two layers switch group tours on: the plan feature and the agency's own switch (design section 2).
// Needs separate agencies (a Basic and a Pro one), so it runs on the multi-tenant stack.

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Group tours settings and the agency switch', () => {
  test('a Basic agency sees nothing about group tours', async ({ page }) => {
    test.skip(!(await isMultiTenantStack()), NEEDS_MULTI);
    test.setTimeout(180_000);
    const sa = await createSuperAdminToken();
    const agency = await completeFirstLogin(API_URL, await createAgency(API_URL, sa, { plan: 'basic', slug: `gt-basic-${Date.now().toString(36)}` }));
    await signInViaUI(page, agency);

    await expect(page.getByRole('navigation').getByRole('link', { name: 'Departures', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Tours', exact: true })).toHaveCount(0);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('group-tours-hub-card')).toHaveCount(0);

    // The pages themselves say the plan does not have it, and the API is never asked for departures.
    const forbidden: string[] = [];
    page.on('response', (r) => {
      if (/\/(departures|tours)(\/|\?|$)/.test(new URL(r.url()).pathname) && r.status() === 403) forbidden.push(r.url());
    });
    await page.goto('/departures');
    await expect(page.getByText('Group tours are not in your plan')).toBeVisible();
    expect(forbidden).toEqual([]);
  });

  test('a Pro agency sees the hub card, switches group tours on and the menu entry appears', async ({ page }) => {
    test.skip(!(await isMultiTenantStack()), NEEDS_MULTI);
    test.setTimeout(180_000);
    const sa = await createSuperAdminToken();
    const agency = await completeFirstLogin(API_URL, await createAgency(API_URL, sa, { plan: 'pro', slug: `gt-pro-${Date.now().toString(36)}` }));
    await signInViaUI(page, agency);

    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Departures', exact: true })).toHaveCount(0);

    await page.goto('/settings');
    const card = page.getByTestId('group-tours-hub-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Sell fixed-departure group tours?');

    // Off: the pages explain it and point to the settings.
    await page.goto('/departures');
    await expect(page.getByText('Group tours are switched off')).toBeVisible();

    await page.goto('/settings/group-tours');
    await expect(page.getByRole('heading', { name: 'Group tours', exact: true }).first()).toBeVisible();
    await page.getByTestId('group-tours-enabled').click();

    await page.locator('#gt-hold').fill('72');
    await page.locator('#gt-confirm-mode').click();
    await page.getByRole('option', { name: /Confirm automatically/ }).click();
    await page.getByTestId('group-tours-save').click();
    await expect(page.getByText('Group tours settings saved')).toBeVisible();

    // The saved values come back from the API.
    const saved = await request(API_URL, 'GET', '/departures/settings', agency.accessToken!);
    expect(saved.json.data).toMatchObject({ enabled: true, holdExpiryHours: 72, confirmMode: 'auto_when_available' });

    // The menu shows the area at once (no reload) and the list opens.
    await expect(nav.getByRole('link', { name: 'Departures', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tours', exact: true })).toBeVisible();
    await nav.getByRole('link', { name: 'Departures', exact: true }).click();
    await expect(page.getByText('No departures yet')).toBeVisible();

    // A reload keeps the values.
    await page.goto('/settings/group-tours');
    await expect(page.locator('#gt-hold')).toHaveValue('72');
  });
});
