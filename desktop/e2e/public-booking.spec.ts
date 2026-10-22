import { test, expect } from './fixtures';
import { api } from './helpers/api-seed';

// The public booking page of a departure, end to end: staff switch the page on from the departure, an anonymous visitor books
// 2 adults and 2 children with a pickup point, room sharing and a preferred seat, accepts the terms, gets the confirmation and pays
// the deposit on the test gateway; staff then see the lead, the held booking, the passengers and the payment without retyping anything.

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A date of birth that makes someone `years` old (and a month more) on the day of the departure. */
const dobFor = (departure: string, years: number) => {
  const [y, m, d] = departure.split('-').map(Number) as [number, number, number];
  const born = new Date(Date.UTC(y - years, m - 2, d));
  return `${born.getUTCFullYear()}-${String(born.getUTCMonth() + 1).padStart(2, '0')}-${String(born.getUTCDate()).padStart(2, '0')}`;
};

test.describe('Public booking page', () => {
  // The spec sets the shared agency to no tax so totals are plain; put the earlier tax system back so later specs
  // (settings-company, invoices) see the agency as they left it.
  let before: Record<string, unknown> = {};
  test.beforeAll(async () => {
    before = ((await api('GET', '/settings/invoice-defaults')).data ?? {}) as Record<string, unknown>;
  });
  test.afterAll(async () => {
    if (before.tax_system) await api('PUT', '/settings/invoice-defaults', { tax_system: before.tax_system, default_tax_type: before.tax_system });
  });

  test('staff switch it on, a visitor books and pays the deposit, staff see everything', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36).toUpperCase();
    const visitor = `Visitor ${stamp}`;

    // ---- the agency: group tours on, a 30% deposit, preferred seats, the test gateway, no tax so totals are plain
    expect((await api('PUT', '/departures/settings', {
      enabled: true, holdExpiryHours: 48, confirmMode: 'manual', showSeatsLeft: 'always',
      preferredSeat: { enabled: true }, deposit: { type: 'percent', value: 30 }, publicBooking: { requireTerms: true, termsText: 'Be kind to the driver.', marketingOptIn: true },
    })).success).toBe(true);
    await api('PUT', '/settings/company', { tax_system: 'none' });
    await api('PUT', '/integrations/payment-gateways/mock', {});

    const startDate = day(90);
    const tour = (await api('POST', '/tours', { code: `PB-${stamp}`, title: `Lakes and Peaks ${stamp}`, destination: 'Switzerland', durationDays: 4, currency: 'EUR' })).data;
    expect((await api('PUT', `/tours/${tour.id}/prices`, {
      prices: [
        { kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 },
        { kind: 'age_band', key: 'child', label: 'Child', amount: 600 },
        { kind: 'age_band', key: 'infant', label: 'Infant', amount: 0 },
        { kind: 'room_supplement', key: 'single', amount: 250 },
        { kind: 'seat_surcharge', key: 'premium', amount: 40 },
      ],
    })).success).toBe(true);
    expect((await api('PUT', `/tours/${tour.id}/stops`, { stops: [{ name: 'Amsterdam Centraal', localTime: '06:30', kind: 'pickup' }, { name: 'Utrecht', localTime: '07:15', kind: 'pickup' }] })).success).toBe(true);
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate, capacityMode: 'manual', capacity: 20 })).data;
    expect((await api('POST', `/departures/${dep.id}/status`, { status: 'open' })).success).toBe(true);

    // ---- staff: the Public page card
    await page.goto(`/departures/${dep.id}`);
    const card = page.getByTestId('public-page-card');
    await expect(card).toBeVisible();
    await card.getByTestId('public-page-enable').click();
    const url = await card.getByTestId('public-page-url').inputValue();
    expect(url).toMatch(/\/book\/[A-Za-z0-9_-]{22}$/);
    await expect(card.getByTestId('public-page-embed')).toHaveValue(new RegExp(`<iframe src="${url}"`));

    // ---- an anonymous browser: no session of the agency
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await anon.newPage();
    await guest.goto(url);
    await expect(guest.getByTestId('tour-header')).toContainText(`Lakes and Peaks ${stamp}`);
    await expect(guest.getByTestId('seats-notice')).toContainText('20 seats left');
    await expect(guest.locator('a[href*="/login"]')).toHaveCount(0); // no product chrome, no way into the CRM
    expect(await guest.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');

    // party: 2 adults, 2 children (one adult is there from the start)
    await guest.getByTestId('band-plus-adult').click();
    await guest.getByTestId('band-plus-child').click();
    await guest.getByTestId('band-plus-child').click();
    await expect(guest.getByTestId('band-count-adult')).toHaveText('2');
    await expect(guest.getByTestId('band-count-child')).toHaveText('2');

    const fill = async (i: number, first: string, opts: { dob?: string } = {}) => {
      const card = guest.getByTestId(`passenger-${i}`);
      await card.getByTestId(`p${i}-first`).fill(first);
      await card.getByTestId(`p${i}-last`).fill(`de Vries ${stamp}`);
      if (opts.dob) await card.getByTestId(`p${i}-dob`).fill(opts.dob);
      await card.getByTestId(`p${i}-pickup`).click();
      await guest.getByRole('option', { name: /Amsterdam Centraal/ }).click();
    };
    await fill(0, 'Eva');
    await fill(1, 'Jan');
    await fill(2, 'Sanne', { dob: dobFor(startDate, 8) });
    await fill(3, 'Tim', { dob: dobFor(startDate, 5) });
    // room type and sharing, and a preferred seat for the first adult
    await guest.getByTestId('p0-room').click();
    await guest.getByRole('option', { name: /Single/ }).click();
    await guest.getByTestId('p0-share').click();
    await guest.getByTestId('p0-seat').fill('7A');

    // the price: 2 x 1000 + 2 x 600 + single 250 + seat 40 = 3490, deposit 30% = 1047
    const summary = guest.getByTestId('price-summary');
    await expect(summary.getByTestId('summary-total')).toContainText('3,490');
    await expect(summary.getByTestId('summary-deposit')).toContainText('1,047');

    await guest.getByTestId('contact-name').fill(visitor);
    await guest.getByTestId('contact-email').fill(`visitor.${stamp.toLowerCase()}@example.test`);

    // a child without a valid age is caught before anything is sent
    await guest.getByTestId('p2-dob').fill(dobFor(startDate, 40));
    await guest.getByTestId('booking-submit').click();
    await expect(guest.getByTestId('booking-error')).toBeVisible();
    await guest.getByTestId('p2-dob').fill(dobFor(startDate, 8));

    // the terms are required
    await guest.getByTestId('booking-submit').click();
    await expect(guest.getByText('Accept the terms to continue')).toBeVisible();
    await guest.getByTestId('terms-toggle').click();
    await expect(guest.getByTestId('terms-text')).toContainText('Be kind to the driver.');
    await guest.getByTestId('accept-terms').click();
    await guest.getByTestId('marketing-opt-in').click();
    await guest.getByTestId('booking-submit').click();

    // ---- the confirmation, then the deposit on the test gateway
    const done = guest.getByTestId('booking-confirmation');
    await expect(done).toBeVisible({ timeout: 30_000 });
    await expect(done).toHaveAttribute('data-status', 'held');
    await expect(guest.getByTestId('confirmation-deposit')).toContainText('1,047');
    const reference = (await guest.getByTestId('confirmation-reference').textContent())!.trim();
    expect(reference.length).toBeGreaterThan(3);
    await guest.getByTestId('confirmation-pay').click();
    await expect(guest.getByTestId('mock-amount')).toContainText('1,047');
    await guest.getByRole('button', { name: /^Pay / }).click();
    await guest.waitForURL(/\/book\/.*payment=success/); // back on the booking page, as the return address says

    // R164-1: the paid confirmation with the reference, never the empty form again (also after a reload)
    for (const reload of [true, false]) {
      await expect(guest.getByTestId('payment-return')).toHaveAttribute('data-state', 'paid');
      await expect(guest.getByTestId('payment-return-title')).toHaveText('Payment received');
      await expect(guest.getByTestId('payment-return-reference')).toHaveText(reference);
      await expect(guest.getByTestId('payment-return-next')).toBeVisible();
      await expect(guest.getByTestId('booking-submit')).toHaveCount(0);
      if (reload) await guest.reload();
    }

    // a cancelled or failed payment offers the way back to the payment page (remembered in this browser), else the agency's contact
    await guest.goto(`${url}?payment=cancelled&ref=${reference}`);
    await expect(guest.getByTestId('payment-return')).toHaveAttribute('data-state', 'cancelled');
    await expect(guest.getByTestId('payment-return-retry')).toHaveAttribute('href', /mock-pay\/.*return=/);
    await expect(guest.getByTestId('booking-submit')).toHaveCount(0);
    await guest.evaluate(() => window.sessionStorage.clear());
    await guest.goto(`${url}?payment=failed&ref=${reference}`);
    await expect(guest.getByTestId('payment-return')).toHaveAttribute('data-state', 'failed');
    await expect(guest.getByTestId('payment-return-contact')).toBeVisible();
    await expect(guest.getByTestId('booking-submit')).toHaveCount(0);
    await anon.close();

    // ---- staff see the lead, the held booking, the passengers and the payment
    const bookings = (await api('GET', `/departures/${dep.id}/bookings`)).data as Array<{ id: string; status: string; seats: number; leadId: string; contactName: string; source: string }>;
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ status: 'held', seats: 4, source: 'public_page', contactName: visitor });
    const detail = (await api('GET', `/seat-bookings/${bookings[0]!.id}`)).data;
    expect(detail.passengers.map((p: { bandKey: string }) => p.bandKey)).toEqual(['adult', 'adult', 'child', 'child']);
    expect(detail.passengers[0]).toMatchObject({ roomType: 'single', shareOk: true, seatNumber: '7A' });
    expect(detail.passengers.every((p: { pickupStopId: string | null }) => !!p.pickupStopId)).toBe(true);
    const lead = (await api('GET', `/leads/${bookings[0]!.leadId}`)).data;
    expect(lead.source).toBe('website');
    expect(lead.departureId ?? lead.departure_id).toBe(dep.id);
    const invoice = (await api('GET', `/invoices/${detail.invoiceId}`)).data;
    expect(invoice.invoiceNumber ?? invoice.invoice_number).toBe(reference);
    expect(Number(invoice.total)).toBe(3490);
    expect(Number(invoice.paidAmount ?? invoice.paid_amount)).toBe(1047);

    // the drawer offers the invoice and refreshes it
    await page.goto(`/departures/${dep.id}`);
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.locator('table tbody tr', { hasText: visitor }).first().getByTestId('booking-status').click();
    const drawer = page.getByTestId('booking-drawer');
    await expect(drawer.getByTestId('drawer-invoice-link')).toBeVisible();
    await expect(drawer.getByTestId('drawer-create-invoice')).toHaveText(/Update invoice/);

    // ---- the same page in Dutch
    const nlCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const nl = await nlCtx.newPage();
    await nl.goto(`${url}?lang=nl`);
    await expect(nl.getByTestId('party-builder')).toContainText('Wie gaan er mee?');
    await expect(nl.getByTestId('seats-notice')).toContainText('stoelen vrij');
    await nlCtx.close();
  });

  test('an unknown link, a switched-off page and a closed departure', async ({ browser }) => {
    const stamp = Date.now().toString(36).toUpperCase();
    expect((await api('PUT', '/departures/settings', { enabled: true })).success).toBe(true);
    const tour = (await api('POST', '/tours', { code: `PC-${stamp}`, title: `Closed Tour ${stamp}`, durationDays: 2, currency: 'EUR' })).data;
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate: day(120), capacityMode: 'manual', capacity: 5 })).data;
    await api('POST', `/departures/${dep.id}/status`, { status: 'open' });
    const link = (await api('POST', `/departures/${dep.id}/public-link`)).data.url as string;

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await ctx.newPage();
    await guest.goto(link.replace(/\/book\/.+$/, '/book/AAAAAAAAAAAAAAAAAAAAAA'));
    await expect(guest.getByTestId('booking-state-missing')).toBeVisible();

    await api('POST', `/departures/${dep.id}/status`, { status: 'closed' });
    await guest.goto(link);
    await expect(guest.getByTestId('booking-state-closed')).toBeVisible();

    await api('DELETE', `/departures/${dep.id}/public-link`);
    await guest.goto(link);
    await expect(guest.getByTestId('booking-state-missing')).toBeVisible();
    await ctx.close();
  });
});
