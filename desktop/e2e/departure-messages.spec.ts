import { test, expect } from './fixtures';
import { api } from './helpers/api-seed';
import { API_URL, TENANT_ID } from './helpers/auth';

// R154: messages that go out N days before or after a departure, each person with their own details. An agency adds the pickup-time
// rule on Settings > Group tours (a template, "2 days before at 00:00", each passenger, sends by itself), looks at the preview of a
// departure (two passengers, two pickup points, two different texts), runs the daily checks, and finds exactly one email per passenger
// in the local outbox with that passenger's own pickup time. Running the checks again sends nothing more.

const dayUtc = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

interface OutboxMail { to: string; subject: string }

async function mailsTo(email: string): Promise<OutboxMail[]> {
  const res = await fetch(`${API_URL}/test/outbox?tenantId=${TENANT_ID}&kind=agency&to=${encodeURIComponent(email)}`);
  return ((await res.json()) as { data: OutboxMail[] }).data;
}

async function waitForMail(email: string, text: string): Promise<OutboxMail> {
  for (let i = 0; i < 90; i++) {
    const found = (await mailsTo(email)).find((m) => JSON.stringify(m).includes(text));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no email to ${email} containing "${text}" in the outbox`);
}

// The agency's locale decides the clock style: 07:00 or 7:00 am.
const at = (time: string, place: string) => new RegExp(`0?${time}( am)? at ${place}`);

test.describe('Departure-relative messages', () => {
  test('a pickup-time rule sends each passenger their own pickup point and time, once', async ({ page }) => {
    test.setTimeout(300_000);
    const stamp = Date.now().toString(36).toUpperCase();
    const lower = stamp.toLowerCase();
    const evaMail = `eva.${lower}@pax.example.test`;
    const janMail = `jan.${lower}@pax.example.test`;
    const ruleName = `Pickup time ${stamp}`;
    const templateName = `Pickup mail ${stamp}`;

    // ---- rules a failed earlier run of this spec left behind would send to this departure too
    const stale = ((await api('GET', '/departure-message-rules?scope=agency')).data ?? []) as Array<{ id: string; name: string }>;
    for (const r of stale.filter((x) => /^Pickup time [A-Z0-9]{5,}$/.test(x.name))) await api('DELETE', `/departure-message-rules/${r.id}`);

    // ---- the agency: UTC, so "today" is the same day for the test and the server; group tours on
    const before = await api('GET', '/settings/company');
    const previousZone: string | undefined = before?.data?.timezone;
    await api('PUT', '/settings/company', { timezone: 'UTC' });
    expect((await api('PUT', '/departures/settings', { enabled: true })).success).toBe(true);

    try {
      // ---- a template with the departure variables, a tour with two pickup stops, a departure two days from now
      const template = (await api('POST', '/templates', {
        channel: 'email', name: templateName, subject: 'Pickup {pickup_time} for {tour_name}', category: 'reminder', language: 'en',
        content: 'Hi {first_name}, your pickup for {tour_name} is at {pickup_time} at {pickup_point}.',
      })).data;
      expect(template?.id).toBeTruthy();

      const tour = (await api('POST', '/tours', { code: `DM-${stamp}`, title: `Lake Tour ${stamp}`, destination: 'Switzerland', durationDays: 3, currency: 'EUR' })).data;
      const dep = (await api('POST', '/departures', { tourId: tour.id, startDate: dayUtc(2), startTime: '07:00', capacityMode: 'manual', capacity: 20 })).data;
      const stops = (await api('PUT', `/departures/${dep.id}/stops`, {
        stops: [
          { name: `Utrecht ${stamp}`, address: 'Stationsplein 1', localTime: '07:00' },
          { name: `Amersfoort ${stamp}`, address: 'Stationsplein 9', localTime: '07:40' },
        ],
      })).data as Array<{ id: string }>;
      expect((await api('POST', `/departures/${dep.id}/status`, { status: 'open' })).success).toBe(true);

      const eva = (await api('POST', '/travellers', { firstName: 'Eva', lastName: 'Visser', fullNamePassport: 'Eva Visser', email: evaMail, nationality: 'Dutch' })).data;
      const jan = (await api('POST', '/travellers', { firstName: 'Jan', lastName: 'Visser', fullNamePassport: 'Jan Visser', email: janMail, nationality: 'Dutch' })).data;
      const booking = (await api('POST', `/departures/${dep.id}/bookings`, {
        contact: { name: `Visser ${stamp}`, email: `visser.${lower}@example.test` },
        passengers: [
          { firstName: 'Eva', lastName: 'Visser', travellerId: eva.id, pickupStopId: stops[0]!.id },
          { firstName: 'Jan', lastName: 'Visser', travellerId: jan.id, pickupStopId: stops[1]!.id },
        ],
      })).data;
      expect((await api('POST', `/seat-bookings/${booking.id}/confirm`, {})).success).toBe(true);

      // ---- Settings > Group tours > Scheduled messages: add the rule
      await page.goto('/settings/group-tours');
      const section = page.getByTestId('scheduled-messages');
      await expect(section).toBeVisible({ timeout: 30_000 });
      await section.getByTestId('add-message-rule').first().click();
      const dialog = page.getByTestId('message-rule-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('#dm-name').fill(ruleName);
      await dialog.getByRole('combobox', { name: 'Template' }).click();
      await page.getByPlaceholder('Search templates').fill(templateName);
      await page.getByRole('option', { name: new RegExp(templateName) }).click();
      await dialog.locator('#dm-days').fill('2');
      await dialog.locator('#dm-time').fill('00:00');
      await dialog.locator('#dm-recipient').click();
      await page.getByRole('option', { name: 'Each passenger with an email or phone' }).click();
      await dialog.locator('#dm-mode').click();
      await page.getByRole('option', { name: 'Sends by itself' }).click();
      await expect(dialog.getByTestId('rule-sentence')).toContainText('Sends 2 days before departure at 00:00');
      await dialog.getByTestId('message-rule-save').click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });

      const row = section.getByTestId('message-rule-row').filter({ hasText: ruleName });
      await expect(row).toBeVisible();
      await expect(row.getByTestId('rule-when')).toHaveText('Sends 2 days before departure at 00:00');

      // ---- the preview: two people, two pickup points, two texts; nothing is sent by looking
      await row.getByTestId('rule-preview').click();
      const preview = page.getByTestId('message-preview');
      await expect(preview).toBeVisible();
      await preview.getByRole('combobox', { name: 'Departure' }).click();
      await page.getByPlaceholder(/Search/).last().fill(dep.code);
      await page.getByRole('option', { name: new RegExp(dep.code) }).first().click();
      const items = preview.getByTestId('preview-item');
      await expect(items).toHaveCount(2, { timeout: 20_000 });
      await expect(items.filter({ hasText: 'Eva Visser' })).toContainText(at('7:00', `Utrecht ${stamp}`));
      await expect(items.filter({ hasText: 'Jan Visser' })).toContainText(at('7:40', `Amersfoort ${stamp}`));
      await expect(items.filter({ hasText: 'Jan Visser' })).not.toContainText(/0?7:00/);
      await expect(preview.getByTestId('preview-send')).toContainText('Send 2 messages now');
      await page.keyboard.press('Escape');
      expect(await mailsTo(evaMail)).toHaveLength(0);

      // ---- "Run daily checks now" runs the job: one email per passenger, each with their own pickup
      expect((await api('POST', '/automations/run-scheduled')).success).toBe(true);
      const evaSent = await waitForMail(evaMail, `Utrecht ${stamp}`);
      const janSent = await waitForMail(janMail, `Amersfoort ${stamp}`);
      expect(evaSent.subject).toMatch(new RegExp(`^Pickup 0?7:00( am)? for Lake Tour ${stamp}$`));
      expect(janSent.subject).toMatch(new RegExp(`^Pickup 0?7:40( am)? for Lake Tour ${stamp}$`));
      expect(JSON.stringify(evaSent)).not.toMatch(/7:40/);
      expect(JSON.stringify(janSent)).not.toMatch(/7:00/);

      // ---- and never twice
      expect((await api('POST', '/automations/run-scheduled')).success).toBe(true);
      await new Promise((r) => setTimeout(r, 4000));
      expect(await mailsTo(evaMail)).toHaveLength(1);
      expect(await mailsTo(janMail)).toHaveLength(1);

      // ---- the preview now says who has been messaged
      await row.getByTestId('rule-preview').click();
      const again = page.getByTestId('message-preview');
      await again.getByRole('combobox', { name: 'Departure' }).click();
      await page.getByPlaceholder(/Search/).last().fill(dep.code);
      await page.getByRole('option', { name: new RegExp(dep.code) }).first().click();
      await expect(again.getByTestId('preview-item').filter({ hasText: 'Eva Visser' })).toContainText('Sent', { timeout: 20_000 });
      await expect(again.getByTestId('preview-send')).toBeDisabled();
      await page.keyboard.press('Escape');
    } finally {
      // the rule goes, so other specs on this stack are not affected
      const rules = ((await api('GET', '/departure-message-rules?scope=agency')).data ?? []) as Array<{ id: string; name: string }>;
      for (const r of rules.filter((x) => x.name === ruleName)) await api('DELETE', `/departure-message-rules/${r.id}`);
      if (previousZone) await api('PUT', '/settings/company', { timezone: previousZone });
    }
  });

  test('the template picker lists the departure variables when group tours are on, and the tour page has its own rules tab', async ({ page }) => {
    expect((await api('PUT', '/departures/settings', { enabled: true })).success).toBe(true);
    await page.goto('/communication/templates/new');
    const picker = page.getByTestId('departure-variables');
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await expect(picker).toContainText('{pickup_time}');
    await expect(picker).toContainText('{tour_leader_phone}');
    await picker.getByRole('button', { name: /Pickup time/ }).click();
    await expect(page.locator('textarea').first()).toHaveValue(/\{pickup_time\}/);

    const stamp = Date.now().toString(36).toUpperCase();
    const tour = (await api('POST', '/tours', { code: `DT-${stamp}`, title: `Tab Tour ${stamp}`, destination: 'Alps', durationDays: 2 })).data;
    await page.goto(`/tours/${tour.id}`);
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByTestId('scheduled-messages')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('scheduled-messages')).toContainText('Add rule');
    // the agency's starter rules apply to the tour and are listed (read-only here) until the tour has a rule of its own
    await expect(page.getByTestId('agency-message-rules')).toContainText('Pickup time');
  });
});
