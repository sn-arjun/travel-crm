import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';

const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

async function seedFlyerTemplate(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const data = {
    name: `E2E Template ${ts}`,
    category: 'festival',
    thumbnailUrl: 'https://example.com/thumb.png',
    ...overrides,
  };
  const res = await api('POST', '/marketing/flyer-templates', data);
  return res.data ?? res;
}

async function seedFlyer(templateId: string, overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const { status, ...createOverrides } = overrides;
  const data = {
    templateId,
    title: `E2E Flyer ${ts}`,
    content: { headline: 'Discover Paradise', colorScheme: 'ocean', fontSize: 'medium' },
    ...createOverrides,
  };
  const res = await api('POST', '/marketing/flyers', data);
  const flyer = res.data ?? res;
  if (status) {
    const updated = await api('PUT', `/marketing/flyers/${flyer.id}`, { status });
    return updated.data ?? updated;
  }
  return flyer;
}

async function seedSegment(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const data = {
    name: `E2E Segment ${ts}`,
    criteria: {},
    ...overrides,
  };
  const res = await api('POST', '/marketing/segments', data);
  return res.data ?? res;
}

async function searchList(page: Page, placeholder: RegExp, term: string) {
  await page.getByPlaceholder(placeholder).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

test.describe('Marketing — Flyer Templates', () => {
  test('create through the form, appears in list, edit pre-fills, edit persists, delete removes it', async ({ page }) => {
    const ts = Date.now();
    const name = `Create Tpl ${ts}`;

    await page.goto('/marketing/flyers/templates');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'New template' }).click();
    await page.waitForURL('**/marketing/flyers/templates/new');

    await page.locator('#name').fill(name);
    await page.locator('#category').click();
    await page.getByRole('option', { name: 'Seasonal' }).click();
    await page.locator('#thumbnailUrl').fill('https://example.com/thumb.png');
    await page.locator('#previewUrl').fill('https://example.com/preview.png');
    await page.getByRole('button', { name: /save|create/i }).last().click();
    await expect(page.locator('text=Template created').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL('**/marketing/flyers/templates');
    await waitForLoad(page);

    await searchList(page, /Search templates/i, name);
    const row = page.locator(`table tbody tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('seasonal');

    // Edit form pre-fills existing values
    await row.locator('button[aria-label="Edit"]').click();
    await page.waitForURL(/\/marketing\/flyers\/templates\/.+\/edit/);
    await expect(page.locator('#name')).toHaveValue(name);
    await expect(page.locator('#thumbnailUrl')).toHaveValue('https://example.com/thumb.png');
    await expect(page.locator('#previewUrl')).toHaveValue('https://example.com/preview.png');

    const updatedName = `${name} Updated`;
    await page.locator('#name').fill(updatedName);
    await page.getByRole('button', { name: /save|update/i }).last().click();
    await expect(page.locator('text=Template updated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL('**/marketing/flyers/templates');
    await waitForLoad(page);

    await searchList(page, /Search templates/i, updatedName);
    await expect(page.locator(`table tbody tr:has-text("${updatedName}")`)).toBeVisible({ timeout: 10_000 });

    // Delete
    const updatedRow = page.locator(`table tbody tr:has-text("${updatedName}")`).first();
    await updatedRow.hover();
    await updatedRow.locator('button[aria-label="Delete"]').click();
    await expect(page.locator('text=Template deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${updatedName}")`)).toHaveCount(0, { timeout: 10_000 });
  });

  test('category filter narrows the list', async ({ page }) => {
    const marker = `CatFilter${Date.now()}`;
    const festival = await seedFlyerTemplate({ name: `${marker} Festival`, category: 'festival' });
    const promo = await seedFlyerTemplate({ name: `${marker} Promo`, category: 'promotional' });

    await page.goto('/marketing/flyers/templates');
    await waitForLoad(page);
    await searchList(page, /Search templates/i, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('button:has-text("All categories"), button:has-text("Category")').first().click();
    await page.getByRole('option', { name: 'festival', exact: true }).click();
    await waitForLoad(page);

    await expect(page.locator(`table tbody tr:has-text("${festival.name}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${promo.name}")`)).toHaveCount(0);
  });

  test('export downloads a non-empty CSV', async ({ page }) => {
    const tpl = await seedFlyerTemplate({ name: `Export Tpl ${Date.now()}`, category: 'general' });

    await page.goto('/marketing/flyers/templates');
    await waitForLoad(page);
    await searchList(page, /Search templates/i, tpl.name);
    await expect(page.locator(`table tbody tr:has-text("${tpl.name}")`)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export all' }).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain(tpl.name);
  });

  test('empty state renders when search matches nothing', async ({ page }) => {
    await page.goto('/marketing/flyers/templates');
    await waitForLoad(page);
    await searchList(page, /Search templates/i, `no-such-template-${Date.now()}-zzz`);
    await expect(page.getByText('No templates yet')).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedFlyerTemplate({ name: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/marketing/flyers/templates');
    await waitForLoad(page);
    await searchList(page, /Search templates/i, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });
});

test.describe('Marketing — Flyers', () => {
  test('create through the form (template combobox, no raw ID input), appears in list, detail shows values, edit pre-fills, edit persists, delete removes it', async ({ page }) => {
    const tpl = await seedFlyerTemplate({ name: `Flyer Src Tpl ${Date.now()}` });
    const title = `Create Flyer ${Date.now()}`;

    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'New flyer' }).click();
    await page.waitForURL('**/marketing/flyers/new');

    // No raw ID input for the template relation — must be a combobox
    expect(await page.locator('input[name*="templateId" i], input[placeholder*="template id" i]').count()).toBe(0);
    const templateCombobox = page.locator('[role="combobox"]').first();
    await expect(templateCombobox).toBeVisible();
    await templateCombobox.click();
    await page.getByPlaceholder(/Search templates/i).fill(tpl.name);
    await page.waitForTimeout(500);
    await expect(page.getByRole('option', { name: new RegExp(tpl.name) })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: new RegExp(tpl.name) }).click();

    await page.locator('#title').fill(title);
    await page.locator('#headline').fill('');
    await page.locator('#headline').fill('Sale headline');
    await page.locator('#subheadline').fill('Sale subheadline');
    await page.locator('#offerText').fill('Flat 40% off');
    await page.locator('#contactInfo').fill('sales@example.com');
    await page.getByRole('button', { name: 'Coral Pink' }).click();
    await page.locator('#fontSize').click();
    await page.getByRole('option', { name: 'Large' }).click();

    await page.getByRole('button', { name: /save|create flyer|create/i }).last().click();
    await expect(page.locator('text=Flyer created').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/marketing\/flyers\/[0-9a-f-]{20,}$/);
    await waitForLoad(page);

    // Detail view shows the filled values
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.locator('text=Sale headline').first()).toBeVisible();
    await expect(page.locator('text=Sale subheadline').first()).toBeVisible();
    await expect(page.locator('text=Flat 40% off').first()).toBeVisible();
    await expect(page.locator('text=sales@example.com').first()).toBeVisible();

    const flyerUrl = page.url();
    const flyerId = flyerUrl.match(/\/marketing\/flyers\/([0-9a-f-]{20,})$/)![1];

    // List shows it
    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, title);
    const row = page.locator(`table tbody tr:has-text("${title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('draft');

    // Edit form pre-fills
    await row.locator('button[aria-label="Edit"]').click();
    await page.waitForURL(`**/marketing/flyers/${flyerId}/edit`);
    await expect(page.locator('#title')).toHaveValue(title);
    await expect(page.locator('#headline')).toHaveValue('Sale headline');
    await expect(page.locator('#subheadline')).toHaveValue('Sale subheadline');
    await expect(page.locator('#offerText')).toHaveValue('Flat 40% off');
    await expect(page.locator('#contactInfo')).toHaveValue('sales@example.com');

    const updatedTitle = `${title} Updated`;
    await page.locator('#title').fill(updatedTitle);
    await page.locator('#offerText').fill('Flat 60% off');
    await page.getByRole('button', { name: /save|update/i }).last().click();
    await expect(page.locator('text=Flyer updated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(`**/marketing/flyers/${flyerId}`);
    await waitForLoad(page);
    await expect(page.getByText(updatedTitle).first()).toBeVisible();
    await expect(page.locator('text=Flat 60% off').first()).toBeVisible();

    // Delete from the detail page
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('text=Flyer deleted').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL('**/marketing/flyers');

    const afterDelete = await api('GET', `/marketing/flyers/${flyerId}`);
    expect(afterDelete.success).toBe(false);
  });

  test('status filter narrows the list', async ({ page }) => {
    const tpl = await seedFlyerTemplate();
    const marker = `StatusFilter${Date.now()}`;
    const draft = await seedFlyer(tpl.id, { title: `${marker} Draft` });
    const published = await seedFlyer(tpl.id, { title: `${marker} Published`, status: 'published' });

    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('button:has-text("All statuses"), button:has-text("Status")').first().click();
    await page.getByRole('option', { name: 'Published', exact: true }).click();
    await waitForLoad(page);

    await expect(page.locator(`table tbody tr:has-text("${published.title}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${draft.title}")`)).toHaveCount(0);
  });

  test('search narrows the list to matching flyers', async ({ page }) => {
    const tpl = await seedFlyerTemplate();
    const marker = `Srch${Date.now()}`;
    const match = await seedFlyer(tpl.id, { title: `${marker} Match` });
    const other = await seedFlyer(tpl.id, { title: `Unrelated ${Date.now()}` });

    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, marker);

    await expect(page.locator(`table tbody tr:has-text("${match.title}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${other.title}")`)).toHaveCount(0);
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, `no-such-flyer-${Date.now()}-zzz`);
    await expect(page.getByText('No flyers yet')).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const tpl = await seedFlyerTemplate();
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedFlyer(tpl.id, { title: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('export downloads a non-empty CSV', async ({ page }) => {
    const tpl = await seedFlyerTemplate();
    const flyer = await seedFlyer(tpl.id, { title: `Export Flyer ${Date.now()}` });

    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, flyer.title);
    await expect(page.locator(`table tbody tr:has-text("${flyer.title}")`)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export all' }).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain(flyer.title);
  });

  test('share dialog uses a segment combobox and calls the share API — no mailto/wa.me/tel anchors anywhere on flyer pages', async ({ page }) => {
    const tpl = await seedFlyerTemplate();
    const flyer = await seedFlyer(tpl.id, { title: `Share Flyer ${Date.now()}` });
    const segment = await seedSegment({ name: `Share Segment ${Date.now()}` });

    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await searchList(page, /Search flyers/i, flyer.title);
    const row = page.locator(`table tbody tr:has-text("${flyer.title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);

    await row.hover();
    await row.locator('button[aria-label="Share"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Share “${flyer.title}”`)).toBeVisible();

    // Segment field is a combobox, not a raw ID input
    expect(await dialog.locator('input[name*="segmentId" i], input[placeholder*="segment id" i]').count()).toBe(0);
    const segmentCombobox = dialog.getByRole('combobox').filter({ hasText: 'Select a segment' });
    await expect(segmentCombobox).toBeVisible();
    await segmentCombobox.click();
    await page.getByPlaceholder(/Search segments/i).fill(segment.name);
    await page.waitForTimeout(500);
    await expect(page.getByRole('option', { name: new RegExp(segment.name) })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: new RegExp(segment.name) }).click();

    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.locator('text=Flyer shared').first()).toBeVisible({ timeout: 10_000 });

    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });
});

test.describe('Marketing — Branding', () => {
  test('save branding colors, font and logo URL; values persist after reload', async ({ page }) => {
    const primary = '#1a2b3c';
    const secondary = '#4d5e6f';

    await page.goto('/marketing/branding');
    await waitForLoad(page);

    await page.locator('#primaryColor').fill('');
    await page.locator('#primaryColor').fill(primary);
    await page.locator('#secondaryColor').fill('');
    await page.locator('#secondaryColor').fill(secondary);
    await page.locator('#fontFamily').click();
    await page.getByRole('option', { name: 'Poppins' }).click();
    await page.locator('#logoUrl').fill('https://example.com/logo.png');

    await page.getByRole('button', { name: /save/i }).last().click();
    await expect(page.locator('text=Branding settings saved').first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('#primaryColor')).toHaveValue(primary);
    await expect(page.locator('#secondaryColor')).toHaveValue(secondary);
    await expect(page.locator('#logoUrl')).toHaveValue('https://example.com/logo.png');

    const branding = await api('GET', '/marketing/branding');
    expect(branding.data.primaryColor).toBe(primary);
    expect(branding.data.secondaryColor).toBe(secondary);
    expect(branding.data.fontFamily).toBe('Poppins');
  });

  test('no raw tel/mailto/wa.me links on branding page', async ({ page }) => {
    await page.goto('/marketing/branding');
    await waitForLoad(page);
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });
});
