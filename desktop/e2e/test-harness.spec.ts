import { test, expect } from '@playwright/test';
import { resetTestData, seedContact, seedLead, api } from './helpers/api-seed';
import { getAuthToken, API_URL, waitForLoad } from './helpers/auth';

// The harness has no UI of its own. These tests prove the reset+reseed contract
// that every other slice depends on, and that the result is visible in the CRM.
test.describe('Test harness — /test/reset', () => {
  test.describe.configure({ mode: 'serial' });

  test('reset succeeds and the demo admin can still authenticate', async () => {
    const res = await api('POST', '/test/reset');
    expect(res.success).toBe(true);

    const token = await getAuthToken();
    expect(token.length).toBeGreaterThan(20);

    const me = await fetch(`${API_URL}/contacts?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
  });

  test('reset leaves a clean tenant: previously seeded rows are gone', async () => {
    const contact = await seedContact({ name: `Harness Pre-Reset ${Date.now()}` });
    expect(contact.id).toBeTruthy();
    const lead = await seedLead(contact.id);
    expect(lead.id).toBeTruthy();

    const before = await api('GET', `/contacts/${contact.id}`);
    expect(before.success).toBe(true);
    expect(before.data.id).toBe(contact.id);

    await resetTestData();

    const contactAfter = await api('GET', `/contacts/${contact.id}`);
    expect(contactAfter.success).toBe(false);
    const leadAfter = await api('GET', `/leads/${lead.id}`);
    expect(leadAfter.success).toBe(false);

    const list = await api('GET', '/contacts?limit=50');
    const rows: any[] = Array.isArray(list.data) ? list.data : list.data?.data ?? [];
    expect(rows.some((r) => r.id === contact.id)).toBe(false);
  });

  test('reset is idempotent', async () => {
    await resetTestData();
    await resetTestData();
    const token = await getAuthToken();
    expect(token).toBeTruthy();
  });

  test('reseeded record appears in the CRM UI and disappears after reset', async ({ page }) => {
    await resetTestData();
    const name = `Harness Visible ${Date.now()}`;
    const contact = await seedContact({ name });
    expect(contact.id).toBeTruthy();

    await page.goto('/contacts');
    await waitForLoad(page);
    const search = page.getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill(name);
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });

    await resetTestData();

    await page.reload();
    await waitForLoad(page);
    const searchAfter = page.getByPlaceholder(/search/i).first();
    await expect(searchAfter).toBeVisible({ timeout: 15_000 });
    await searchAfter.fill(name);
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 15_000 });
  });
});
