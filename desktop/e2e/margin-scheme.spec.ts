import { test, expect } from './fixtures';
import { api } from './helpers/api-seed';

// R152: margin-scheme invoices, end to end. The agency switches the scheme on in Settings > Invoice defaults with the EU wording preset
// and its own VAT rate, issues the invoice of a seat booking from the booking drawer, and the invoice shows the wording and no VAT line.
// The margin report lists it with the VAT on the margin; with the rate removed the VAT column is blank and a row without a recorded
// cost says so. The tour, departure and booking are made through the API.

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.describe('Margin scheme', () => {
  const madeInvoices: string[] = [];
  let before: Record<string, unknown> = {};

  test.beforeAll(async () => {
    before = ((await api('GET', '/settings/invoice-defaults')).data ?? {}) as Record<string, unknown>;
  });

  test.afterAll(async () => {
    // Leave the shared agency as it was found: no margin scheme, the earlier tax system, and none of these invoices counted
    await api('PUT', '/settings/margin-scheme', { enabled: false, defaultFor: 'none', vatRate: null, wording: '' });
    const restore: Record<string, unknown> = { tax_system: before.tax_system, default_tax_type: before.tax_system };
    if (before.country !== undefined) restore.country = before.country;
    await api('PUT', '/settings/invoice-defaults', restore);
    for (const id of madeInvoices) await api('DELETE', `/invoices/${id}`);
  });

  test('wording preset and rate in Settings, a booking invoice without a VAT line, and the margin report', async ({ page }) => {
    test.setTimeout(300_000);
    const stamp = Date.now().toString(36).toUpperCase();
    const buyer = `Margin Buyer ${stamp}`;

    // ---- the agency: group tours on, a euro VAT agency whose own rate is NOT entered in the margin scheme yet
    expect((await api('PUT', '/departures/settings', { enabled: true, holdExpiryHours: 48, confirmMode: 'manual', deposit: { type: 'none', value: null } })).success).toBe(true);
    expect((await api('PUT', '/settings/invoice-defaults', { tax_system: 'vat', default_tax_type: 'vat', country: 'Netherlands', vat_rate: 21 })).success).toBe(true);
    await api('PUT', '/settings/margin-scheme', { enabled: false, defaultFor: 'none', vatRate: null, wording: '' });

    const tour = (await api('POST', '/tours', { code: `MS-${stamp}`, title: `Rome Weekend ${stamp}`, destination: 'Rome', durationDays: 4, currency: 'EUR' })).data;
    expect((await api('PUT', `/tours/${tour.id}/prices`, { prices: [{ kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 }] })).success).toBe(true);
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate: day(100), capacityMode: 'manual', capacity: 20 })).data;
    expect((await api('POST', `/departures/${dep.id}/status`, { status: 'open' })).success).toBe(true);
    expect((await api('PUT', `/departures/${dep.id}/costs`, { costs: [{ description: 'Hotel and coach', kind: 'per_seat', amount: 300, currency: 'EUR' }] })).success).toBe(true);

    // ---- Settings > Invoice defaults: the card offers presets but fills in nothing
    await page.goto('/settings/invoice-defaults');
    const card = page.getByTestId('margin-scheme-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('margin-wording')).toHaveValue('');
    await expect(card.getByTestId('margin-vat-rate')).toHaveValue('');
    await expect(card.getByTestId('margin-presets')).toContainText('check with your accountant');
    await card.getByTestId('margin-enabled').check();
    await card.getByTestId('margin-save').click(); // switched on without wording: refused
    await expect(page.getByText('Enter the wording that is printed on the invoice.').first()).toBeVisible();

    // the EU preset, the agency's own rate, margin mode for tour bookings
    await card.getByTestId('margin-preset-eu').click();
    await expect(card.getByTestId('margin-wording')).toHaveValue('Margin scheme — Travel agents');
    await card.getByTestId('margin-wording').fill('Margin scheme — Travel agents (e2e)'); // editable
    await card.getByTestId('margin-vat-rate').fill('21');
    await card.getByRole('combobox', { name: 'Start new invoices in margin mode' }).click();
    await page.getByRole('option', { name: 'For tour bookings' }).click();
    await card.getByTestId('margin-save').click();
    await expect(page.getByText('Margin scheme saved').first()).toBeVisible();
    const saved = (await api('GET', '/settings/margin-scheme')).data;
    expect(saved).toMatchObject({ enabled: true, defaultFor: 'tour_bookings', wording: 'Margin scheme — Travel agents (e2e)', vatRate: 21, costSource: 'auto' });

    // ---- a booking of 2 adults, then its invoice from the booking drawer
    const email = `margin.${stamp.toLowerCase()}@example.test`;
    const booking = (await api('POST', `/departures/${dep.id}/bookings`, {
      contact: { name: buyer, email },
      passengers: [{ firstName: 'Eva', ageYears: 40 }, { firstName: 'Jan', ageYears: 41 }],
    })).data;
    expect((await api('POST', `/seat-bookings/${booking.id}/confirm`, {})).success).toBe(true);
    await page.goto(`/departures/${dep.id}`);
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.locator('table tbody tr', { hasText: buyer }).first().getByTestId('booking-status').click();
    const drawer = page.getByTestId('booking-drawer');
    await drawer.getByTestId('drawer-create-invoice').click();
    await expect(drawer.getByTestId('drawer-invoice-link')).toBeVisible({ timeout: 20_000 });
    await drawer.getByTestId('drawer-invoice-link').click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const invoiceId = page.url().split('/').pop()!;
    madeInvoices.push(invoiceId);

    // ---- the invoice: the wording, no VAT line, and the cost and margin for staff with finance rights
    await expect(page.getByTestId('invoice-tax-note')).toHaveText('Margin scheme — Travel agents (e2e)');
    await expect(page.getByTestId('invoice-tax-line')).toHaveCount(0);
    await expect(page.getByTestId('invoice-margin-card')).toBeVisible();
    await expect(page.getByTestId('invoice-margin-cost')).toContainText(/600/); // 2 seats x 300, from the departure costs
    await expect(page.getByTestId('invoice-margin-amount')).toContainText(/1,?400/);
    await expect(page.getByTestId('invoice-margin-vat')).toContainText(/242[.,]98/); // 1,400 x 21 / 121
    const stored = (await api('GET', `/invoices/${invoiceId}`)).data;
    expect(stored).toMatchObject({ tax_regime: 'margin', total: 2000, total_tax: 0, margin_cost: 600, margin_cost_source: 'departure' });
    expect(JSON.parse(stored.tax_breakdown).filter((e: { hidden?: boolean }) => !e.hidden)).toEqual([]);

    // the draft form offers the treatment and the cost
    await page.goto(`/invoices/${invoiceId}/edit`);
    await expect(page.getByTestId('invoice-regime-select')).toBeVisible();
    await expect(page.getByTestId('margin-figures')).toBeVisible();
    await expect(page.getByTestId('margin-amount')).toContainText(/1,?400/);
    await expect(page.getByTestId('margin-vat-amount')).toContainText(/242[.,]98/);

    // a second invoice for the same agency typed by hand, with no cost recorded (to see the incomplete row)
    const contactId = booking.contactId as string;
    const manual = (await api('POST', '/invoices', { contactId, taxRegime: 'margin', items: [{ description: `Hand made ${stamp}`, quantity: 1, rate: 500 }] })).data;
    madeInvoices.push(manual.id);
    expect(manual.marginCost).toBeNull();

    // both are issued: only sent invoices are in the report
    for (const id of [invoiceId, manual.id]) {
      const sent = await api('POST', `/invoices/${id}/send`, { channel: 'email', to: email });
      expect(sent.success, JSON.stringify(sent)).toBe(true);
    }

    // ---- the margin report lists them with the VAT on the margin
    await page.goto('/reports/financial');
    await page.getByRole('tab', { name: 'Margin scheme' }).click();
    const report = page.getByTestId('margin-report');
    await expect(report).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('margin-report-notice')).toContainText('For your accountant: figures are computed from the costs recorded in TravelCRM');
    const priced = report.locator('tr', { hasText: stored.invoice_number });
    await expect(priced).toContainText(/242[.,]98/);
    const unpriced = report.locator('tr', { hasText: (await api('GET', `/invoices/${manual.id}`)).data.invoice_number });
    await expect(unpriced.getByTestId('margin-report-missing')).toHaveText('Costs not recorded');
    await expect(unpriced.getByTestId('margin-report-vat')).toHaveText('—');
    // the VAT in the invoice itself was worked out when it was made
    expect(JSON.parse(stored.tax_breakdown).find((e: { hidden?: boolean }) => e.hidden)).toMatchObject({ code: 'MARGIN_VAT', base: 1400, rate: 21, amount: 242.98 });

    // ---- without the agency's rate the VAT column is blank (nothing is assumed)
    expect((await api('PUT', '/settings/margin-scheme', { vatRate: null })).success).toBe(true);
    const noRate = (await api('POST', '/invoices', { contactId, taxRegime: 'margin', marginCost: 600, items: [{ description: `No rate ${stamp}`, quantity: 1, rate: 1000 }] })).data;
    madeInvoices.push(noRate.id);
    expect((await api('POST', `/invoices/${noRate.id}/send`, { channel: 'email', to: email })).success).toBe(true);
    const noRateNumber = (await api('GET', `/invoices/${noRate.id}`)).data.invoice_number;
    expect(JSON.parse((await api('GET', `/invoices/${noRate.id}`)).data.tax_breakdown)).toEqual([{ code: 'MARGIN_VAT', hidden: true, status: 'inputs_missing' }]);
    await page.goto('/reports/financial');
    await page.getByRole('tab', { name: 'Margin scheme' }).click();
    await expect(report).toBeVisible({ timeout: 20_000 });
    const blankRow = report.locator('tr', { hasText: noRateNumber });
    await expect(blankRow.getByTestId('margin-report-vat')).toHaveText('—');
    await expect(blankRow).toContainText(/400/); // the margin is known without the rate
    await expect(page.getByTestId('margin-report-no-rate')).toContainText('no VAT rate is set');
    await expect(report.locator('tr', { hasText: stored.invoice_number })).toContainText(/242[.,]98/); // issued with a rate: keeps it

    // the tax report leaves margin invoices out and points to this report
    await page.getByRole('tab', { name: 'Tax', exact: true }).click();
    await expect(page.getByTestId('tax-margin-pointer')).toContainText('margin-scheme invoices are not in the taxes above');
  });
});
