import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedItineraryTemplate, seedContact, seedLead } from './helpers/api-seed';

const TEMPLATES_API = '/itinerary-templates';
const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

async function searchList(page: Page, term: string) {
  await page.getByPlaceholder(/Search templates/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

test.describe('Itinerary Templates', () => {
  test('list shows every seeded field; preview shows destination, duration and day count', async ({ page }) => {
    const tpl = await seedItineraryTemplate({
      title: `List Tpl ${Date.now()}`,
      destination: 'Kerala Backwaters',
      durationDays: 3,
      category: 'honeymoon',
    });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, tpl.title);

    const row = page.locator(`table tbody tr:has-text("${tpl.title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('honeymoon');
    await expect(row).toContainText('Kerala Backwaters');
    await expect(row).toContainText('3 days');

    for (const header of ['Title', 'Category', 'Destination', 'Duration', 'Created']) {
      await expect(page.locator('table thead').getByText(header, { exact: true })).toBeVisible();
    }

    // Preview dialog (this slice's read-only "detail view" — no Sheet drawer per manifest)
    await row.hover();
    await row.locator('button[aria-label="Preview"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(tpl.title)).toBeVisible();
    await expect(dialog.getByText('Kerala Backwaters')).toBeVisible();
    await expect(dialog.getByText('3 days')).toBeVisible();
    await expect(dialog.getByText('3 day items')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(dialog).toBeHidden();
  });

  test('use template: lead is a searchable combobox (no raw ID input), creates a real itinerary from the template data', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Tpl Lead ${Date.now()}` });
    const tpl = await seedItineraryTemplate({ title: `Use Tpl ${Date.now()}` });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, tpl.title);
    const row = page.locator(`table tbody tr:has-text("${tpl.title}")`).first();
    await row.hover();
    await row.locator('button[aria-label="Use template"]').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create Itinerary from Template')).toBeVisible();

    // No raw ID input anywhere in the dialog — lead field must be a combobox
    expect(await dialog.locator('input[name*="Id" i], input[placeholder*="lead id" i]').count()).toBe(0);
    const leadCombobox = dialog.locator('[role="combobox"]');
    await expect(leadCombobox).toBeVisible();

    const newTitle = `Created From Template ${Date.now()}`;
    await dialog.locator('#newTitle').fill('');
    await dialog.locator('#newTitle').fill(newTitle);

    await leadCombobox.click();
    await page.getByPlaceholder(/Search leads/i).fill(lead.title);
    await page.waitForTimeout(500);
    await expect(page.getByRole('option', { name: new RegExp(lead.title) })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: new RegExp(lead.title) }).click();

    await dialog.getByRole('button', { name: /Create itinerary/i }).click();
    await expect(page.locator('text=Itinerary created from template').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/itineraries\/[0-9a-f-]{20,}$/, { timeout: 15_000 });
    await waitForLoad(page);

    const id = page.url().match(/\/itineraries\/([0-9a-f-]{20,})$/)![1];
    const getResult = await api('GET', `/itineraries/${id}`);
    expect(getResult.success, JSON.stringify(getResult)).toBe(true);
    const created = getResult.data;
    expect(created.title).toBe(newTitle);
    expect(created.leadId).toBe(lead.id);
    expect(created.days.length).toBe(3);
  });

  test('use template requires both a title and a lead before submitting', async ({ page }) => {
    const tpl = await seedItineraryTemplate({ title: `Validate Tpl ${Date.now()}` });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, tpl.title);
    const row = page.locator(`table tbody tr:has-text("${tpl.title}")`).first();
    await row.hover();
    await row.locator('button[aria-label="Use template"]').click();

    const dialog = page.getByRole('dialog');
    await dialog.locator('#newTitle').fill('');
    await dialog.getByRole('button', { name: /Create itinerary/i }).click();
    await expect(page.locator('text=Please enter a title').first()).toBeVisible({ timeout: 5_000 });

    await dialog.locator('#newTitle').fill('Some Title');
    await dialog.getByRole('button', { name: /Create itinerary/i }).click();
    await expect(page.locator('text=Please select a lead').first()).toBeVisible({ timeout: 5_000 });

    // Dialog stayed open, nothing was created
    await expect(dialog).toBeVisible();
  });

  test('delete removes a template from the list and from the API', async ({ page }) => {
    const tpl = await seedItineraryTemplate({ title: `Delete Tpl ${Date.now()}` });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, tpl.title);
    const row = page.locator(`table tbody tr:has-text("${tpl.title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.hover();
    await row.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.locator('text=Template deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${tpl.title}")`)).toHaveCount(0, { timeout: 10_000 });

    const afterDelete = await api('GET', `${TEMPLATES_API}/${tpl.id}`);
    expect(afterDelete.success).toBe(false);
  });

  test('bulk delete removes every selected template', async ({ page }) => {
    const marker = `Bulk${Date.now()}`;
    const a = await seedItineraryTemplate({ title: `${marker} A` });
    const b = await seedItineraryTemplate({ title: `${marker} B` });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('table tbody tr').nth(0).getByRole('checkbox').click();
    await page.locator('table tbody tr').nth(1).getByRole('checkbox').click();
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.locator('text=Templates deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${marker}")`)).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `${TEMPLATES_API}/${a.id}`)).success).toBe(false);
    expect((await api('GET', `${TEMPLATES_API}/${b.id}`)).success).toBe(false);
  });

  test('search narrows the list to matching templates', async ({ page }) => {
    const marker = `Srch${Date.now()}`;
    const match = await seedItineraryTemplate({ title: `${marker} Match` });
    const other = await seedItineraryTemplate({ title: `Unrelated ${Date.now()}` });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, marker);

    await expect(page.locator(`table tbody tr:has-text("${match.title}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${other.title}")`)).toHaveCount(0);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('empty state renders when the search matches nothing', async ({ page }) => {
    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, `no-such-template-${Date.now()}-zzz`);

    await expect(page.getByText('No templates yet')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText('Save an itinerary as a template from its detail page to reuse it later.'),
    ).toBeVisible();
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    expect(await page.locator('table tbody tr td:has-text("days")').count()).toBe(0);
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedItineraryTemplate({ title: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('export downloads a non-empty CSV containing the listed templates', async ({ page }) => {
    const tpl = await seedItineraryTemplate({
      title: `Export Tpl ${Date.now()}`,
      destination: 'Goa',
      durationDays: 5,
      category: 'beach',
    });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchList(page, tpl.title);
    await expect(page.locator(`table tbody tr:has-text("${tpl.title}")`)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^itinerary-templates-.*\.csv$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain('"Title","Category","Destination","Duration (days)","Created"');
    expect(csv).toContain(`"${tpl.title}","beach","Goa","5"`);
  });

  test('no raw tel/mailto/wa.me links on the list page (no messaging surface in this slice)', async ({ page }) => {
    await seedItineraryTemplate();
    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });
});

test.describe('Itinerary Templates — create', () => {
  test('New template creates a template that is listed and previews its day outline', async ({ page }) => {
    const title = `Fresh Template ${Date.now()}`;
    await page.goto('/itineraries/templates');
    await waitForLoad(page);

    await page.getByRole('button', { name: /new template/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#tplTitle').fill(title);
    await dialog.locator('#tplDestination').fill('Coorg');
    await dialog.locator('#tplDays').fill('2');
    await dialog.getByLabel('Day 1 title').fill('Arrive in Madikeri');
    await dialog.getByRole('button', { name: /create template/i }).click();
    await expect(page.locator('text=Template created').first()).toBeVisible({ timeout: 10_000 });

    await searchList(page, title);
    const row = page.locator(`table tbody tr:has-text("${title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('2 days');
    await row.click();
    await expect(page.getByRole('dialog').getByText('2 day items')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Arrive in Madikeri')).toBeVisible();
  });
});
