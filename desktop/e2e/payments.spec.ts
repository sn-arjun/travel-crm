import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedContact, seedInvoice, seedPayment } from './helpers/api-seed';

const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

// Invoice of 10,000 + 18% tax = 11,800 total.
const INVOICE_TOTAL = 11800;

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function todayDisplay(long = false) {
  return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' });
}

async function newInvoice(overrides: Record<string, any> = {}) {
  const contact = await seedContact({ name: `Pay Client ${Date.now()}-${Math.floor(Math.random() * 1000)}` });
  const invoice = await seedInvoice(contact.id, overrides);
  expect(invoice?.id, JSON.stringify(invoice)).toBeTruthy();
  const number = invoice.invoiceNumber ?? invoice.invoice_number;
  expect(number, 'seeded invoice exposes its number').toBeTruthy();
  return { contact, invoice, number: number as string };
}

async function searchList(page: Page, term: string) {
  await page.getByPlaceholder(/Search payments/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

async function gotoList(page: Page) {
  await page.goto('/payments');
  await waitForLoad(page);
  await expect(page.getByRole('heading', { name: /payments/i }).first()).toBeVisible();
}

function rowFor(page: Page, text: string) {
  return page.locator(`table tbody tr:has-text("${text}")`).first();
}

async function pickInvoice(page: Page, invoiceNumber: string) {
  await page.getByRole('combobox').filter({ hasText: /Search invoices/i }).click();
  await page.getByPlaceholder(/search/i).last().fill(invoiceNumber);
  const option = page.getByRole('option', { name: new RegExp(invoiceNumber) });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

// CurrencyInput reformats on focus/blur; a plain fill() races with that and appends to the old value.
async function setAmount(page: Page, value: string) {
  const input = page.locator('input[inputmode="decimal"]');
  await input.click();
  await input.press('Control+A');
  await input.pressSequentially(value);
  await input.blur();
}

async function fetchInvoice(id: string) {
  const res = await api('GET', `/invoices/${id}`);
  expect(res.success, JSON.stringify(res)).toBe(true);
  return res.data;
}

test.describe('Payments — create through the form, then list → detail → delete', () => {
  test('records a payment with every field, shows it in list and detail, updates the invoice, and deletes it', async ({ page }) => {
    const { contact, invoice, number } = await newInvoice();
    const ref = `UTR-FULL-${Date.now()}`;
    const notes = `Full flow note ${Date.now()}`;

    await page.goto('/payments');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Record payment/i }).first().click();
    await page.waitForURL('**/payments/new');
    await expect(page.getByText('Record payment').first()).toBeVisible();

    // Invoice is a searchable combobox — no raw ID input anywhere
    expect(await page.locator('input[name="invoiceId"], input[placeholder*="invoice id" i]').count()).toBe(0);
    await pickInvoice(page, number);

    // Selecting the invoice shows its summary and pre-fills the amount with the balance due
    await expect(page.getByText('Invoice total')).toBeVisible();
    await expect(page.getByText('Balance due', { exact: true })).toBeVisible();
    const amountInput = page.locator('input[inputmode="decimal"]');
    await expect(amountInput).toHaveValue(/11,?800/);

    await setAmount(page, '4000');
    await page.locator('#paymentMethod').click();
    await page.getByRole('option', { name: 'UPI' }).click();
    await page.locator('#reference').fill(ref);
    await page.getByPlaceholder(/additional notes/i).fill(notes);

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Payment recorded successfully').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/payments$/, { timeout: 15_000 });
    await waitForLoad(page);

    // List shows every value
    await searchList(page, ref);
    const row = rowFor(page, ref);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(number);
    await expect(row).toContainText(contact.name);
    await expect(row).toContainText(inr(4000));
    await expect(row).toContainText('UPI');
    await expect(row).toContainText(todayDisplay());
    for (const header of ['Date', 'Invoice #', 'Client', 'Amount', 'Method', 'Reference']) {
      await expect(page.locator('table thead').getByText(header, { exact: true })).toBeVisible();
    }

    // Invoice balance updated server-side
    const afterPay = await fetchInvoice(invoice.id);
    expect(afterPay.paidAmount ?? afterPay.paid_amount).toBe(4000);
    expect(afterPay.balanceDue ?? afterPay.balance_due).toBe(INVOICE_TOTAL - 4000);
    expect(afterPay.status).toBe('partially_paid');

    // Detail shows every value
    await row.click();
    await page.waitForURL(/\/payments\/[0-9a-f-]{20,}$/, { timeout: 15_000 });
    await waitForLoad(page);
    const paymentId = page.url().match(/\/payments\/([0-9a-f-]{20,})$/)![1];
    await expect(page.getByRole('heading', { name: new RegExp(`4,?000`) }).first()).toBeVisible();
    await expect(page.getByText(`Against invoice ${number}`)).toBeVisible();
    await expect(page.getByText(ref, { exact: true })).toBeVisible();
    await expect(page.getByText(notes)).toBeVisible();
    await expect(page.getByText(contact.name).first()).toBeVisible();
    await expect(page.getByText('UPI').first()).toBeVisible();
    await expect(page.getByText(todayDisplay(true))).toBeVisible();

    // Linked invoice section links through to the invoice
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('Linked invoice')).toBeVisible();
    await expect(page.getByText(number).first()).toBeVisible();
    await page.getByRole('button', { name: /Open invoice/i }).click();
    await page.waitForURL(new RegExp(`/invoices/${invoice.id}`), { timeout: 15_000 });
    await page.goBack();
    await waitForLoad(page);

    // Payments are an immutable ledger: backend has no update route, so there must be no edit affordance
    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: /^Edit/i })).toHaveCount(0);

    // Delete from the detail page reverses the payment on the invoice
    await page.getByRole('menuitem', { name: 'Delete payment' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete payment' }).click();
    await expect(page.getByText('Payment deleted').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/payments$/, { timeout: 15_000 });
    await searchList(page, ref);
    await expect(page.locator(`table tbody tr:has-text("${ref}")`)).toHaveCount(0, { timeout: 10_000 });

    expect((await api('GET', `/payments/${paymentId}`)).success).toBe(false);
    const afterDelete = await fetchInvoice(invoice.id);
    expect(afterDelete.paidAmount ?? afterDelete.paid_amount).toBe(0);
    expect(afterDelete.balanceDue ?? afterDelete.balance_due).toBe(INVOICE_TOTAL);
  });

  test('form validates: invoice required, amount > 0, amount cannot exceed balance due', async ({ page }) => {
    const { number } = await newInvoice();
    await page.goto('/payments/new');
    await waitForLoad(page);

    // Nothing filled → blocked, still on the form
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Amount is required|Amount must be greater than zero/).first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/payments\/new/);

    // Amount without invoice → invoice error
    await setAmount(page, '100');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#invoiceId-error')).toHaveText('Please select an invoice to record payment against', { timeout: 5_000 });

    // Over-balance amount → error toast, nothing recorded
    await pickInvoice(page, number);
    await setAmount(page, '999999');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/exceeds invoice balance due/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/payments\/new/);
  });

  test('invoice combobox: typing filters options, and ?invoiceId= pre-fills invoice, summary and amount', async ({ page }) => {
    const a = await newInvoice();
    const b = await newInvoice();

    await page.goto('/payments/new');
    await waitForLoad(page);
    await page.getByRole('combobox').filter({ hasText: /Search invoices/i }).click();
    await page.getByPlaceholder(/search/i).last().fill(a.number);
    await expect(page.getByRole('option', { name: new RegExp(a.number) })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('option', { name: new RegExp(b.number) })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.goto(`/payments/new?invoiceId=${b.invoice.id}`);
    await waitForLoad(page);
    await expect(page.getByRole('combobox').filter({ hasText: b.number })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Invoice total')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[inputmode="decimal"]')).toHaveValue(/11,?800/);
  });

  test('advance payment toggle swaps the invoice picker for a lead combobox', async ({ page }) => {
    await page.goto('/payments/new');
    await waitForLoad(page);
    await expect(page.getByText('Link to invoice')).toBeVisible();
    await page.getByRole('switch').click();
    await expect(page.getByText('Lead reference')).toBeVisible();
    await expect(page.getByText('Link to invoice')).toHaveCount(0);
    await expect(page.getByRole('combobox').filter({ hasText: /Search leads/i })).toBeVisible();
    expect(await page.locator('input[name="leadId"], input[placeholder*="lead id" i]').count()).toBe(0);
  });

  test('cancel on the form returns without recording anything', async ({ page }) => {
    await gotoList(page);
    await page.getByRole('button', { name: /Record payment/i }).first().click();
    await page.waitForURL('**/payments/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForURL(/\/payments$/);
  });
});

test.describe('Payments — record from the invoice detail page', () => {
  async function openRecordPaymentDialog(page: Page, invoiceId: string) {
    await page.goto(`/invoices/${invoiceId}`);
    await waitForLoad(page);
    await page.locator('button').filter({ has: page.locator('.lucide-more-horizontal, .lucide-ellipsis') }).last().click();
    await page.getByRole('menuitem', { name: 'Record payment' }).click();
    await expect(page.getByText('Record Payment').first()).toBeVisible();
  }

  test('records a payment (with UTR reference) and the list reflects it', async ({ page }) => {
    const { invoice, number } = await newInvoice();
    const utr = `UTR-INV-${Date.now()}`;
    await openRecordPaymentDialog(page, invoice.id);

    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.clear();
    await amountInput.fill('5000');
    const refInput = page.getByPlaceholder(/utr/i);
    await expect(refInput).toBeVisible();
    await refInput.fill(utr);

    await page.getByRole('button', { name: /record payment/i }).click();
    await expect(page.getByText(/payment recorded/i).first()).toBeVisible({ timeout: 10_000 });

    await gotoList(page);
    await searchList(page, utr);
    const row = rowFor(page, utr);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(number);
    await expect(row).toContainText(inr(5000));
  });

  test('rejects a zero amount', async ({ page }) => {
    const { invoice } = await newInvoice();
    await openRecordPaymentDialog(page, invoice.id);

    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.clear();
    await amountInput.fill('0');
    await page.getByRole('button', { name: /record payment/i }).click();
    await expect(page.getByText(/valid payment amount/i)).toBeVisible({ timeout: 5_000 });
  });

  test('API seeder returns a valid payment', async () => {
    const { invoice } = await newInvoice();
    const payment = await seedPayment(invoice.id);
    expect(payment).toBeTruthy();
    expect(payment.id || payment.invoiceId).toBeTruthy();
  });
});

test.describe('Payments — list', () => {
  test('shows a seeded payment with all columns; page renders heading, count and primary action', async ({ page }) => {
    const { contact, invoice, number } = await newInvoice();
    const ref = `LIST-${Date.now()}`;
    await seedPayment(invoice.id, { amount: 2500, method: 'cash', reference: ref });

    await gotoList(page);
    await searchList(page, ref);
    const row = rowFor(page, ref);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(number);
    await expect(row).toContainText(contact.name);
    await expect(row).toContainText(inr(2500));
    await expect(row).toContainText('Cash');
    await expect(row).toContainText(todayDisplay());
    await expect(page.getByRole('button', { name: /Record payment/i }).first()).toBeVisible();
  });

  test('search narrows by reference, client name and invoice number', async ({ page }) => {
    const marker = `Srch${Date.now()}`;
    const a = await newInvoice();
    const b = await newInvoice();
    await seedPayment(a.invoice.id, { reference: `${marker}-match` });
    await seedPayment(b.invoice.id, { reference: `other-${Date.now()}` });

    await gotoList(page);
    await searchList(page, marker);
    await expect(rowFor(page, `${marker}-match`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table tbody tr')).toHaveCount(1);

    await searchList(page, a.contact.name);
    await expect(rowFor(page, a.contact.name)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${b.contact.name}")`)).toHaveCount(0);

    await searchList(page, b.number);
    await expect(rowFor(page, b.number)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${a.number}")`)).toHaveCount(0);
  });

  test('method filter narrows results, shows an active-filter chip, and clears', async ({ page }) => {
    const marker = `Filt${Date.now()}`;
    const { invoice } = await newInvoice();
    await seedPayment(invoice.id, { amount: 100, method: 'cash', reference: `${marker}-cash` });
    await seedPayment(invoice.id, { amount: 100, method: 'upi', reference: `${marker}-upi` });

    await gotoList(page);
    await searchList(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.getByRole('combobox', { name: 'Filter by method' }).click();
    await page.getByRole('option', { name: 'Cash' }).click();
    await expect(rowFor(page, `${marker}-cash`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${marker}-upi")`)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.getByText('Filters:')).toBeVisible();

    // Filter that matches nothing for this search → empty state
    await page.getByRole('combobox', { name: 'Filter by method' }).click();
    await page.getByRole('option', { name: 'Card' }).click();
    await expect(page.getByText('No payments yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Record your first payment against an outstanding invoice.')).toBeVisible();

    // Reset
    await page.getByRole('combobox', { name: 'Filter by method' }).click();
    await page.getByRole('option', { name: 'All methods' }).click();
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });
  });

  test('empty state renders when search matches nothing', async ({ page }) => {
    await gotoList(page);
    await searchList(page, `no-such-payment-${Date.now()}-zzz`);
    await expect(page.getByText('No payments yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Record your first payment against an outstanding invoice.')).toBeVisible();
    await expect(page.locator('table tbody tr td:has-text("₹")')).toHaveCount(0);
  });

  test('hover actions: view opens detail, receipt opens receipt, delete removes the row and reverses the invoice', async ({ page }) => {
    const { invoice, number } = await newInvoice();
    const ref = `HOV-${Date.now()}`;
    const payment = await seedPayment(invoice.id, { amount: 3000, method: 'card', reference: ref });

    await gotoList(page);
    await searchList(page, ref);
    const row = rowFor(page, ref);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Receipt
    await row.hover();
    await row.locator('button[aria-label="Receipt"]').click();
    await expect(page.getByText(number).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(ref).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('button:has(.lucide-x)').first().click({ timeout: 2_000 }).catch(() => {});

    // View
    await row.hover();
    await row.locator('button[aria-label="View"]').click();
    await page.waitForURL(new RegExp(`/payments/${payment.id}$`), { timeout: 15_000 });
    await page.goBack();
    await waitForLoad(page);
    await searchList(page, ref);

    // Delete (cancel first, then confirm)
    const row2 = rowFor(page, ref);
    await row2.hover();
    await row2.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Cancel$/ }).click();
    await expect(row2).toBeVisible();

    await row2.hover();
    await row2.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete payment' }).click();
    await expect(page.getByText('Payment deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${ref}")`)).toHaveCount(0, { timeout: 10_000 });

    expect((await api('GET', `/payments/${payment.id}`)).success).toBe(false);
    const inv = await fetchInvoice(invoice.id);
    expect(inv.paidAmount ?? inv.paid_amount).toBe(0);
  });

  test('bulk delete removes every selected payment', async ({ page }) => {
    const marker = `Bulk${Date.now()}`;
    const { invoice } = await newInvoice();
    const p1 = await seedPayment(invoice.id, { amount: 100, reference: `${marker}-1` });
    const p2 = await seedPayment(invoice.id, { amount: 100, reference: `${marker}-2` });

    await gotoList(page);
    await searchList(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });
    await page.locator('table tbody tr').nth(0).getByRole('checkbox').click();
    await page.locator('table tbody tr').nth(1).getByRole('checkbox').click();
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('Payments deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${marker}")`)).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `/payments/${p1.id}`)).success).toBe(false);
    expect((await api('GET', `/payments/${p2.id}`)).success).toBe(false);
  });

  test('export downloads a non-empty CSV containing the listed payment', async ({ page }) => {
    const { invoice, number } = await newInvoice();
    const ref = `EXP-${Date.now()}`;
    await seedPayment(invoice.id, { amount: 1234, method: 'upi', reference: ref });

    await gotoList(page);
    await searchList(page, ref);
    await expect(rowFor(page, ref)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('payments.csv');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain('"Date","Invoice #","Client","Amount","Method","Reference"');
    expect(csv).toContain(ref);
    expect(csv).toContain(number);
    expect(csv).toContain('"1234"');
    expect(csv).toContain('UPI');
  });

  test('infinite scroll loads more rows as the list is scrolled', async ({ page }) => {
    test.setTimeout(180_000);
    const marker = `Scroll${Date.now()}`;
    const { invoice } = await newInvoice({ items: [{ description: 'Big', quantity: 1, rate: 1_000_000, taxRate: 0 }] });
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedPayment(invoice.id, { amount: 10, reference: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await gotoList(page);
    await searchList(page, marker);
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 15_000 });
  });

  test('list page has no raw mailto:/tel:/wa.me anchors', async ({ page }) => {
    const { invoice } = await newInvoice();
    await seedPayment(invoice.id);
    await gotoList(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });
});

test.describe('Payments — detail', () => {
  test('messaging goes through SendMessageDialog, not raw links; unknown id shows not-found state', async ({ page }) => {
    const { contact, invoice, number } = await newInvoice();
    const ref = `DET-${Date.now()}`;
    const payment = await seedPayment(invoice.id, { amount: 750, method: 'cash', reference: ref, notes: 'detail notes' });

    await page.goto(`/payments/${payment.id}`);
    await waitForLoad(page);
    await expect(page.getByText(`Against invoice ${number}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(contact.name).first()).toBeVisible();
    await expect(page.getByText('detail notes')).toBeVisible();
    await expect(page.getByText('Cash').first()).toBeVisible();
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);

    await page.getByRole('button', { name: /Send message/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
    await page.keyboard.press('Escape');

    // Receipt download action
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Download receipt' }).click();
    await expect(page.getByText(ref).first()).toBeVisible({ timeout: 5_000 });

    await page.goto('/payments/00000000-0000-7000-8000-00000000dead');
    await waitForLoad(page);
    await expect(page.getByText('Payment not found')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Back to payments' }).click();
    await page.waitForURL(/\/payments$/);
  });
});
