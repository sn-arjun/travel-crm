import { test, expect } from './fixtures';
import { api, seedContact, seedLead } from './helpers/api-seed';

// "Accept and book" on the shared quote page, end to end: staff switch it on in Settings > Itinerary defaults, share a quote linked to a
// departure, an anonymous browser accepts with a name, sees the seats held and pays the deposit on the test gateway; staff then see
// the lead won, the seat booking and the payment.

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.describe('Quote acceptance', () => {
  let before: Record<string, unknown> = {};

  test.beforeAll(async () => {
    before = ((await api('GET', '/settings/invoice-defaults')).data ?? {}) as Record<string, unknown>;
  });

  test.afterAll(async () => {
    // Leave the shared agency as it was found: acceptance off, no deposit default, the earlier tax system.
    await api('PUT', '/settings/quotes-accept', { enabled: false, createInvoice: 'none' });
    await api('PUT', '/settings/payment-defaults', { deposit: { type: 'none' } });
    await api('PUT', '/settings/invoice-defaults', { tax_system: before.tax_system, default_tax_type: before.tax_system });
  });

  test('staff switch it on, a visitor accepts and pays the deposit, staff see everything', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36).toUpperCase();
    const visitor = `Quote Visitor ${stamp}`;

    expect((await api('PUT', '/departures/settings', { enabled: true, holdExpiryHours: 48, confirmMode: 'manual', showSeatsLeft: 'always', deposit: { type: 'none', value: null } })).success).toBe(true);
    await api('PUT', '/settings/invoice-defaults', { tax_system: 'none', default_tax_type: 'none' });
    await api('PUT', '/settings/payment-defaults', { deposit: { type: 'percent', value: 25 } });
    await api('PUT', '/integrations/payment-gateways/mock', {});

    // ---- staff: the Quote link card
    await page.goto('/settings/itinerary-defaults');
    const card = page.getByTestId('quote-link-card');
    await expect(card).toBeVisible();
    const enabled = card.getByTestId('quote-accept-enabled');
    if ((await enabled.getAttribute('aria-checked')) !== 'true') await enabled.click();
    await card.getByTestId('quote-accept-invoice').click();
    await page.getByRole('option', { name: 'An invoice' }).click();
    await card.getByTestId('quote-accept-save').click();
    await expect.poll(async () => (await api('GET', '/settings/quotes-accept')).data).toMatchObject({ enabled: true, createInvoice: 'invoice' });

    // ---- a departure, a lead and a quote linked to it
    const tour = (await api('POST', '/tours', { code: `QA-${stamp}`, title: `Fjords ${stamp}`, destination: 'Norway', durationDays: 4, currency: 'EUR' })).data;
    await api('PUT', `/tours/${tour.id}/prices`, { prices: [{ kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 }] });
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate: day(80), capacityMode: 'manual', capacity: 12 })).data;
    await api('POST', `/departures/${dep.id}/status`, { status: 'open' });

    const contact = await seedContact({ name: visitor, email: `qa-${stamp}@example.test` });
    const lead = await seedLead(contact.id, { paxAdults: 3, paxChildren: 0 });
    const quote = (await api('POST', '/itineraries', {
      leadId: lead.id, title: `Fjords quote ${stamp}`, currency: 'EUR', validityDate: day(30),
      days: [{ dayNumber: 1, title: 'Arrive', items: [
        { type: 'hotel', title: 'Fjord hotel', sellingPrice: 800, quantity: 1, sortOrder: 0 },
        { type: 'activity', title: 'Infant ticket', sellingPrice: 50, quantity: 0, paxType: 'infant', sortOrder: 1 },
      ] }],
    })).data;
    expect((await api('PUT', `/itineraries/${quote.id}/departure`, { departureId: dep.id, seatsRequested: 3 })).success).toBe(true);
    const shareToken = (await api('POST', `/itineraries/${quote.id}/share-link`)).data.shareToken as string;

    // ---- an anonymous browser
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await anon.newPage();
    await guest.goto(`/q/${shareToken}`);
    await expect(guest.getByTestId('shared-quote')).toContainText(`Fjords quote ${stamp}`);
    await expect(guest.getByTestId('shared-quote')).not.toContainText('Infant ticket'); // a zero-quantity line is not shown
    await expect(guest.getByTestId('accept-departure')).toContainText('12 seats left');
    await guest.getByTestId('accept-button').click();
    await guest.getByTestId('accept-confirm').click();
    await expect(guest.getByTestId('accept-error')).toBeVisible(); // a name and the terms are needed
    await guest.getByLabel('Your name').fill(visitor);
    await guest.getByLabel('I accept the terms and conditions of this quotation').click();
    await guest.getByTestId('accept-confirm').click();

    const done = guest.getByTestId('quote-accepted');
    await expect(done).toBeVisible({ timeout: 30_000 });
    await expect(guest.getByTestId('accepted-seats')).toHaveAttribute('data-status', 'held');
    await expect(guest.getByTestId('accepted-seats')).toContainText('3 seats are held');
    await expect(guest.getByTestId('accepted-invoice')).toBeVisible();
    await expect(guest.getByTestId('accept-button')).toHaveCount(0);
    await expect(guest.getByTestId('pay-deposit')).toContainText('200'); // 25% of 800
    await guest.getByTestId('pay-deposit').click();
    await expect(guest.getByTestId('mock-amount')).toContainText('200');
    await guest.getByRole('button', { name: /^Pay / }).click();
    // the test gateway sends the visitor back to the app; what matters is the payment, checked here
    await expect.poll(async () => {
      const list = (await api('GET', `/invoices?leadId=${lead.id}`)).data;
      const first = (Array.isArray(list) ? list : (list as any).items ?? [])[0];
      if (!first) return 0;
      const inv = (await api('GET', `/invoices/${first.id}`)).data;
      return Number(inv.paidAmount ?? inv.paid_amount ?? 0);
    }, { timeout: 30_000 }).toBe(200);
    // coming back later shows the accepted state, not the button
    await guest.goto(`/q/${shareToken}`);
    await expect(guest.getByTestId('quote-accepted')).toBeVisible();
    await expect(guest.getByTestId('accept-button')).toHaveCount(0);
    await anon.close();

    // ---- staff see the lead won, the seat booking and the payment
    expect((await api('GET', `/leads/${lead.id}`)).data.status).toBe('won');
    const bookings = (await api('GET', `/departures/${dep.id}/bookings`)).data as Array<{ status: string; seats: number; source: string; invoiceId?: string }>;
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ status: 'held', seats: 3, source: 'quote_accept' });
    const invoices = (await api('GET', `/invoices?leadId=${lead.id}`)).data as Array<{ id: string; total: number | string; paidAmount?: number | string; paid_amount?: number | string }>;
    const invoice = (Array.isArray(invoices) ? invoices : (invoices as any).items ?? [])[0];
    const full = (await api('GET', `/invoices/${invoice.id}`)).data;
    expect(Number(full.total)).toBe(800);
    expect(Number(full.paidAmount ?? full.paid_amount)).toBe(200);

    // the itinerary page tells who accepted and how
    await page.goto(`/itineraries/${quote.id}`);
    await expect(page.getByTestId('accepted-badge')).toContainText(`Accepted by ${visitor}`);
    await expect(page.getByTestId('accepted-badge')).toContainText('via link');
  });
});
