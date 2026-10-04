/**
 * WhatsApp Campaigns — full E2E.
 *
 * Pages: /marketing/whatsapp, /marketing/whatsapp/new, /marketing/whatsapp/[id], /marketing/whatsapp/[id]/edit.
 * Gate: `whatsapp_campaigns`. No milestone-named specs existed for this slice.
 *
 * A. Gate: working feature OR upgrade affordance — a 403 from the API is a failure either way
 * B. Create through the form: validation, relation comboboxes narrow on typing and expose no raw ID
 *    input, every field filled, redirect to detail
 * C. List shows every value; detail shows every value; edit form is pre-filled; edit persists
 * D. Search + status filter narrow rows; empty state when nothing matches
 * E. Lifecycle: send -> pause -> cancel from the detail page; analytics + recipients visible;
 *    non-draft campaigns cannot be edited or deleted
 * F. Delete (list hover action + confirm, and from detail)
 * G. Export CSV is non-empty; infinite scroll loads more rows
 * H. No mailto:/wa.me/tel: anchors anywhere in the slice
 *
 * Campaign sends are queued, not delivered, in the test worker (no WhatsApp provider), so
 * lifecycle assertions stop at the `sending` state the backend reports.
 */
import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import * as fs from 'fs';
import { waitForLoad } from './helpers/auth';
import { api, seedContact } from './helpers/api-seed';
import { pickDate } from './helpers/date-picker';

test.setTimeout(120_000);

const RUN = Date.now();
const PREFIX = `E2E-WA-${RUN}`;
const TOAST = '[data-sonner-toast]';
const COMM_ANCHORS = 'a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]';

const NAME = `${PREFIX}-Create`;
const NAME_EDITED = `${PREFIX}-Edited`;
const TPL_A = `${PREFIX}-TplAlpha`;
const TPL_B = `${PREFIX}-TplBravo`;
const SEGMENT = `${PREFIX}-Segment`;

let tplA: any;
let tplB: any;
let segment: any;
let createdId = '';
const createdIds: string[] = [];
const forbidden: string[] = [];

// ─── helpers ──────────────────────────────────────────────────────────────────

async function createCampaignApi(name: string, extra: Record<string, unknown> = {}) {
  const res = await api('POST', '/whatsapp-campaigns', {
    name,
    templateName: TPL_A,
    templateContent: 'Hello {customer_name}, our latest offer is live!',
    ...extra,
  });
  const id = res?.data?.id;
  expect(id, `campaign create failed: ${JSON.stringify(res)}`).toBeTruthy();
  createdIds.push(id);
  return id as string;
}

/** Opens a page and resolves whether the feature is enabled or shows the upgrade affordance. */
async function open(page: Page, path: string, heading: string | RegExp): Promise<'enabled' | 'gated'> {
  await page.goto(path);
  await waitForLoad(page);
  const working = page.getByRole('heading', { name: heading }).first();
  const gated = page.getByText(/not available on your plan/i).first();
  await expect(working.or(gated)).toBeVisible({ timeout: 20_000 });
  if (await gated.isVisible()) {
    await expect(page.getByRole('link', { name: /upgrade plan|view usage/i })).toBeVisible();
    await expect(page.locator(TOAST)).toHaveCount(0);
    return 'gated';
  }
  return 'enabled';
}

function row(page: Page, text: string) {
  return page.locator('tbody tr').filter({ hasText: text });
}

async function search(page: Page, term: string) {
  await page.getByPlaceholder('Search campaigns...').fill(term);
}

async function pickRelation(page: Page, trigger: RegExp, searchPlaceholder: string, option: string) {
  await page.getByRole('combobox', { name: trigger }).click();
  await page.getByPlaceholder(searchPlaceholder).fill(option);
  await page.getByRole('option', { name: new RegExp(option) }).click();
  await expect(page.getByPlaceholder(searchPlaceholder)).toHaveCount(0);
}

async function expectNoCommAnchors(page: Page) {
  await expect(page.locator(COMM_ANCHORS)).toHaveCount(0);
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  for (let i = 0; i < 2; i++) await seedContact({ name: `${PREFIX}-Contact-${i}` });
  tplA = (await api('POST', '/templates', {
    name: TPL_A, channel: 'whatsapp', content: 'Hi {customer_name}, alpha offer', category: 'offer', language: 'en',
  })).data;
  tplB = (await api('POST', '/templates', {
    name: TPL_B, channel: 'whatsapp', content: 'Hi {customer_name}, bravo offer', category: 'offer', language: 'en',
  })).data;
  segment = (await api('POST', '/marketing/segments', {
    name: SEGMENT, description: 'WA segment', filtersJson: JSON.stringify({ operator: 'AND', rules: [] }),
  })).data;
  expect(tplA?.id && tplB?.id && segment?.id, 'seed failed').toBeTruthy();
});

test.afterAll(async () => {
  for (const id of createdIds) await api('DELETE', `/whatsapp-campaigns/${id}`).catch(() => undefined);
  for (const t of [tplA, tplB]) if (t?.id) await api('DELETE', `/templates/${t.id}`).catch(() => undefined);
  if (segment?.id) await api('DELETE', `/marketing/segments/${segment.id}`).catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
  page.on('response', (r) => {
    if (r.url().includes('/whatsapp-campaigns') && r.status() === 403) forbidden.push(r.url());
  });
});

test.afterEach(() => {
  expect(forbidden, 'API returned 403 — the UI must show the upgrade state instead').toEqual([]);
});

// ─── A. gate ──────────────────────────────────────────────────────────────────

test.describe.serial('WhatsApp campaigns', () => {
  test('A. list page renders the working feature or an upgrade affordance, never an error toast', async ({ page }) => {
    const state = await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns');
    await expect(page.locator(`${TOAST}:has-text("Failed")`)).toHaveCount(0);
    if (state === 'gated') {
      await open(page, '/marketing/whatsapp/new', /./);
      return;
    }
    await expect(page.getByRole('button', { name: /New campaign/ })).toBeVisible();
    await expect(page.getByPlaceholder('Search campaigns...')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter by status' }).or(page.getByLabel('Filter by status'))).toBeVisible();
  });

  // ─── B. create ──────────────────────────────────────────────────────────────

  test('B1. new form validates required fields', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp/new', 'New WhatsApp campaign')) === 'gated') return;
    await page.getByRole('button', { name: /^(Save|Create|Submit)/ }).first().click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Pick an approved WhatsApp template')).toBeVisible();
    await expect(page).toHaveURL(/\/marketing\/whatsapp\/new/);
  });

  test('B2. relation fields are comboboxes whose options narrow as you type; no raw ID input', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp/new', 'New WhatsApp campaign')) === 'gated') return;
    await expect(page.locator('input[name="templateId"], input#templateId, input[name="segmentId"], input#segmentId')).toHaveCount(0);

    const template = page.getByRole('combobox', { name: /WhatsApp template/ });
    await expect(template).toBeVisible();
    await template.click();
    const search = page.getByPlaceholder('Search templates...');
    await search.fill(TPL_A);
    await expect(page.getByRole('option', { name: new RegExp(TPL_A) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(TPL_B) })).toHaveCount(0);
    await search.fill(`${PREFIX}-nothing-matches`);
    await expect(page.getByText('No approved WhatsApp templates found.')).toBeVisible();
    await page.keyboard.press('Escape');

    const seg = page.getByRole('combobox', { name: /Audience segment/ });
    await expect(seg).toBeVisible();
    await seg.click();
    await page.getByPlaceholder('Search segments...').fill(SEGMENT);
    await expect(page.getByRole('option', { name: new RegExp(SEGMENT) })).toBeVisible();
    await page.getByPlaceholder('Search segments...').fill(`${PREFIX}-nothing-matches`);
    await expect(page.getByRole('option')).toHaveCount(0);
    await expectNoCommAnchors(page);
  });

  test('B3. create a campaign filling every field, then land on its detail page', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp/new', 'New WhatsApp campaign')) === 'gated') return;

    await page.locator('#name').fill(NAME);
    await pickRelation(page, /WhatsApp template/, 'Search templates...', TPL_A);
    await pickRelation(page, /Audience segment/, 'Search segments...', SEGMENT);

    // Schedule: 28th of next month, via the calendar popover.
    const nowDate = new Date();
    await pickDate(page, page.getByRole('button', { name: /Pick a date/ }), new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 28));

    await page.getByRole('button', { name: /^(Save|Create|Submit)/ }).first().click();
    await expect(page).toHaveURL(/\/marketing\/whatsapp\/(?!new)[^/]+$/, { timeout: 20_000 });
    createdId = page.url().split('/').pop()!;
    createdIds.push(createdId);
    await expect(page.locator(`${TOAST}:has-text("Campaign created")`)).toBeVisible();

    // Backend persisted the real values.
    const stored = (await api('GET', `/whatsapp-campaigns/${createdId}`)).data;
    expect(stored.name).toBe(NAME);
    expect(stored.status).toBe('draft');
    expect(stored.templateName).toBe(TPL_A);
    expect(stored.templateContent).toContain('alpha offer');
    expect(stored.scheduledAt).toBeTruthy();
  });

  // ─── C. list / detail / edit ────────────────────────────────────────────────

  test('C1. list shows every created value', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;
    await search(page, NAME);
    const r = row(page, NAME);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText(TPL_A);
    await expect(r).toContainText(/draft/i);
    await expect(r).toContainText(/28 \w{3} \d{4}/);
    // Sent / Delivered / Read counters start at zero.
    expect((await r.locator('td').allInnerTexts()).filter((t) => t.trim() === '0').length).toBeGreaterThanOrEqual(3);
  });

  test('C2. detail page shows every value', async ({ page }) => {
    if ((await open(page, `/marketing/whatsapp/${createdId}`, NAME)) === 'gated') return;
    await expect(page.getByText(/draft/i).first()).toBeVisible();
    for (const label of ['Sent', 'Delivered', 'Read', 'Replied']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    const details = page.locator('dl');
    await expect(details).toContainText(TPL_A);
    await expect(details).toContainText(SEGMENT);
    await expect(details).toContainText(/28\/\d{2}\/\d{4}/);
    await expectNoCommAnchors(page);
  });

  test('C3. edit form is pre-filled, edits persist', async ({ page }) => {
    if ((await open(page, `/marketing/whatsapp/${createdId}`, NAME)) === 'gated') return;
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/marketing/whatsapp/${createdId}/edit`));

    await expect(page.locator('#name')).toHaveValue(NAME);
    await expect(page.getByRole('combobox', { name: /WhatsApp template/ })).toContainText(TPL_A);
    await expect(page.getByRole('combobox', { name: /Audience segment/ })).toContainText(SEGMENT);
    await expect(page.getByRole('button', { name: /28 \w{3} \d{4}/ })).toBeVisible();

    await page.locator('#name').fill(NAME_EDITED);
    await pickRelation(page, /WhatsApp template/, 'Search templates...', TPL_B);
    await page.getByRole('button', { name: /^(Save|Update)/ }).first().click();

    await expect(page).toHaveURL(new RegExp(`/marketing/whatsapp/${createdId}$`), { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: NAME_EDITED })).toBeVisible();
    await expect(page.locator('dl')).toContainText(TPL_B);

    const stored = (await api('GET', `/whatsapp-campaigns/${createdId}`)).data;
    expect(stored.name).toBe(NAME_EDITED);
    expect(stored.templateName).toBe(TPL_B);
    expect(stored.templateContent).toContain('bravo offer');
  });

  // ─── D. search / filter / empty ─────────────────────────────────────────────

  test('D1. search narrows rows and an unmatched search shows the empty state', async ({ page }) => {
    const otherId = await createCampaignApi(`${PREFIX}-Other`);
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;

    await search(page, PREFIX);
    await expect(row(page, NAME_EDITED)).toHaveCount(1);
    await expect(row(page, `${PREFIX}-Other`)).toHaveCount(1);

    await search(page, `${PREFIX}-Other`);
    await expect(row(page, `${PREFIX}-Other`)).toHaveCount(1);
    await expect(row(page, NAME_EDITED)).toHaveCount(0);

    await search(page, `${PREFIX}-zzz-no-match`);
    await expect(page.getByText('No WhatsApp campaigns yet')).toBeVisible();
    await expect(row(page, PREFIX)).toHaveCount(0); // the empty state itself renders inside tbody
    void otherId;
  });

  test('D2. status filter narrows the list', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;
    await search(page, PREFIX);
    await expect(row(page, NAME_EDITED)).toHaveCount(1);

    await page.getByLabel('Filter by status').selectOption('cancelled');
    await expect(row(page, NAME_EDITED)).toHaveCount(0);

    await page.getByLabel('Filter by status').selectOption('draft');
    await expect(row(page, NAME_EDITED)).toHaveCount(1);
    const statuses = await page.locator('tbody tr').locator('td').filter({ hasText: /^(draft|sending|sent|paused|cancelled|failed)$/i }).allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(s.trim().toLowerCase()).toBe('draft');
  });

  // ─── E. lifecycle ───────────────────────────────────────────────────────────

  test('E. send -> pause -> cancel from detail; analytics and recipients render; locked afterwards', async ({ page }) => {
    const id = await createCampaignApi(`${PREFIX}-Life`);
    if ((await open(page, `/marketing/whatsapp/${id}`, `${PREFIX}-Life`)) === 'gated') return;

    await page.getByRole('button', { name: /Send now/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Send$/ }).click();
    await expect(page.locator(`${TOAST}:has-text("Campaign sent")`)).toBeVisible();
    await expect(page.getByText('sending', { exact: true }).first()).toBeVisible();
    expect((await api('GET', `/whatsapp-campaigns/${id}`)).data.status).toBe('sending');

    // Analytics stats + recipients tab.
    for (const label of ['Sent', 'Delivered', 'Read', 'Replied']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('Recipients').first()).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText(/\+?\d{7,}/);

    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.getByRole('button', { name: /^Pause$/ }).click();
    await expect(page.locator(`${TOAST}:has-text("Campaign paused")`)).toBeVisible();
    await expect(page.getByText('paused', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Cancel campaign' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel campaign' }).click();
    await expect(page.locator(`${TOAST}:has-text("Campaign cancelled")`)).toBeVisible();
    await expect(page.getByText('cancelled', { exact: true }).first()).toBeVisible();
    expect((await api('GET', `/whatsapp-campaigns/${id}`)).data.status).toBe('cancelled');

    // A cancelled campaign cannot be edited via the UI route.
    await page.goto(`/marketing/whatsapp/${id}/edit`);
    await expect(page.getByText('Campaign can no longer be edited')).toBeVisible({ timeout: 15_000 });
  });

  // ─── F. delete ──────────────────────────────────────────────────────────────

  test('F1. delete from the list row action requires confirmation and removes the row', async ({ page }) => {
    const name = `${PREFIX}-DeleteMe`;
    const id = await createCampaignApi(name);
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;
    await search(page, name);
    const r = row(page, name);
    await expect(r).toHaveCount(1);

    await r.hover();
    await r.getByRole('button', { name: 'Delete' }).click();
    // Cancel keeps it.
    await page.getByRole('dialog').getByRole('button', { name: /^Cancel$/ }).click();
    await expect(r).toHaveCount(1);

    await r.hover();
    await r.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator(`${TOAST}:has-text("Campaign deleted")`)).toBeVisible();
    await expect(row(page, name)).toHaveCount(0);
    expect((await api('GET', `/whatsapp-campaigns/${id}`)).success).toBeFalsy();
  });

  test('F2. delete from the detail page returns to the list', async ({ page }) => {
    const name = `${PREFIX}-DeleteDetail`;
    const id = await createCampaignApi(name);
    if ((await open(page, `/marketing/whatsapp/${id}`, name)) === 'gated') return;
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/marketing\/whatsapp$/, { timeout: 15_000 });
    await search(page, name);
    await expect(row(page, name)).toHaveCount(0);
  });

  // ─── G. export / infinite scroll ────────────────────────────────────────────

  test('G1. export downloads a non-empty CSV containing the campaigns', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('button', { name: 'Export all', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^whatsapp-campaigns-.*\.csv$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    expect(fs.statSync(path!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(path!, 'utf8');
    expect(csv.split('\n')[0]).toContain('Name');
    expect(csv).toContain(NAME_EDITED);
  });

  test('G2. infinite scroll loads more rows; no pagination buttons', async ({ page }) => {
    for (let i = 0; i < 24; i++) await createCampaignApi(`${PREFIX}-Scroll-${String(i).padStart(2, '0')}`);
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;
    await expect(page.getByRole('button', { name: /^(Next|Previous)( Page)?$/ })).toHaveCount(0);

    const before = await page.locator('tbody tr').count();
    expect(before).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) {
      await page.locator('tbody tr').last().scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 20_000);
      if ((await page.locator('tbody tr').count()) > before) break;
      await page.waitForTimeout(500);
    }
    await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(before);
  });

  // ─── H. communication anchors ───────────────────────────────────────────────

  test('H. list and form pages have no mailto:, wa.me or tel: anchors', async ({ page }) => {
    if ((await open(page, '/marketing/whatsapp', 'WhatsApp Campaigns')) === 'gated') return;
    await expectNoCommAnchors(page);
    await open(page, '/marketing/whatsapp/new', 'New WhatsApp campaign');
    await expectNoCommAnchors(page);
  });
});
