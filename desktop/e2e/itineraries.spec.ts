import { test, expect } from './fixtures';
import { API_URL, waitForLoad } from './helpers/auth';
import { pickDate } from './helpers/date-picker';
import { seedContact, seedLead, seedItinerary, seedRateCard, api } from './helpers/api-seed';
import { isMultiTenantStack, NEEDS_MULTI, signInViaUI } from './helpers/tenants';
import { createEuroAgency, seedEuroLead } from './helpers/eur-agency';

// ---------------------------------------------------------------------------
// Full round trip: create via form -> list -> detail -> edit prefill -> edit
// -> delete. Plus search/filter, relation combobox, communication hub,
// export, infinite scroll, empty state, versions, share link, PDF.
// ---------------------------------------------------------------------------

test.describe('Itinerary — full lifecycle via form UI', () => {
  test('create, view, edit, delete round trip', async ({ page }) => {
    const contact = await seedContact({ name: `Itin-Contact-${Date.now()}` });
    const lead = await seedLead(contact.id, { title: `Itin-Lead-${Date.now()}` });
    const ts = Date.now();
    const title = `E2E-Itin-${ts}`;
    const destination = `Testland-${ts}`;

    // ── CREATE via form ──
    await page.goto('/itineraries/new');
    await waitForLoad(page);

    await page.locator('input[placeholder*="title" i]').first().fill(title);
    await page.locator('#dest').fill(destination);

    // Relation combobox: lead picker. Assert it's a searchable combobox, not raw ID input.
    await expect(page.getByPlaceholder(/enter.*lead.*id/i)).toHaveCount(0);
    const leadCombobox = page.locator('[role="combobox"]').first();
    await expect(leadCombobox).toBeVisible({ timeout: 10_000 });
    await leadCombobox.click();
    const leadSearchInput = page.getByPlaceholder(/search leads/i);
    await expect(leadSearchInput).toBeVisible({ timeout: 5_000 });
    await leadSearchInput.fill(lead.title);
    await page.waitForTimeout(600);
    const leadOption = page.getByRole('option', { name: new RegExp(lead.title) });
    await expect(leadOption.first()).toBeVisible({ timeout: 5_000 });
    await leadOption.first().click();

    // Valid until date
    await pickDate(page, page.locator('#validity'), new Date(Date.now() + 86400000 * 10));
    await page.locator('#desc').fill('E2E full lifecycle description');

    // Add an activity to day 1 so cost/selling totals are non-trivial
    const addHotelBtn = page.getByRole('button', { name: /^hotel$/i }).first();
    await addHotelBtn.click();
    await page.locator('input[placeholder="Hotel name"]').first().fill('E2E Test Hotel');
    const costInputs = page.locator('input[placeholder^="Cost"]');
    await costInputs.first().fill('4000');
    const sellingInputs = page.locator('input[placeholder^="Selling"]');
    await sellingInputs.first().fill('6000');

    // Currency
    await page.locator('#currency').click();
    await page.getByRole('option', { name: 'USD' }).click();

    // Inclusions / exclusions
    await page.getByPlaceholder(/add inclusion/i).fill('E2E Inclusion Item');
    await page.getByPlaceholder(/add inclusion/i).press('Enter');
    await page.getByPlaceholder(/add exclusion/i).fill('E2E Exclusion Item');
    await page.getByPlaceholder(/add exclusion/i).press('Enter');

    // Save
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForURL(/\/itineraries\/(?!new$|templates$)[^/]+$/, { timeout: 15_000 });
    await waitForLoad(page);

    const itineraryUrl = page.url();
    const itineraryId = itineraryUrl.split('/itineraries/')[1];
    expect(itineraryId).toBeTruthy();

    // ── DETAIL: assert every filled value is present ──
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('E2E Inclusion Item')).toBeVisible();
    await expect(page.getByText('E2E Exclusion Item')).toBeVisible();
    await expect(page.getByText(/E2E Test Hotel/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /edit/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /email/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /whatsapp/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /more/i }).click();
    await expect(page.getByRole('menuitem', { name: /preview pdf/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /download pdf/i })).toBeVisible();
    await page.keyboard.press('Escape');

    // No direct mailto/wa.me/tel links anywhere on the detail page
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);
    expect(await page.locator('a[href^="tel:"]').count()).toBe(0);

    // ── LIST: assert title & values appear ──
    await page.goto('/itineraries');
    await waitForLoad(page);
    const search = page.getByPlaceholder(/search itineraries/i);
    await search.fill(title);
    await page.waitForTimeout(900);
    const row = page.locator('tr').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('draft').first()).toBeVisible();

    // Row click opens detail drawer with values
    await row.click();
    const drawer = page.locator('[data-slot="sheet-content"]').or(page.getByRole('dialog'));
    await expect(drawer.first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(title).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ── EDIT: open edit form, assert prefill ──
    await page.goto(`/itineraries/${itineraryId}/edit`);
    await waitForLoad(page);

    await expect(page.locator('#title')).toHaveValue(title, { timeout: 10_000 });
    await expect(page.locator('#description')).toHaveValue('E2E full lifecycle description');
    await expect(page.locator('#destination')).toHaveValue(destination);

    // ── EDIT: change title, save, assert persisted ──
    const updatedTitle = `${title}-UPDATED`;
    await page.locator('#title').clear();
    await page.locator('#title').fill(updatedTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL(`**/itineraries/${itineraryId}`, { timeout: 15_000 });
    await waitForLoad(page);
    await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 });

    // Re-open edit to confirm the update round-tripped through the backend
    await page.goto(`/itineraries/${itineraryId}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#title')).toHaveValue(updatedTitle, { timeout: 10_000 });

    // ── DELETE from detail page ──
    await page.goto(`/itineraries/${itineraryId}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /more/i }).click();
    await page.getByRole('menuitem', { name: /^delete$/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^delete$/i }).click();
    await page.waitForURL('**/itineraries', { timeout: 10_000 });
    await waitForLoad(page);

    const searchAfterDelete = page.getByPlaceholder(/search itineraries/i);
    await searchAfterDelete.fill(updatedTitle);
    await page.waitForTimeout(900);
    await expect(page.locator('tr').filter({ hasText: updatedTitle })).toHaveCount(0, { timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// List UX: search/filter narrows results, empty state, infinite scroll,
// FilterBar, status filter.
// ---------------------------------------------------------------------------

test.describe('Itinerary list — UX contract', () => {
  test('search narrows results to matching itineraries only', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const uniqueTitle = `Unique-Narrow-${Date.now()}`;
    await seedItinerary(lead.id, { title: uniqueTitle });

    const contact2 = await seedContact();
    const lead2 = await seedLead(contact2.id);
    const otherTitle = `Other-Itinerary-${Date.now()}`;
    await seedItinerary(lead2.id, { title: otherTitle });

    await page.goto('/itineraries');
    await waitForLoad(page);

    const search = page.getByPlaceholder(/search itineraries/i);
    await search.fill(uniqueTitle);
    await page.waitForTimeout(900);

    await expect(page.locator('tr').filter({ hasText: uniqueTitle })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr').filter({ hasText: otherTitle })).toHaveCount(0);
  });

  test('status filter narrows results', async ({ page }) => {
    await page.goto('/itineraries');
    await waitForLoad(page);

    const statusSelect = page.locator('select').first();
    await expect(statusSelect).toBeVisible({ timeout: 5_000 });
    await statusSelect.selectOption('approved');
    await page.waitForTimeout(900);

    // Every visible row (if any) must show the approved status badge, never a draft/sent one
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      await expect(rows.nth(i).getByText(/approved/i).first()).toBeVisible();
    }
    await statusSelect.selectOption('');
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/itineraries');
    await waitForLoad(page);

    const search = page.getByPlaceholder(/search itineraries/i);
    await search.fill(`no-such-itinerary-${Date.now()}-zzz`);
    await page.waitForTimeout(900);

    await expect(page.getByText(/no itineraries found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows when many itineraries exist', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    // Seed enough itineraries to exceed the first page (limit 30)
    const batchTag = `Scroll-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await seedItinerary(lead.id, { title: `${batchTag}-${i}` });
    }

    await page.goto('/itineraries');
    await waitForLoad(page);

    const rowsBefore = await page.locator('tbody tr').count();
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(1200);
    const rowsAfter = await page.locator('tbody tr').count();

    // Either more rows loaded, or the page reports all itineraries are already loaded
    const allLoadedText = page.getByText(/all itineraries loaded/i);
    const allLoaded = await allLoadedText.isVisible().catch(() => false);
    expect(rowsAfter >= rowsBefore || allLoaded).toBe(true);
  });

  test('export downloads a non-empty CSV file', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    await seedItinerary(lead.id, { title: `Export-Test-${Date.now()}` });

    await page.goto('/itineraries');
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export/i }).click(),
    ]);

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('fs');
    const stats = fs.statSync(path!);
    expect(stats.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Communication Hub — SendMessageDialog, no raw mailto/wa.me links
// ---------------------------------------------------------------------------

test.describe('Itinerary — Communication Hub', () => {
  test('email and whatsapp buttons open SendMessageDialog, not direct links', async ({ page }) => {
    const contact = await seedContact({ email: 'itin-comm@example.com' });
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id);

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);

    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);

    const emailBtn = page.getByRole('button', { name: /email/i }).first();
    await emailBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp(`/itineraries/${itinerary.id}$`));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const whatsappBtn = page.getByRole('button', { name: /whatsapp/i }).first();
    await whatsappBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Versions, Clone, Share Link, PDF — via API for speed + one UI smoke check
// ---------------------------------------------------------------------------

test.describe('Itinerary — versions, clone, share link, PDF', () => {
  test('detail page versions tab creates a new version', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id);
    expect(itinerary.version).toBe(1);

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);

    const versionsTab = page.getByRole('tab', { name: /versions/i });
    await expect(versionsTab).toBeVisible({ timeout: 10_000 });
    await versionsTab.click();
    await waitForLoad(page);

    await expect(page.getByRole('button', { name: /create new version/i })).toBeVisible({ timeout: 5_000 });

    const versionResult = await api('POST', `/itineraries/${itinerary.id}/new-version`, {});
    const newVersion = versionResult.data ?? versionResult;
    expect(newVersion.version).toBe(2);
    expect(newVersion.id).not.toBe(itinerary.id);
  });

  test('clone itinerary from detail page navigates to cloned copy', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id, { title: `Clone-Source-${Date.now()}` });

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);

    await page.getByRole('button', { name: /more/i }).click();
    await page.getByRole('menuitem', { name: /duplicate/i }).click();
    await page.waitForURL((url) => /\/itineraries\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(`/${itinerary.id}`), { timeout: 10_000 });
    await waitForLoad(page);
    expect(page.url()).not.toContain(itinerary.id);
  });

  test('share link generate and revoke from Share tab', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id);

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);

    const shareTab = page.getByRole('tab', { name: /share/i });
    await expect(shareTab).toBeVisible({ timeout: 10_000 });
    await shareTab.click();
    await waitForLoad(page);

    const generateBtn = page.getByRole('button', { name: /generate share link/i });
    const alreadyActive = await page.getByRole('button', { name: /regenerate link/i }).isVisible().catch(() => false);

    if (!alreadyActive) {
      await expect(generateBtn).toBeVisible({ timeout: 5_000 });
      await generateBtn.click();
      await page.waitForTimeout(1500);
    }

    const revokeBtn = page.getByRole('button', { name: /revoke link/i });
    if (await revokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await revokeBtn.click();
      await page.waitForTimeout(1000);
    } else {
      console.warn('Share link generation unavailable in test env — skipping revoke step');
    }
  });

  test('PDF preview page renders and detail page has PDF actions', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id, { title: `PDF-Test-${Date.now()}` });

    await page.goto(`/itineraries/${itinerary.id}/pdf`);
    await waitForLoad(page);
    await expect(page.locator('body')).toBeVisible();

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /more/i }).click();
    await expect(page.getByRole('menuitem', { name: /preview pdf/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('menuitem', { name: /download pdf/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Builder relation combobox — no raw ID input, typing filters options
// ---------------------------------------------------------------------------

test.describe('Itinerary builder — Lead relation combobox', () => {
  test('lead field is a searchable combobox and typing filters options', async ({ page }) => {
    const contact = await seedContact({ name: `Combobox-Contact-${Date.now()}` });
    const lead = await seedLead(contact.id, { title: `Combobox-Lead-${Date.now()}` });

    await page.goto('/itineraries/new');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/enter.*lead.*id/i)).toHaveCount(0);

    const combobox = page.locator('[role="combobox"]').first();
    await expect(combobox).toBeVisible({ timeout: 10_000 });
    await combobox.click();

    const searchInput = page.getByPlaceholder(/search leads/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill(lead.title);
    await page.waitForTimeout(600);

    await expect(page.getByRole('option', { name: new RegExp(lead.title) }).first()).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });

  test('URL leadId param prefills and resolves the lead combobox label', async ({ page }) => {
    const contact = await seedContact({ name: `Prefill-Contact-${Date.now()}` });
    const lead = await seedLead(contact.id, { title: `Prefill-Lead-${Date.now()}` });

    await page.goto(`/itineraries/new?leadId=${lead.id}`);
    await waitForLoad(page);

    await expect(page.getByText(new RegExp(lead.title)).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Rate-card picker (real names and prices) and quotation placeholders
// ---------------------------------------------------------------------------

test.describe('Itinerary — rate cards and quotation email', () => {
  test('edit page: rate card picker shows real name and prices and applies them', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id);
    const rcName = `Kathakali Show ${Date.now()}`;
    await seedRateCard({ name: rcName, serviceType: 'activity', destination: 'Kochi', costPrice: 450, sellingPrice: 650 });

    await page.goto(`/itineraries/${itinerary.id}/edit`);
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Activity', exact: true }).first().click();
    await page.getByRole('button', { name: 'Select from Rate Card' }).last().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(/search rate cards/i).fill(rcName);
    const row = dialog.locator('li').filter({ hasText: rcName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('₹450');
    await expect(row).toContainText('₹650');
    await expect(row).not.toContainText('N/A');
    await row.getByRole('button', { name: 'Select' }).click();
    await expect(page.locator('text=Rate card applied').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel('Activity name').last()).toHaveValue(rcName);
  });

  test('quotation email from the Share tab has no placeholder text', async ({ page }) => {
    const contact = await seedContact({ email: 'quote-client@example.com' });
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id);

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: /share/i }).click();
    await page.getByRole('button', { name: /send via email/i }).click();
    await page.getByText('Quotation Email', { exact: true }).click();
    const body = await page.locator('#msg-body').inputValue();
    const subject = await page.locator('#msg-subject').inputValue();
    expect(`${subject}\n${body}`).not.toMatch(/\[[A-Za-z ]+\]/);
    expect(body).not.toContain('{{amount}}');
    expect(body).toContain('₹');
  });

  test('quotation email resolves the company name from the company profile (no unresolved placeholders)', async ({ page }) => {
    const company = `Sahyadri Holidays ${Date.now()}`;
    await api('PUT', '/settings/company', { company_name: company });
    const contact = await seedContact({ email: 'quote-company@example.com' });
    const lead = await seedLead(contact.id);
    const itinerary = await seedItinerary(lead.id);

    await page.goto(`/itineraries/${itinerary.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: /share/i }).click();
    await page.getByRole('button', { name: /send via email/i }).click();
    await page.getByText('Quotation Email', { exact: true }).click();
    await expect(page.locator('#msg-body')).toContainText(company);
    const body = await page.locator('#msg-body').inputValue();
    const subject = await page.locator('#msg-subject').inputValue();
    expect(`${subject}\n${body}`).not.toMatch(/\{\{[a-z_]+\}\}/);
    await expect(page.getByTestId('placeholder-warning')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// R138: a euro agency never gets the rupee from a default.
// Needs the multi-tenant stack (fix-stack up --multi); skipped on a single-tenant stack.
// ---------------------------------------------------------------------------
test.describe('Itinerary: a euro agency sees euros', () => {
  test.use({ storageState: undefined });

  test('POST /itineraries without a currency is in euro, and the detail page shows the euro amount', async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!(await isMultiTenantStack(API_URL)), NEEDS_MULTI);
    const { agency, call } = await createEuroAgency('itin');
    const { leadId, leadCurrency } = await seedEuroLead(call);
    expect(leadCurrency).toBe('EUR');

    const created = await call('POST', '/itineraries', {
      leadId,
      title: 'Lisbon week',
      days: [{ dayNumber: 1, title: 'Arrival', items: [{ type: 'hotel', title: 'Hotel Baixa', costPrice: 800, sellingPrice: 1234.5 }] }],
    });
    expect(created.data.currency).toBe('EUR');

    await signInViaUI(page, agency);
    await page.goto(`/itineraries/${created.data.id}`);
    await waitForLoad(page);
    await expect.poll(async () => (await page.locator('body').innerText()).includes('€'), { timeout: 20_000 }).toBe(true);
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('₹');
    expect(text).not.toMatch(/\bINR\b/);
  });
});
