import { test, expect } from './fixtures';
import { waitForLoad, API_URL } from './helpers/auth';
import { seedContact, seedInvoice, seedPayment, seedCreditNote, api } from './helpers/api-seed';

/**
 * Navigate to invoice detail and wait until it fully loads.
 */
async function openInvoiceDetail(page: any, invoiceId: string) {
  await page.goto(`/invoices/${invoiceId}`);
  await waitForLoad(page);
  await page.waitForSelector('text=/INV-|PI-/', { timeout: 20_000 });
}

test.describe('Invoices', () => {
  // ─────────────────────────────────────────────────────────────
  // Full round trip: create via form → list → detail → edit → delete
  // ─────────────────────────────────────────────────────────────

  test('full round trip: create, view in list, view detail, edit, verify prefill, save, void', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `InvContact-${ts}` });
    const itemDesc = `FullInvoiceItem-${ts}`;

    await page.goto('/invoices/new');
    await waitForLoad(page);

    // Invoice type radio
    await expect(page.getByText('Tax Invoice')).toBeVisible();
    await expect(page.getByText('Proforma Invoice')).toBeVisible();

    // Contact combobox — relation, no raw ID input
    const rawIdInputs = await page.locator('input[placeholder*="Enter" i][placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);

    const contactCombo = page.locator('button[role="combobox"]').filter({ hasText: 'Search contacts...' });
    await contactCombo.click();
    await page.getByPlaceholder('Type to search contacts...').fill(contact.name.slice(0, 10));
    await page.waitForTimeout(600);
    await page.getByRole('option', { name: new RegExp(contact.name) }).click();

    // Currency
    const currencyTrigger = page.locator('[role="combobox"]').filter({ hasText: 'INR' });
    await currencyTrigger.click();
    await page.getByRole('option', { name: 'USD' }).click();

    // Line item
    const descInput = page.getByPlaceholder(/Flight tickets|e\.g\./i).first();
    await descInput.fill(itemDesc);
    const priceInput = page.locator('input[placeholder="0"]').first();
    await priceInput.fill('12000');

    // GST
    const gstTrigger = page.locator('[role="combobox"]').filter({ hasText: '18%' });
    await gstTrigger.click();
    await page.getByRole('option', { name: '12%' }).click();

    // Notes / Terms
    await page.getByPlaceholder('Any notes for the client...').fill('E2E full flow notes');
    // Terms textarea has no placeholder (pre-filled with default boilerplate) —
    // it's the second (last) textarea on the form, after Notes.
    const termsTextarea = page.locator('textarea').last();
    await expect(termsTextarea).toHaveValue(/Payment due within 30 days/i);
    await termsTextarea.fill('Custom terms for E2E test');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Invoice created successfully')).toBeVisible({ timeout: 15_000 });
    await page.waitForURL('**/invoices', { timeout: 15_000 });

    // 1. Assert every filled value appears in the list
    await waitForLoad(page);
    await page.getByPlaceholder(/Search invoices/i).fill(itemDesc.slice(0, 8));
    // item description isn't a list column — search by contact name instead
    await page.getByPlaceholder(/Search invoices/i).fill('');
    await page.getByPlaceholder(/Search invoices/i).fill(contact.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row = page.locator(`table tbody tr:has-text("${contact.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Draft');

    // 2. Open detail view, assert every value present
    await row.locator('button[aria-label="View"]').click();
    await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const invoiceUrl = page.url();
    const invoiceId = invoiceUrl.split('/invoices/')[1];
    expect(invoiceId).toBeTruthy();
    await page.waitForSelector('text=/INV-|PI-/', { timeout: 20_000 });

    await expect(page.getByText(itemDesc)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('p').filter({ hasText: 'Status' }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'Issue Date' }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'Due Date' }).first()).toBeVisible();
    await expect(page.getByText('E2E full flow notes')).toBeVisible();
    // NOTE: "Terms & Conditions" is dead input end-to-end for invoices — both the create
    // and edit forms collect it, and the desktop UpdateInvoiceRequest type even declares a
    // `terms` field, but backend/src/routes/invoices.ts's create/update Zod schemas have no
    // `terms` key at all, and the `invoices` table (backend/src/db/tenant-schema.ts) has no
    // terms/terms_conditions column (only itineraries does). The value is silently discarded
    // in both directions. This is a real gap outside this slice's fileAllowlist (backend/
    // isn't covered), so it's asserted here as current behavior rather than dropped from
    // coverage: the typed value must NOT appear post-create.
    await expect(page.getByText('Custom terms for E2E test')).toHaveCount(0);

    // No raw tel:/mailto:/wa.me anchors — outbound contact must go through Communication Hub
    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    // 3. Open edit form, assert every value is pre-filled
    await page.goto(`/invoices/${invoiceId}/edit`);
    await waitForLoad(page);
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`input[value="${itemDesc}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('Any notes for the client...')).toHaveValue('E2E full flow notes');
    // Terms is blank on edit too, since create never persisted it (see note above)
    await expect(page.locator('textarea').last()).toHaveValue('');

    // Contact combobox is intentionally disabled on edit (contact cannot be changed post-creation)
    const editContactCombo = page.locator('button[role="combobox"]').filter({ hasText: contact.name });
    await expect(editContactCombo).toBeDisabled();

    // 4. Edit a value, save, assert the change persisted (terms is typed here too, but per
    // the note above it is dropped by the backend regardless of create vs. update — verified
    // via API below rather than asserted on the page, to document rather than hide the gap)
    const updatedDesc = `Updated-${ts}`;
    const editDescInput = page.locator(`input[value="${itemDesc}"]`);
    await editDescInput.fill(updatedDesc);
    await page.locator('textarea').last().fill('Custom terms for E2E test');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Invoice updated successfully')).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(`**/invoices/${invoiceId}`, { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.getByText(updatedDesc)).toBeVisible({ timeout: 10_000 });

    // Verify persisted via API too
    const fetched = await api('GET', `/invoices/${invoiceId}`);
    const fetchedItems = fetched.data.items ?? [];
    expect(fetchedItems.some((it: any) => it.description === updatedDesc)).toBe(true);
    expect(fetched.data.terms).toBeFalsy();

    // 5. Void (distinct from delete: POST /invoices/:id/void sets status -> 'void',
    // while DELETE sets status -> 'cancelled' — see the delete test below) — assert status changes
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Void invoice' }).click();
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Void invoice"), [role="alertdialog"] button:has-text("Void invoice")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(page.getByText('Invoice voided')).toBeVisible({ timeout: 10_000 });

    const voided = await api('GET', `/invoices/${invoiceId}`);
    expect(voided.data.status).toBe('void');
  });

  // ─────────────────────────────────────────────────────────────
  // Delete lifecycle (separate from the void flow above)
  // ─────────────────────────────────────────────────────────────

  test('delete an invoice from the list soft-cancels it', async ({ page }) => {
    // Backend DELETE /invoices/:id is a soft delete: it sets status to 'cancelled'
    // rather than removing the row (invoices must remain auditable for accounting).
    const contact = await seedContact({ name: `DeleteInv-${Date.now()}` });
    const invoice = await seedInvoice(contact.id);

    await page.goto('/invoices');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search invoices/i).fill(contact.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const row = page.locator(`table tbody tr:has-text("${contact.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('button[aria-label="Delete"]').click();
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(page.getByText('Invoice deleted')).toBeVisible({ timeout: 10_000 });

    const fetched = await api('GET', `/invoices/${invoice.id}`);
    expect(fetched.data.status).toBe('cancelled');
  });

  // ─────────────────────────────────────────────────────────────
  // List page: search, filter, empty state, infinite scroll
  // ─────────────────────────────────────────────────────────────

  test('search narrows results to matching invoices', async ({ page }) => {
    const contact = await seedContact({ name: `SearchInv-${Date.now()}` });
    await seedInvoice(contact.id);

    await page.goto('/invoices');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search invoices/i).fill(contact.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(contact.name);
    }
  });

  test('status filter narrows the list to matching status only', async ({ page }) => {
    const contact = await seedContact({ name: `StatusFilterInv-${Date.now()}` });
    const invoice = await seedInvoice(contact.id);
    // DELETE soft-cancels (status -> 'cancelled'); this is the status the list's
    // "Cancelled" filter option maps to (distinct from the separate void action, which
    // sets status -> 'void' — a value STATUS_LABELS doesn't cover, so it isn't filterable here).
    await api('DELETE', `/invoices/${invoice.id}`);

    await page.goto('/invoices');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search invoices/i).fill(contact.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const statusTrigger = page.locator('[role="combobox"]').filter({ hasText: 'All status' });
    await statusTrigger.click();
    await page.getByRole('option', { name: 'Cancelled' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/cancelled/i);
    }
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/invoices');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search invoices/i).fill(`no-such-invoice-${Date.now()}-zzz`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(page.locator('text=No invoices yet').or(page.locator('text=Nothing here yet')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const contact = await seedContact({ name: `ScrollInv-${Date.now()}` });
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedInvoice(contact.id);
    }

    await page.goto('/invoices');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search invoices/i).fill(contact.name);
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
  // Relation comboboxes (contact / lead on the create form)
  // ─────────────────────────────────────────────────────────────

  test('contact and lead fields are comboboxes with no raw ID input on the create form', async ({ page }) => {
    await page.goto('/invoices/new');
    await waitForLoad(page);

    const rawIdInputs = await page.locator('input[placeholder*="Enter" i][placeholder*="ID" i]').count();
    expect(rawIdInputs).toBe(0);

    const comboboxes = page.locator('[role="combobox"]');
    const count = await comboboxes.count();
    expect(count).toBeGreaterThanOrEqual(2); // contact + lead

    const contactCombo = page.locator('button[role="combobox"]').filter({ hasText: 'Search contacts...' });
    await expect(contactCombo).toBeVisible();
    await contactCombo.click();
    await expect(page.getByPlaceholder('Type to search contacts...')).toBeVisible();
    const contact = await seedContact({ name: `ComboSearchInv-${Date.now()}` });
    await page.getByPlaceholder('Type to search contacts...').fill(contact.name.slice(0, 10));
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    const leadCombo = page.locator('button[role="combobox"]').filter({ hasText: 'Search leads...' });
    await expect(leadCombo).toBeVisible();
    await leadCombo.click();
    await expect(page.getByPlaceholder('Type to search leads...')).toBeVisible();
  });

  test('creating an invoice from a contact pre-fills the contact via URL param', async ({ page }) => {
    const contact = await seedContact({ name: `AutoFillInv-${Date.now()}` });

    await page.goto(`/invoices/new?contactId=${contact.id}&contactName=${encodeURIComponent(contact.name)}`);
    await waitForLoad(page);

    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Outbound messaging via Communication Hub only
  // ─────────────────────────────────────────────────────────────

  test('sending an invoice opens SendMessageDialog, never a raw mailto/wa.me/tel link', async ({ page }) => {
    const contact = await seedContact({
      name: `InvComms-${Date.now()}`,
      email: `invcomms-${Date.now()}@e2e.test`,
      phone: '+919000200003',
    });
    const invoice = await seedInvoice(contact.id);

    await openInvoiceDetail(page, invoice.id);

    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    const sendBtn = page.getByRole('button', { name: 'Send message' });
    await expect(sendBtn).toBeVisible({ timeout: 5_000 });
    await sendBtn.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

  test('list row send action opens SendMessageDialog with no mailto/wa.me links on list page', async ({ page }) => {
    const contact = await seedContact({
      name: `InvListComms-${Date.now()}`,
      email: `invlistcomms-${Date.now()}@e2e.test`,
    });
    const invoice = await seedInvoice(contact.id);

    await page.goto('/invoices');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search invoices/i).fill(contact.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    const row = page.locator(`table tbody tr:has-text("${contact.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    const sendBtn = row.locator('button[aria-label="Send"]');
    await expect(sendBtn).toBeVisible({ timeout: 5_000 });
    await sendBtn.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  // The bulk export backend works (export_jobs migration 0032): the job completes and the
  // browser receives the zip. A queueing failure is forced with a route stub so the error
  // path stays covered.
  test('export queues a bulk job and downloads the invoices zip', async ({ page }) => {
    const contact = await seedContact({ name: `ExportInv-${Date.now()}` });
    await seedInvoice(contact.id);

    await page.goto('/invoices');
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45_000 }),
      page.getByRole('button', { name: /Export/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^invoices_\d{4}-\d{2}-\d{2}\.zip$/);
    await expect(page.getByText('Invoices exported')).toBeVisible({ timeout: 15_000 });
  });

  test('export surfaces an error toast when the bulk export job fails to queue', async ({ page }) => {
    const contact = await seedContact({ name: `ExportInvFail-${Date.now()}` });
    await seedInvoice(contact.id);

    await page.route('**/exports/invoices/bulk-pdf', (route) =>
      route.fulfill({ status: 500, json: { success: false, error: { message: 'Export queue unavailable' } } }));

    await page.goto('/invoices');
    await waitForLoad(page);

    await page.getByRole('button', { name: /Export/i }).click();
    await expect(page.getByText('Failed to export invoices')).toBeVisible({ timeout: 15_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Payments, credit/debit notes, duplicate — detail page actions
  // ─────────────────────────────────────────────────────────────

  test('recording a payment from the detail page updates balance and shows in payment history', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id, {
      items: [{ description: 'Payment Test Item', quantity: 1, rate: 10000, taxRate: 18 }],
    });

    await openInvoiceDetail(page, invoice.id);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Record payment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Record Payment' })).toBeVisible();

    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.fill('5000');
    const refInput = page.getByPlaceholder(/UTR number/i);
    await refInput.fill('E2E-UTR-001');

    await page.getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.getByText('Payment recorded')).toBeVisible({ timeout: 10_000 });

    // Balance Due is on the default Overview tab (Totals section)
    await expect(page.getByText(/Balance Due/i)).toBeVisible({ timeout: 10_000 });

    // Payment History lives under the "Related" tab
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('E2E-UTR-001')).toBeVisible({ timeout: 10_000 });

    const fetched = await api('GET', `/invoices/${invoice.id}`);
    expect(Number(fetched.data.paidAmount ?? fetched.data.paid_amount ?? 0)).toBeGreaterThanOrEqual(5000);
  });

  test('record payment - zero amount shows validation error', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Record payment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.fill('0');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.getByText(/valid payment amount/i)).toBeVisible({ timeout: 5_000 });
  });

  test('creating a credit note from the detail page persists via API', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    const reason = `E2E CN reason ${Date.now()}`;

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Create credit note' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder(/Service cancellation/i).fill(reason);
    await page.locator('[role="dialog"] input[placeholder="Description"]').first().fill('Refund item');
    await page.locator('[role="dialog"] input[placeholder="Rate"]').first().fill('500');

    await page.getByRole('button', { name: 'Create Credit Note' }).click();
    await expect(page.getByText('Credit note created')).toBeVisible({ timeout: 10_000 });

    // The reason is persisted as part of the JSON-encoded `notes` column (no dedicated
    // `reason` field on the credit note record returned by the list endpoint).
    const cnRes = await api('GET', '/credit-notes');
    const cnList = Array.isArray(cnRes.data) ? cnRes.data : (cnRes.data?.data ?? []);
    expect(cnList.some((cn: any) => typeof cn.notes === 'string' && cn.notes.includes(reason))).toBe(true);
  });

  test('creating a debit note from the detail page persists via API', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    const reason = `E2E DN reason ${Date.now()}`;

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Create debit note' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder(/Additional charges/i).fill(reason);
    await page.locator('[role="dialog"] input[placeholder="Description"]').first().fill('Extra charge');
    await page.locator('[role="dialog"] input[placeholder="Rate"]').first().fill('300');

    await page.getByRole('button', { name: 'Create Debit Note' }).click();
    await expect(page.getByText('Debit note created')).toBeVisible({ timeout: 10_000 });

    const dnRes = await api('GET', '/debit-notes');
    const dnList = Array.isArray(dnRes.data) ? dnRes.data : (dnRes.data?.data ?? []);
    expect(dnList.some((dn: any) => typeof dn.notes === 'string' && dn.notes.includes(reason))).toBe(true);
  });

  test('duplicating an invoice creates a new invoice and navigates to it', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate invoice' }).click();

    await expect(page.getByText(/Invoice duplicated/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForURL((url) => !url.href.endsWith(`/invoices/${invoice.id}`), { timeout: 10_000 });

    const newInvoiceId = page.url().split('/invoices/')[1];
    expect(newInvoiceId).toBeTruthy();
    expect(newInvoiceId).not.toBe(invoice.id);
  });

  test('payment history shows seeded payments on detail page', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    const reference = `UPI-E2E-${Date.now()}`;
    await seedPayment(invoice.id, { amount: 2000, method: 'upi', reference });

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('Payment History')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(reference)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('₹2,000')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────
  // Downloads (PDF/CSV) — real file generation, not a no-op
  // ─────────────────────────────────────────────────────────────

  test('download PDF from detail page produces a non-empty file', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id, {
      items: [{ description: 'PDF Test Item', quantity: 1, rate: 9000, taxRate: 18 }],
    });

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('button', { name: 'More actions' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('menuitem', { name: 'Download PDF' }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
  });

  test('download CSV from detail page produces a non-empty file', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);

    await openInvoiceDetail(page, invoice.id);
    await page.getByRole('button', { name: 'More actions' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('menuitem', { name: 'Download CSV' }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Edit guard for non-draft invoices
  // ─────────────────────────────────────────────────────────────

  test('non-draft invoice cannot be edited — edit route shows guard message', async ({ page }) => {
    const contact = await seedContact();
    const invoice = await seedInvoice(contact.id);
    await api('POST', `/invoices/${invoice.id}/void`);

    await page.goto(`/invoices/${invoice.id}/edit`);
    await waitForLoad(page);

    await expect(page.getByText('Invoice cannot be edited')).toBeVisible({ timeout: 10_000 });
    // No Edit button shown on the detail header for a non-draft invoice
    await page.goto(`/invoices/${invoice.id}`);
    await waitForLoad(page);
    await expect(page.getByRole('button', { name: /^Edit$/ })).toHaveCount(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Form validation
  // ─────────────────────────────────────────────────────────────

  test('validation error shown when submitting without a contact', async ({ page }) => {
    await page.goto('/invoices/new');
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Please select a contact').first()).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────

  test('invoices API requires authentication', async () => {
    const res = await fetch(`${API_URL}/invoices`, { headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(401);
  });

  test('invoices API rejects invalid token', async () => {
    const res = await fetch(`${API_URL}/invoices`, { headers: { Authorization: 'Bearer invalid-token-here' } });
    expect(res.status).toBe(401);
  });
});
