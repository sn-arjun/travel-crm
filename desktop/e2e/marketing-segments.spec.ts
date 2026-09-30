import { test, expect, type Page } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { api, seedContact } from './helpers/api-seed';

const SEGMENTS_API = '/marketing/segments';
const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

async function searchList(page: Page, term: string) {
  await page.getByPlaceholder(/Search segments/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

function filtersJsonFor(field: string, value: string) {
  return JSON.stringify({ groups: [{ logic: 'AND', rules: [{ field, operator: 'equals', value }] }] });
}

test.describe('Marketing Segments', () => {
  test('create via form: fill name, description and a rule; appears in list with summarized criteria', async ({ page }) => {
    const ts = Date.now();
    const name = `E2E Segment ${ts}`;
    const description = `E2E description ${ts}`;

    await page.goto('/marketing/segments/new');
    await waitForLoad(page);

    await page.locator('#name').fill(name);
    await page.locator('#description').fill(description);

    // Rule field/operator are Selects, not raw ID inputs
    await expect(page.locator('input[name*="Id" i]')).toHaveCount(0);
    const ruleRow = page.locator('.flex.items-center.gap-ds-2').filter({ has: page.locator('input[placeholder="Value..."]') }).first();
    await ruleRow.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: 'City', exact: true }).click();
    await ruleRow.locator('input[placeholder="Value..."]').fill('Mumbai');

    await page.getByRole('button', { name: /^Save|Create/i }).click();
    await expect(page.locator('text=Segment created successfully').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/marketing\/segments$/, { timeout: 10_000 });
    await waitForLoad(page);

    await searchList(page, name);
    const row = page.locator(`table tbody tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('groups: 1 values');

    const getResult = await api('GET', SEGMENTS_API);
    const savedRow = (getResult.data?.data ?? getResult.data ?? []).find((s: any) => s.name === name);
    expect(savedRow).toBeTruthy();

    for (const header of ['Name', 'Criteria', 'Contacts', 'Created']) {
      await expect(page.locator('table thead').getByText(header, { exact: true })).toBeVisible();
    }
  });

  test('detail drawer shows description, criteria, matching contacts preview; edit form is pre-filled and edits persist', async ({ page }) => {
    const ts = Date.now();
    await seedContact({ city: 'Pune' });
    const created = await api('POST', SEGMENTS_API, {
      name: `E2E Detail Segment ${ts}`,
      description: `Detail desc ${ts}`,
      filtersJson: filtersJsonFor('city', 'Pune'),
    });
    const segment = created.data ?? created;
    await api('POST', `${SEGMENTS_API}/${segment.id}/refresh-count`);

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, segment.name);
    const row = page.locator(`table tbody tr:has-text("${segment.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(segment.name)).toBeVisible();
    await expect(drawer.getByText(segment.description)).toBeVisible();
    await expect(drawer.getByText('groups: 1 values')).toBeVisible();
    await expect(drawer.getByText('Contacts matched')).toBeVisible();

    // Edit navigates to the edit form, which is pre-filled with existing values
    await drawer.getByRole('button', { name: /Edit segment/i }).click();
    await page.waitForURL(new RegExp(`/marketing/segments/${segment.id}/edit`), { timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.locator('#name')).toHaveValue(segment.name);
    await expect(page.locator('#description')).toHaveValue(segment.description);
    const valueInputs = page.locator('input[placeholder="Value..."]');
    await expect(valueInputs.first()).toHaveValue('Pune');

    const newName = `${segment.name} Edited`;
    await page.locator('#name').fill('');
    await page.locator('#name').fill(newName);
    await valueInputs.first().fill('');
    await valueInputs.first().fill('Delhi');

    await page.getByRole('button', { name: /^Save|Update/i }).click();
    await expect(page.locator('text=Segment updated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/marketing\/segments$/, { timeout: 10_000 });
    await waitForLoad(page);

    const getResult = await api('GET', `${SEGMENTS_API}/${segment.id}`);
    expect(getResult.data.name).toBe(newName);
    const criteria = JSON.parse(getResult.data.filters_json);
    expect(criteria.groups[0].rules[0].value).toBe('Delhi');
  });

  test('refresh count updates the contact count shown in list and drawer', async ({ page }) => {
    const contact = await seedContact({ city: `RefreshCity${Date.now()}` });
    const cityValue = contact.city;
    const created = await api('POST', SEGMENTS_API, {
      name: `E2E Refresh Segment ${Date.now()}`,
      filtersJson: filtersJsonFor('city', cityValue),
    });
    const segment = created.data ?? created;

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, segment.name);
    const row = page.locator(`table tbody tr:has-text("${segment.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.hover();
    await row.locator('button[aria-label="Refresh count"]').click();
    await expect(page.locator(`text=Refreshed contact count for "${segment.name}"`).first()).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);

    const getResult = await api('GET', `${SEGMENTS_API}/${segment.id}`);
    expect(getResult.data.contact_count).toBeGreaterThan(0);

    const afterRow = page.locator(`table tbody tr:has-text("${segment.name}")`).first();
    await expect(afterRow).toContainText(Number(getResult.data.contact_count).toLocaleString());
  });

  test('delete removes a segment from the list and from the API', async ({ page }) => {
    const created = await api('POST', SEGMENTS_API, { name: `E2E Delete Segment ${Date.now()}` });
    const segment = created.data ?? created;

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, segment.name);
    const row = page.locator(`table tbody tr:has-text("${segment.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.hover();
    await row.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.locator('text=Segment deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${segment.name}")`)).toHaveCount(0, { timeout: 10_000 });

    const afterDelete = await api('GET', `${SEGMENTS_API}/${segment.id}`);
    expect(afterDelete.success).toBe(false);
  });

  test('bulk delete removes every selected segment', async ({ page }) => {
    const marker = `Bulk${Date.now()}`;
    const a = (await api('POST', SEGMENTS_API, { name: `${marker} A` })).data;
    const b = (await api('POST', SEGMENTS_API, { name: `${marker} B` })).data;

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('table tbody tr').nth(0).getByRole('checkbox').click();
    await page.locator('table tbody tr').nth(1).getByRole('checkbox').click();
    // ListPage's bulk action bar calls onSelect directly — no confirm dialog step
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('text=segments deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${marker}")`)).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `${SEGMENTS_API}/${a.id}`)).success).toBe(false);
    expect((await api('GET', `${SEGMENTS_API}/${b.id}`)).success).toBe(false);
  });

  test('search narrows the list to matching segments', async ({ page }) => {
    const marker = `Srch${Date.now()}`;
    const match = (await api('POST', SEGMENTS_API, { name: `${marker} Match` })).data;
    const other = (await api('POST', SEGMENTS_API, { name: `Unrelated ${Date.now()}` })).data;

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, marker);

    await expect(page.locator(`table tbody tr:has-text("${match.name}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${other.name}")`)).toHaveCount(0);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('empty state renders when the search matches nothing', async ({ page }) => {
    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, `no-such-segment-${Date.now()}-zzz`);

    await expect(page.getByText('No segments yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table tbody tr')).toHaveCount(1);
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await api('POST', SEGMENTS_API, { name: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('export downloads a non-empty CSV containing the listed segments', async ({ page }) => {
    const created = await api('POST', SEGMENTS_API, {
      name: `Export Segment ${Date.now()}`,
      description: 'Export desc',
      filtersJson: filtersJsonFor('city', 'Chennai'),
    });
    const segment = created.data ?? created;

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await searchList(page, segment.name);
    await expect(page.locator(`table tbody tr:has-text("${segment.name}")`)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export all', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^marketing-segments-.*\.csv$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain('"Name","Description","Criteria","Contacts","Created"');
    expect(csv).toContain(segment.name);
  });

  test('no raw tel/mailto/wa.me links and no raw ID inputs anywhere in this slice', async ({ page }) => {
    const created = await api('POST', SEGMENTS_API, { name: `NoLinks Segment ${Date.now()}` });
    const segment = created.data ?? created;

    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);

    await page.goto('/marketing/segments/new');
    await waitForLoad(page);
    expect(await page.locator('input[name*="Id" i]').count()).toBe(0);
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);

    await page.goto(`/marketing/segments/${segment.id}/edit`);
    await waitForLoad(page);
    expect(await page.locator('input[name*="Id" i]').count()).toBe(0);
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });
});
