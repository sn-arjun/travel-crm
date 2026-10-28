import { test, expect } from './fixtures';
import { waitForLoad, API_URL } from './helpers/auth';
import { api } from './helpers/api-seed';

const ENDPOINTS = [
  { key: 'lead-capture', title: 'Lead Capture Webhook', path: '/leads/webhook', auth: /tenant api_key/i },
  { key: 'sendgrid-events', title: 'SendGrid Event Webhook', path: '/webhooks/sendgrid/events', auth: /signed event webhook/i },
  { key: 'twilio-status', title: 'Twilio Status Callback', path: '/webhooks/twilio/status', auth: /signature verification is not yet enabled/i },
];

test.describe('Webhooks & Integrations', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  });

  test('reachable from Settings → Integrations card', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);
    const card = page.locator('a[href="/settings/integrations"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Integrations');
    await card.click();
    await page.waitForURL('**/settings/integrations');
    await expect(page.getByRole('heading', { name: 'Webhooks & Integrations' })).toBeVisible();
  });

  test('lists all three endpoints with full URL, method, and auth note', async ({ page }) => {
    await page.goto('/settings/integrations');
    await waitForLoad(page);
    await expect(page.getByText('Inbound webhook endpoints for connecting external systems')).toBeVisible();

    for (const ep of ENDPOINTS) {
      await expect(page.getByText(ep.title, { exact: true })).toBeVisible();
      const input = page.locator(`#${ep.key}-url`);
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('readonly', '');
      const value = await input.inputValue();
      expect(value.startsWith('http')).toBe(true);
      expect(value.endsWith(ep.path)).toBe(true);
      // Label is associated with the input (a11y)
      await expect(page.getByLabel('Endpoint URL').nth(ENDPOINTS.indexOf(ep))).toHaveValue(value);
      await expect(page.getByText(ep.auth)).toBeVisible();
    }
    await expect(page.getByText('POST', { exact: true })).toHaveCount(3);
  });

  test('an admin creates a website-form API key, sees it once, and can revoke it', async ({ page }) => {
    await page.goto('/settings/integrations');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Create API key' }).click();
    await expect(page.getByText('API key created')).toBeVisible();
    await expect(page.locator('#issued-api-key')).toHaveValue(/^tcrm_[0-9a-f]{48}$/);
    await expect(page.getByText('Website form API keys')).toBeVisible();

    await page.getByRole('button', { name: /^Revoke key/ }).first().click();
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    await expect(page.getByText('API key revoked')).toBeVisible();
  });

  test('copy button writes the exact URL to the clipboard and confirms', async ({ page }) => {
    await page.goto('/settings/integrations');
    await waitForLoad(page);
    const buttons = page.getByRole('button', { name: 'Copy webhook URL' });
    await expect(buttons).toHaveCount(3);

    for (let i = 0; i < ENDPOINTS.length; i++) {
      const expected = await page.locator(`#${ENDPOINTS[i]!.key}-url`).inputValue();
      await buttons.nth(i).click();
      await expect(page.getByText('Webhook URL copied').first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    }
  });

  test('has no mailto/wa.me/tel anchors and no error toast', async ({ page }) => {
    await page.goto('/settings/integrations');
    await waitForLoad(page);
    await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
    await expect(page.getByText(/Could not copy|Failed|Forbidden|403/i)).toHaveCount(0);
  });

  test('back button returns to Settings', async ({ page }) => {
    await page.goto('/settings/integrations');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await page.waitForURL(/\/settings$/);
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  });

  test('displayed URLs are live receivers (reject malformed payloads with 400, not 404)', async () => {
    const base = API_URL;
    for (const ep of ENDPOINTS) {
      const res = await fetch(`${base}${ep.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status, `${ep.path}`).toBe(400);
    }
  });

  test('lead webhook rejects an invalid api_key and creates no lead', async () => {
    const before = await api('GET', '/leads?limit=1');
    const res = await fetch(`${API_URL}/leads/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: 'invalid-key-e2e', name: 'Webhook E2E', phone: '+919000000000' }),
    });
    expect([400, 401, 403]).toContain(res.status);
    const after = await api('GET', '/leads?limit=1');
    expect(after?.pagination?.total ?? after?.meta?.total).toEqual(before?.pagination?.total ?? before?.meta?.total);
  });

  test('SendGrid and Twilio receivers validate their payload shape', async () => {
    const sg = await fetch(`${API_URL}/webhooks/sendgrid/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ not: 'an array' }),
    });
    expect(sg.status).toBe(400);
    expect((await sg.json()).error.message).toMatch(/array of events/i);

    const tw = await fetch(`${API_URL}/webhooks/twilio/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    expect(tw.status).toBe(400);
    expect((await tw.json()).error.message).toMatch(/missing required/i);
  });
});
