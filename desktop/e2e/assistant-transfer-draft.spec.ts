import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedContact, seedDriver, seedLead, seedVehicle } from './helpers/api-seed';

const SHOTS = process.env.E2E_SHOTS_DIR;

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

test.describe('Assistant: arrival transfer and drafted messages', () => {
  test.describe.configure({ mode: 'serial' });
  let leadId = '';

  test.beforeAll(async () => {
    const stamp = Date.now().toString(36).toUpperCase();
    // At least one vehicle that seats the group and one driver exist; the assistant picks whichever is free.
    await seedVehicle({ registrationNumber: `KL 07 ${stamp}`, type: 'muv', make: 'Toyota', model: 'Innova Crysta', seatingCapacity: 7 });
    await seedDriver({ name: `Aaa Transfer Driver ${stamp}` });
    const contact = await seedContact({ name: 'Transfer Family' });
    const lead = await seedLead(contact.id, { title: 'Transfer check trip', travelDate: day(3), paxAdults: 2, paxChildren: 2, destinations: ['Kumarakom'] });
    leadId = lead.id;
    const won = await api('PUT', `/leads/${leadId}/status`, { status: 'won' });
    expect(won.success ?? !!won.data).toBeTruthy();
  });

  test('a confirmed booking near its travel date offers a pre-filled transfer form', async ({ page }) => {
    await page.goto(`/leads/${leadId}`);
    await waitForLoad(page);
    const card = page.locator('[data-testid="assistant-suggestion"][data-action="open_prefilled_form"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('Transfer Family');
    await expect(card).toContainText('Vehicle');
    await expect(card).toContainText('Driver');
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/transfer-card.png` });

    await card.getByRole('button', { name: 'Open trip form' }).click();
    await page.waitForURL('**/fleet/trips/new?**');
    await waitForLoad(page);
    const url = new URL(page.url());
    expect(url.searchParams.get('leadId')).toBe(leadId);
    expect(url.searchParams.get('passengerName')).toBe('Transfer Family');
    expect(url.searchParams.get('vehicleId')).toBeTruthy();
    expect(url.searchParams.get('driverId')).toBeTruthy();
    expect(url.searchParams.get('date')).toBe(day(3));
    // The form shows the values, not just the address bar.
    await expect(page.getByPlaceholder('Enter drop location')).toHaveValue('Kumarakom', { timeout: 15_000 });
    const vehicle = await api('GET', `/fleet/vehicles/${url.searchParams.get('vehicleId')}`);
    const driver = await api('GET', `/fleet/drivers/${url.searchParams.get('driverId')}`);
    expect(vehicle.data.seatingCapacity).toBeGreaterThanOrEqual(5); // four passengers and the driver
    await expect(page.getByText(vehicle.data.registrationNumber).first()).toBeVisible();
    await expect(page.getByText(driver.data.name).first()).toBeVisible();
    await expect(page.getByText('Pick a date')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/transfer-form.png`, fullPage: true });

    // Nothing was booked by opening the form.
    const trips = await api('GET', `/fleet/trips?leadId=${leadId}`);
    const list = (trips.data?.items ?? trips.data ?? []) as Array<{ leadId?: string | null }>;
    expect(list.filter((t) => t.leadId === leadId)).toHaveLength(0);
  });

  test('the drafted request opens in the send dialog, where AI drafting degrades cleanly when it is off', async ({ page }) => {
    await page.goto(`/leads/${leadId}`);
    await waitForLoad(page);
    const draft = page.locator('[data-testid="assistant-suggestion"][data-action="draft_reply"]').filter({ hasText: /traveller/i }).first();
    await expect(draft).toBeVisible({ timeout: 20_000 });
    await draft.getByRole('button', { name: 'Review and send' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('#msg-ai-brief')).toBeVisible();
    if (SHOTS) await dialog.screenshot({ path: `${SHOTS}/send-dialog.png` });

    await dialog.getByRole('button', { name: 'Draft', exact: true }).click();
    await expect(page.getByText('Say in a few words what the message should cover')).toBeVisible();

    await dialog.locator('#msg-ai-brief').fill('ask for passport copies by Friday');
    await dialog.getByRole('button', { name: 'Draft', exact: true }).click();
    // This stack runs without the AI binding: the dialog says so and keeps the message that was there.
    await expect(page.getByText(/AI drafting is not available right now|Draft ready/)).toBeVisible({ timeout: 30_000 });
    await expect(dialog.locator('textarea').first()).not.toHaveValue('');
  });
});
