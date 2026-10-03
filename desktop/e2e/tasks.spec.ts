/**
 * Tasks — full E2E round trip.
 *
 * Replaces 11-tasks-calendar.spec.ts and 14-m14-tasks-calendar.spec.ts (task assertions only;
 * calendar/follow-up/dashboard assertions live in calendar.spec.ts, follow-ups.spec.ts and
 * dashboard.spec.ts).
 *
 *   A. Create via form (every field) → list → detail → edit prefill → edit → delete
 *   B. Create form (validation, category options, relation comboboxes, URL prefill, no raw IDs)
 *   C. List UX (search, status/priority filters, empty state, hover actions, bulk, export, infinite scroll)
 *   D. Detail (status, subtasks, comments, activity, overdue badge)
 *   E. Kanban (columns, overdue, drag to Done, dashboard summary)
 *   F. No mailto:/wa.me/tel: links
 */

import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedTask, seedContact, seedLead } from './helpers/api-seed';

const RUN = Date.now().toString(36);

async function goToTasks(page: Page, query = '') {
  await page.goto(`/tasks${query}`);
  await waitForLoad(page);
  await expect(page.getByRole('heading', { name: 'Tasks' }).first()).toBeVisible({ timeout: 15_000 });
}

async function searchList(page: Page, term: string) {
  const search = page.getByPlaceholder(/search tasks/i).first();
  await search.fill(term);
  await page.waitForTimeout(700); // 300ms debounce + fetch
  await waitForLoad(page);
}

function rowFor(page: Page, text: string) {
  return page.locator('tbody tr', { hasText: text }).first();
}

async function pickOption(page: Page, trigger: ReturnType<Page['locator']>, name: RegExp | string) {
  await trigger.click();
  await page.getByRole('option', { name }).first().click();
}

async function expectNoErrorToast(page: Page) {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
}

async function openCreateDialog(page: Page) {
  await page.getByRole('button', { name: /add task/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create task').first()).toBeVisible();
  return dialog;
}

/** Pick a relation option by typing a query; returns the picked option's label. */
async function pickRelation(page: Page, trigger: ReturnType<Page['locator']>, query?: string) {
  await trigger.click();
  const search = page.getByPlaceholder('Search…').last();
  if (query) {
    await search.fill(query);
    await page.waitForTimeout(600);
  }
  const option = page.locator('[cmdk-item]').first();
  await expect(option).toBeVisible({ timeout: 8_000 });
  const label = ((await option.locator('span.block').first().textContent()) ?? '').trim();
  await option.click();
  return label;
}

/** Formats a date in the browser's own locale so assertions match what the page renders. */
async function fmt(page: Page, y: number, m: number, d: number, opts?: Intl.DateTimeFormatOptions, locale?: string) {
  return page.evaluate(
    ([yy, mm, dd, o, l]) => new Date(yy as number, mm as number, dd as number).toLocaleDateString((l as string) || undefined, (o as any) || undefined),
    [y, m, d, opts ?? null, locale ?? null] as const,
  );
}

async function taskIdByTitle(title: string): Promise<string> {
  const res = await api('GET', `/tasks?view=all&search=${encodeURIComponent(title)}`);
  const items = res?.data?.data ?? res?.data ?? [];
  const found = items.find((t: any) => t.title === title);
  if (!found) throw new Error(`task ${title} not found via API`);
  return found.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Full CRUD round trip through the UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks: CRUD round trip', () => {
  test('create with every field → list → detail → edit prefill → edit → delete', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Task Lead ${RUN}` });
    const title = `Full Task ${RUN}`;
    const description = `Full description ${RUN}`;
    const now = new Date();
    const dueY = now.getFullYear();
    const dueM = now.getMonth() + 1; // next month → never overdue
    const listDue = await fmt(page, dueY, dueM, 15);
    const detailDue = await fmt(page, dueY, dueM, 15, { day: 'numeric', month: 'short', year: 'numeric' });
    const pickerDue = await fmt(page, dueY, dueM, 15, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-IN');

    // ── CREATE ──
    await goToTasks(page);
    const dialog = await openCreateDialog(page);
    await dialog.locator('#taskTitle').fill(title);
    await dialog.locator('#taskDesc').fill(description);
    const combos = dialog.locator('button[role="combobox"]');
    await pickOption(page, combos.nth(0), /^High$/);
    await pickOption(page, combos.nth(1), /^Follow Up$/);
    const assignee = await pickRelation(page, combos.nth(2));
    const assigneeName = assignee;
    await pickRelation(page, combos.nth(3), lead.title);

    await dialog.getByRole('button', { name: /pick a date/i }).click();
    const calendar = page.locator('[data-radix-popper-content-wrapper]').last();
    await calendar.locator('button').nth(1).click(); // next month
    await calendar.getByRole('button', { name: '15', exact: true }).click();
    await expect(dialog.getByRole('button', { name: pickerDue })).toBeVisible();

    await dialog.getByRole('button', { name: /^create task$/i }).click();
    await expect(page.getByText('Task created').first()).toBeVisible({ timeout: 10_000 });
    await expectNoErrorToast(page);

    // ── LIST shows every list-visible value ──
    await waitForLoad(page);
    await searchList(page, title);
    const row = rowFor(page, title);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('To Do');
    await expect(row).toContainText(/high/i);
    await expect(row).toContainText(listDue);
    await expect(row).toContainText(assigneeName);
    await expect(row).toContainText(/follow up/i);
    expect((await row.textContent()) ?? '').not.toMatch(/undefined|NaN|Invalid Date|null/);

    // ── DETAIL shows every value ──
    await row.click();
    await page.waitForURL(/\/tasks\/(?!new)[\w-]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const detailUrl = page.url();
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 10_000 });
    const main = page.locator('main').first();
    await expect(main.getByText(description).first()).toBeVisible();
    await expect(main.getByText(/^high$/i).first()).toBeVisible();
    await expect(main.getByText(/follow up/i).first()).toBeVisible();
    await expect(main.getByText(assigneeName).first()).toBeVisible();
    await expect(main.getByText(detailDue).first()).toBeVisible();
    await expect(main.getByRole('link', { name: lead.title })).toBeVisible();
    expect((await main.textContent()) ?? '').not.toMatch(/undefined|NaN|Invalid Date/);

    // ── EDIT prefill ──
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    const edit = page.getByRole('dialog');
    await expect(edit.getByText('Edit task').first()).toBeVisible();
    await expect(edit.locator('#editTitle')).toHaveValue(title);
    await expect(edit.locator('#editDesc')).toHaveValue(description);
    const eCombos = edit.locator('button[role="combobox"]');
    await expect(eCombos.nth(0)).toContainText('High');
    await expect(eCombos.nth(1)).toContainText('Follow Up');
    await expect(eCombos.nth(2)).toContainText(assigneeName, { timeout: 8_000 });
    await expect(eCombos.nth(3)).toContainText(lead.title, { timeout: 8_000 });
    await expect(edit.getByRole('button', { name: pickerDue })).toBeVisible();

    // ── EDIT, save, assert persisted ──
    const newTitle = `${title} Edited`;
    await edit.locator('#editTitle').fill(newTitle);
    await edit.locator('#editDesc').fill(`${description} edited`);
    await pickOption(page, eCombos.nth(0), /^Low$/);
    await pickOption(page, eCombos.nth(1), /^Payment$/);
    await edit.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Task updated').first()).toBeVisible({ timeout: 10_000 });
    await expectNoErrorToast(page);
    await page.reload();
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: newTitle }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main').getByText(`${description} edited`).first()).toBeVisible();
    await expect(page.locator('main').getByText(/^low$/i).first()).toBeVisible();
    await expect(page.locator('main').getByText(/payment/i).first()).toBeVisible();
    // untouched values survive the edit
    await expect(page.locator('main').getByText(assigneeName).first()).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: lead.title })).toBeVisible();

    // ── DELETE ──
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^delete$/i }).click();
    await page.waitForURL(/\/tasks$/, { timeout: 10_000 });
    await waitForLoad(page);
    await searchList(page, newTitle);
    await expect(rowFor(page, newTitle)).toHaveCount(0);
    const res = await api('GET', `/tasks/${detailUrl.split('/').pop()}`);
    expect(res?.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Create form
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks: create form', () => {
  test('submitting without a title shows a validation toast and keeps the dialog open', async ({ page }) => {
    await goToTasks(page);
    const dialog = await openCreateDialog(page);
    await dialog.getByRole('button', { name: /^create task$/i }).click();
    await expect(page.getByText('Task title is required').first()).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('category dropdown lists every option', async ({ page }) => {
    await goToTasks(page);
    const dialog = await openCreateDialog(page);
    await expect(dialog.getByText('Category')).toBeVisible();
    await dialog.locator('button[role="combobox"]').nth(1).click();
    for (const name of ['General', 'Follow Up', 'Documentation', 'Meeting', 'Payment', 'Visa']) {
      await expect(page.getByRole('option', { name })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  test('assignee and lead are searchable comboboxes (typing filters), never raw ID inputs', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Combo Lead ${RUN}` });
    await seedLead(contact.id, { title: `Other Lead ${RUN}` });

    await goToTasks(page);
    const dialog = await openCreateDialog(page);
    await expect(dialog.getByText('Assign to')).toBeVisible();
    await expect(dialog.getByText('Linked lead')).toBeVisible();
    await expect(dialog.locator('button[role="combobox"]', { hasText: /search team members/i })).toBeVisible();
    const leadTrigger = dialog.locator('button[role="combobox"]', { hasText: /search leads/i });
    await expect(leadTrigger).toBeVisible();
    // the only text input in the form is the title
    await expect(dialog.locator('input')).toHaveCount(1);
    await expect(dialog.locator('input[placeholder*="id" i]')).toHaveCount(0);

    // typing narrows the lead options
    await leadTrigger.click();
    await page.getByPlaceholder('Search…').last().fill(lead.title);
    await page.waitForTimeout(700);
    const options = page.locator('[cmdk-item]');
    await expect(options.filter({ hasText: lead.title })).toHaveCount(1, { timeout: 8_000 });
    await expect(options.filter({ hasText: `Other Lead ${RUN}` })).toHaveCount(0);
    // a query with no match renders the empty text
    await page.getByPlaceholder('Search…').last().fill(`zzz-nomatch-${RUN}`);
    await expect(page.getByText('No matches found.')).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  test('lead is pre-filled from ?leadId URL params and the created task is linked to it', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Prefill Lead ${RUN}` });
    const title = `Prefilled Task ${RUN}`;

    await goToTasks(page, `?leadId=${lead.id}&leadTitle=${encodeURIComponent(lead.title)}`);
    const dialog = await openCreateDialog(page);
    await expect(dialog.locator('button[role="combobox"]').nth(3)).toContainText(lead.title, { timeout: 8_000 });

    await dialog.locator('#taskTitle').fill(title);
    await dialog.getByRole('button', { name: /^create task$/i }).click();
    await expect(page.getByText('Task created').first()).toBeVisible({ timeout: 10_000 });

    const id = await taskIdByTitle(title);
    const res = await api('GET', `/tasks/${id}`);
    expect(res.data.related_lead_id).toBe(lead.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. List UX
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks: list UX', () => {
  test('search narrows rows and a non-matching search renders the empty state', async ({ page }) => {
    const keep = `Searchable ${RUN}`;
    const other = `Different ${RUN}`;
    await seedTask({ title: keep });
    await seedTask({ title: other });

    await goToTasks(page);
    await searchList(page, keep);
    await expect(rowFor(page, keep)).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, other)).toHaveCount(0);

    await searchList(page, `ZZZNOTEXIST-${RUN}`);
    await expect(page.locator('tbody tr', { hasText: keep })).toHaveCount(0);
    await expect(page.getByText('No tasks yet')).toBeVisible();
    await expect(page.getByText('Create your first task to start tracking work.')).toBeVisible();
  });

  test('status filter lists every status and narrows the table', async ({ page }) => {
    const todo = `FilterTodo ${RUN}`;
    const done = `FilterDone ${RUN}`;
    await seedTask({ title: todo, status: 'todo' });
    await seedTask({ title: done, status: 'done' });

    await goToTasks(page);
    await searchList(page, `Filter`);
    await expect(rowFor(page, todo)).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, done)).toBeVisible();

    const statusTrigger = page.locator('button[role="combobox"]').filter({ hasText: /all status/i }).first();
    await statusTrigger.click();
    for (const name of [/all status/i, /^to do$/i, /^in progress$/i, /^done$/i]) {
      await expect(page.getByRole('option', { name })).toBeVisible();
    }
    await page.getByRole('option', { name: /^done$/i }).click();
    await waitForLoad(page);
    await page.waitForTimeout(500);
    await expect(rowFor(page, done)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr', { hasText: todo })).toHaveCount(0);
    for (const t of await page.locator('tbody tr').all()) {
      await expect(t).toContainText('Done');
    }
  });

  test('priority filter narrows the table', async ({ page }) => {
    const high = `PrioHigh ${RUN}`;
    const low = `PrioLow ${RUN}`;
    await seedTask({ title: high, priority: 'high' });
    await seedTask({ title: low, priority: 'low' });

    await goToTasks(page);
    await searchList(page, `Prio`);
    await pickOption(page, page.locator('button[role="combobox"]').filter({ hasText: /all priorities/i }).first(), /^High$/);
    await waitForLoad(page);
    await page.waitForTimeout(500);
    await expect(rowFor(page, high)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr', { hasText: low })).toHaveCount(0);
  });

  test('row hover actions: view navigates, delete removes the row', async ({ page }) => {
    const title = `HoverTask ${RUN}`;
    const id = (await seedTask({ title })).id;

    await goToTasks(page);
    await searchList(page, title);
    const row = rowFor(page, title);
    await row.hover();
    await expect(row.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible();

    await row.getByRole('button', { name: 'View' }).click();
    await page.waitForURL(new RegExp(`/tasks/${id}$`), { timeout: 10_000 });

    await goToTasks(page);
    await searchList(page, title);
    const row2 = rowFor(page, title);
    await row2.hover();
    await row2.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Task deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr', { hasText: title })).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `/tasks/${id}`))?.success).toBe(false);
  });

  test('bulk select → Mark complete, then bulk Delete', async ({ page }) => {
    const a = `Bulk A ${RUN}`;
    const b = `Bulk B ${RUN}`;
    const ida = (await seedTask({ title: a })).id;
    const idb = (await seedTask({ title: b })).id;

    await goToTasks(page);
    await searchList(page, `Bulk `);
    await expect(rowFor(page, a)).toBeVisible({ timeout: 10_000 });
    await rowFor(page, a).getByRole('checkbox').check();
    await rowFor(page, b).getByRole('checkbox').check();
    await expect(page.getByText('2 selected')).toBeVisible();

    await page.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.getByText('Tasks marked complete').first()).toBeVisible({ timeout: 10_000 });
    expect((await api('GET', `/tasks/${ida}`)).data.status).toBe('done');
    expect((await api('GET', `/tasks/${idb}`)).data.status).toBe('done');

    await searchList(page, `Bulk `);
    await expect(rowFor(page, a)).toContainText('Done', { timeout: 10_000 });
    await rowFor(page, a).getByRole('checkbox').check();
    await rowFor(page, b).getByRole('checkbox').check();
    await page.locator('div', { hasText: /^2 selected/ }).getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Tasks deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr', { hasText: a })).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `/tasks/${ida}`))?.success).toBe(false);
  });

  test('export downloads a non-empty CSV containing the data', async ({ page }) => {
    const title = `Export ${RUN}`;
    await seedTask({ title, priority: 'high' });
    await goToTasks(page);
    await searchList(page, title);
    await expect(rowFor(page, title)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^tasks.*\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('Title,Status,Priority,Due Date,Assignee,Category');
    expect(body).toContain(title);
  });

  test('infinite scroll loads more rows when scrolled', async ({ page }) => {
    const tag = `Scroll${RUN}`;
    for (let i = 0; i < 25; i++) await seedTask({ title: `${tag} ${String(i).padStart(2, '0')}` });

    await goToTasks(page);
    await searchList(page, tag);
    const rows = page.locator('tbody tr:has(td)').filter({ hasText: tag });
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await page.locator('div.justify-center.py-ds-4').last().scrollIntoViewIfNeeded();
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('skeleton/loading resolves into rows', async ({ page }) => {
    await seedTask({ title: `Skeleton ${RUN}` });
    await goToTasks(page);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Detail page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks: detail page', () => {
  test('status select updates the task and the Overview badge', async ({ page }) => {
    const title = `Status ${RUN}`;
    const id = (await seedTask({ title })).id;
    await page.goto(`/tasks/${id}`);
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 10_000 });

    await pickOption(page, page.locator('button[role="combobox"]').first(), /^In Progress$/);
    await expect(page.getByText('Status updated').first()).toBeVisible({ timeout: 10_000 });
    expect((await api('GET', `/tasks/${id}`)).data.status).toBe('in_progress');
    await expect(page.locator('main').getByText('In Progress').first()).toBeVisible();

    await pickOption(page, page.locator('button[role="combobox"]').first(), /^Done$/);
    await expect(page.getByText('Status updated').first()).toBeVisible();
    await page.reload();
    await waitForLoad(page);
    expect((await api('GET', `/tasks/${id}`)).data.status).toBe('done');
    await expectNoErrorToast(page);
  });

  test('subtasks: add, toggle complete, progress and parent counts', async ({ page }) => {
    const id = (await seedTask({ title: `Parent ${RUN}` })).id;
    await page.goto(`/tasks/${id}`);
    await waitForLoad(page);

    await expect(page.getByText('No subtasks yet')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^add$/i }).first().click();
    await page.getByPlaceholder('Subtask title...').fill(`Subtask ${RUN}`);
    await page.getByPlaceholder('Subtask title...').press('Enter');
    await expect(page.getByText('Subtask added').first()).toBeVisible({ timeout: 10_000 });
    const sub = page.locator('main').getByText(`Subtask ${RUN}`);
    await expect(sub).toBeVisible();
    await expect(page.getByText('0/1').first()).toBeVisible();

    // toggle: the checkbox button precedes the title
    await sub.locator('xpath=preceding-sibling::button[1]').click();
    await expect(page.getByText('1/1').first()).toBeVisible({ timeout: 10_000 });
    await expect(sub).toHaveClass(/line-through/);
    const subs = await api('GET', `/tasks/${id}/subtasks`);
    expect(subs.data[0].status).toBe('done');
  });

  test('comments: post, edit, delete; Activity tab shows creation and comments', async ({ page }) => {
    const id = (await seedTask({ title: `Commented ${RUN}` })).id;
    await page.goto(`/tasks/${id}`);
    await waitForLoad(page);

    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('No comments yet')).toBeVisible({ timeout: 10_000 });
    const box = page.getByPlaceholder('Add a comment...');
    await box.fill(`First comment ${RUN}`);
    await page.getByRole('button', { name: /^post$/i }).click();
    await expect(page.getByText('Comment added').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main').getByText(`First comment ${RUN}`)).toBeVisible();
    await expect(box).toHaveValue('');

    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    const editBox = page.locator('textarea').last();
    await editBox.fill(`Edited comment ${RUN}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Comment updated').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main').getByText(`Edited comment ${RUN}`)).toBeVisible();

    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByText('Task created').first()).toBeVisible();
    await expect(page.getByText(/commented/).first()).toBeVisible();
    await expect(page.getByText(`Edited comment ${RUN}`).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Related' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await expect(page.getByText('Comment deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No comments yet')).toBeVisible();
    await expectNoErrorToast(page);
  });

  test('overdue badge shows for past due dates and disappears when done', async ({ page }) => {
    const pastDate = new Date(Date.now() - 7 * 86400000).toISOString();
    const title = `Overdue ${RUN}`;
    const id = (await seedTask({ title, priority: 'high', due_date: pastDate })).id;
    await page.goto(`/tasks/${id}`);
    await waitForLoad(page);
    await expect(page.getByText('Overdue', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await pickOption(page, page.locator('button[role="combobox"]').first(), /^Done$/);
    await expect(page.getByText('Status updated').first()).toBeVisible();
    await expect(page.getByText('Overdue', { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });

  test('unknown task id renders the not-found state', async ({ page }) => {
    await page.goto('/tasks/00000000-0000-7000-8000-00000000dead');
    await waitForLoad(page);
    await expect(page.getByText('Task not found')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /back to tasks/i }).click();
    await page.waitForURL(/\/tasks$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Kanban
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks: kanban', () => {
  test('three columns, overdue card, drag a card to Done persists and updates the dashboard summary', async ({ page }) => {
    const title = `Kanban ${RUN}`;
    const overdue = `KanbanOverdue ${RUN}`;
    // earliest due dates sort both cards to the top of the To Do column so the drag source is on screen
    const id = (await seedTask({ title, status: 'todo', due_date: '2000-01-01T00:00:00.000Z' })).id;
    await seedTask({ title: overdue, priority: 'high', due_date: '2000-01-02T00:00:00.000Z' });
    const before = await api('GET', '/tasks/dashboard/summary');
    expect(before?.success).not.toBe(false);

    await goToTasks(page);
    await page.getByRole('button', { name: 'Kanban view' }).click();
    for (const col of ['To Do', 'In Progress', 'Done']) {
      await expect(page.locator('h3', { hasText: col }).first()).toBeVisible({ timeout: 10_000 });
    }
    await page.waitForTimeout(800); // column slide-up animation must settle before dragging
    const card = page.locator('[draggable="true"]', { hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const overdueCard = page.locator('[draggable="true"]', { hasText: overdue }).first();
    await expect(overdueCard.getByText('Overdue', { exact: true })).toBeVisible();

    const doneDrop = page.locator('div.min-h-32').nth(2);
    // Dispatch the HTML5 DnD events straight at the card/column: native drag emulation picks the
    // wrong source when the board is long, while the app's dragstart/drop handlers are what matter.
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent('dragstart', { dataTransfer });
    await doneDrop.dispatchEvent('dragover', { dataTransfer });
    await doneDrop.dispatchEvent('drop', { dataTransfer });
    await card.dispatchEvent('dragend', { dataTransfer });
    await expect(page.getByText('Status updated').first()).toBeVisible({ timeout: 10_000 });
    await expect(doneDrop.locator('[draggable="true"]', { hasText: title })).toBeVisible();
    expect((await api('GET', `/tasks/${id}`)).data.status).toBe('done');

    const after = await api('GET', '/tasks/dashboard/summary');
    expect(JSON.stringify(after.data)).not.toEqual(JSON.stringify(before.data));
    await expectNoErrorToast(page);

    // card click opens the detail page
    await card.click();
    await page.waitForURL(new RegExp(`/tasks/${id}$`), { timeout: 10_000 });
  });

  test('create from the kanban view adds the card to To Do', async ({ page }) => {
    const title = `KanbanNew ${RUN}`;
    await goToTasks(page);
    await page.getByRole('button', { name: 'Kanban view' }).click();
    await expect(page.locator('h3', { hasText: 'To Do' }).first()).toBeVisible({ timeout: 10_000 });
    const dialog = await openCreateDialog(page);
    await dialog.locator('#taskTitle').fill(title);
    await dialog.getByRole('button', { name: /^create task$/i }).click();
    await expect(page.getByText('Task created').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[draggable="true"]', { hasText: title }).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Communication rules
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks: no direct messaging links', () => {
  test('list, kanban and detail pages have no mailto:/wa.me/tel: anchors', async ({ page }) => {
    const id = (await seedTask({ title: `NoLinks ${RUN}` })).id;
    const check = async () => {
      expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
      expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);
      expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
    };
    await goToTasks(page);
    await check();
    await page.getByRole('button', { name: 'Kanban view' }).click();
    await expect(page.locator('h3', { hasText: 'To Do' }).first()).toBeVisible({ timeout: 10_000 });
    await check();
    await page.goto(`/tasks/${id}`);
    await waitForLoad(page);
    await check();
  });
});
