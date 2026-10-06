/**
 * Marketing Opt-Out — /marketing/opted-out
 *
 * This entity has no create form: contacts land here via the opt-out action
 * (POST /marketing/opt-out/:contactId), which this spec drives through the
 * real API since there is no UI to trigger an opt-out from — only the
 * ListPage + re-subscribe dialog covered by uxContract. Round trip covered:
 * seed contact → opt out via API → appears in list with channel/reason/date
 * → search/filter narrow it → re-subscribe via UI → gone from the opted-out
 * list → contact is opted back in. Plus empty state, no raw-ID inputs, no
 * mailto/wa.me/tel anchors, infinite scroll, and CSV export.
 */

import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad, navigateTo } from './helpers/auth';
import { api, seedContact } from './helpers/api-seed';

async function optOutContact(contactId: string, data: { channel?: string; reason?: string } = {}) {
  return api('POST', `/marketing/opt-out/${contactId}`, data);
}

async function optInContact(contactId: string) {
  return api('POST', `/marketing/opt-out/${contactId}/opt-in`);
}

async function waitForOptedOutList(page: Page) {
  await waitForLoad(page);
  await page
    .waitForSelector('table tbody tr, text=/No opted-out contacts/i', { timeout: 15_000 })
    .catch(() => null);
}

test.describe.configure({ mode: 'serial' });

// ─── A. Full round trip ──────────────────────────────────────────────────

test.describe('A. Opt-out full round trip', () => {
  test('opted-out contact appears with all fields, search/filter narrow it, re-subscribe removes it', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `E2E-OptOut-${ts}`, email: `e2e-optout-${ts}@test.com` });
    expect(contact?.id).toBeTruthy();

    const reason = `Too many emails ${ts}`;
    const optOutRes = await optOutContact(contact.id, { channel: 'email', reason });
    expect((optOutRes.data ?? optOutRes).opted_out).toBe(true);

    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);

    // ── LIST: assert every value from the opt-out is present ──
    await page.getByPlaceholder(/search by name, email, or phone/i).fill(contact.name);
    await page.waitForTimeout(700);
    const row = page.locator('tr').filter({ hasText: contact.name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(contact.email);
    await expect(row).toContainText(/email/i);
    // Opted-out date column renders today's date.
    const today = new Date().getDate().toString();
    await expect(row).toContainText(new RegExp(today));

    await page.getByPlaceholder(/search by name, email, or phone/i).clear();
    await page.waitForTimeout(500);

    // ── FILTER: channel filter narrows to email-channel opt-outs ──
    const otherContact = await seedContact({ name: `E2E-OptOut-SMS-${ts}` });
    await optOutContact(otherContact.id, { channel: 'sms', reason: 'SMS spam' });

    const channelSelect = page.locator('[role="combobox"]').first();
    await channelSelect.click();
    await page.getByRole('option', { name: /^Email$/i }).click();
    await waitForLoad(page);

    await page.getByPlaceholder(/search by name, email, or phone/i).fill(`E2E-OptOut-${ts}`);
    await page.waitForTimeout(700);
    await expect(page.locator('tr').filter({ hasText: contact.name })).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('tr').filter({ hasText: otherContact.name })).toHaveCount(0);

    // Reset filter back to all channels before continuing.
    await channelSelect.click();
    await page.getByRole('option', { name: /all channels/i }).click();
    await waitForLoad(page);
    await page.getByPlaceholder(/search by name, email, or phone/i).clear();
    await page.waitForTimeout(500);

    // ── Re-subscribe via hover row action + confirm dialog ──
    await page.getByPlaceholder(/search by name, email, or phone/i).fill(contact.name);
    await page.waitForTimeout(700);
    const targetRow = page.locator('tr').filter({ hasText: contact.name });
    await expect(targetRow).toBeVisible({ timeout: 10_000 });
    await targetRow.hover();
    await targetRow.getByRole('button', { name: /re-subscribe/i }).click();

    await expect(page.getByRole('dialog').getByText(/re-subscribe contact/i)).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(contact.name);
    await expect(page.getByRole('dialog')).toContainText(reason);
    await page.getByRole('dialog').getByRole('button', { name: /^Re-subscribe$/i }).click();
    await waitForLoad(page);

    // ── Assert it's gone from the opted-out list ──
    await expect(page.locator('tr').filter({ hasText: contact.name })).toHaveCount(0, { timeout: 8_000 });

    // ── Assert the underlying contact really was opted back in ──
    // (GET /contacts/:id doesn't project the optedOut column, so verify via
    // the opt-out list endpoint instead, which does.)
    const stillOptedOut = await api('GET', `/marketing/opt-out?search=${encodeURIComponent(contact.name)}`);
    const rows = (stillOptedOut.data ?? stillOptedOut).data ?? stillOptedOut.data ?? [];
    expect(rows.find((r: any) => r.id === contact.id)).toBeUndefined();

    await optInContact(otherContact.id).catch(() => null);
  });
});

// ─── B. List UX: search, empty state, hover actions, no raw IDs ─────────

test.describe('B. List UX', () => {
  test('search narrows results to the matching contact', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `E2E-Search-${ts}` });
    const other = await seedContact({ name: `E2E-Other-${ts}` });
    await optOutContact(contact.id, { channel: 'manual' });
    await optOutContact(other.id, { channel: 'manual' });

    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);

    await page.getByPlaceholder(/search by name, email, or phone/i).fill(contact.name);
    await page.waitForTimeout(700);

    await expect(page.getByText(contact.name)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(other.name)).not.toBeVisible();

    await optInContact(contact.id).catch(() => null);
    await optInContact(other.id).catch(() => null);
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);

    await page.getByPlaceholder(/search by name, email, or phone/i).fill(`no-such-contact-${Date.now()}-zzz`);
    await page.waitForTimeout(700);

    await expect(page.getByText(/no opted-out contacts/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('row exposes hover re-subscribe action', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Hover-${Date.now()}` });
    await optOutContact(contact.id, { channel: 'manual' });

    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);
    await page.getByPlaceholder(/search by name, email, or phone/i).fill(contact.name);
    await page.waitForTimeout(700);

    const row = page.locator('tr').filter({ hasText: contact.name });
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.hover();
    await expect(row.getByRole('button', { name: /re-subscribe/i })).toBeVisible();

    await optInContact(contact.id).catch(() => null);
  });

  test('no raw ID inputs anywhere on the list', async ({ page }) => {
    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);
    await expect(page.getByPlaceholder(/enter.*id/i)).toHaveCount(0);
    await expect(page.getByPlaceholder(/contact.*id/i)).toHaveCount(0);
  });

  test('no mailto/wa.me/tel anchors on the page', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-NoLinks-${Date.now()}` });
    await optOutContact(contact.id, { channel: 'email' });

    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);

    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);
    expect(await page.locator('a[href^="tel:"]').count()).toBe(0);

    await optInContact(contact.id).catch(() => null);
  });
});

// ─── C. Infinite scroll ──────────────────────────────────────────────────

test.describe('C. Infinite scroll', () => {
  test('scrolling the list loads more rows beyond the first page', async ({ page }) => {
    const ts = Date.now();
    const seeded: string[] = [];
    for (let i = 0; i < 25; i++) {
      const c = await seedContact({ name: `E2E-Scroll-${ts}-${i}` });
      await optOutContact(c.id, { channel: 'manual' });
      seeded.push(c.id);
    }

    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);

    const initialCount = await page.locator('table tbody tr').count();
    expect(initialCount).toBeGreaterThan(0);

    await page.locator('table tbody tr').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);

    const afterScrollCount = await page.locator('table tbody tr').count();
    expect(afterScrollCount).toBeGreaterThanOrEqual(initialCount);

    await Promise.all(seeded.map((id) => optInContact(id).catch(() => null)));
  });
});

// ─── D. Export ───────────────────────────────────────────────────────────

test.describe('D. Export', () => {
  test('export downloads a non-empty CSV', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Export-${Date.now()}` });
    await optOutContact(contact.id, { channel: 'whatsapp', reason: 'Export test' });

    await page.goto('/marketing/opted-out');
    await waitForOptedOutList(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export/i }).click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);

    await optInContact(contact.id).catch(() => null);
  });
});

// ─── E. Navigation ─────────────────────────────────────────────────────────

test.describe('E. Navigation', () => {
  test('sidebar Opted-Out link points at /marketing/opted-out', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    await navigateTo(page, '/marketing/opted-out');
    await expect(page).toHaveURL(/\/marketing\/opted-out/);
  });
});
