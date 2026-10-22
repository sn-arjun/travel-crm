import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { API_URL, TENANT_ID, waitForLoad } from './helpers/auth';
import { api, seedContact, seedItineraryTemplate, seedLead, seedTraveller } from './helpers/api-seed';

// R149: agency age bands, a template priced by them, a quote filled from ages, from the lead's message and from travellers.

const STAMP = Date.now();
const TEMPLATE_TITLE = `Age band template ${STAMP}`;
const TRAVEL_DATE = '2032-07-10';

const LINES = [
  { title: 'Adult tour', price: 100, band: 'Adult (12+)' },
  { title: 'Child 6 to 11 tour', price: 60, band: 'Child 6 to 11 (6–11)' },
  { title: 'Child 4 to 5 tour', price: 40, band: 'Child 4 to 5 (4–5)' },
  { title: 'Child 0 to 3 tour', price: 10, band: 'Child 0 to 3 (0–3)' },
  { title: 'Transfer per person', price: 20, band: 'Per person (all travellers)' },
] as const;

async function searchTemplates(page: Page, term: string) {
  await page.getByPlaceholder(/Search templates/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

async function quantities(itineraryId: string): Promise<Record<string, number>> {
  const res = await api('GET', `/itineraries/${itineraryId}`);
  expect(res.success, JSON.stringify(res)).toBe(true);
  const out: Record<string, number> = {};
  for (const day of res.data.days) for (const item of day.items) out[item.title] = item.quantity;
  return out;
}

const totalOf = async (itineraryId: string): Promise<number> => (await api('GET', `/itineraries/${itineraryId}`)).data.totalSelling;

/** Opens "Use template" for the e2e template and creates a quote for the lead; returns the new itinerary id. */
async function createQuote(page: Page, leadTitle: string, title: string, party?: { adults: string; ages: string }): Promise<string> {
  await page.goto('/itineraries/templates');
  await waitForLoad(page);
  await searchTemplates(page, TEMPLATE_TITLE);
  const row = page.locator(`table tbody tr:has-text("${TEMPLATE_TITLE}")`).first();
  await row.hover();
  await row.locator('button[aria-label="Use template"]').click();

  const dialog = page.getByRole('dialog');
  await dialog.locator('#newTitle').fill(title);
  await dialog.getByRole('combobox', { name: 'Link to lead' }).click();
  await page.getByPlaceholder(/Search leads/i).fill(leadTitle);
  await page.getByRole('option', { name: new RegExp(leadTitle) }).click();
  if (party) {
    await dialog.locator('#partyAdults').fill(party.adults);
    await dialog.locator('#partyAges').fill(party.ages);
  }
  await dialog.getByRole('button', { name: /Create itinerary/i }).click();
  await page.waitForURL(/\/itineraries\/[0-9a-f-]{20,}$/, { timeout: 15_000 });
  await waitForLoad(page);
  return page.url().match(/\/itineraries\/([0-9a-f-]{20,})$/)![1];
}

test.describe('Age-band pricing', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await api('PUT', '/settings/age-bands', { bands: null });
  });

  test.afterAll(async () => {
    await api('PUT', '/settings/age-bands', { bands: null });
  });

  test('an admin sets four agency bands in Settings', async ({ page }) => {
    await page.goto('/settings/itinerary-defaults');
    await waitForLoad(page);
    const card = page.getByTestId('age-bands-card');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId('age-band-row')).toHaveCount(3);
    await expect(card.getByText('Using the standard bands')).toBeVisible();

    await card.getByLabel('Label of band 2').fill('Child 6 to 11');
    await card.getByLabel('Minimum age of band 2').fill('6');
    await card.getByLabel('Label of band 3').fill('Child 4 to 5');
    await card.getByLabel('Minimum age of band 3').fill('4');
    await card.getByTestId('age-band-add').click();
    await card.getByLabel('Label of band 4').fill('Child 0 to 3');
    await card.getByLabel('Minimum age of band 4').fill('0');
    await expect(card.getByTestId('age-band-range')).toHaveText(['12+', '6–11', '4–5', '0–3']);

    // A list that leaves out age 0 cannot be saved, and says why.
    await card.getByLabel('Minimum age of band 4').fill('1');
    await expect(card.getByRole('alert')).toHaveText('The youngest band must start at age 0.');
    await expect(card.getByTestId('age-bands-save')).toBeDisabled();
    await card.getByLabel('Minimum age of band 4').fill('0');

    await card.getByTestId('age-bands-save').click();
    await expect(page.getByText('Age bands saved').first()).toBeVisible();

    const saved = await api('GET', '/settings/age-bands');
    expect(saved.data.isDefault).toBe(false);
    expect(saved.data.bands.map((b: { minAge: number }) => b.minAge)).toEqual([12, 6, 4, 0]);
  });

  test('a template prices its lines by those bands', async ({ page }) => {
    await seedItineraryTemplate({
      title: TEMPLATE_TITLE,
      destination: 'Kerala',
      durationDays: 1,
      category: 'family',
      templateData: JSON.stringify({
        days: [{
          dayNumber: 1,
          title: 'Day one',
          items: LINES.map((l, i) => ({ type: 'activity', title: l.title, costPrice: 0, sellingPrice: l.price, quantity: 1, taxRate: 0, sortOrder: i })),
        }],
        inclusions: [],
        exclusions: [],
      }),
    });

    await page.goto('/itineraries/templates');
    await waitForLoad(page);
    await searchTemplates(page, TEMPLATE_TITLE);
    const row = page.locator(`table tbody tr:has-text("${TEMPLATE_TITLE}")`).first();
    await row.hover();
    await row.locator('button[aria-label="Preview"]').click();
    await page.getByTestId('template-age-bands').click();

    const dialog = page.getByTestId('template-bands-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Uses the agency's bands/)).toContainText('Child 0 to 3 (0–3)');
    for (const line of LINES) {
      await dialog.getByRole('combobox', { name: `Priced by, ${line.title}` }).click();
      await page.getByRole('option', { name: line.band, exact: true }).click();
    }
    await dialog.getByTestId('template-bands-save').click();
    await expect(page.getByText('Age bands saved on the template').first()).toBeVisible();

    const list = await api('GET', `/itinerary-templates?search=${encodeURIComponent(TEMPLATE_TITLE)}`);
    const id = list.data[0].id;
    const detail = await api('GET', `/itinerary-templates/${id}`);
    const types = detail.data.templateData.days[0].items.map((i: { paxType: string }) => i.paxType);
    expect(types).toEqual(['adult', 'child', 'infant', 'child_0_to_3', 'per_person']);
  });

  test('a quote made with the party has the right quantities and total', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Ages lead ${STAMP}`, destinations: ['Kerala'], travelDate: TRAVEL_DATE, paxAdults: 2, paxChildren: 2, tripType: 'family' });
    const id = await createQuote(page, lead.title, `Party quote ${STAMP}`, { adults: '2', ages: '8, 5' });

    // Two adults, one child of 8 (6-11), one of 5 (4-5), nobody under 4, four travellers.
    expect(await quantities(id)).toEqual({
      'Adult tour': 2, 'Child 6 to 11 tour': 1, 'Child 4 to 5 tour': 1, 'Child 0 to 3 tour': 0, 'Transfer per person': 4,
    });
    expect(await totalOf(id)).toBe(2 * 100 + 60 + 40 + 0 + 4 * 20);
  });

  test("a quote refills from the lead's message, then from travellers", async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Message lead ${STAMP}`, destinations: ['Kerala'], travelDate: TRAVEL_DATE, paxAdults: 2, paxChildren: 2, tripType: 'family' });
    // The customer writes in; the rule reader finds the children's ages.
    const inbound = await fetch(`${API_URL}/test/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        channel: 'whatsapp',
        from: contact.phone,
        fromName: contact.name,
        body: 'Hi, two adults and kids aged 8 and 5 would like a Kerala trip in July. Could you send a plan?',
      }),
    });
    expect(inbound.ok).toBe(true);

    // Made without the party: every line still has the template's quantity of 1.
    const id = await createQuote(page, lead.title, `Refill quote ${STAMP}`);
    expect(await quantities(id)).toEqual({
      'Adult tour': 1, 'Child 6 to 11 tour': 1, 'Child 4 to 5 tour': 1, 'Child 0 to 3 tour': 1, 'Transfer per person': 1,
    });

    await page.getByTestId('fill-quantities-action').click();
    const dialog = page.getByTestId('fill-quantities-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('fill-source-lead').click();
    await dialog.getByTestId('fill-preview-button').click();
    const preview = dialog.getByTestId('fill-preview');
    await expect(preview).toContainText('Adults: 2');
    await expect(preview).toContainText('Children: 8, 5');
    // Only the lines that change are listed: the two child bands that already hold one traveller stay out.
    await expect(preview.getByTestId('fill-line')).toHaveCount(3);
    await expect(preview.getByTestId('fill-line').filter({ hasText: 'Child 6 to 11 tour' })).toHaveCount(0);
    await expect(preview.getByTestId('fill-line').filter({ hasText: 'Child 0 to 3 tour' })).toContainText('0');
    // Previewing changed nothing yet.
    expect((await quantities(id))['Adult tour']).toBe(1);
    await dialog.getByTestId('fill-apply').click();
    await expect(dialog).toBeHidden();
    expect(await quantities(id)).toEqual({
      'Adult tour': 2, 'Child 6 to 11 tour': 1, 'Child 4 to 5 tour': 1, 'Child 0 to 3 tour': 0, 'Transfer per person': 4,
    });
    expect(await totalOf(id)).toBe(380);

    // Refill from the family's travellers: on the travel date they are 2 adults, a child of 8, one of 5 and one of 2.
    const born = ['1990-01-01', '1992-05-05', '2024-03-01', '2027-01-01', '2030-01-01'];
    for (const [i, dateOfBirth] of born.entries()) {
      await seedTraveller({ contactId: contact.id, firstName: `Fam${i}`, lastName: `T${STAMP}`, dateOfBirth });
    }
    await page.getByTestId('fill-quantities-action').click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('fill-source-travellers').click();
    for (let i = 0; i < born.length; i++) {
      await dialog.getByRole('combobox', { name: 'Travellers' }).click();
      await page.getByPlaceholder(/Search travellers by name/i).fill(`Fam${i}`);
      await page.getByRole('option', { name: new RegExp(`Fam${i} T${STAMP}`) }).click();
    }
    await dialog.getByTestId('fill-preview-button').click();
    const second = dialog.getByTestId('fill-preview');
    await expect(second).toContainText('Ages are measured on');
    await dialog.getByTestId('fill-apply').click();
    await expect(dialog).toBeHidden();
    expect(await quantities(id)).toEqual({
      'Adult tour': 2, 'Child 6 to 11 tour': 1, 'Child 4 to 5 tour': 1, 'Child 0 to 3 tour': 1, 'Transfer per person': 5,
    });
    expect(await totalOf(id)).toBe(2 * 100 + 60 + 40 + 10 + 5 * 20);
  });

  test('the builder shows which band each line is priced by', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: `Builder lead ${STAMP}`, destinations: ['Kerala'], travelDate: TRAVEL_DATE });
    const id = await createQuote(page, lead.title, `Builder quote ${STAMP}`, { adults: '2', ages: '8' });
    await page.goto(`/itineraries/${id}/edit`);
    await waitForLoad(page);
    const selects = page.getByTestId('item-priced-by');
    await expect(selects).toHaveCount(5, { timeout: 15_000 });
    await expect(selects.first()).toContainText('Adult (12+)');
    await expect(selects.nth(3)).toContainText('Child 0 to 3 (0–3)');
    await expect(selects.nth(4)).toContainText('Per person (all travellers)');
  });
});
