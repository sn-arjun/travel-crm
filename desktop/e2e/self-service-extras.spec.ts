import { test, expect } from './fixtures';
import { api } from './helpers/api-seed';
import { API_URL, TENANT_ID } from './helpers/auth';

// R150: extras and the traveller self-service page, end to end. Staff add extras to a tour on the tour screen, make the party's link
// from the booking and send it through the Communication Hub; the customer opens it with no session, enters two travellers, picks
// extras on two days and pays on the test gateway. Staff then see the travellers (with their document expiry), the extras on the
// manifest, the paid extras invoice and the sales in the extras_sales report. The tour, departure and booking are made through the API.

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.describe('Extras and the traveller self-service page', () => {
  test('staff add extras and send the link, the customer fills in travellers, picks extras and pays', async ({ page, browser }) => {
    test.setTimeout(300_000);
    const stamp = Date.now().toString(36).toUpperCase();
    const email = `family.${stamp.toLowerCase()}@example.test`;
    const gondola = `Gondola ${stamp}`;
    const dinner = `Dinner ${stamp}`;

    // ---- the agency: group tours on, the test gateway, no deposit and no tax so the totals are plain
    expect((await api('PUT', '/departures/settings', {
      enabled: true, holdExpiryHours: 48, confirmMode: 'manual', showSeatsLeft: 'always', deposit: { type: 'none', value: null }, extrasCutoffDays: 7,
    })).success).toBe(true);
    await api('PUT', '/settings/company', { tax_system: 'none' });
    await api('PUT', '/integrations/payment-gateways/mock', {});

    const tour = (await api('POST', '/tours', { code: `SX-${stamp}`, title: `Canal Weekend ${stamp}`, destination: 'Amsterdam', durationDays: 4, currency: 'EUR' })).data;
    expect((await api('PUT', `/tours/${tour.id}/prices`, {
      prices: [
        { kind: 'age_band', key: 'adult', label: 'Adult', amount: 800 },
        { kind: 'age_band', key: 'child', label: 'Child', amount: 500 },
        { kind: 'age_band', key: 'infant', label: 'Infant', amount: 0 },
      ],
    })).success).toBe(true);

    // ---- staff: the extras of the tour, on the tour screen
    await page.goto(`/tours/${tour.id}/edit`);
    await page.getByRole('tab', { name: /^Extras/ }).click();
    const editor = page.getByTestId('extras-editor');
    await expect(editor).toBeVisible();
    await editor.getByTestId('add-extra').click();
    await editor.getByTestId('add-extra').click();
    const rows = editor.getByTestId('extra-row');
    await expect(rows).toHaveCount(2);
    const fillRow = async (index: number, title: string, price: string, dayNumber: string, child?: string) => {
      const row = rows.nth(index);
      await row.getByTestId('extra-title').fill(title);
      await row.getByLabel('Price', { exact: true }).fill(price);
      await row.getByLabel('Day', { exact: true }).fill(dayNumber);
      if (child) await row.getByTestId('extra-band-child').getByRole('textbox').fill(child);
    };
    await fillRow(0, gondola, '50', '2', '30');
    await fillRow(1, dinner, '25', '3');
    await page.getByTestId('tour-save').click();
    await page.waitForURL(new RegExp(`/tours/${tour.id}$`), { timeout: 30_000 });
    await expect(page.getByTestId('tour-extras')).toContainText(gondola);
    const saved = (await api('GET', `/tours/${tour.id}/extras`)).data as Array<{ title: string; price: number; dayNumber: number | null; bandPrices: Record<string, number> | null }>;
    expect(saved.find((e) => e.title === gondola)).toMatchObject({ price: 50, dayNumber: 2, bandPrices: { child: 30 } });
    expect(saved.find((e) => e.title === dinner)).toMatchObject({ price: 25, dayNumber: 3, bandPrices: null });

    // ---- a departure with a party of two adults booked by staff (names to be completed by the customer)
    const startDate = day(120);
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate, capacityMode: 'manual', capacity: 20 })).data;
    expect((await api('POST', `/departures/${dep.id}/status`, { status: 'open' })).success).toBe(true);
    const booking = (await api('POST', `/departures/${dep.id}/bookings`, {
      contact: { name: `Family ${stamp}`, email },
      passengers: [{ firstName: 'Eva', dateOfBirth: '1985-03-01' }, { firstName: 'Jan', dateOfBirth: '1984-05-02' }],
    })).data;
    expect((await api('POST', `/seat-bookings/${booking.id}/confirm`, {})).success).toBe(true);

    // ---- staff make the link and send it through the Communication Hub
    await page.goto(`/departures/${dep.id}`);
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.locator('table tbody tr', { hasText: `Family ${stamp}` }).first().getByTestId('booking-status').click();
    await page.getByTestId('booking-drawer').getByTestId('drawer-traveller-link').click();
    const linkDialog = page.getByTestId('traveller-link-dialog');
    await expect(linkDialog).toBeVisible();
    const url = await linkDialog.getByTestId('traveller-link-url').inputValue();
    expect(url).toMatch(/\/trip\/[A-Za-z0-9_-]{22}$/);
    await linkDialog.getByTestId('traveller-link-send').click();
    const hub = page.getByRole('dialog').filter({ hasText: `To: Family ${stamp}` });
    await expect(hub).toBeVisible({ timeout: 15_000 });
    await hub.getByRole('button', { name: /Email/ }).first().click();
    await hub.getByText('Traveller details and extras', { exact: true }).click();
    await expect(hub.locator('textarea').first()).toHaveValue(new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?step=travellers`));
    await hub.getByRole('button', { name: /Preview/ }).click();
    await hub.getByRole('button', { name: /^Send Email/ }).click();

    let mail: { subject: string; to: string } | undefined;
    for (let i = 0; i < 90 && !mail; i++) {
      const res = await fetch(`${API_URL}/test/outbox?tenantId=${TENANT_ID}&kind=agency&to=${encodeURIComponent(email)}`);
      const body = (await res.json()) as { data: Array<{ subject: string; to: string }> };
      mail = body.data.find((m) => JSON.stringify(m).includes(url.split('/').pop()!));
      if (!mail) await new Promise((r) => setTimeout(r, 1000));
    }
    expect(mail, 'the message with the link is in the outbox').toBeTruthy();

    // ---- the customer: no session of the agency
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await anon.newPage();
    await guest.goto(`${url}?step=travellers`);
    await expect(guest.getByTestId('trip-header')).toContainText(`Canal Weekend ${stamp}`);
    await expect(guest.locator('a[href*="/login"]')).toHaveCount(0);
    expect(await guest.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');

    // step 1: two travellers as on the travel document
    const traveller = async (i: number, last: string, number: string, expiry: string, meal: string) => {
      const card = guest.getByTestId(`traveller-${i}`);
      await card.getByTestId(`t${i}-last`).fill(last);
      await card.getByTestId(`t${i}-x-nationality`).fill('Dutch');
      await card.getByTestId(`t${i}-x-documentNumber`).fill(number);
      await card.getByTestId(`t${i}-x-documentExpiry`).fill(expiry);
      await card.getByTestId(`t${i}-meal`).fill(meal);
    };
    await expect(guest.getByTestId('traveller-0').getByTestId('t0-first')).toHaveValue('Eva');
    await traveller(0, `de Vries ${stamp}`, 'NL1234567', '2031-06-01', 'vegetarian');
    // a first name that is blank is caught before anything is sent
    await guest.getByTestId('t1-first').fill('');
    await guest.getByTestId('travellers-save').click();
    await expect(guest.getByTestId('travellers-error')).toBeVisible();
    await guest.getByTestId('t1-first').fill('Jan');
    await traveller(1, `de Vries ${stamp}`, 'NL7654321', '2032-02-03', 'no pork');
    await guest.getByTestId('travellers-save').click();

    // step 2: extras on two days; a child price does not apply to adults, the total is 50 + 2 x 25
    await expect(guest.getByTestId('extras-step')).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId(`extra-${gondola}`)).toContainText(gondola);
    await guest.getByTestId(`more-${gondola}-Eva`).click();
    await guest.getByTestId(`more-${dinner}-Jan`).click();
    await guest.getByTestId(`more-${dinner}-Jan`).click();
    await expect(guest.getByTestId(`qty-${dinner}-Jan`)).toHaveText('2');
    await expect(guest.getByTestId('extras-total')).toContainText('100');
    await guest.getByTestId('extras-save').click();

    // step 3: review and pay on the test gateway
    await expect(guest.getByTestId('pay-step')).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId('pay-extras-due')).toContainText('100');
    await guest.getByTestId('pay-extras').click();
    await expect(guest.getByTestId('mock-amount')).toContainText('100');
    await guest.getByRole('button', { name: /^Pay / }).click();
    await guest.waitForURL(/\/trip\//, { timeout: 30_000 });
    await expect(guest.getByTestId('pay-nothing')).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId('pay-extras-paid')).toContainText('100');
    // R164-1: the way back from the pay page says what happened
    await expect(guest.getByTestId('payment-return')).toHaveAttribute('data-state', 'paid');
    await anon.close();

    // ---- staff see the travellers, the extras on the manifest, the paid extras invoice and the sales
    const detail = (await api('GET', `/seat-bookings/${booking.id}`)).data;
    expect(detail.passengers.map((p: { lastName: string }) => p.lastName)).toEqual([`de Vries ${stamp}`, `de Vries ${stamp}`]);
    expect(detail.passengers.every((p: { travellerId: string | null; documentsStatus: string }) => !!p.travellerId && p.documentsStatus === 'provided')).toBe(true);
    const eva = (await api('GET', `/travellers/${detail.passengers[0].travellerId}`)).data;
    expect(eva.passport_number ?? eva.passportNumber).toBe('NL1234567');
    expect(String(eva.passport_expiry_date ?? eva.passportExpiryDate)).toContain('2031-06-01');

    const manifest = (await api('GET', `/departures/${dep.id}/manifest?view=full`)).data;
    expect(manifest.columns.map((c: { key: string }) => c.key)).toContain('extras');
    const cells = Object.fromEntries(manifest.groups[0].rows.map((r: Record<string, string>) => [String(r.name).split(' ')[0], r.extras]));
    expect(cells.Eva).toBe(`${gondola} (2)`);
    expect(cells.Jan).toBe(`${dinner} x2 (3)`);

    await page.goto(`/departures/${dep.id}`);
    await page.getByRole('tab', { name: 'Extras' }).click();
    const effective = page.getByTestId('effective-extras');
    await expect(effective).toContainText(gondola);
    await expect(effective.locator('[data-testid="effective-extra"]', { hasText: dinner })).toContainText('2 chosen');
    await expect(page.getByTestId('extras-passengers')).toContainText('Paid');

    const extrasRows = (await api('GET', `/departures/${dep.id}/extras`)).data.passengers.flatMap((p: { choices: Array<{ invoiceId: string; status: string }> }) => p.choices);
    expect(extrasRows.every((c: { status: string }) => c.status === 'paid')).toBe(true);
    const invoice = (await api('GET', `/invoices/${extrasRows[0].invoiceId}`)).data;
    expect(Number(invoice.total)).toBe(100);
    expect(invoice.status).toBe('paid');

    // The report answer is cached per set of parameters: a page size of its own keeps a repeated run from reading an older answer.
    const pageSize = 100 + (parseInt(stamp, 36) % 100);
    const report = (await api('GET', `/reports/extras_sales?per_page=${pageSize}&date_from=2000-01-01&date_to=2099-12-31`)).data.data as Array<{ extra: string; quantity: number; revenue: number }>;
    expect(report.find((r) => r.extra === gondola)).toMatchObject({ quantity: 1, revenue: 50 });
    expect(report.find((r) => r.extra === dinner)).toMatchObject({ quantity: 2, revenue: 50 });
  });

  test('a passenger link shows one traveller, and an unknown link is a plain not-found page', async ({ browser }) => {
    const stamp = Date.now().toString(36).toUpperCase();
    expect((await api('PUT', '/departures/settings', { enabled: true })).success).toBe(true);
    const tour = (await api('POST', '/tours', { code: `SY-${stamp}`, title: `Solo Page ${stamp}`, durationDays: 2, currency: 'EUR' })).data;
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate: day(100), capacityMode: 'manual', capacity: 6 })).data;
    await api('POST', `/departures/${dep.id}/status`, { status: 'open' });
    const booking = (await api('POST', `/departures/${dep.id}/bookings`, {
      contact: { name: `Pair ${stamp}`, email: `pair.${stamp.toLowerCase()}@example.test` },
      passengers: [{ firstName: 'Anna', lastName: 'Pair' }, { firstName: 'Bram', lastName: 'Pair' }],
    })).data;
    const link = (await api('POST', `/seat-bookings/${booking.id}/self-service-link`, { scope: 'passenger', passengerId: booking.passengers[1].id })).data;

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await ctx.newPage();
    await guest.goto(link.tripUrl);
    await expect(guest.getByTestId('trip-personal')).toBeVisible();
    await expect(guest.getByTestId('traveller-0').getByTestId('t0-first')).toHaveValue('Bram');
    await expect(guest.getByTestId('traveller-1')).toHaveCount(0);

    await guest.goto(link.tripUrl.replace(/\/trip\/.+$/, '/trip/AAAAAAAAAAAAAAAAAAAAAA'));
    await expect(guest.getByTestId('booking-state-missing')).toBeVisible();
    await ctx.close();
  });
});
