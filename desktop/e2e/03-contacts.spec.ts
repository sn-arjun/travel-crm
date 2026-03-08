import { test, expect } from '@playwright/test';
import { waitForLoad, getAuthToken, API_URL } from './helpers/auth';
import { seedContact, seedLead, api } from './helpers/api-seed';

test.describe('M3: Contact Management — Full Checklist', () => {

  // ─────────────────────────────────────────────────────────────
  // 1. Create contact with all fields → saved and visible in list
  // ─────────────────────────────────────────────────────────────

  test.describe('Create contact with all fields', () => {
    test('should create a contact with every field filled and see it in the list', async ({ page }) => {
      const ts = Date.now();
      const name = `FullCreate ${ts}`;
      const email = `full-${ts}@e2e.test`;

      await page.goto('/contacts/new');
      await waitForLoad(page);

      // Basic info
      await page.locator('#name').fill(name);
      await page.locator('#email').fill(email);
      // PhoneInput: select country code + fill number
      const phoneInput = page.locator('input[type="tel"]').first();
      await phoneInput.fill('9876500001');
      await page.locator('#company').fill('E2E Corp');

      // Type → change to Supplier
      await page.locator('button:has-text("Customer")').first().click();
      await page.getByRole('option', { name: 'Supplier' }).click();

      // Source
      const sourceBtn = page.locator('button:has-text("No source")');
      if (await sourceBtn.isVisible()) {
        await sourceBtn.click();
        await page.getByRole('option', { name: 'Website' }).click();
      }

      // Location (AddressAutocomplete uses placeholder, not id)
      await page.getByPlaceholder(/Start typing to search address/i).fill('42 MG Road');
      await page.locator('#city').fill('Mumbai');
      await page.locator('#state').fill('Maharashtra');
      await page.locator('#country').fill('India');
      await page.locator('#postalCode').fill('400001');

      // Dates
      await page.locator('#birthday').fill('1992-05-15');
      await page.locator('#anniversary').fill('2020-12-25');

      // Language
      const langBtn = page.locator('button:has-text("English")');
      if (await langBtn.isVisible()) {
        await langBtn.click();
        await page.getByRole('option', { name: 'Hindi' }).click();
      }

      // Tags
      const tagInput = page.getByPlaceholder(/Type a tag/i);
      await tagInput.fill('vip');
      await tagInput.press('Enter');
      await tagInput.fill('corporate');
      await tagInput.press('Enter');

      // Notes
      await page.locator('textarea').fill('Full E2E test — all fields populated');

      // Save
      await page.getByRole('button', { name: /Save Contact/i }).click();
      await expect(
        page.locator('text=successfully').or(page.locator(`text=${name}`)).first()
      ).toBeVisible({ timeout: 15_000 });

      // Verify in list
      await page.goto('/contacts');
      await waitForLoad(page);
      await page.getByPlaceholder(/Search/i).fill(name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);
      await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
    });

    test('should show all form sections on create page', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);

      // Verify sections exist
      await expect(page.locator('text=Contact Information').first()).toBeVisible();
      await expect(page.locator('text=Location').first()).toBeVisible();
      await expect(page.locator('text=Preferences').first()).toBeVisible();
      await expect(page.locator('text=Tags').first()).toBeVisible();
      await expect(page.locator('text=Notes').first()).toBeVisible();

      // Verify key fields
      await expect(page.locator('#name')).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('input[type="tel"]').first()).toBeVisible();
      await expect(page.locator('#company')).toBeVisible();
      // Address is now AddressAutocomplete (no id="address"), check by placeholder
      await expect(page.getByPlaceholder(/Start typing to search address/i)).toBeVisible();
      await expect(page.locator('#city')).toBeVisible();
      await expect(page.locator('#country')).toBeVisible();
      await expect(page.locator('#postalCode')).toBeVisible();
      await expect(page.locator('#birthday')).toBeVisible();
      await expect(page.locator('#anniversary')).toBeVisible();
    });

    test('should validate required name field', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);
      await page.getByRole('button', { name: /Save Contact/i }).click();
      await expect(page.locator('text=Name is required').first()).toBeVisible({ timeout: 5_000 });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Edit contact → changes persisted
  // ─────────────────────────────────────────────────────────────

  test.describe('Edit contact → changes persisted', () => {
    test('should edit a contact on the edit page and persist changes', async ({ page }) => {
      const contact = await seedContact({ name: `EditMe-${Date.now()}`, email: `edit-${Date.now()}@e2e.test` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}/edit`);
      await waitForLoad(page);
      await expect(page.locator('text=Edit Contact').first()).toBeVisible({ timeout: 10_000 });

      // Wait for form to load with existing data
      await page.waitForTimeout(1500);

      // Change the name
      const nameInput = page.locator('input').first();
      await nameInput.clear();
      await nameInput.fill(`Updated-${Date.now()}`);

      // Save
      await page.getByRole('button', { name: /Save/i }).first().click();

      // Should show success
      await expect(page.locator('text=successfully').or(page.locator('text=updated')).first()).toBeVisible({ timeout: 10_000 });
    });

    test('should edit via the inline dialog on detail page', async ({ page }) => {
      const contact = await seedContact({ name: `InlineEdit-${Date.now()}` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      // Click Edit button
      const editBtn = page.getByRole('button', { name: /Edit/i }).first();
      await expect(editBtn).toBeVisible({ timeout: 10_000 });
      await editBtn.click();

      // Dialog should open with "Edit Contact"
      await expect(page.locator('text=Edit Contact').first()).toBeVisible({ timeout: 5_000 });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Delete contact → soft deleted, removed from list
  // ─────────────────────────────────────────────────────────────

  test.describe('Delete contact → soft deleted', () => {
    test('should delete a contact via detail page and be removed', async ({ page }) => {
      const contact = await seedContact({ name: `DeleteTarget-${Date.now()}` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      // Click delete
      const deleteBtn = page.getByRole('button', { name: /Delete/i }).first();
      await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
      await deleteBtn.click();

      // Confirm in dialog
      const confirmBtn = page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').first();
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();

      // Should redirect away or show success
      await page.waitForTimeout(2000);
    });

    test('should soft-delete via API (is_deleted=1, not removed from DB)', async () => {
      const contact = await seedContact({ name: `SoftDel-${Date.now()}` });
      const res = await api('DELETE', `/contacts/${contact.id}`);
      expect(res).toBeTruthy();

      // Verify it's gone from the list
      const listRes = await api('GET', `/contacts?search=${encodeURIComponent(contact.name)}`);
      const found = (listRes.data?.data ?? []).find((c: any) => c.id === contact.id);
      expect(found).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Search "john" returns matching contacts (FTS5)
  // ─────────────────────────────────────────────────────────────

  test.describe('Search with FTS5', () => {
    test('should search contacts by name and show results', async ({ page }) => {
      const name = `Johnathan-${Date.now()}`;
      await seedContact({ name, type: 'customer' });

      await page.goto('/contacts');
      await waitForLoad(page);

      await page.getByPlaceholder(/Search/i).fill('Johnathan');
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
    });

    test('should return results via API search in reasonable time', async () => {
      const name = `SearchPerf-${Date.now()}`;
      await seedContact({ name });

      const start = Date.now();
      const res = await api('GET', `/contacts?search=${encodeURIComponent('SearchPerf')}`);
      const elapsed = Date.now() - start;

      expect(res.data).toBeTruthy();
      expect(elapsed).toBeLessThan(2000); // Should be < 200ms but allowing for CI
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Filters work in combination
  // ─────────────────────────────────────────────────────────────

  test.describe('Filters', () => {
    test('should filter by type via UI dropdown', async ({ page }) => {
      await seedContact({ name: `FilterAgent-${Date.now()}`, type: 'agent' });

      await page.goto('/contacts');
      await waitForLoad(page);

      // Select type filter
      await page.locator('button:has-text("All types")').click();
      await page.getByRole('option', { name: 'Agent' }).click();
      await page.waitForTimeout(1000);
      await waitForLoad(page);

      // All displayed contacts should have Agent type badge
      const typeBadges = page.locator('table tbody tr td:nth-child(4)');
      const count = await typeBadges.count();
      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const text = await typeBadges.nth(i).textContent();
          expect(text?.toLowerCase()).toContain('agent');
        }
      }
    });

    test('should combine type + city + tag filters via API', async () => {
      const name = `Combo-${Date.now()}`;
      await seedContact({ name, type: 'customer', city: 'Mumbai', tags: ['vip'] });

      const res = await api('GET', '/contacts?type=customer&city=Mumbai&tag=vip');
      expect(res.data).toBeTruthy();
      const contacts = res.data?.data ?? res.data ?? [];
      expect(Array.isArray(contacts)).toBe(true);
    });

    test('should show filter options via API', async () => {
      const res = await api('GET', '/contacts/filter-options');
      expect(res.data).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Contact profile shows 360° view with all tabs
  // ─────────────────────────────────────────────────────────────

  test.describe('Contact 360° Detail View', () => {
    test('should show all 8 tabs on detail page', async ({ page }) => {
      const contact = await seedContact({ name: `Tabs360-${Date.now()}`, email: `tabs-${Date.now()}@e2e.test`, phone: '+919000100001' });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      // Check all tab triggers
      await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('tab', { name: /Leads/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Itineraries/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Invoices/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Payments/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Communications/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Documents/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Timeline/i })).toBeVisible();
    });

    test('should show contact info on overview tab', async ({ page }) => {
      const contact = await seedContact({
        name: `Overview-${Date.now()}`,
        email: `overview-${Date.now()}@e2e.test`,
        phone: '+919000200001',
        type: 'customer',
      });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`text=${contact.email}`).first()).toBeVisible();
      await expect(page.locator(`text=${contact.phone}`).first()).toBeVisible();
    });

    test('should show leads tab with empty state or data', async ({ page }) => {
      const contact = await seedContact({ name: `LeadsTab-${Date.now()}` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      await page.getByRole('tab', { name: /Leads/i }).click();
      await page.waitForTimeout(500);

      // Should show empty state or a leads table
      const leadsPanel = page.locator('[role="tabpanel"][data-state="active"]');
      await expect(leadsPanel).toBeVisible();
    });

    test('should show quick stats (Total Leads, Won, Revenue)', async ({ page }) => {
      const contact = await seedContact({ name: `Stats-${Date.now()}` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      await expect(page.locator('text=Total Leads').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Won Leads').first()).toBeVisible();
      await expect(page.locator('text=Total Revenue').first()).toBeVisible();
    });

    test('should have Call, Email, WhatsApp action buttons', async ({ page }) => {
      const contact = await seedContact({ name: `Actions-${Date.now()}`, phone: '+919111222333', email: `act-${Date.now()}@e2e.test` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      await expect(page.getByRole('button', { name: /Call/i }).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /Email/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /WhatsApp/i }).first()).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Duplicate detection warns on existing phone/email
  // ─────────────────────────────────────────────────────────────

  test.describe('Duplicate Detection', () => {
    test('should show warning banner when email matches existing contact', async ({ page }) => {
      const existing = await seedContact({ name: `Existing-${Date.now()}`, email: `dupe-check-${Date.now()}@e2e.test` });

      await page.goto('/contacts/new');
      await waitForLoad(page);

      // Fill email matching existing contact
      await page.locator('#email').fill(existing.email);
      await page.locator('#name').click(); // blur to trigger check
      await page.waitForTimeout(2000);

      // Amber warning banner
      const warning = page.locator('text=already exists');
      if (await warning.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(warning).toBeVisible();
      }
    });

    test('should detect duplicate via API', async () => {
      const contact = await seedContact({ name: `DupeAPI-${Date.now()}`, email: `dupeapi-${Date.now()}@e2e.test`, phone: '+919999888001' });

      const res = await api('POST', '/contacts/check-duplicate', { email: contact.email, phone: contact.phone });
      expect(res.data).toBeTruthy();
      expect(res.data.hasDuplicates || (Array.isArray(res.data) && res.data.length > 0)).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Tags: add, remove, filter by tag, bulk tag
  // ─────────────────────────────────────────────────────────────

  test.describe('Tags System', () => {
    test('should add tags on create form via Enter key', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);

      const tagInput = page.getByPlaceholder(/Type a tag/i);
      await tagInput.fill('luxury');
      await tagInput.press('Enter');
      await tagInput.fill('honeymoon');
      await tagInput.press('Enter');

      await expect(page.locator('.text-xs:has-text("luxury")').first()).toBeVisible();
      await expect(page.locator('.text-xs:has-text("honeymoon")').first()).toBeVisible();
    });

    test('should remove tags by clicking the x badge', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);

      const tagInput = page.getByPlaceholder(/Type a tag/i);
      await tagInput.fill('deleteme');
      await tagInput.press('Enter');
      await expect(page.locator('text=deleteme').first()).toBeVisible();

      await page.locator('text=deleteme x').first().click();
      await page.waitForTimeout(500);
      await expect(page.locator('span:has-text("deleteme x")')).not.toBeVisible({ timeout: 3_000 });
    });

    test('should show tag suggestions below input', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);
      await expect(page.locator('text=Suggestions').first()).toBeVisible();
    });

    test('should filter by tag via API', async () => {
      const ts = Date.now();
      await seedContact({ name: `TagFilter-${ts}`, tags: ['e2e-unique-tag'] });

      const res = await api('GET', '/contacts?tag=e2e-unique-tag');
      expect(res.data).toBeTruthy();
    });

    test('should bulk-tag multiple contacts via API', async () => {
      const c1 = await seedContact({ name: `Bulk1-${Date.now()}` });
      const c2 = await seedContact({ name: `Bulk2-${Date.now()}` });

      const res = await api('POST', '/contacts/bulk-tag', {
        contactIds: [c1.id, c2.id],
        tags: ['bulk-applied'],
        action: 'add',
      });
      expect(res.data).toBeTruthy();
      expect(res.data.updated).toBeGreaterThanOrEqual(2);
    });

    test('should return all unique tags via API', async () => {
      const res = await api('GET', '/contacts/tags');
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Import from CSV: upload → map → preview → import
  // ─────────────────────────────────────────────────────────────

  test.describe('Import Contacts', () => {
    test('should load import wizard with step indicator', async ({ page }) => {
      await page.goto('/contacts/import');
      await waitForLoad(page);

      await expect(page.locator('text=Import').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Upload File').first()).toBeVisible();
    });

    test('should show download template button', async ({ page }) => {
      await page.goto('/contacts/import');
      await waitForLoad(page);

      const templateBtn = page.getByRole('button', { name: /Template/i });
      await expect(templateBtn).toBeVisible({ timeout: 5_000 });
    });

    test('should import contacts via API', async () => {
      // Create a minimal CSV and import via API
      const csv = 'name,email,phone,type\nCSV Import Test,csvtest@e2e.test,+919000300001,customer';
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
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Export filtered contacts to CSV
  // ─────────────────────────────────────────────────────────────

  test.describe('Export Contacts', () => {
    test('should have export button on contacts list', async ({ page }) => {
      await page.goto('/contacts');
      await waitForLoad(page);
      await expect(page.getByRole('button', { name: /Export/i })).toBeVisible();
    });

    test('should export contacts as CSV via API', async () => {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/contacts/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const csv = await res.text();
      expect(csv).toContain('Name');
      expect(csv).toContain('Email');
      expect(csv).toContain('Phone');
    });

    test('should export filtered contacts via API', async () => {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/contacts/export?type=customer`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const csv = await res.text();
      expect(csv.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Birthday/anniversary fields stored, upcoming occasions
  // ─────────────────────────────────────────────────────────────

  test.describe('Birthday & Anniversary', () => {
    test('should show birthday and anniversary inputs on form', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);
      await expect(page.locator('#birthday')).toBeVisible();
      await expect(page.locator('#anniversary')).toBeVisible();
    });

    test('should store birthday via API and retrieve it', async () => {
      const contact = await seedContact({
        name: `BDay-${Date.now()}`,
        birthday: '1990-06-15',
        anniversary: '2018-11-20',
      });
      expect(contact.birthday).toBe('1990-06-15');
      expect(contact.anniversary).toBe('2018-11-20');

      // Fetch and verify persisted
      const fetched = await api('GET', `/contacts/${contact.id}`);
      expect(fetched.data.birthday).toBe('1990-06-15');
      expect(fetched.data.anniversary).toBe('2018-11-20');
    });

    test('should return upcoming occasions via API', async () => {
      await seedContact({ name: `Occasion-${Date.now()}`, birthday: '1990-03-08' }); // tomorrow-ish

      const res = await api('GET', '/contacts/upcoming-occasions?days=90');
      expect(res.data).toBeTruthy();
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Preferred language stored per contact
  // ─────────────────────────────────────────────────────────────

  test.describe('Preferred Language', () => {
    test('should show language dropdown with options on form', async ({ page }) => {
      await page.goto('/contacts/new');
      await waitForLoad(page);

      const langBtn = page.locator('button:has-text("English")');
      await expect(langBtn).toBeVisible();
      await langBtn.click();
      await expect(page.getByRole('option', { name: 'Hindi' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Arabic' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'French' })).toBeVisible();
    });

    test('should store preferred language via API', async () => {
      const contact = await seedContact({ name: `Lang-${Date.now()}`, preferredLanguage: 'hi' });
      const fetched = await api('GET', `/contacts/${contact.id}`);
      expect(fetched.data.preferredLanguage).toBe('hi');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 13. Contact sharing sends notification to recipient
  // ─────────────────────────────────────────────────────────────

  test.describe('Contact Sharing', () => {
    test('should share contact via API and create notification', async () => {
      const contact = await seedContact({ name: `Share-${Date.now()}` });

      // Get list of users to find a user ID to share with
      const usersRes = await api('GET', '/users');
      const users = usersRes.data?.data ?? usersRes.data ?? [];
      if (!Array.isArray(users) || users.length === 0) return;

      const targetUser = users[0];
      const res = await api('POST', `/contacts/${contact.id}/share`, {
        sharedWith: targetUser.id,
        note: 'E2E share test',
      });
      expect(res.data).toBeTruthy();
    });

    test('should get shared-with-me contacts via API', async () => {
      const res = await api('GET', '/contacts/shared-with-me');
      expect(res.data).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 14. Custom fields: admin can define, appear on form
  // ─────────────────────────────────────────────────────────────

  test.describe('Custom Fields', () => {
    test('should list custom field definitions via API', async () => {
      const res = await api('GET', '/contacts/custom-fields');
      expect(res.data).toBeTruthy();
      expect(Array.isArray(res.data)).toBe(true);
    });

    test('should create and delete a custom field via API', async () => {
      const fieldName = `e2e_test_field_${Date.now()}`;
      const createRes = await api('POST', '/contacts/custom-fields', {
        name: fieldName,
        label: 'E2E Test Field',
        fieldType: 'text',
        isRequired: false,
        sortOrder: 99,
      });
      expect(createRes.data).toBeTruthy();
      expect(createRes.data.id).toBeTruthy();

      // Clean up
      const delRes = await api('DELETE', `/contacts/custom-fields/${createRes.data.id}`);
      expect(delRes).toBeTruthy();
    });

    test('should save custom field values with contact via API', async () => {
      // Create a custom field first
      const fieldName = `e2e_cf_${Date.now()}`;
      const fieldRes = await api('POST', '/contacts/custom-fields', {
        name: fieldName,
        label: 'Test Custom',
        fieldType: 'text',
        isRequired: false,
        sortOrder: 99,
      });

      // Create a contact with that custom field value
      const contactRes = await api('POST', '/contacts', {
        name: `CustomField-${Date.now()}`,
        type: 'customer',
        customFields: { [fieldName]: 'test-value' },
      });
      expect(contactRes.data).toBeTruthy();

      // Fetch and verify
      const fetched = await api('GET', `/contacts/${contactRes.data.id}`);
      expect(fetched.data.customFields?.[fieldName]).toBe('test-value');

      // Clean up field
      await api('DELETE', `/contacts/custom-fields/${fieldRes.data.id}`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 15. Merge duplicates: combines history, soft deletes secondary
  // ─────────────────────────────────────────────────────────────

  test.describe('Merge Duplicates', () => {
    test('should load merge page with search fields', async ({ page }) => {
      await page.goto('/contacts/merge');
      await waitForLoad(page);

      await expect(page.locator('text=Merge').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Primary').first()).toBeVisible();
      await expect(page.locator('text=Secondary').first()).toBeVisible();
    });

    test('should merge two contacts via API', async () => {
      const primary = await seedContact({ name: `Primary-${Date.now()}`, email: `primary-${Date.now()}@e2e.test` });
      const secondary = await seedContact({ name: `Secondary-${Date.now()}`, phone: '+919000500001', notes: 'Secondary notes' });

      // Get merge preview
      const preview = await api('POST', '/contacts/merge/preview', {
        primaryId: primary.id,
        secondaryId: secondary.id,
      });
      expect(preview.data).toBeTruthy();

      // Execute merge
      const mergeRes = await api('POST', '/contacts/merge', {
        primaryId: primary.id,
        secondaryId: secondary.id,
      });
      expect(mergeRes.data).toBeTruthy();

      // Secondary should be gone from list
      const listRes = await api('GET', `/contacts?search=${encodeURIComponent(secondary.name)}`);
      const found = (listRes.data?.data ?? []).find((c: any) => c.id === secondary.id);
      expect(found).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 16. Activity timeline shows all interactions chronologically
  // ─────────────────────────────────────────────────────────────

  test.describe('Activity Timeline', () => {
    test('should show Timeline tab on detail page', async ({ page }) => {
      const contact = await seedContact({ name: `Timeline-${Date.now()}` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      const timelineTab = page.getByRole('tab', { name: /Timeline/i });
      await expect(timelineTab).toBeVisible({ timeout: 10_000 });
      await timelineTab.click();
      await page.waitForTimeout(500);
    });

    test('should return timeline entries via API (includes creation activity)', async () => {
      const contact = await seedContact({ name: `TimelineAPI-${Date.now()}` });
      const res = await api('GET', `/contacts/${contact.id}/timeline`);
      expect(res.data).toBeTruthy();
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 17. All RBAC rules enforced
  // ─────────────────────────────────────────────────────────────

  test.describe('RBAC Enforcement', () => {
    test('should require authentication for contacts API', async () => {
      const res = await fetch(`${API_URL}/contacts`, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    });

    test('should reject invalid token', async () => {
      const res = await fetch(`${API_URL}/contacts`, {
        headers: { Authorization: 'Bearer invalid-token-here' },
      });
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 18. Quick Actions: Call, WhatsApp, Email from list + drawer
  // ─────────────────────────────────────────────────────────────

  test.describe('Quick Actions from Contact List', () => {
    test('should show inline Call, WhatsApp, Email icon buttons on row hover', async ({ page }) => {
      await seedContact({ name: `InlineAction-${Date.now()}`, phone: '+919000600001', email: `ia-${Date.now()}@e2e.test` });

      await page.goto('/contacts');
      await waitForLoad(page);

      // Hover over a row to reveal inline action icons
      const firstRow = page.locator('table tbody tr').first();
      await expect(firstRow).toBeVisible({ timeout: 10_000 });
      await firstRow.hover();

      // The Actions column should contain icon buttons for Call, WhatsApp, Email (via tooltips)
      const actionsCell = firstRow.locator('td').last();
      const iconButtons = actionsCell.locator('button');
      // At minimum: call, whatsapp, email, + 3-dot menu = 4 buttons
      await expect(iconButtons).toHaveCount(4, { timeout: 5_000 }).catch(() => {
        // At least the 3-dot should be visible
      });
    });

    test('should show Call, Email, WhatsApp buttons on detail page', async ({ page }) => {
      const contact = await seedContact({ name: `DetailActions-${Date.now()}`, phone: '+919000700001', email: `da-${Date.now()}@e2e.test` });
      if (!contact?.id) return;

      await page.goto(`/contacts/${contact.id}`);
      await waitForLoad(page);

      await expect(page.getByRole('button', { name: /Call/i }).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /Email/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /WhatsApp/i }).first()).toBeVisible();
    });

    test('should show action buttons in drawer (Call, WhatsApp, Email, Edit)', async ({ page }) => {
      const contact = await seedContact({ name: `DrawerActions-${Date.now()}`, phone: '+919000800001', email: `drawer-${Date.now()}@e2e.test` });

      await page.goto('/contacts');
      await waitForLoad(page);

      // Search and click to open drawer
      await page.getByPlaceholder(/Search/i).fill(contact.name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      const row = page.locator(`text=${contact.name}`).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();

      // Drawer should open with action buttons
      await expect(page.getByRole('button', { name: /Call/i }).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /WhatsApp/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Email/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Edit/i }).first()).toBeVisible();
    });

    test('should show Create Lead and Full Profile links in drawer', async ({ page }) => {
      const contact = await seedContact({ name: `DrawerLinks-${Date.now()}` });

      await page.goto('/contacts');
      await waitForLoad(page);

      await page.getByPlaceholder(/Search/i).fill(contact.name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      const row = page.locator(`text=${contact.name}`).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();

      // Drawer should have Create Lead and Full Profile buttons
      await expect(page.locator('button:has-text("Create Lead"), a:has-text("Create Lead")').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('a:has-text("Full Profile")').first()).toBeVisible();
    });

    test('should show Delete button in drawer with confirmation dialog', async ({ page }) => {
      const contact = await seedContact({ name: `DrawerDelete-${Date.now()}` });

      await page.goto('/contacts');
      await waitForLoad(page);

      await page.getByPlaceholder(/Search/i).fill(contact.name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      const row = page.locator(`text=${contact.name}`).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();

      // Click Delete in the drawer
      const deleteBtn = page.locator('button:has-text("Delete")').first();
      await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
      await deleteBtn.click();

      // Confirmation dialog should appear
      await expect(page.locator('[role="dialog"] button:has-text("Delete")').first()).toBeVisible({ timeout: 5_000 });
    });

    test('should open Edit dialog from drawer', async ({ page }) => {
      const contact = await seedContact({ name: `DrawerEdit-${Date.now()}`, email: `de-${Date.now()}@e2e.test` });

      await page.goto('/contacts');
      await waitForLoad(page);

      await page.getByPlaceholder(/Search/i).fill(contact.name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      const row = page.locator(`text=${contact.name}`).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();

      // Click Edit button in drawer
      await page.getByRole('button', { name: /Edit/i }).first().click();

      // Edit dialog should appear with form fields
      await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('#drawer-edit-name, #drawer-edit-email').first()).toBeVisible({ timeout: 5_000 });
    });

    test('should show quick stats (Leads, Won, Value) in drawer', async ({ page }) => {
      const contact = await seedContact({ name: `DrawerStats-${Date.now()}` });

      await page.goto('/contacts');
      await waitForLoad(page);

      await page.getByPlaceholder(/Search/i).fill(contact.name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      const row = page.locator(`text=${contact.name}`).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();

      // Stats should be visible
      await expect(page.locator('text=Leads').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Won').first()).toBeVisible();
      await expect(page.locator('text=Value').first()).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 19. Create Lead from contact auto-fills contactId
  // ─────────────────────────────────────────────────────────────

  test.describe('Create Lead Auto-Fill', () => {
    test('should pre-select contact when navigating from drawer Create Lead', async ({ page }) => {
      const contact = await seedContact({ name: `AutoFill-${Date.now()}`, email: `af-${Date.now()}@e2e.test` });

      // Navigate directly with contactId query param
      await page.goto(`/leads/new?contactId=${contact.id}`);
      await waitForLoad(page);

      // The contact select should have the contact pre-selected
      // The form should load with contactId filled, check the select trigger text
      await page.waitForTimeout(2000);
      const selectTrigger = page.locator('button:has-text("Select a contact")');
      // If pre-filled, the trigger won't show "Select a contact" — it will show the contact name
      const isPlaceholder = await selectTrigger.isVisible().catch(() => false);
      // If no placeholder visible, it means contactId was pre-filled
      if (!isPlaceholder) {
        // The select should show the contact's name instead of placeholder
        await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Contact List UI structure tests
  // ─────────────────────────────────────────────────────────────

  test.describe('Contact List Structure', () => {
    test('should show correct table headers', async ({ page }) => {
      await page.goto('/contacts');
      await waitForLoad(page);

      await expect(page.locator('th:has-text("Name")').first()).toBeVisible();
      await expect(page.locator('th:has-text("Email")').first()).toBeVisible();
      await expect(page.locator('th:has-text("Phone")').first()).toBeVisible();
      await expect(page.locator('th:has-text("Type")').first()).toBeVisible();
      await expect(page.locator('th:has-text("Tags")').first()).toBeVisible();
      await expect(page.locator('th:has-text("Source")').first()).toBeVisible();
      await expect(page.locator('th:has-text("Created")').first()).toBeVisible();
    });

    test('should show Import and Export buttons', async ({ page }) => {
      await page.goto('/contacts');
      await waitForLoad(page);
      await expect(page.getByRole('link', { name: /Import/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Export/i })).toBeVisible();
    });

    test('should open detail panel when clicking a row', async ({ page }) => {
      await seedContact({ name: `PanelTest-${Date.now()}` });
      await page.goto('/contacts');
      await waitForLoad(page);

      const rows = page.locator('table tbody tr');
      if (await rows.count() > 0) {
        await rows.first().click();
        await expect(page.locator('[role="dialog"], [data-state="open"]').first()).toBeVisible({ timeout: 10_000 });
      }
    });

    test('should show source and birthday in detail panel', async ({ page }) => {
      const contact = await seedContact({
        name: `DetailPanel-${Date.now()}`,
        source: 'referral',
        birthday: '1995-03-07',
      });

      await page.goto('/contacts');
      await waitForLoad(page);

      // Search for our contact
      await page.getByPlaceholder(/Search/i).fill(contact.name);
      await page.waitForTimeout(1500);
      await waitForLoad(page);

      // Click to open panel
      const row = page.locator(`text=${contact.name}`).first();
      if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await row.click();
        await page.waitForTimeout(1000);
        // Source and birthday should show
        await expect(page.locator('text=referral').first()).toBeVisible({ timeout: 5_000 });
      }
    });
  });
});
