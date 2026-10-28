import { test, expect } from './fixtures';
import { API_URL, BASE_URL, TENANT_ID } from './helpers/auth';
import { api, seedContact, seedInvoice } from './helpers/api-seed';

/**
 * R142: pay online on a local stack. Connect the test gateway, create a deposit link on a euro invoice, open the pay page,
 * pay with iDEAL, come back, and see the payment and the balance. The customer email of a sent invoice is read from the
 * local outbox (nothing reaches SendGrid in test mode).
 */

test.describe.configure({ mode: 'serial' });

let invoiceId = '';
let invoiceNumber = '';
let contactEmail = '';
let linkUrl = '';

test('connect the test gateway in Settings > Integrations', async ({ page }) => {
  await page.goto('/settings/integrations');
  const card = page.getByTestId('payment-gateway-mock');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const connect = page.getByTestId('payment-gateway-mock-connect');
  if (await connect.isVisible().catch(() => false)) await connect.click();
  await expect(card.getByText(/^connected$/i)).toBeVisible({ timeout: 10_000 });
  // The Stripe card tells the agency where iDEAL is switched on
  await expect(page.getByTestId('stripe-methods-hint')).toContainText('iDEAL');
});

test('set a 30% default deposit in Settings > Invoice defaults', async ({ page }) => {
  await page.goto('/settings/invoice-defaults');
  const card = page.getByTestId('payment-defaults-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.locator('#depositType').click();
  await page.getByRole('option', { name: /percentage of the invoice total/i }).click();
  await card.locator('#depositValue').fill('30');
  await page.getByTestId('payment-defaults-save').click();
  await expect(page.getByText(/payment defaults saved/i).first()).toBeVisible({ timeout: 10_000 });
  const saved = await api('GET', '/settings/payment-defaults');
  expect((saved.data ?? saved).deposit).toEqual({ type: 'percent', value: 30 });
});

test('create a deposit link on a euro invoice', async ({ page }) => {
  contactEmail = `payer-${Date.now()}@example.test`;
  const contact = await seedContact({ name: `Pay Online ${Date.now()}`, email: contactEmail });
  const invoice = await seedInvoice(contact.id, { currency: 'EUR', items: [{ description: 'Tulip tour', quantity: 1, rate: 1000, taxRate: 0 }] });
  invoiceId = invoice.id;
  invoiceNumber = invoice.invoiceNumber ?? invoice.invoice_number;
  expect(invoiceId).toBeTruthy();

  await page.goto(`/invoices/${invoiceId}`);
  await page.getByTestId('invoice-payment-link-create').click();
  await expect(page.getByTestId('payment-link-dialog')).toBeVisible();
  await page.getByTestId('payment-link-purpose-deposit').check();
  await page.getByTestId('payment-link-submit').click();
  const urlBox = page.getByTestId('payment-link-created-url');
  await expect(urlBox).toBeVisible({ timeout: 15_000 });
  linkUrl = await urlBox.inputValue();
  expect(linkUrl).toContain('/webhooks/payments/mock-pay/');
  // "Send to customer" opens the Communication Hub dialog, never mailto: or wa.me
  await page.getByRole('button', { name: /send to customer/i }).click();
  await expect(page.getByRole('dialog').filter({ hasText: /send/i }).first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('open the link, pay with iDEAL, return and see the payment and the balance', async ({ page }) => {
  await page.goto(`${linkUrl}?return=${encodeURIComponent(`${BASE_URL}/invoices/${invoiceId}`)}`);
  await expect(page.getByTestId('mock-amount')).toContainText('300');
  await expect(page.getByText('iDEAL')).toBeVisible();
  await page.getByLabel('iDEAL').check();
  await page.getByRole('button', { name: /^pay /i }).click();

  await page.waitForURL(new RegExp(`/invoices/${invoiceId}\\?payment=success`), { timeout: 20_000 });
  await expect(page.getByTestId('invoice-payment-link-amount')).toContainText('300', { timeout: 15_000 });

  const detail = (await api('GET', `/invoices/${invoiceId}`)).data;
  expect(detail.status).toBe('partially_paid');
  expect(Number(detail.paid_amount ?? detail.paidAmount)).toBe(300);
  expect(Number(detail.balance_due ?? detail.balanceDue)).toBe(700);
  const payments = (await api('GET', `/invoices/${invoiceId}/payments`)).data;
  const rows = payments.data ?? payments.items ?? payments;
  expect(rows).toHaveLength(1);
  await expect(page.getByText(/700/).first()).toBeVisible();
});

test('the customer email of a sent invoice is readable in the local outbox', async () => {
  test.setTimeout(120_000);
  const sent = await api('POST', `/invoices/${invoiceId}/send`, { channel: 'email', to: contactEmail });
  expect(sent.success ?? true).toBeTruthy();
  let mail: { subject: string; to: string; tenantId: string; kind: string } | undefined;
  for (let i = 0; i < 90 && !mail; i++) {
    const res = await fetch(`${API_URL}/test/outbox?tenantId=${TENANT_ID}&kind=agency&to=${encodeURIComponent(contactEmail)}`);
    const body = (await res.json()) as { data: Array<{ subject: string; to: string; tenantId: string; kind: string }> };
    mail = body.data[0];
    if (!mail) await new Promise((r) => setTimeout(r, 1000));
  }
  expect(mail, 'invoice email found in the outbox').toBeTruthy();
  expect(mail!.to).toBe(contactEmail);
  expect(mail!.kind).toBe('agency');
  expect(mail!.subject).toContain(invoiceNumber);
});
