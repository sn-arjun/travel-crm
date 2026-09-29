import { test, expect, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import { navigateTo, waitForLoad } from './helpers/auth';
import { api, seedContact, seedLead } from './helpers/api-seed';

const RUN = Date.now();
const DAY = 86_400_000;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ALPHA_TITLE = `E2E FollowUp Alpha ${RUN}`;
const BETA_TITLE = `E2E FollowUp Beta ${RUN}`;
const CREATE_NOTES = `E2E schedule notes ${RUN}`;
const OVERDUE_NOTES = `E2E overdue notes ${RUN}`;
const BULK_NOTES = `E2E bulk-seed ${RUN}`;
const CANCEL_NOTES = `E2E bulk-cancel ${RUN}`;
const OUTCOME_NOTES = `Spoke to the client ${RUN}`;
const BULK_SEED_COUNT = 22; // > one page (20) so infinite scroll has something to load

let contact: any;
let alpha: any;
let beta: any;
let createdId = '';
let overdueId = '';
let bulkIds: string[] = [];
let cancelIds: string[] = [];

/* ─── data helpers ─── */

async function seedFollowUp(leadId: string, overrides: Record<string, unknown> = {}) {
  const res = await api('POST', '/follow-ups', {
    leadId,
    scheduledAt: new Date(Date.now() + DAY * 10).toISOString(),
    type: 'whatsapp',
    notes: `E2E FU ${RUN}`,
    ...overrides,
  });
  if (!res?.data?.id) throw new Error(`seedFollowUp failed: ${JSON.stringify(res)}`);
  return res.data;
}

async function pendingFollowUps(): Promise<any[]> {
  const res = await api('GET', '/follow-ups');
  return Array.isArray(res?.data) ? res.data : [];
}

/* ─── ui helpers ─── */

const pad = (n: number) => String(n).padStart(2, '0');

function formatRowDate(page: Page, iso: string) {
  return page.evaluate(
    (v) =>
      new Date(v).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
    iso,
  );
}

function formatPickerDate(page: Page, iso: string) {
  return page.evaluate((v) => {
    const d = new Date(v);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }, iso);
}

function expectLocalDateTime(iso: string, target: Date, hours: number, minutes: number) {
  const d = new Date(iso);
  expect(d.getFullYear()).toBe(target.getFullYear());
  expect(d.getMonth()).toBe(target.getMonth());
  expect(d.getDate()).toBe(target.getDate());
  expect(d.getHours()).toBe(hours);
  expect(d.getMinutes()).toBe(minutes);
}

async function openList(page: Page) {
  await page.goto('/follow-ups');
  await expect(page.getByRole('heading', { level: 1, name: 'Follow-ups', exact: true })).toBeVisible();
  await expect(page.locator('tbody .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  await waitForLoad(page);
}

const searchBox = (page: Page) => page.getByPlaceholder('Search follow-ups...');
const rowsFor = (page: Page, text: string | RegExp) => page.locator('tbody tr').filter({ hasText: text });
const typeFilter = (page: Page) => page.getByRole('combobox').filter({ hasText: /^(All types|Call|Email|WhatsApp|Visit|SMS)$/ });
const statusFilter = (page: Page) => page.getByRole('combobox').filter({ hasText: /^(All statuses|Pending|Overdue)$/ });

async function chooseOption(page: Page, trigger: Locator, name: string) {
  await trigger.click();
  await page.getByRole('option', { name, exact: true }).click();
}

async function rowAction(row: Locator, label: string) {
  await row.hover();
  await row.getByRole('button', { name: label, exact: true }).click();
}

async function expectNoErrorToast(page: Page) {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
}

async function pickDateTime(page: Page, dialog: Locator, target: Date, hours: number, minutes: number) {
  await dialog.getByRole('button', { name: /Pick date & time|\d{4} \d{2}:\d{2}/ }).click();
  const pop = page.locator('[data-radix-popper-content-wrapper]').last();
  const header = pop.locator('span.font-semibold');
  const wanted = `${MONTHS[target.getMonth()]} ${target.getFullYear()}`;
  for (let i = 0; i < 24 && (await header.innerText()) !== wanted; i++) {
    await header.locator('xpath=following-sibling::button').click();
  }
  await expect(header).toHaveText(wanted);
  await pop.getByRole('button', { name: String(target.getDate()), exact: true }).click();
  await pop.locator('select').nth(0).selectOption(String(hours));
  await pop.locator('select').nth(1).selectOption(String(minutes));
  await pop.getByRole('button', { name: 'Done' }).click();
  await expect(pop).toBeHidden();
}

/* ─── suite ─── */

test.describe.configure({ mode: 'serial' });

test.describe('Follow-ups', () => {
  let failedCalls: string[] = [];

  test.beforeAll(async () => {
    contact = await seedContact({ name: `E2E FollowUp Contact ${RUN}` });
    alpha = await seedLead(contact.id, { title: ALPHA_TITLE });
    beta = await seedLead(contact.id, { title: BETA_TITLE });
    expect(alpha?.id).toBeTruthy();
    expect(beta?.id).toBeTruthy();

    const overdue = await seedFollowUp(beta.id, {
      type: 'call',
      notes: OVERDUE_NOTES,
      scheduledAt: new Date(Date.now() - DAY * 2).toISOString(),
    });
    overdueId = overdue.id;

    for (let i = 0; i < BULK_SEED_COUNT; i++) {
      const fu = await seedFollowUp(beta.id, {
        notes: `${BULK_NOTES} #${i}`,
        scheduledAt: new Date(Date.now() + DAY * 10 + i * 60_000).toISOString(),
      });
      bulkIds.push(fu.id);
    }
    for (let i = 0; i < 2; i++) {
      const fu = await seedFollowUp(beta.id, {
        type: 'sms',
        notes: `${CANCEL_NOTES} #${i}`,
        scheduledAt: new Date(Date.now() + DAY * 20 + i * 60_000).toISOString(),
      });
      cancelIds.push(fu.id);
    }
  });

  test.afterAll(async () => {
    try {
      const ours = new Set([alpha?.id, beta?.id]);
      for (const fu of await pendingFollowUps()) {
        if (ours.has(fu.leadId)) await api('DELETE', `/follow-ups/${fu.id}`);
      }
      for (const lead of [alpha, beta]) if (lead?.id) await api('DELETE', `/leads/${lead.id}`);
      if (contact?.id) await api('DELETE', `/contacts/${contact.id}`);
    } catch {
      // best-effort cleanup
    }
  });

  test.beforeEach(async ({ page }) => {
    failedCalls = [];
    page.on('response', (res) => {
      const url = res.url();
      if (res.status() >= 400 && /\/api\/v1\/(follow-ups|leads)/.test(url)) {
        failedCalls.push(`${res.status()} ${res.request().method()} ${url}`);
      }
    });
  });

  test.afterEach(async () => {
    expect(failedCalls, 'no follow-up/lead API call may fail (403/4xx would surface as an error toast)').toEqual([]);
  });

  test('sidebar opens the list; skeleton shows while loading; count matches the data; no mailto/wa.me/tel links', async ({ page }) => {
    await page.route(/\/api\/v1\/follow-ups$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await new Promise((r) => setTimeout(r, 1500));
      return route.continue();
    });
    await page.goto('/dashboard');
    await navigateTo(page, '/follow-ups');
    await expect(page.locator('tbody .animate-pulse').first()).toBeVisible();
    await page.unroute(/\/api\/v1\/follow-ups$/);

    await expect(page.getByRole('heading', { level: 1, name: 'Follow-ups', exact: true })).toBeVisible();
    await expect(page.locator('tbody .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
    await expect(searchBox(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();

    const pending = await pendingFollowUps();
    expect(pending.length).toBeGreaterThanOrEqual(BULK_SEED_COUNT);
    await expect(page.getByRole('heading', { level: 1, name: 'Follow-ups', exact: true }).locator('xpath=following-sibling::*[1]'))
      .toHaveText(pending.length.toLocaleString());

    await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
  });

  test('infinite scroll loads the next page when the list is scrolled', async ({ page }) => {
    await openList(page);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(20);
    await expect.poll(
      async () => {
        await rows.last().scrollIntoViewIfNeeded();
        await page.mouse.wheel(0, 4000);
        return rows.count();
      },
      { timeout: 15_000, message: 'scrolling to the bottom must append more rows' },
    ).toBeGreaterThan(20);
  });

  test('schedules a follow-up through the form: lead is a searchable combobox, every field is saved', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Schedule follow-up' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Schedule follow-up' })).toBeVisible();

    // Submit is blocked until a lead and a date are chosen
    const submit = dialog.getByRole('button', { name: 'Schedule', exact: true });
    await expect(submit).toBeDisabled();

    // Relation field: no raw ID input, a searchable combobox that actually filters
    await expect(dialog.locator('input:not([type="hidden"])')).toHaveCount(0);
    const leadTrigger = dialog.getByRole('combobox').filter({ hasText: 'Select a lead' });
    await leadTrigger.click();
    const leadSearch = page.getByPlaceholder('Search leads...');
    await leadSearch.fill(`Alpha ${RUN}`);
    await expect(page.getByRole('option', { name: new RegExp(ALPHA_TITLE) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(BETA_TITLE) })).toHaveCount(0);
    await leadSearch.fill(`Beta ${RUN}`);
    await expect(page.getByRole('option', { name: new RegExp(BETA_TITLE) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(ALPHA_TITLE) })).toHaveCount(0);
    await leadSearch.fill(`zzz-no-lead-${RUN}`);
    await expect(page.getByText('No matches found.')).toBeVisible();
    await leadSearch.fill(`Alpha ${RUN}`);
    await page.getByRole('option', { name: new RegExp(ALPHA_TITLE) }).click();
    await expect(dialog.getByRole('combobox').first()).toContainText(ALPHA_TITLE);

    // Date picker: past days are blocked, today is selectable
    await dialog.getByRole('button', { name: /Pick date & time/ }).click();
    const pop = page.locator('[data-radix-popper-content-wrapper]').last();
    const today = new Date();
    await expect(pop.getByRole('button', { name: String(today.getDate()), exact: true })).toBeEnabled();
    if (today.getDate() > 1) {
      await expect(pop.getByRole('button', { name: String(today.getDate() - 1), exact: true })).toBeDisabled();
    }
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();

    const target = new Date(Date.now() + DAY * 3);
    await pickDateTime(page, dialog, target, 14, 30);
    await expect(dialog.getByRole('button', { name: /\d{4} 14:30/ })).toBeVisible();

    await chooseOption(page, dialog.locator('#followup-type'), 'Email');
    await dialog.locator('#followup-notes').fill(CREATE_NOTES);

    await expect(submit).toBeEnabled();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/v1\/follow-ups$/.test(r.url()) && r.request().method() === 'POST'),
      submit.click(),
    ]);
    expect(resp.ok()).toBe(true);
    createdId = (await resp.json()).data.id;
    expect(createdId).toBeTruthy();

    await expect(page.getByText('Follow-up scheduled').first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expectNoErrorToast(page);

    // Persisted with every filled value
    const saved = (await pendingFollowUps()).find((f) => f.id === createdId);
    expect(saved).toBeTruthy();
    expect(saved.leadId).toBe(alpha.id);
    expect(saved.type).toBe('email');
    expect(saved.notes).toBe(CREATE_NOTES);
    expect(saved.status).toBe('pending');
    expectLocalDateTime(saved.scheduledAt, target, 14, 30);
  });

  test('list shows every saved value; search narrows; lead link opens the lead; row actions are hover-revealed', async ({ page }) => {
    await openList(page);
    await searchBox(page).fill(ALPHA_TITLE);
    const row = rowsFor(page, ALPHA_TITLE);
    await expect(row).toHaveCount(1);

    const saved = (await pendingFollowUps()).find((f) => f.id === createdId);
    await expect(row).toContainText(/email/i);
    await expect(row).toContainText(ALPHA_TITLE);
    await expect(row).toContainText(contact.name);
    await expect(row).toContainText(CREATE_NOTES);
    await expect(row).toContainText(await formatRowDate(page, saved.scheduledAt));
    await expect(row).toContainText('Pending');

    // Search matches on notes and narrows to the same single row
    await searchBox(page).fill(CREATE_NOTES);
    await expect(rowsFor(page, ALPHA_TITLE)).toHaveCount(1);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await searchBox(page).fill(ALPHA_TITLE);
    await expect(row).toHaveCount(1);

    // Hover actions
    await row.hover();
    await expect(row.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Reschedule', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Cancel follow-up', exact: true })).toBeVisible();

    // No detail drawer / no direct-contact anchors; the lead link is the drill-down
    await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
    await row.getByRole('button', { name: ALPHA_TITLE }).click();
    await page.waitForURL(new RegExp(`/leads/${alpha.id}`), { timeout: 15_000 });
    await expect(page.getByText(ALPHA_TITLE).first()).toBeVisible();
  });

  test('reschedule dialog is pre-filled and the new date persists', async ({ page }) => {
    await openList(page);
    await searchBox(page).fill(ALPHA_TITLE);
    const row = rowsFor(page, ALPHA_TITLE);
    await expect(row).toHaveCount(1);
    const before = (await pendingFollowUps()).find((f) => f.id === createdId);

    await rowAction(row, 'Reschedule');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Reschedule follow-up' })).toBeVisible();

    // Pre-filled: lead, type, date & time — with lead/type locked
    const leadTrigger = dialog.getByRole('combobox').first();
    await expect(leadTrigger).toContainText(ALPHA_TITLE);
    await expect(leadTrigger).toBeDisabled();
    await expect(dialog.locator('#followup-type')).toContainText('Email');
    await expect(dialog.locator('#followup-type')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: await formatPickerDate(page, before.scheduledAt) })).toBeVisible();
    await expect(dialog.locator('input:not([type="hidden"])')).toHaveCount(0);

    // The picker's time selects start from the saved time, not a default
    await dialog.getByRole('button', { name: /\d{4} 14:30/ }).click();
    const pop = page.locator('[data-radix-popper-content-wrapper]').last();
    await expect(pop.locator('select').nth(0)).toHaveValue('14');
    await expect(pop.locator('select').nth(1)).toHaveValue('30');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();

    const target = new Date(Date.now() + DAY * 5);
    await pickDateTime(page, dialog, target, 16, 15);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/follow-ups/${createdId}`) && r.request().method() === 'PUT'),
      dialog.getByRole('button', { name: 'Reschedule', exact: true }).click(),
    ]);
    expect(resp.ok()).toBe(true);
    await expect(page.getByText('Follow-up rescheduled').first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expectNoErrorToast(page);

    const after = (await pendingFollowUps()).find((f) => f.id === createdId);
    expectLocalDateTime(after.scheduledAt, target, 16, 15);
    expect(after.type).toBe('email');
    expect(after.notes).toBe(CREATE_NOTES);

    await searchBox(page).fill(ALPHA_TITLE);
    await expect(rowsFor(page, ALPHA_TITLE)).toContainText(await formatRowDate(page, after.scheduledAt));
  });

  test('export downloads a non-empty CSV with the data', async ({ page }) => {
    await openList(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^follow-ups_export_\d{4}-\d{2}-\d{2}\.csv$/);
    const path = await download.path();
    const csv = fs.readFileSync(path, 'utf8');
    expect(csv.length).toBeGreaterThan(0);
    const [header, ...lines] = csv.trim().split('\n');
    expect(header).toBe('Type,Lead,Contact,Notes,Scheduled,Status');
    // Full dataset, not just the first page of 20
    expect(lines.length).toBeGreaterThan(20);
    const alphaLine = lines.find((l) => l.includes(ALPHA_TITLE));
    expect(alphaLine).toBeTruthy();
    expect(alphaLine).toContain('email');
    expect(alphaLine).toContain(contact.name);
    expect(alphaLine).toContain(CREATE_NOTES);
    expect(alphaLine).toContain('Pending');
    await expect(page.getByText('Follow-ups exported successfully').first()).toBeVisible();
    await expectNoErrorToast(page);
  });

  test('type and status filters narrow the list; chips remove them; nothing matching shows the empty state', async ({ page }) => {
    await openList(page);
    const rows = page.locator('tbody tr');

    // Type filter
    await chooseOption(page, typeFilter(page), 'WhatsApp');
    await expect(page.getByText(/Type:\s*whatsapp/i)).toBeVisible();
    await expect.poll(async () => {
      const texts = await rows.allInnerTexts();
      return texts.length > 0 && texts.every((t) => /whatsapp/i.test(t));
    }, { timeout: 15_000 }).toBe(true);

    // Combined with search: Alpha is an email follow-up, so nothing matches -> empty state
    await searchBox(page).fill(ALPHA_TITLE);
    await expect(page.getByText('No follow-ups yet')).toBeVisible();
    await expect(page.getByText('Schedule a follow-up to stay on top of your leads.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();

    // Removing the chip restores it
    await page.getByText(/Type:\s*whatsapp/i).getByRole('button').click();
    await expect(page.getByText(/Type:\s*whatsapp/i)).toHaveCount(0);
    await expect(rowsFor(page, ALPHA_TITLE)).toHaveCount(1);

    // Status filter: overdue
    await searchBox(page).fill('');
    await chooseOption(page, statusFilter(page), 'Overdue');
    await expect(page.getByText(/Status:\s*overdue/i)).toBeVisible();
    await expect.poll(async () => {
      const texts = await rows.allInnerTexts();
      return texts.length > 0 && texts.every((t) => /Overdue/.test(t));
    }, { timeout: 15_000 }).toBe(true);
    await searchBox(page).fill(OVERDUE_NOTES);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(BETA_TITLE);
    await expect(rows.first()).toContainText(/call/i);
    await expect(rows.first()).toContainText('Overdue');
    await searchBox(page).fill(ALPHA_TITLE);
    await expect(page.getByText('No follow-ups yet')).toBeVisible();

    // Status filter: pending excludes the overdue one, includes Alpha
    await chooseOption(page, statusFilter(page), 'Pending');
    await expect(rowsFor(page, ALPHA_TITLE)).toContainText('Pending');
    await searchBox(page).fill(OVERDUE_NOTES);
    await expect(page.getByText('No follow-ups yet')).toBeVisible();

    // Clear all
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByText('Filters:')).toHaveCount(0);
    await expect(rowsFor(page, OVERDUE_NOTES)).toHaveCount(1);

    // Pure search with no match
    await searchBox(page).fill(`zzz-no-match-${RUN}`);
    await expect(page.getByText('No follow-ups yet')).toBeVisible();
    await searchBox(page).fill('');
    await expect(rows.first()).not.toContainText('No follow-ups yet');
    await expectNoErrorToast(page);
  });

  test('completes an overdue follow-up with an outcome and it leaves the pending list', async ({ page }) => {
    await openList(page);
    await searchBox(page).fill(OVERDUE_NOTES);
    const row = rowsFor(page, OVERDUE_NOTES);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Overdue');

    await rowAction(row, 'Mark complete');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Complete follow-up' })).toBeVisible();
    await chooseOption(page, dialog.locator('#complete-outcome'), 'Positive');
    await dialog.locator('#complete-notes').fill(OUTCOME_NOTES);

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/follow-ups/${overdueId}/complete`) && r.request().method() === 'PUT'),
      dialog.getByRole('button', { name: 'Mark complete' }).click(),
    ]);
    expect(resp.ok()).toBe(true);
    await expect(page.getByText('Follow-up completed').first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expectNoErrorToast(page);

    // Gone from the pending list, in the UI and in the API
    await searchBox(page).fill(OVERDUE_NOTES);
    await expect(rowsFor(page, OVERDUE_NOTES)).toHaveCount(0);
    expect((await pendingFollowUps()).some((f) => f.id === overdueId)).toBe(false);

    // Status really changed: completing again is rejected
    const again = await api('PUT', `/follow-ups/${overdueId}/complete`, {});
    expect(again.success).toBe(false);

    // The outcome and notes reached the lead's activity timeline
    const activities = await api('GET', `/leads/${beta.id}/activities?limit=100`);
    const text = JSON.stringify(activities);
    expect(text).toContain('Follow-up completed: call');
    expect(text).toContain(`Positive — ${OUTCOME_NOTES}`);
  });

  test('cancel asks for confirmation; dismissing keeps the row, confirming deletes it', async ({ page }) => {
    await openList(page);
    await searchBox(page).fill(ALPHA_TITLE);
    const row = rowsFor(page, ALPHA_TITLE);
    await expect(row).toHaveCount(1);

    await rowAction(row, 'Cancel follow-up');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Cancel follow-up' })).toBeVisible();
    await expect(dialog).toContainText('This follow-up will be permanently removed.');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(1);
    expect((await pendingFollowUps()).some((f) => f.id === createdId)).toBe(true);

    await rowAction(row, 'Cancel follow-up');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/follow-ups/${createdId}`) && r.request().method() === 'DELETE'),
      dialog.getByRole('button', { name: 'Cancel follow-up', exact: true }).click(),
    ]);
    expect(resp.ok()).toBe(true);
    await expect(page.getByText('Follow-up cancelled').first()).toBeVisible();
    await expectNoErrorToast(page);

    await searchBox(page).fill(ALPHA_TITLE);
    await expect(rowsFor(page, ALPHA_TITLE)).toHaveCount(0);
    expect((await pendingFollowUps()).some((f) => f.id === createdId)).toBe(false);

    // Still gone after a full reload
    await openList(page);
    await searchBox(page).fill(ALPHA_TITLE);
    await expect(page.getByText('No follow-ups yet')).toBeVisible();
  });

  test('bulk cancel removes every selected row', async ({ page }) => {
    await openList(page);
    await searchBox(page).fill(CANCEL_NOTES);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(/sms/i);

    await page.getByRole('checkbox', { name: 'Select all rows' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('2 follow-ups cancelled').first()).toBeVisible();
    await expectNoErrorToast(page);

    await searchBox(page).fill(CANCEL_NOTES);
    await expect(page.getByText('No follow-ups yet')).toBeVisible();
    const remaining = new Set((await pendingFollowUps()).map((f) => f.id));
    for (const id of cancelIds) expect(remaining.has(id)).toBe(false);
    for (const id of bulkIds) expect(remaining.has(id)).toBe(true);
  });
});
