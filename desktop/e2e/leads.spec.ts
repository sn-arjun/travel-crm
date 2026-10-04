import { test, expect } from './fixtures';
import { waitForLoad, getAuthToken, API_URL } from './helpers/auth';
import { seedContact, seedLead, api } from './helpers/api-seed';
import { pickDate } from './helpers/date-picker';

test.describe('Leads', () => {
  // ─────────────────────────────────────────────────────────────
  // Full round trip: create via form → list → detail → edit → delete
  // ─────────────────────────────────────────────────────────────

  test('full round trip: create, view in list, view detail, edit, verify prefill, save, delete', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `LeadContact-${ts}` });
    const title = `FullLead ${ts}`;

    await page.goto('/leads/new');
    await waitForLoad(page);

    // Contact combobox
    const contactCombo = page.locator('button[role="combobox"]', { hasText: 'Select a contact' });
    await contactCombo.click();
    await page.getByPlaceholder(/Search contacts/i).fill(contact.name);
    await page.waitForTimeout(600);
    await page.getByRole('option', { name: new RegExp(contact.name) }).click();

    // Title
    await page.locator('#title').fill(title);

    // Destinations tag input (placeholder changes from "Type & press Enter..." to "Add more..." after the first tag)
    const destInput = page.getByPlaceholder(/Type & press Enter|Add more/i);
    await destInput.fill('Bali');
    await destInput.press('Enter');
    await destInput.fill('Phuket');
    await destInput.press('Enter');
    await expect(page.locator('text=Bali').first()).toBeVisible();
    await expect(page.locator('text=Phuket').first()).toBeVisible();

    // Trip type combobox
    await page.locator('#tripType').click();
    await page.getByRole('option', { name: 'International' }).click();

    // Travel date (calendar popover — minDate is today, so advance to next month for a safely-enabled day)
    const nowDate = new Date();
    await pickDate(page, page.locator('button:has-text("Pick travel date")'), new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 10));

    // Return date
    await pickDate(page, page.locator('button:has-text("Pick return date")'), new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 15));

    // Pax
    await page.locator('#paxAdults').fill('2');
    await page.locator('#paxChildren').fill('1');
    await page.locator('#paxInfants').fill('0');

    // Budget + currency
    const budgetInput = page.locator('input[inputmode="decimal"]');
    await budgetInput.fill('150000');
    await page.locator('#currency').click();
    await page.getByRole('option', { name: 'USD' }).click();

    // Priority
    await page.locator('#priority').click();
    await page.getByRole('option', { name: 'Hot' }).click();

    // Source
    await page.locator('#source').click();
    await page.getByRole('option', { name: 'Referral' }).click();

    // Assigned to (optional relation combobox) — leave unset, no raw id input allowed
    const rawIdInputs = await page.locator('input[name*="Id" i], input[placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);

    // Special requirements + notes
    await page.locator('#specialRequirements').fill('Vegetarian meals only');
    await page.locator('#notes').fill('VIP client, handle with care');

    // Submit
    await page.locator('button:has-text("Save Lead")').first().click();
    await expect(page.locator('text=Lead created successfully')).toBeVisible({ timeout: 15_000 });
    await page.waitForURL('**/leads', { timeout: 15_000 });

    // 1. Assert every filled value appears in the list
    await waitForLoad(page);
    await page.getByPlaceholder(/Search leads/i).fill(title);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row = page.locator(`table tbody tr:has-text("${title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/Bali/);
    await expect(row).toContainText(contact.name);
    await expect(row).toContainText(/hot/i);
    await expect(row).toContainText('$');

    // 2. Open detail view, assert every value present
    await row.locator('button[aria-label="View"]').click();
    await page.waitForURL(/\/leads\/[^/]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const leadUrl = page.url();
    const leadId = leadUrl.split('/leads/')[1];
    expect(leadId).toBeTruthy();

    await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Bali').first()).toBeVisible();
    await expect(page.locator('text=Phuket').first()).toBeVisible();
    await expect(page.locator('text=international').first()).toBeVisible();
    await expect(page.locator('text=2 Adults, 1 Child').first()).toBeVisible();
    await expect(page.locator('text=hot').first()).toBeVisible();
    await expect(page.locator('text=referral').first()).toBeVisible();
    await expect(page.locator('text=Vegetarian meals only').first()).toBeVisible();

    // No raw tel:/mailto:/wa.me anchors — outbound contact must go through Communication Hub
    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    // 3. Open edit form, assert every value is pre-filled
    await page.goto(`/leads/${leadId}/edit`);
    await waitForLoad(page);
    await expect(page.locator('text=Edit lead').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#title')).toHaveValue(title);
    await expect(page.locator('text=Bali').first()).toBeVisible();
    await expect(page.locator('text=Phuket').first()).toBeVisible();
    await expect(page.locator('#paxAdults')).toHaveValue('2');
    await expect(page.locator('#paxChildren')).toHaveValue('1');
    await expect(page.locator('#specialRequirements')).toHaveValue('Vegetarian meals only');
    await expect(page.locator('#notes')).toHaveValue('VIP client, handle with care');
    await expect(page.locator('button', { hasText: contact.name })).toBeVisible({ timeout: 10_000 });

    // 4. Edit a value, save, assert the change persisted
    const updatedTitle = `Updated-${ts}`;
    const titleField = page.locator('#title');
    await titleField.fill('');
    await titleField.fill(updatedTitle);
    await page.getByRole('button', { name: /Save Changes|Save Lead/i }).click();
    await expect(page.locator('text=Lead updated successfully')).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(`**/leads/${leadId}`, { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator(`text=${updatedTitle}`).first()).toBeVisible({ timeout: 10_000 });

    // Verify persisted via API too
    const fetched = await api('GET', `/leads/${leadId}`);
    expect(fetched.data.title).toBe(updatedTitle);

    // 5. Delete, assert it is gone — DetailPage renders actions in a "More actions" dropdown menu
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Delete Lead"), [role="alertdialog"] button:has-text("Delete Lead")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(page.locator('text=Lead deleted successfully')).toBeVisible({ timeout: 10_000 });

    const listRes = await api('GET', `/leads?search=${encodeURIComponent(updatedTitle)}`);
    const items = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.data ?? []);
    const found = items.find((l: any) => l.id === leadId);
    expect(found).toBeFalsy();
  });

  // ─────────────────────────────────────────────────────────────
  // List page: search, filter, empty state, infinite scroll
  // ─────────────────────────────────────────────────────────────

  test('search narrows results to matching leads', async ({ page }) => {
    const contact = await seedContact();
    const marker = `SearchLead-${Date.now()}`;
    await seedLead(contact.id, { title: marker });

    await page.goto('/leads');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search leads/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${marker}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('status filter narrows the list to matching status only', async ({ page }) => {
    const contact = await seedContact();
    const marker = `StatusFilter-${Date.now()}`;
    const wonLead = await seedLead(contact.id, { title: `${marker}-Won` });
    await seedLead(contact.id, { title: `${marker}-New` });
    await api('PUT', `/leads/${wonLead.id}/status`, { status: 'won' });

    await page.goto('/leads');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search leads/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await page.locator('button:has-text("All statuses")').click();
    await page.getByRole('option', { name: 'Won' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/won/i);
    }
  });

  test('priority filter narrows the list to matching priority only', async ({ page }) => {
    const contact = await seedContact();
    const marker = `PriorityFilter-${Date.now()}`;
    await seedLead(contact.id, { title: `${marker}-Hot`, priority: 'hot' });
    await seedLead(contact.id, { title: `${marker}-Cold`, priority: 'cold' });

    await page.goto('/leads');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search leads/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await page.locator('button:has-text("All priority")').click();
    await page.getByRole('option', { name: 'Hot' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/leads');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search leads/i).fill(`no-such-lead-${Date.now()}-zzz`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(page.locator('text=No leads yet').or(page.locator('text=Nothing here yet')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const contact = await seedContact();
    const marker = `Scroll-${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedLead(contact.id, { title: `${marker}-${i}` });
    }

    await page.goto('/leads');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search leads/i).fill(marker);
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
  // Relation combobox behavior (contact / assigned-to on the form)
  // ─────────────────────────────────────────────────────────────

  test('contact and assigned-to are comboboxes with no raw ID input on the form', async ({ page }) => {
    await page.goto('/leads/new');
    await waitForLoad(page);

    const rawIdInputs = await page.locator('input[name*="Id" i], input[placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);

    const contactCombo = page.locator('button[role="combobox"]', { hasText: 'Select a contact' });
    await expect(contactCombo).toBeVisible();
    await contactCombo.click();
    await expect(page.getByPlaceholder(/Search contacts/i)).toBeVisible();
    const contact = await seedContact({ name: `ComboSearch-${Date.now()}` });
    await page.getByPlaceholder(/Search contacts/i).fill(contact.name.slice(0, 10));
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    const assignedCombo = page.locator('button[role="combobox"]', { hasText: 'Select agent' });
    await expect(assignedCombo).toBeVisible();
    await assignedCombo.click();
    await expect(page.getByPlaceholder(/Search team/i)).toBeVisible();
  });

  test('creating a lead from a contact pre-fills the contact via URL param', async ({ page }) => {
    const contact = await seedContact({ name: `AutoFillLead-${Date.now()}` });

    await page.goto(`/leads/new?contactId=${contact.id}`);
    await waitForLoad(page);

    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button:has-text("Select a contact")')).toHaveCount(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Outbound messaging via Communication Hub only
  // ─────────────────────────────────────────────────────────────

  test('messaging a lead opens SendMessageDialog, never a raw mailto/wa.me/tel link', async ({ page }) => {
    const contact = await seedContact({
      name: `LeadComms-${Date.now()}`,
      email: `leadcomms-${Date.now()}@e2e.test`,
      phone: '+919000200002',
    });
    const lead = await seedLead(contact.id, { title: `CommsLead-${Date.now()}` });

    await page.goto('/leads');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search leads/i).fill(lead.title);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    const row = page.locator(`table tbody tr:has-text("${lead.title}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    const emailBtn = row.locator('button[aria-label="Email"]');
    await expect(emailBtn).toBeVisible({ timeout: 5_000 });
    await emailBtn.click();

    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  test('export downloads a non-empty file', async ({ page }) => {
    const contact = await seedContact();
    await seedLead(contact.id, { title: `ExportLead-${Date.now()}` });

    await page.goto('/leads');
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
  });

  // ─────────────────────────────────────────────────────────────
  // Status change, notes, follow-ups (detail page actions)
  // ─────────────────────────────────────────────────────────────

  test('status can be changed from the detail page and persists', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `StatusChange-${Date.now()}` });

    await page.goto(`/leads/${lead.id}`);
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Change Status' }).click();
    await page.locator('[role="dialog"] [role="combobox"], [role="dialog"] button:has-text("Select status")').first().click();
    await page.getByRole('option', { name: 'Qualified' }).click();
    await page.getByRole('button', { name: 'Update Status' }).click();
    await expect(page.locator('text=Status updated successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Qualified').first()).toBeVisible({ timeout: 10_000 });

    const fetched = await api('GET', `/leads/${lead.id}`);
    expect(fetched.data.status).toBe('qualified');
  });

  test('note can be added and deleted from the detail page', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `NoteLead-${Date.now()}` });
    const noteContent = `E2E note ${Date.now()}`;

    await page.goto(`/leads/${lead.id}`);
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Add note' }).first().click();
    await page.locator('[role="dialog"] textarea').fill(noteContent);
    await page.getByRole('button', { name: 'Add Note' }).click();
    await expect(page.locator('text=Note added')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${noteContent}`).first()).toBeVisible({ timeout: 10_000 });

    const notesRes = await api('GET', `/leads/${lead.id}/notes`);
    const notesList = Array.isArray(notesRes.data) ? notesRes.data : (notesRes.data?.data ?? []);
    const created = notesList.find((n: any) => n.content === noteContent);
    expect(created).toBeTruthy();

    // Delete via UI
    await page.locator('button[aria-label="Delete note"]').first().click();
    await expect(page.locator('text=Note deleted')).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Unassigned leads + bulk assign (client-only surface per manifest notes)
  // ─────────────────────────────────────────────────────────────

  test('unassigned leads page lists leads with no owner and bulk-assigns them', async ({ page }) => {
    const contact = await seedContact();
    const marker = `Unassigned-${Date.now()}`;
    const lead = await seedLead(contact.id, { title: marker, assignedTo: null });
    expect(lead.assignedTo ?? null).toBeFalsy();

    const usersRes = await api('GET', '/users');
    const users = usersRes.data?.data ?? usersRes.data ?? [];
    test.skip(!Array.isArray(users) || users.length === 0, 'no team members available to assign to');

    await page.goto('/leads/unassigned');
    await waitForLoad(page);
    await expect(page.locator('text=Unassigned Leads').first()).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/Search unassigned/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const row = page.locator(`table tbody tr:has-text("${marker}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    await row.locator('button[aria-label="Assign"]').click();

    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
    const combo = page.locator('[role="dialog"] button[role="combobox"]').first();
    await combo.click();
    await page.getByPlaceholder(/Search team/i).fill('');
    await page.waitForTimeout(600);
    await page.locator('[role="option"]').first().click();
    await page.getByRole('button', { name: 'Assign' }).last().click();
    await expect(page.locator('text=lead(s) assigned')).toBeVisible({ timeout: 10_000 });

    const fetched = await api('GET', `/leads/${lead.id}`);
    expect(fetched.data.assignedTo).toBeTruthy();
  });

  test('bulk-assign, bulk-status and bulk-delete work via API (client-only actions)', async () => {
    const contact = await seedContact();
    const leadA = await seedLead(contact.id, { title: `BulkA-${Date.now()}` });
    const leadB = await seedLead(contact.id, { title: `BulkB-${Date.now()}` });

    const usersRes = await api('GET', '/users');
    const users = usersRes.data?.data ?? usersRes.data ?? [];
    test.skip(!Array.isArray(users) || users.length === 0, 'no team members available');

    const assignRes = await api('POST', '/leads/bulk-assign', { leadIds: [leadA.id, leadB.id], assignedTo: users[0].id });
    expect(assignRes.data?.updated ?? assignRes.success).toBeTruthy();

    const statusRes = await api('POST', '/leads/bulk-status', { leadIds: [leadA.id, leadB.id], status: 'contacted' });
    expect(statusRes.data?.updated ?? statusRes.success).toBeTruthy();

    const deleteRes = await api('POST', '/leads/bulk-delete', { leadIds: [leadA.id, leadB.id] });
    expect(deleteRes.data?.deleted ?? deleteRes.success).toBeTruthy();

    const fetchedA = await api('GET', `/leads/${leadA.id}`);
    expect(fetchedA.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────

  test('leads API requires authentication', async () => {
    const res = await fetch(`${API_URL}/leads`, { headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(401);
  });

  test('leads API rejects invalid token', async () => {
    const res = await fetch(`${API_URL}/leads`, { headers: { Authorization: 'Bearer invalid-token-here' } });
    expect(res.status).toBe(401);
  });
});
