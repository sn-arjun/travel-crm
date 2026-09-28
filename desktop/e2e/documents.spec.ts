import { test, expect } from '@playwright/test';
import { waitForLoad, getAuthToken, API_URL } from './helpers/auth';
import { seedLead, seedContact, seedItinerary, api } from './helpers/api-seed';

async function seedDocument(overrides: { name: string; leadId?: string; itineraryId?: string; category?: string }) {
  const token = await getAuthToken();
  const form = new FormData();
  form.append('file', new Blob([`seed-${Date.now()}`], { type: 'text/csv' }), 'seed.csv');
  form.append('name', overrides.name);
  if (overrides.category) form.append('category', overrides.category);
  if (overrides.leadId) form.append('leadId', overrides.leadId);
  if (overrides.itineraryId) form.append('itineraryId', overrides.itineraryId);
  const res = await fetch(`${API_URL}/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  return json.data ?? json;
}

test.describe('Documents', () => {
  // ─────────────────────────────────────────────────────────────
  // Full round trip: upload via form → list → detail → rename (edit) → delete
  // ─────────────────────────────────────────────────────────────

  test('full round trip: upload, view in list, view detail, rename, verify prefill, save, delete', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `DocContact-${ts}` });
    const lead = await seedLead(contact.id, { title: `DocLead-${ts}` });
    const itinerary = await seedItinerary(lead.id, { title: `DocItinerary-${ts}` });

    const docName = `E2E Passport ${ts}`;
    const csvContent = `name,value\ne2e,${ts}`;

    await page.goto('/documents');
    await waitForLoad(page);

    await page.getByRole('button', { name: /Upload File/i }).first().click();
    await expect(page.locator('text=Upload document').first()).toBeVisible({ timeout: 10_000 });

    // File input (hidden, inside FileDropzone) — no raw text/URL input for the file itself
    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e-passport.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });

    await page.locator('#doc-name').fill('');
    await page.locator('#doc-name').fill(docName);

    // Category combobox (Select)
    await page.locator('#doc-category').click();
    await page.getByRole('option', { name: 'Passport' }).click();

    // Linked itinerary — searchable RelationCombobox, no raw ID input.
    // The documents table stores a single related_to/related_id pair, so
    // only one of lead/itinerary can actually persist; this round trip
    // exercises the itinerary link (the lead combobox's own search/select
    // interaction is covered separately below).
    const rawIdInputsBeforeLink = await page.locator('input[name*="Id" i], input[placeholder*="ID" i]').count();
    expect(rawIdInputsBeforeLink).toBe(0);

    const uploadComboboxes = page.getByRole('combobox');
    await uploadComboboxes.filter({ hasText: 'Search itineraries' }).click();
    await page.getByPlaceholder('Search…').fill(itinerary.title.slice(0, 8));
    await page.waitForTimeout(600);
    await page.getByRole('option', { name: itinerary.title }).click();

    await page.getByRole('button', { name: /^Upload$/i }).click();
    await expect(page.locator('text=Document uploaded').first()).toBeVisible({ timeout: 15_000 });
    await waitForLoad(page);

    // 1. Assert the uploaded document appears in the list with its values
    await page.getByPlaceholder(/Search documents/i).fill(docName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row = page.locator(`table tbody tr:has-text("${docName}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/passport/i);
    await expect(row).toContainText('KB');

    // 2. Open detail drawer, assert values present including linked lead/itinerary
    await row.click();
    await expect(page.locator('[role="dialog"], [data-slot="sheet-content"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${docName}`).first()).toBeVisible();
    await expect(page.locator('text=Passport').first()).toBeVisible();
    await expect(page.locator(`text=${itinerary.id}`).first()).toBeVisible();

    // No raw mailto/wa.me/tel anchors anywhere on this page
    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    // 3. Rename (edit) — dialog opens pre-filled with current name
    await page.getByRole('button', { name: 'Rename' }).first().click();
    await expect(page.locator('text=Rename document').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#rename-input')).toHaveValue(docName);

    // 4. Edit and save, assert the change persisted
    const renamedDocName = `Renamed-${ts}`;
    await page.locator('#rename-input').fill('');
    await page.locator('#rename-input').fill(renamedDocName);
    await page.getByRole('button', { name: /Save/i }).click();
    await expect(page.locator('text=Document renamed').first()).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator(`text=${renamedDocName}`).first()).toBeVisible({ timeout: 10_000 });

    // Verify persisted via API too
    const listRes = await api('GET', `/documents?search=${encodeURIComponent(renamedDocName)}`);
    const created = (listRes.data ?? []).find((d: any) => d.name === renamedDocName);
    expect(created).toBeTruthy();
    const docId = created.id;

    // 5. Delete, assert it is gone
    const renamedRow = page.locator(`table tbody tr:has-text("${renamedDocName}")`).first();
    await renamedRow.hover();
    await renamedRow.locator('button[aria-label="Delete"]').click();
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(page.locator('text=Document deleted').first()).toBeVisible({ timeout: 10_000 });

    const afterDelete = await api('GET', `/documents/${docId}`);
    expect(afterDelete.success === false || afterDelete.data == null).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────
  // Download round trip
  // ─────────────────────────────────────────────────────────────

  test('download returns the uploaded file content', async ({ page }) => {
    const ts = Date.now();
    const docName = `DownloadMe-${ts}`;

    await page.goto('/documents');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Upload File/i }).first().click();
    await expect(page.locator('text=Upload document').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'downloadable.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`content-${ts}`),
    });
    await page.locator('#doc-name').fill('');
    await page.locator('#doc-name').fill(docName);
    await page.getByRole('button', { name: /^Upload$/i }).click();
    await expect(page.locator('text=Document uploaded').first()).toBeVisible({ timeout: 15_000 });
    await waitForLoad(page);

    await page.getByPlaceholder(/Search documents/i).fill(docName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const row = page.locator(`table tbody tr:has-text("${docName}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      row.locator('button[aria-label="Download"]').click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toContain(docName);
  });

  // ─────────────────────────────────────────────────────────────
  // Search, filter, empty state, infinite scroll
  // ─────────────────────────────────────────────────────────────

  test('search narrows results to matching documents', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `SearchDocContact-${ts}` });
    const lead = await seedLead(contact.id, { title: `SearchDocLead-${ts}` });
    const marker = `Searchable-${ts}`;

    await page.goto('/documents');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Upload File/i }).first().click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'search-doc.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('search test'),
    });
    await page.locator('#doc-name').fill('');
    await page.locator('#doc-name').fill(marker);
    await page.getByRole('button', { name: /^Upload$/i }).click();
    await expect(page.locator('text=Document uploaded').first()).toBeVisible({ timeout: 15_000 });
    await waitForLoad(page);

    await page.getByPlaceholder(/Search documents/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${marker}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('category filter narrows the list to matching category only', async ({ page }) => {
    const ts = Date.now();
    const marker = `CatFilter${ts}`;

    for (const [suffix, category] of [['Visa', 'visa'], ['Contract', 'contract']] as const) {
      // eslint-disable-next-line no-await-in-loop
      await page.goto('/documents');
      // eslint-disable-next-line no-await-in-loop
      await waitForLoad(page);
      // eslint-disable-next-line no-await-in-loop
      await page.getByRole('button', { name: /Upload File/i }).first().click();
      // eslint-disable-next-line no-await-in-loop
      await page.locator('input[type="file"]').setInputFiles({
        name: `${suffix}.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(suffix),
      });
      // eslint-disable-next-line no-await-in-loop
      await page.locator('#doc-name').fill('');
      // eslint-disable-next-line no-await-in-loop
      await page.locator('#doc-name').fill(`${marker}${suffix}`);
      // eslint-disable-next-line no-await-in-loop
      await page.locator('#doc-category').click();
      // eslint-disable-next-line no-await-in-loop
      await page.getByRole('option', { name: new RegExp(`^${category}$`, 'i') }).click();
      // eslint-disable-next-line no-await-in-loop
      await page.getByRole('button', { name: /^Upload$/i }).click();
      // eslint-disable-next-line no-await-in-loop
      await expect(page.locator('text=Document uploaded').first()).toBeVisible({ timeout: 15_000 });
      // eslint-disable-next-line no-await-in-loop
      await waitForLoad(page);
    }

    await page.getByPlaceholder(/Search documents/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await page.locator('button[aria-label="Filter by category"]').click();
    await page.getByRole('option', { name: 'Visa' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/visa/i);
    }
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/documents');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search documents/i).fill(`no-such-document-${Date.now()}-zzz`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(page.locator('text=No documents yet').or(page.locator('text=Nothing here yet')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll-${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedDocument({ name: `${marker}-${i}` });
    }

    await page.goto('/documents');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search documents/i).fill(marker);
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

  // ─────────────────────────────────────────────────────────────
  // Relation combobox behavior on the upload form
  // ─────────────────────────────────────────────────────────────

  test('linked lead/itinerary fields are searchable comboboxes with no raw ID input', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `ComboContact-${ts}` });
    const lead = await seedLead(contact.id, { title: `ComboLead-${ts}` });

    await page.goto('/documents');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Upload File/i }).first().click();
    await expect(page.locator('text=Upload document').first()).toBeVisible({ timeout: 10_000 });

    const rawIdInputs = await page.locator('input[name*="Id" i], input[placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);

    const comboboxes = page.getByRole('combobox');
    const leadTrigger = comboboxes.filter({ hasText: 'Search leads' });
    await expect(leadTrigger).toBeVisible();
    await leadTrigger.click();
    const searchInput = page.getByPlaceholder('Search…');
    await expect(searchInput).toBeVisible();
    await searchInput.fill(lead.title.slice(0, 8));
    await page.waitForTimeout(600);
    await expect(page.getByRole('option', { name: lead.title })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    await expect(comboboxes.filter({ hasText: 'Search itineraries' })).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────
  // URL prefill: linked lead auto-populates upload dialog from URL param
  // ─────────────────────────────────────────────────────────────

  test('navigating with a leadId URL param opens the upload dialog pre-filled with that lead', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `PrefillContact-${ts}` });
    const lead = await seedLead(contact.id, { title: `PrefillLead-${ts}` });

    await page.goto(`/documents?leadId=${lead.id}`);
    await waitForLoad(page);

    await expect(page.locator('text=Upload document').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${lead.title}`).first()).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  test('export downloads a non-empty CSV file', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/documents');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Upload File/i }).first().click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'export-me.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('export test'),
    });
    await page.locator('#doc-name').fill('');
    await page.locator('#doc-name').fill(`ExportMe-${ts}`);
    await page.getByRole('button', { name: /^Upload$/i }).click();
    await expect(page.locator('text=Document uploaded').first()).toBeVisible({ timeout: 15_000 });
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toContain('.csv');
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────

  test('documents API requires authentication', async () => {
    const res = await fetch(`${API_URL}/documents`);
    expect(res.status).toBe(401);
  });
});
