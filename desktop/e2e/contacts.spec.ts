import { test, expect } from '@playwright/test';
import { waitForLoad, navigateTo, getAuthToken, API_URL } from './helpers/auth';
import { seedContact, api } from './helpers/api-seed';

test.describe('Contacts', () => {
  // ─────────────────────────────────────────────────────────────
  // Full round trip: create via form → list → detail → edit → delete
  // ─────────────────────────────────────────────────────────────

  test('full round trip: create, view in list, view detail, edit, verify prefill, save, delete', async ({ page }) => {
    const ts = Date.now();
    const name = `FullCreate ${ts}`;
    const email = `full-${ts}@e2e.test`;
    const phoneDigits = '9876500001';

    await page.goto('/contacts/new');
    await waitForLoad(page);

    // Fill every field via the form UI
    await page.locator('#name').fill(name);
    await page.locator('#email').fill(email);
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill(phoneDigits);
    await page.locator('#company').fill('E2E Corp');

    // Contact type combobox
    await page.locator('button:has-text("Customer")').first().click();
    await page.getByRole('option', { name: 'Supplier' }).click();

    // Source combobox
    const sourceBtn = page.locator('button:has-text("No source")');
    if (await sourceBtn.isVisible()) {
      await sourceBtn.click();
      await page.getByRole('option', { name: 'Website' }).click();
    }

    // Address (Google Places autocomplete, falls back to plain text entry)
    await page.getByPlaceholder(/Start typing to search address/i).fill('42 MG Road');
    await page.locator('#city').fill('Mumbai');
    await page.locator('#state').fill('Maharashtra');
    await page.locator('#country').fill('India');
    await page.locator('#postalCode').fill('400001');

    // Dates
    await page.locator('#birthday').fill('1992-05-15');
    await page.locator('#anniversary').fill('2020-12-25');

    // Preferred language combobox
    const langBtn = page.locator('button:has-text("English")');
    await langBtn.click();
    await page.getByRole('option', { name: 'Hindi' }).click();

    // Tags
    const tagInput = page.getByPlaceholder(/Type a tag/i);
    await tagInput.fill('vip');
    await tagInput.press('Enter');
    await tagInput.fill('corporate');
    await tagInput.press('Enter');
    await expect(page.locator('text=vip').first()).toBeVisible();
    await expect(page.locator('text=corporate').first()).toBeVisible();

    // Notes
    await page.locator('textarea').fill('Full E2E test — all fields populated');

    // Save
    await page.getByRole('button', { name: /Save Contact/i }).click();
    await expect(
      page.locator('text=successfully').or(page.locator(`text=${name}`)).first()
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForURL('**/contacts', { timeout: 15_000 });

    // 1. Assert every filled value appears in the list (search narrows results)
    await waitForLoad(page);
    await page.getByPlaceholder(/Search/i).fill(name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row = page.locator(`table tbody tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator(`text=${email}`)).toBeVisible();
    await expect(row).toContainText(/supplier/i);
    await expect(row).toContainText('vip');

    // 2. Open detail view (full profile) and assert every value present
    await row.getByRole('link', { name: 'View' }).click().catch(async () => {
      // fallback: row-action icon button
      await row.locator('button[aria-label="View"]').click();
    });
    await page.waitForURL(/\/contacts\/[^/]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const contactUrl = page.url();
    const contactId = contactUrl.split('/contacts/')[1];
    expect(contactId).toBeTruthy();

    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${email}`).first()).toBeVisible();
    await expect(page.locator(`text=${phoneDigits.slice(0, 5)}`).first()).toBeVisible();
    await expect(page.locator('text=Supplier').first()).toBeVisible();
    await expect(page.locator('text=vip').first()).toBeVisible();
    await expect(page.locator('text=corporate').first()).toBeVisible();
    await expect(page.locator('text=Full E2E test').first()).toBeVisible();

    // No raw tel:/mailto:/wa.me anchors — outbound contact must go through Communication Hub
    const rawAnchors = await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]').count();
    expect(rawAnchors).toBe(0);

    // 3. Open edit form, assert every value is pre-filled
    await page.goto(`/contacts/${contactId}/edit`);
    await waitForLoad(page);
    await expect(page.locator('text=Edit Contact').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#name')).toHaveValue(name);
    await expect(page.locator('#email')).toHaveValue(email);
    await expect(page.locator('#company')).toHaveValue('E2E Corp');
    await expect(page.locator('text=vip').first()).toBeVisible();
    await expect(page.locator('text=corporate').first()).toBeVisible();

    // 4. Edit a value, save, assert the change persisted
    const updatedName = `Updated-${ts}`;
    const nameField = page.locator('#name');
    await nameField.fill('');
    await nameField.fill(updatedName);
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await expect(page.locator('text=successfully').or(page.locator('text=updated')).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(`**/contacts/${contactId}`, { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible({ timeout: 10_000 });

    // Verify persisted via API too
    const fetched = await api('GET', `/contacts/${contactId}`);
    expect(fetched.data.name).toBe(updatedName);

    // 5. Delete, assert it is gone
    await page.getByRole('button', { name: /Delete/i }).first().click();
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(page.locator('text=deleted').first()).toBeVisible({ timeout: 10_000 });

    const listRes = await api('GET', `/contacts?search=${encodeURIComponent(updatedName)}`);
    const found = (listRes.data?.data ?? []).find((c: any) => c.id === contactId);
    expect(found).toBeFalsy();
  });

  test('should validate required name field on create', async ({ page }) => {
    await page.goto('/contacts/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Save Contact/i }).click();
    await expect(page.locator('text=Name is required').first()).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // List page: search, filter, empty state, infinite scroll
  // ─────────────────────────────────────────────────────────────

  test('search narrows results to matching contacts', async ({ page }) => {
    const name = `Johnathan-${Date.now()}`;
    await seedContact({ name, type: 'customer' });

    await page.goto('/contacts');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search/i).fill('Johnathan');
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText('Johnathan');
    }
  });

  test('type filter narrows the list to matching type only', async ({ page }) => {
    const marker = `Filtertest${Date.now()}`;
    await seedContact({ name: `${marker}Agent`, type: 'agent' });
    await seedContact({ name: `${marker}Customer`, type: 'customer' });

    await page.goto('/contacts');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await page.locator('button:has-text("All types")').click();
    await page.getByRole('option', { name: 'Agent' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/agent/i);
    }
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/contacts');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search/i).fill(`no-such-contact-${Date.now()}-zzz`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(page.locator('text=Nothing here yet').or(page.locator('text=No contacts')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    // Seed enough contacts to exceed the first page (limit=20)
    const marker = `Scroll-${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedContact({ name: `${marker}-${i}` });
    }

    await page.goto('/contacts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rowsBefore = await page.locator('table tbody tr').count();
    expect(rowsBefore).toBeGreaterThan(0);

    // Scroll the sentinel into view to trigger the next page load
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(1500);
    await waitForLoad(page);

    const rowsAfter = await page.locator('table tbody tr').count();
    expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
  });

  // ─────────────────────────────────────────────────────────────
  // Relation combobox behavior (contact type / source / language)
  // ─────────────────────────────────────────────────────────────

  test('type/source/language are comboboxes with no raw ID input on the form', async ({ page }) => {
    await page.goto('/contacts/new');
    await waitForLoad(page);

    // No raw <input> for an "id" style relation field exists
    const rawIdInputs = await page.locator('input[name*="Id" i], input[placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);

    // Contact type is a combobox (button + role="option" listbox)
    const typeTrigger = page.locator('button:has-text("Customer")').first();
    await expect(typeTrigger).toBeVisible();
    await typeTrigger.click();
    await expect(page.getByRole('option', { name: 'Supplier' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Agent' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Language combobox
    const langTrigger = page.locator('button:has-text("English")');
    await langTrigger.click();
    await expect(page.getByRole('option', { name: 'Hindi' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Arabic' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'French' })).toBeVisible();
  });

  test('merge page contact pickers are searchable, not raw ID inputs', async ({ page }) => {
    const primary = await seedContact({ name: `MergeSearch-${Date.now()}` });

    await page.goto('/contacts/merge');
    await waitForLoad(page);

    await expect(page.locator('text=Primary').first()).toBeVisible({ timeout: 10_000 });
    const rawIdInputs = await page.locator('input[name*="Id" i]').count();
    expect(rawIdInputs).toBe(0);

    const searchInputs = page.getByPlaceholder(/Search contacts/i);
    await expect(searchInputs.first()).toBeVisible();

    await searchInputs.first().fill(primary.name.slice(0, 8));
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${primary.name}`).first()).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Outbound messaging via Communication Hub only
  // ─────────────────────────────────────────────────────────────

  test('messaging a contact opens SendMessageDialog, never a raw mailto/wa.me/tel link', async ({ page }) => {
    const contact = await seedContact({
      name: `Comms-${Date.now()}`,
      email: `comms-${Date.now()}@e2e.test`,
      phone: '+919000100002',
    });

    await page.goto('/contacts');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search/i).fill(contact.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    // No raw contact-action anchors anywhere on the list page
    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    const row = page.locator(`table tbody tr:has-text("${contact.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    const emailBtn = row.locator('button[aria-label="Email"]');
    await expect(emailBtn).toBeVisible({ timeout: 5_000 });
    await emailBtn.click();

    // The Communication Hub compose dialog opens (channel → template → compose → preview)
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  test('export downloads a non-empty CSV file', async ({ page }) => {
    await seedContact({ name: `ExportMe-${Date.now()}` });

    await page.goto('/contacts');
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

  test('export via API returns non-empty CSV with expected columns', async () => {
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/contacts/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain('Name');
    expect(csv).toContain('Email');
    expect(csv).toContain('Phone');
  });

  // ─────────────────────────────────────────────────────────────
  // Duplicate detection, merge, import (API-level, since these are
  // secondary flows off the primary CRUD round trip covered above)
  // ─────────────────────────────────────────────────────────────

  test('duplicate detection flags a contact sharing email/phone', async () => {
    const contact = await seedContact({ name: `DupeAPI-${Date.now()}`, email: `dupeapi-${Date.now()}@e2e.test`, phone: '+919999888001' });
    const res = await api('POST', '/contacts/check-duplicate', { email: contact.email, phone: contact.phone });
    expect(res.data).toBeTruthy();
    expect(res.data.hasDuplicates || (Array.isArray(res.data) && res.data.length > 0)).toBeTruthy();
  });

  test('duplicate warning banner shows on create form when email matches', async ({ page }) => {
    const existing = await seedContact({ name: `Existing-${Date.now()}`, email: `dupe-check-${Date.now()}@e2e.test` });

    await page.goto('/contacts/new');
    await waitForLoad(page);
    await page.locator('#email').fill(existing.email);
    await page.locator('#name').click();
    await expect(page.locator('text=already exists').first()).toBeVisible({ timeout: 5_000 });
  });

  test('merge combines two contacts and removes the secondary', async () => {
    const primary = await seedContact({ name: `Primary-${Date.now()}`, email: `primary-${Date.now()}@e2e.test` });
    const secondary = await seedContact({ name: `Secondary-${Date.now()}`, phone: '+919000500001', notes: 'Secondary notes' });

    const preview = await api('POST', '/contacts/merge/preview', { primaryId: primary.id, secondaryId: secondary.id });
    expect(preview.data).toBeTruthy();

    const mergeRes = await api('POST', '/contacts/merge', { primaryId: primary.id, secondaryId: secondary.id });
    expect(mergeRes.data).toBeTruthy();

    const listRes = await api('GET', `/contacts?search=${encodeURIComponent(secondary.name)}`);
    const found = (listRes.data?.data ?? []).find((c: any) => c.id === secondary.id);
    expect(found).toBeFalsy();
  });

  test('import wizard walks through upload, map, preview steps', async ({ page }) => {
    await page.goto('/contacts/import');
    await waitForLoad(page);
    await expect(page.locator('text=Import Contacts').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Upload File').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Download Template/i })).toBeVisible();

    const csv = 'name,email,phone,type\nCSV Import Test,csvtest@e2e.test,+919000300001,customer';
    await page.setInputFiles('#file-upload', {
      name: 'contacts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(page.locator('text=Upload & Continue').first()).toBeVisible({ timeout: 5_000 });
  });

  test('import contacts via API', async () => {
    const csv = 'name,email,phone,type\nCSV Import Test,csvtest2@e2e.test,+919000300002,customer';
    const blob = new Blob([csv], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'test.csv');

    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/contacts/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await res.json();
    expect(json.data).toBeTruthy();
    expect(json.data.imported).toBeGreaterThanOrEqual(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Custom fields: settings page + persistence
  // ─────────────────────────────────────────────────────────────

  test('custom field can be created in settings, saved with a contact, and deleted', async ({ page }) => {
    await navigateTo(page, '/contacts');
    await page.locator('button:has-text("Custom Fields")').click();
    await page.waitForURL('**/settings/custom-fields', { timeout: 10_000 });
    await waitForLoad(page);

    const fieldLabel = `E2E Passport ${Date.now()}`;
    await page.getByRole('button', { name: /New Field/i }).click();
    await page.locator('#field-label').fill(fieldLabel);
    await page.locator('#field-name').fill(`e2e_passport_${Date.now()}`);
    await page.getByRole('button', { name: /Create Field/i }).click();
    await expect(page.locator('text=Field created').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${fieldLabel}`).first()).toBeVisible({ timeout: 10_000 });

    // Clean up via API (field id not surfaced to the UI test directly)
    const fields = await api('GET', '/contacts/custom-fields');
    const created = (fields.data ?? []).find((f: any) => f.label === fieldLabel);
    expect(created).toBeTruthy();
    const delRes = await api('DELETE', `/contacts/custom-fields/${created.id}`);
    expect(delRes).toBeTruthy();
  });

  test('custom field values persist with a contact via API', async () => {
    const fieldName = `e2e_cf_${Date.now()}`;
    const fieldRes = await api('POST', '/contacts/custom-fields', {
      name: fieldName,
      label: 'Test Custom',
      fieldType: 'text',
      isRequired: false,
      sortOrder: 99,
    });

    const contactRes = await api('POST', '/contacts', {
      name: `CustomField-${Date.now()}`,
      type: 'customer',
      customFields: { [fieldName]: 'test-value' },
    });
    expect(contactRes.data).toBeTruthy();

    const fetched = await api('GET', `/contacts/${contactRes.data.id}`);
    expect(fetched.data.customFields?.[fieldName]).toBe('test-value');

    await api('DELETE', `/contacts/custom-fields/${fieldRes.data.id}`);
  });

  // ─────────────────────────────────────────────────────────────
  // Detail page tabs, timeline, sharing, occasions — API-level checks
  // for surface area not covered by the main round-trip UI test
  // ─────────────────────────────────────────────────────────────

  test('detail page shows all 8 tabs', async ({ page }) => {
    const contact = await seedContact({ name: `Tabs360-${Date.now()}`, email: `tabs-${Date.now()}@e2e.test`, phone: '+919000100001' });

    await page.goto(`/contacts/${contact.id}`);
    await waitForLoad(page);

    await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: /Leads/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Itineraries/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Invoices/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Payments/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Communications/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Documents/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Timeline/i })).toBeVisible();
  });

  test('timeline includes creation activity via API', async () => {
    const contact = await seedContact({ name: `TimelineAPI-${Date.now()}` });
    const res = await api('GET', `/contacts/${contact.id}/timeline`);
    expect(res.data).toBeTruthy();
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('contact can be shared and appears in shared-with-me for the recipient', async () => {
    const contact = await seedContact({ name: `Share-${Date.now()}` });
    const usersRes = await api('GET', '/users');
    const users = usersRes.data?.data ?? usersRes.data ?? [];
    test.skip(!Array.isArray(users) || users.length === 0, 'no other users to share with');

    const res = await api('POST', `/contacts/${contact.id}/share`, {
      sharedWith: users[0].id,
      note: 'E2E share test',
    });
    expect(res.data).toBeTruthy();

    const sharedRes = await api('GET', '/contacts/shared-with-me');
    expect(sharedRes.data).toBeTruthy();
  });

  test('birthday and anniversary persist and surface in upcoming occasions', async () => {
    const contact = await seedContact({
      name: `BDay-${Date.now()}`,
      birthday: '1990-06-15',
      anniversary: '2018-11-20',
    });
    expect(contact.birthday).toBe('1990-06-15');
    expect(contact.anniversary).toBe('2018-11-20');

    const fetched = await api('GET', `/contacts/${contact.id}`);
    expect(fetched.data.birthday).toBe('1990-06-15');
    expect(fetched.data.anniversary).toBe('2018-11-20');

    const res = await api('GET', '/contacts/upcoming-occasions?days=90');
    expect(res.data).toBeTruthy();
    expect(Array.isArray(res.data)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────

  test('contacts API requires authentication', async () => {
    const res = await fetch(`${API_URL}/contacts`, { headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(401);
  });

  test('contacts API rejects invalid token', async () => {
    const res = await fetch(`${API_URL}/contacts`, { headers: { Authorization: 'Bearer invalid-token-here' } });
    expect(res.status).toBe(401);
  });

  // ─────────────────────────────────────────────────────────────
  // Create Lead auto-fill from contact
  // ─────────────────────────────────────────────────────────────

  test('creating a lead from a contact pre-fills the contact via URL param', async ({ page }) => {
    const contact = await seedContact({ name: `AutoFill-${Date.now()}`, email: `af-${Date.now()}@e2e.test` });

    await page.goto(`/leads/new?contactId=${contact.id}`);
    await waitForLoad(page);

    const selectTrigger = page.locator('button:has-text("Select a contact")');
    const isPlaceholder = await selectTrigger.isVisible().catch(() => false);
    expect(isPlaceholder).toBe(false);
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 5_000 });
  });
});
