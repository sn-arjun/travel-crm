/**
 * Notifications — one real E2E spec for the whole slice.
 *
 * Covers (merged from the former 10-m10-notifications.spec.ts):
 *   - Announcements compose form (create through the UI) → notification in the list
 *   - Notifications list: values, search, type + unread filters, empty state,
 *     mark read, mark all read, delete, bulk delete, export, infinite scroll
 *   - Deep linking (lead assignment notification → lead page)
 *   - Notification preferences (8 types × 3 channels, mute all, persistence)
 *   - Quiet hours (integer hours, enable/disable, persistence)
 *   - Sidebar badge, navigation, and no mailto:/wa.me/tel: anchors
 */
import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedLead, api } from './helpers/api-seed';

const ts = Date.now();

async function openNotifications(page: Page) {
  await page.goto('/notifications');
  await expect(page.locator('h1', { hasText: /^Notifications$/ })).toBeVisible();
  await waitForLoad(page);
}

function row(page: Page, text: string) {
  return page.locator('tbody tr', { hasText: text }).first();
}

async function sendAnnouncementViaApi(title: string, body: string) {
  const res = await api('POST', '/notifications/announce', { title, body });
  expect(res.success, JSON.stringify(res)).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Announcements — the creation form
// ─────────────────────────────────────────────────────────────────────────────

const ANN_TITLE = `E2E Announcement ${ts}`;
const ANN_BODY = `Quarterly offsite details for ${ts}`;

test.describe.serial('Announcements form', () => {
  test('form has recipients/title/body, validates, previews, and offers every role', async ({ page }) => {
    await page.goto('/settings/announcements');
    await expect(page.getByRole('heading', { name: /send announcement/i })).toBeVisible();
    await expect(page.getByText(/new announcement/i).first()).toBeVisible();
    await waitForLoad(page);

    await expect(page.locator('#target')).toBeVisible();
    await expect(page.locator('#ann-title')).toBeVisible();
    await expect(page.locator('#ann-body')).toBeVisible();

    // Submit is disabled until both title and body are present
    const sendBtn = page.getByRole('button', { name: /send announcement/i });
    await expect(sendBtn).toBeDisabled();
    await page.locator('#ann-title').fill('Only title');
    await expect(sendBtn).toBeDisabled();
    await page.locator('#ann-body').fill('Now with body');
    await expect(sendBtn).toBeEnabled();

    // Live preview mirrors input
    await page.locator('#ann-title').fill(`Preview Title ${ts}`);
    await page.locator('#ann-body').fill(`Preview body ${ts}`);
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByText(`Preview Title ${ts}`).first()).toBeVisible();
    await expect(page.getByText(`Preview body ${ts}`).first()).toBeVisible();

    // Recipients is a fixed-option select, not a raw ID input
    await page.locator('#target').click();
    for (const name of ['All Team Members', 'Admins Only', 'Sales Managers', 'Salespersons', 'Accountants']) {
      await expect(page.getByRole('option', { name })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('input[name*="userId" i], input[placeholder*="user id" i]')).toHaveCount(0);
  });

  test('sending an announcement via the form toasts, resets the form', async ({ page }) => {
    await page.goto('/settings/announcements');
    await waitForLoad(page);

    await page.locator('#target').click();
    await page.getByRole('option', { name: 'Admins Only' }).click();
    await page.locator('#ann-title').fill(ANN_TITLE);
    await page.locator('#ann-body').fill(ANN_BODY);
    await page.getByRole('button', { name: /send announcement/i }).click();

    await expect(page.getByText(/announcement sent to \d+ team member/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/failed to send/i)).toHaveCount(0);

    // Form resets (title/body cleared, recipients back to All)
    await expect(page.locator('#ann-title')).toHaveValue('');
    await expect(page.locator('#ann-body')).toHaveValue('');
    await expect(page.locator('#target')).toContainText('All Team Members');
  });

  test('back button returns to settings', async ({ page }) => {
    await page.goto('/settings/announcements');
    await waitForLoad(page);
    await page.locator('button:has(svg.lucide-arrow-left)').first().click();
    await page.waitForURL(/\/settings\/?$/, { timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Notifications list
// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Notifications list', () => {
  test('announcement from the form appears with every value', async ({ page }) => {
    await openNotifications(page);

    const r = row(page, ANN_TITLE);
    await expect(r).toBeVisible({ timeout: 10_000 });
    await expect(r.getByText(ANN_BODY)).toBeVisible();
    await expect(r.getByText('Announcement', { exact: true })).toBeVisible(); // title badge
    await expect(r.getByText('Announcements', { exact: true })).toBeVisible(); // type column
    await expect(r.getByText('Unread', { exact: true })).toBeVisible();
    await expect(r.getByText(/just now|\dm ago/i)).toBeVisible();

    // List header: description + count, filter bar present, no skeleton/spinner left
    await expect(page.getByText(/stay on top of what needs your attention/i)).toBeVisible();
    await expect(page.getByPlaceholder(/search notifications/i)).toBeVisible();
    expect(await page.locator('.animate-spin').count()).toBe(0);
  });

  test('page shows no mailto:/wa.me/tel: anchors (no direct outbound messaging)', async ({ page }) => {
    await openNotifications(page);
    await expect(row(page, ANN_TITLE)).toBeVisible();
    await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
  });

  test('search narrows results and a non-matching search shows the empty state', async ({ page }) => {
    const other = `E2E-Other-${ts}`;
    await sendAnnouncementViaApi(other, 'different body');
    await openNotifications(page);
    await expect(row(page, other)).toBeVisible();
    await expect(row(page, ANN_TITLE)).toBeVisible();

    const search = page.getByPlaceholder(/search notifications/i);
    await search.fill(ANN_TITLE);
    await expect(row(page, ANN_TITLE)).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: other })).toHaveCount(0);

    // Matches on message body too
    await search.fill(`different body`);
    await expect(row(page, other)).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: ANN_TITLE })).toHaveCount(0);

    await search.fill(`zzz-no-match-${ts}`);
    await expect(page.getByText('No notifications yet')).toBeVisible();
    await expect(page.getByText(/you're all caught up/i)).toBeVisible();

    await search.fill('');
    await expect(row(page, ANN_TITLE)).toBeVisible();
  });

  test('type filter narrows to the chosen type, shows a chip, and can be cleared', async ({ page }) => {
    await openNotifications(page);
    await expect(row(page, ANN_TITLE)).toBeVisible();

    await page.getByRole('combobox', { name: /filter by type/i }).click();
    await page.getByRole('option', { name: 'Payments' }).click();

    await expect(page.locator('[data-slot="badge"]', { hasText: 'Payments' })).toBeVisible();
    // No announcement matches the Payments type
    await expect(page.locator('tbody tr', { hasText: ANN_TITLE })).toHaveCount(0);
    // Whatever remains (if anything) is strictly of the Payments type
    for (const t of await page.locator('tbody tr[tabindex="0"] td:nth-child(3)').allTextContents()) {
      expect(t.trim()).toBe('Payments');
    }

    await page.getByRole('combobox', { name: /filter by type/i }).click();
    await page.getByRole('option', { name: 'Announcements' }).click();
    await expect(page.locator('[data-slot="badge"]', { hasText: 'Announcements' })).toBeVisible();
    await expect(row(page, ANN_TITLE)).toBeVisible();

    // Remove the chip via its X
    await page.locator('[data-slot="badge"]', { hasText: 'Announcements' }).getByRole('button').click();
    await expect(page.locator('[data-slot="badge"]', { hasText: 'Type:' })).toHaveCount(0);
  });

  test('unread-only toggle filters to unread rows; Clear all resets', async ({ page }) => {
    // Make one notification read so the filter has something to exclude
    const readTitle = `E2E-ReadMe-${ts}`;
    await sendAnnouncementViaApi(readTitle, 'to be read');
    await openNotifications(page);
    await row(page, readTitle).click(); // click marks read
    await expect(row(page, readTitle).getByText('Read', { exact: true })).toBeVisible();

    const unreadBtn = page.getByRole('button', { name: /^unread only$/i });
    await unreadBtn.click();
    await expect(page.getByText('Unread only').nth(1)).toBeVisible(); // chip (button is first)
    await expect(page.locator('tbody tr', { hasText: readTitle })).toHaveCount(0);
    await expect(row(page, ANN_TITLE)).toBeVisible();
    // every visible row is unread
    const statuses = await page.locator('tbody tr[tabindex="0"] td:nth-child(4)').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(s.trim()).toBe('Unread');

    await page.getByRole('button', { name: /clear all/i }).click();
    await expect(unreadBtn).toHaveAttribute('data-variant', 'outline');
    await expect(row(page, readTitle)).toBeVisible();
  });

  test('row actions: hover shows Delete (no View for announcements) and clicking a row marks it read', async ({ page }) => {
    const t = `E2E-Hover-${ts}`;
    await sendAnnouncementViaApi(t, 'hover body');
    await openNotifications(page);

    const r = row(page, t);
    await expect(r.getByText('Unread', { exact: true })).toBeVisible();
    const before = (await api('GET', '/notifications/unread-count')).data.unreadCount;

    await r.hover();
    await expect(r.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(r.getByRole('button', { name: 'View' })).toHaveCount(0); // announcements have no target entity

    await r.getByText(t).click();
    await expect(r.getByText('Read', { exact: true })).toBeVisible();
    await expect.poll(async () => (await api('GET', '/notifications/unread-count')).data.unreadCount).toBe(before - 1);
    await expect(page).toHaveURL(/\/notifications$/); // no route → stays put
  });

  test('delete removes the notification (row action) and it stays gone after reload', async ({ page }) => {
    const t = `E2E-ToDelete-${ts}`;
    await sendAnnouncementViaApi(t, 'delete me');
    await openNotifications(page);

    const r = row(page, t);
    await expect(r).toBeVisible();
    await r.hover();
    await r.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Notification deleted')).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: t })).toHaveCount(0);

    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('tbody tr', { hasText: t })).toHaveCount(0);
  });

  test('bulk select → Mark as read, then bulk Delete', async ({ page }) => {
    const a = `E2E-Bulk-A-${ts}`;
    const b = `E2E-Bulk-B-${ts}`;
    await sendAnnouncementViaApi(a, 'bulk a');
    await sendAnnouncementViaApi(b, 'bulk b');
    await openNotifications(page);
    await page.getByPlaceholder(/search notifications/i).fill(`-${ts}`);
    await expect(row(page, a)).toBeVisible();
    await expect(row(page, b)).toBeVisible();

    await row(page, a).getByRole('checkbox').click();
    await row(page, b).getByRole('checkbox').click();
    await expect(page.getByText('2 selected')).toBeVisible();

    await page.getByText('2 selected').locator('xpath=..').getByRole('button', { name: 'Mark as read' }).click();
    await expect(row(page, a).getByText('Read', { exact: true })).toBeVisible();
    await expect(row(page, b).getByText('Read', { exact: true })).toBeVisible();

    // selection survives the refetch
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByText('2 selected').locator('xpath=..').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('2 notifications deleted')).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: a })).toHaveCount(0);
    await expect(page.locator('tbody tr', { hasText: b })).toHaveCount(0);
  });

  test('export downloads a non-empty CSV containing the notifications', async ({ page }) => {
    await openNotifications(page);
    await expect(row(page, ANN_TITLE)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^notifications-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const ch of stream) chunks.push(ch as Buffer);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv.length).toBeGreaterThan(0);
    expect(csv.split('\n')[0]).toBe('Title,Message,Type,Status,Created At');
    expect(csv).toContain(ANN_TITLE);
    expect(csv).toContain(ANN_BODY);
  });

  test('mark all as read clears unread state and the sidebar badge', async ({ page }) => {
    await sendAnnouncementViaApi(`E2E-MarkAll-${ts}`, 'mark all');
    await openNotifications(page);
    await expect(row(page, `E2E-MarkAll-${ts}`).getByText('Unread', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /mark all as read/i }).click();
    await expect(page.getByText('All notifications marked as read')).toBeVisible();
    await expect(row(page, `E2E-MarkAll-${ts}`).getByText('Read', { exact: true })).toBeVisible();

    await expect.poll(async () => (await api('GET', '/notifications/unread-count')).data.unreadCount).toBe(0);
    // Sidebar badge on the Notifications link must be gone (count 0)
    const link = page.locator('aside a[href="/notifications"]');
    await expect(link).toBeVisible();
    await expect(link).not.toContainText(/\d/);
  });

  test('infinite scroll loads more rows past the first page', async ({ page }) => {
    // Top up only if the tenant has fewer than two pages of notifications
    // (each announcement fans out to push-queue jobs, so avoid seeding needlessly).
    const total: number = (await api('GET', '/notifications?limit=1')).data.total;
    for (let i = total; i < 25; i++) await sendAnnouncementViaApi(`E2E-Scroll-${ts}-${i}`, `scroll ${i}`);
    const expectedTotal = Math.max(total, 25);

    await openNotifications(page);
    // Header count reflects the full dataset, not just the loaded page
    await expect(page.getByText(String(expectedTotal), { exact: true }).first()).toBeVisible();

    const rows = page.locator('tbody tr[tabindex="0"]');
    await expect.poll(() => rows.count()).toBe(20); // first page only
    await expect
      .poll(async () => {
        await rows.last().scrollIntoViewIfNeeded().catch(() => {});
        await page.keyboard.press('End');
        return rows.count();
      }, { timeout: 20_000 })
      .toBeGreaterThan(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Deep linking — a real lead-assignment notification
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Notification deep link', () => {
  test('lead-assignment notification offers View and navigates to the lead', async ({ page }) => {
    const me = (await api('GET', '/users/me')).data;
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `E2E DeepLink Lead ${ts}` });
    const res = await api('POST', `/leads/${lead.id}/assign`, { assignedTo: me.id });
    expect(res.success, JSON.stringify(res)).toBe(true);

    await openNotifications(page);
    const r = row(page, `E2E DeepLink Lead ${ts}`);
    await expect(r).toBeVisible({ timeout: 10_000 });
    await expect(r.getByText('Lead Assigned', { exact: true })).toBeVisible();
    await r.hover();
    await expect(r.getByRole('button', { name: 'View' })).toBeVisible();

    await r.getByText(`E2E DeepLink Lead ${ts}`).click();
    await page.waitForURL(new RegExp(`/leads/${lead.id}`), { timeout: 15_000 });
    await expect(page.getByText(`E2E DeepLink Lead ${ts}`).first()).toBeVisible();

    // The click also marked it read
    await openNotifications(page);
    await expect(row(page, `E2E DeepLink Lead ${ts}`).getByText('Read', { exact: true })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Notification preferences
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS = [
  'Lead Assigned',
  'Lead Status Change',
  'Follow-up Reminder',
  'Payment Received',
  'Task Assigned',
  'Birthday Reminder',
  'Invoice Overdue',
  'Announcements',
];

/** Switch for a given type row + channel column (0=Email, 1=Push, 2=In-App). */
function prefSwitch(page: Page, label: string, channel: 0 | 1 | 2) {
  return page
    .locator('div.grid', { has: page.getByText(label, { exact: true }) })
    .last()
    .getByRole('switch')
    .nth(channel);
}

test.describe.serial('Notification preferences', () => {
  test('lists all 8 types with Email/Push/In-App columns and a mute-all switch', async ({ page }) => {
    await page.goto('/settings/notifications');
    await expect(page.getByRole('heading', { name: /notification preferences/i })).toBeVisible();
    await waitForLoad(page);

    for (const l of TYPE_LABELS) await expect(page.getByText(l, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Email', { exact: true })).toBeVisible();
    await expect(page.getByText('Push', { exact: true })).toBeVisible();
    await expect(page.getByText('In-App', { exact: true })).toBeVisible();
    await expect(page.getByText(/mute all notifications/i)).toBeVisible();
    await expect(page.getByRole('switch').first()).toBeVisible();
    // 1 mute + 8×3 channel + 1 quiet hours
    await expect(page.getByRole('switch')).toHaveCount(1 + 8 * 3 + 1);
  });

  test('mute all disables the type grid', async ({ page }) => {
    await page.goto('/settings/notifications');
    await waitForLoad(page);

    await page.getByRole('switch').first().click();
    await expect(page.locator('.opacity-50.pointer-events-none')).toBeVisible();
    await page.getByRole('switch').first().click();
    await expect(page.locator('.opacity-50.pointer-events-none')).toHaveCount(0);
  });

  test('toggling a channel saves the type-first payload and persists across reload', async ({ page }) => {
    await page.goto('/settings/notifications');
    await waitForLoad(page);

    const sw = prefSwitch(page, 'Task Assigned', 0); // Email column
    const before = await sw.getAttribute('aria-checked');
    await sw.click();
    const expected = before === 'true' ? 'false' : 'true';
    await expect(sw).toHaveAttribute('aria-checked', expected);

    const reqPromise = page.waitForRequest((r) => /notification-preferences\/me$/.test(r.url()) && r.method() === 'PUT');
    await page.getByRole('button', { name: /save preferences/i }).click();
    const payload = (await reqPromise).postDataJSON();
    await expect(page.getByText(/notification preferences saved/i)).toBeVisible();

    // type-first, snake_case, all three channel booleans
    expect(Object.keys(payload)).toContain('preferences');
    const keys = Object.keys(payload.preferences);
    expect(keys.some((k) => /[A-Z]/.test(k))).toBe(false);
    expect(keys).toContain('task_assigned');
    for (const k of keys) {
      expect(typeof payload.preferences[k].push_enabled).toBe('boolean');
      expect(typeof payload.preferences[k].in_app_enabled).toBe('boolean');
      expect(typeof payload.preferences[k].email_enabled).toBe('boolean');
    }
    expect(payload.preferences.task_assigned.email_enabled).toBe(expected === 'true');

    await page.reload();
    await waitForLoad(page);
    await expect(prefSwitch(page, 'Task Assigned', 0)).toHaveAttribute('aria-checked', expected);

    // restore
    await prefSwitch(page, 'Task Assigned', 0).click();
    await page.getByRole('button', { name: /save preferences/i }).click();
    await expect(page.getByText(/notification preferences saved/i)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Quiet hours
// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Quiet hours', () => {
  const qhSwitch = (page: Page) => page.getByRole('switch').last();

  test('enabling reveals time inputs; saving sends integer hours and persists across reload', async ({ page }) => {
    await page.goto('/settings/notifications');
    await waitForLoad(page);

    await expect(page.getByText(/quiet hours/i).first()).toBeVisible();
    await expect(page.getByText(/enable quiet hours/i)).toBeVisible();

    if ((await qhSwitch(page).getAttribute('aria-checked')) !== 'true') await qhSwitch(page).click();
    await expect(page.locator('#quietStart')).toBeVisible();
    await expect(page.locator('#quietEnd')).toBeVisible();

    await page.locator('#quietStart').fill('21:00');
    await page.locator('#quietEnd').fill('06:00');

    const reqPromise = page.waitForRequest((r) => /quiet-hours$/.test(r.url()) && r.method() === 'PUT');
    await page.getByRole('button', { name: /save quiet hours/i }).click();
    const payload = (await reqPromise).postDataJSON();
    await expect(page.getByText(/quiet hours saved/i)).toBeVisible();
    expect(payload.startHour).toBe(21);
    expect(payload.endHour).toBe(6);

    await page.reload();
    await waitForLoad(page);
    await expect(qhSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#quietStart')).toHaveValue('21:00');
    await expect(page.locator('#quietEnd')).toHaveValue('06:00');
  });

  test('disabling and saving persists as disabled after reload', async ({ page }) => {
    await page.goto('/settings/notifications');
    await waitForLoad(page);

    await expect(qhSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await qhSwitch(page).click();
    await expect(page.locator('#quietStart')).toHaveCount(0);
    await page.getByRole('button', { name: /save quiet hours/i }).click();
    await expect(page.getByText(/quiet hours disabled/i)).toBeVisible();

    await page.reload();
    await waitForLoad(page);
    await expect(qhSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#quietStart')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Navigation & sidebar badge
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Navigation and sidebar badge', () => {
  test('sidebar link opens the notifications list', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    const link = page.locator('aside a[href="/notifications"]');
    await expect(link).toContainText('Notifications');
    await link.click();
    await page.waitForURL('**/notifications', { timeout: 10_000 });
    await expect(page.locator('h1', { hasText: /^Notifications$/ })).toBeVisible();
  });

  test('sidebar badge equals the real unread count and grows with a new notification', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    const link = page.locator('aside a[href="/notifications"]');

    const unread = async () => (await api('GET', '/notifications/unread-count')).data.unreadCount as number;
    const badgeNumber = async () => {
      const m = (await link.innerText()).match(/\d+/);
      return m ? Number(m[0]) : 0;
    };

    await expect.poll(badgeNumber, { timeout: 10_000 }).toBe(Math.min(await unread(), 99));

    await sendAnnouncementViaApi(`E2E-Badge-${ts}`, 'badge');
    const target = await unread();
    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect.poll(badgeNumber, { timeout: 15_000 }).toBe(Math.min(target, 99));
    expect(target).toBeGreaterThan(0);
  });
});
