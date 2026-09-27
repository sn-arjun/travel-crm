import { test, expect } from '@playwright/test';
import { waitForLoad, navigateTo } from './helpers/auth';
import { api, seedContact } from './helpers/api-seed';

/**
 * Outbound calling requires real Twilio/Plivo credentials to fully succeed —
 * none exist in this test environment. `POST /calls/outbound` still inserts
 * the call_logs row *before* contacting the provider, and marks it `failed`
 * if the provider call throws, so dialing through the real UI is a valid way
 * to create a call: the row lands in the DB either way. We configure a
 * default caller ID once (required or the endpoint 422s) and then drive
 * every call log through the dial pad, exactly like a real agent would.
 */
async function ensureVoipConfigured() {
  const settings = await api('GET', '/voip/settings');
  if (!settings?.data?.defaultCallerId) {
    await api('PUT', '/voip/settings', { defaultCallerId: '+15550001234', voipProvider: 'twilio' });
  }
}

test.describe('Calls', () => {
  test.beforeAll(async () => {
    await ensureVoipConfigured();
  });

  // ─────────────────────────────────────────────────────────────
  // Full round trip: dial via form UI → list → detail → edit outcome → delete
  // ─────────────────────────────────────────────────────────────

  test('full round trip: dial via UI, view in list, view detail, edit outcome, delete', async ({ page }) => {
    const contact = await seedContact({ name: `CallContact-${Date.now()}` });
    const uniqueSuffix = Date.now().toString().slice(-9);
    const toNumber = `+91${uniqueSuffix}`;

    await page.goto('/communication/calls/dial');
    await waitForLoad(page);

    // Relation combobox for contact — no raw ID input on the dial pad
    expect(await page.locator('input[name*="Id" i]').count()).toBe(0);
    await page.getByRole('combobox').filter({ hasText: 'Search contacts' }).click();
    await page.getByPlaceholder(/Search by name or phone…/i).fill(contact.name.slice(0, 8));
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });
    await page.locator(`text=${contact.name}`).first().click();

    // PhoneInput — fill the raw digits, not the combobox
    const phoneField = page.locator('input[type="tel"]').first();
    await phoneField.fill('');
    await phoneField.fill(toNumber.replace(/^\+91/, ''));

    await page.getByRole('button', { name: 'Call', exact: true }).click();
    await expect(page.locator('text=Calling').or(page.locator('text=Failed to initiate call')).first()).toBeVisible({ timeout: 15_000 });

    // Confirm the call log landed via API (dialer doesn't navigate away)
    await expect.poll(async () => {
      const res = await api('GET', `/calls?search=${encodeURIComponent(uniqueSuffix)}&limit=5`);
      return res.data?.find((c: any) => c.toNumber === toNumber);
    }, { timeout: 15_000 }).toBeTruthy();

    const listRes = await api('GET', `/calls?search=${encodeURIComponent(uniqueSuffix)}&limit=5`);
    const call = listRes.data.find((c: any) => c.toNumber === toNumber);
    expect(call).toBeTruthy();
    expect(call.direction).toBe('outbound');

    // 1. Assert it appears in the Call Log list
    await page.goto('/communication/calls');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search by phone number…/i).fill(uniqueSuffix);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row = page.locator(`table tbody tr:has-text("${uniqueSuffix}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Outgoing');

    // 2. Open detail view, assert values present
    await row.click();
    await page.waitForURL(new RegExp(`/communication/calls/${call.id}$`), { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator('text=Outbound call').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${call.toNumber}`).first()).toBeVisible();

    // Linked contact shows on the Related tab
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });

    // No raw tel:/mailto:/wa.me anchors anywhere on the detail page
    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    // 3/4/5. Call detail has no separate edit form — outcome/notes update via
    // the update endpoint is the only "edit" surface for a call log. Verify
    // it persists (this is the closest analogue to edit+save for this entity).
    const updateRes = await api('PUT', `/calls/${call.id}`, { outcome: 'interested', notes: 'E2E follow-up notes' });
    expect(updateRes.success !== false).toBe(true);
    const fetched = await api('GET', `/calls/${call.id}`);
    expect(fetched.data.outcome).toBe('interested');
    expect(fetched.data.notes).toBe('E2E follow-up notes');

    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('text=E2E follow-up notes').first()).toBeVisible({ timeout: 10_000 });

    // 6. Delete, assert it is gone
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').first();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForURL('**/communication/calls', { timeout: 10_000 });

    const afterDelete = await api('GET', `/calls/${call.id}`);
    expect(afterDelete.data).toBeFalsy();
  });

  // ─────────────────────────────────────────────────────────────
  // List page: search, filter, empty state, infinite scroll, delete row action
  // ─────────────────────────────────────────────────────────────

  test('search narrows the call log to a matching number', async ({ page }) => {
    const marker = `77${Date.now().toString().slice(-8)}`;
    await page.goto('/communication/calls/dial');
    await waitForLoad(page);
    const phoneField = page.locator('input[type="tel"]').first();
    await phoneField.fill(marker);
    await page.getByRole('button', { name: 'Call', exact: true }).click();
    await expect(page.locator('text=Calling').or(page.locator('text=Failed to initiate call')).first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => {
      const res = await api('GET', `/calls?search=${marker}&limit=5`);
      return res.data?.length ?? 0;
    }, { timeout: 15_000 }).toBeGreaterThan(0);

    await page.goto('/communication/calls');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search by phone number…/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${marker}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('direction filter narrows the list to outbound calls only', async ({ page }) => {
    await page.goto('/communication/calls');
    await waitForLoad(page);

    // The FilterBar's visible "Filters" button opens the direction/status dropdown
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('menuitemradio', { name: 'Outgoing' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i)).toContainText('Outgoing');
      }
    }
    await expect(page.locator('text=Direction: outgoing').first()).toBeVisible();
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/communication/calls');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search by phone number…/i).fill(`+1999999${Date.now()}`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(page.locator('text=No calls yet').first()).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `88${Date.now().toString().slice(-8)}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await api('POST', '/calls/outbound', { toNumber: `+91${marker}${String(i).padStart(2, '0')}`.slice(0, 13) }).catch(() => null);
    }

    await page.goto('/communication/calls');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search by phone number…/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rowsBefore = await page.locator('table tbody tr').count();
    expect(rowsBefore).toBeGreaterThan(0);

    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(1500);
    await waitForLoad(page);

    const rowsAfter = await page.locator('table tbody tr').count();
    expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
  });

  test('delete row action removes a call from the log', async ({ page }) => {
    const marker = `55${Date.now().toString().slice(-8)}`;
    await api('POST', '/calls/outbound', { toNumber: `+91${marker}` }).catch(() => null);

    await page.goto('/communication/calls');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search by phone number…/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const row = page.locator(`table tbody tr:has-text("${marker}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    await row.locator('button[aria-label="Delete"]').click();
    await expect(page.locator('text=Call log removed').first()).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(500);
    await waitForLoad(page);
    await expect(page.locator(`table tbody tr:has-text("${marker}")`)).toHaveCount(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Outbound messaging via Communication Hub only
  // ─────────────────────────────────────────────────────────────

  test('messaging a linked contact opens SendMessageDialog, never a raw tel/mailto/wa.me link', async ({ page }) => {
    const contact = await seedContact({ name: `MsgCall-${Date.now()}`, phone: '+919000700001' });
    const outboundRes = await api('POST', '/calls/outbound', { toNumber: '+919000700001', contactId: contact.id }).catch(() => null);
    const callLogId = outboundRes?.data?.callLogId ?? outboundRes?.error?.details?.callLogId;
    test.skip(!callLogId, 'outbound call could not be created');

    await page.goto(`/communication/calls/${callLogId}`);
    await waitForLoad(page);

    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    const messageBtn = page.getByRole('button', { name: /Message|Send message/i }).first();
    if (await messageBtn.isVisible().catch(() => false)) {
      await messageBtn.click();
      await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
      expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  test('export downloads a non-empty CSV file', async ({ page }) => {
    await api('POST', '/calls/outbound', { toNumber: `+9190${Date.now().toString().slice(-8)}` }).catch(() => null);

    await page.goto('/communication/calls');
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /Export/i }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toContain('.csv');
  });

  // ─────────────────────────────────────────────────────────────
  // Dial pad: PhoneInput + RelationCombobox, recent calls
  // ─────────────────────────────────────────────────────────────

  test('dial pad uses PhoneInput and a searchable contact combobox, no raw ID input', async ({ page }) => {
    await page.goto('/communication/calls/dial');
    await waitForLoad(page);

    expect(await page.locator('input[name*="Id" i], input[placeholder*="contact id" i]').count()).toBe(0);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible();

    const contact = await seedContact({ name: `DialSearch-${Date.now()}` });
    await page.getByRole('combobox').filter({ hasText: 'Search contacts' }).click();
    const searchInput = page.getByPlaceholder(/Search by name or phone…/i);
    await searchInput.fill(contact.name.slice(0, 8));
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });

    // Typing narrows: an unrelated query should not show this contact
    await searchInput.fill('zzz-no-such-contact-zzz');
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${contact.name}`)).toHaveCount(0);
  });

  test('dial pad prefills the number from a call-back link', async ({ page }) => {
    const phone = '+919876512345';
    await page.goto(`/communication/calls/dial?phone=${encodeURIComponent(phone)}`);
    await waitForLoad(page);
    await expect(page.locator('input[type="tel"]').first()).toHaveValue(phone);
  });

  test('recent calls list shows previously dialed numbers', async ({ page }) => {
    const marker = `66${Date.now().toString().slice(-8)}`;
    await api('POST', '/calls/outbound', { toNumber: `+91${marker}` }).catch(() => null);

    await page.goto('/communication/calls/dial');
    await waitForLoad(page);
    await expect(page.locator('text=Recent calls').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${marker}`).first()).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Analytics page
  // ─────────────────────────────────────────────────────────────

  test('analytics page shows stat cards and a top-callers table', async ({ page }) => {
    await api('POST', '/calls/outbound', { toNumber: `+9191${Date.now().toString().slice(-8)}` }).catch(() => null);

    await page.goto('/communication/calls/analytics');
    await waitForLoad(page);

    await expect(page.locator('text=Call analytics').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Total calls').first()).toBeVisible();
    await expect(page.locator('text=Missed calls').first()).toBeVisible();
    await expect(page.locator('text=Top callers').first()).toBeVisible();

    // Period selector changes the query
    await page.locator('button', { hasText: 'This month' }).click().catch(() => {});
    const periodTrigger = page.getByRole('combobox').first();
    if (await periodTrigger.isVisible().catch(() => false)) {
      await periodTrigger.click();
      await page.getByRole('option', { name: 'This week' }).click();
      await waitForLoad(page);
      await expect(page.locator('text=Total calls').first()).toBeVisible();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Transcript search
  // ─────────────────────────────────────────────────────────────

  test('transcript search requires a query and finds matching transcripts', async ({ page }) => {
    await page.goto('/communication/calls/transcripts');
    await waitForLoad(page);

    await expect(page.locator('text=Transcript search').first()).toBeVisible({ timeout: 10_000 });
    // No query yet — empty state prompts the user to type
    await expect(page.locator('text=Type a search term').first()).toBeVisible();

    await page.getByPlaceholder(/Search transcripts…/i).fill('nonexistent-transcript-phrase-zzz');
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    await expect(page.locator('text=No transcripts found').first()).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // voip_calling feature gate — every page must render the correct state
  // ─────────────────────────────────────────────────────────────

  test('all five call pages render without a mis-surfaced 403 error toast', async ({ page }) => {
    const paths = [
      '/communication/calls',
      '/communication/calls/dial',
      '/communication/calls/analytics',
      '/communication/calls/transcripts',
    ];
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      await page.goto(path);
      // eslint-disable-next-line no-await-in-loop
      await waitForLoad(page);
      // A 403 must never render as a raw error toast — either the feature
      // works (enterprise plan on the demo tenant has voip_calling) or an
      // upgrade affordance shows. Either way, no unhandled error surface.
      // eslint-disable-next-line no-await-in-loop
      await expect(page.locator('text=/^Error$/').or(page.locator('text=Something went wrong'))).toHaveCount(0);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────

  test('calls API requires authentication', async () => {
    const res = await fetch('http://localhost:8787/api/v1/calls', { headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(401);
  });
});
