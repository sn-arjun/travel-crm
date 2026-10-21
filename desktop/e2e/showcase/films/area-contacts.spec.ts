/** Film area-contacts: contacts, consent, merge, custom fields, travellers, documents (studio/clips/area-contacts.json). Demo admin. */
import * as path from 'node:path';

import * as D from '../demo-data';
import { api, asUser, beat, clickOn, expect, focus, glance, openRow, pause, pickDate, pickRelation, pickSelect, recordFilm, rows, scrollSteps, search, settle, typeInto, visit } from './film-kit';

const test = asUser();
const PDF = path.resolve(__dirname, '..', 'fixtures', 'nair-family-passports.pdf');

test.beforeAll(async () => {
  // Rohit was "entered twice": one copy exists before the take, the film adds the second and merges them.
  const have = rows(await api('GET', `/contacts?search=${encodeURIComponent('Rohit Bhatia')}`));
  if (!have.length) await api('POST', '/contacts', { name: 'Rohit Bhatia', phone: '+919811142500', email: 'rohit.b@example.com', city: 'New Delhi', country: 'India', source: 'walkin', type: 'customer' });
});

test('film:area-contacts', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-contacts', testInfo, async () => {
    await page.goto('/contacts');
    await settle(page, 1500);

    await beat(page, 'contacts-list', async () => {
      await search(page, /Search contacts/i, 'Nair');
      await typeInto(page, page.getByPlaceholder(/Search contacts/i).first(), '');
      await settle(page, 700);
      const tag = page.getByRole('combobox', { name: 'Filter by tag' });
      await focus(page, 'tag-filter', tag);
      await pickSelect(page, tag, 'family');
      await settle(page, 1200);
      await pickSelect(page, tag, /All tags/);
      await settle(page, 700);
    });

    await beat(page, 'contacts-new', async () => {
      await clickOn(page, page.getByRole('button', { name: /New Contact/ }));
      await page.waitForURL('**/contacts/new');
      await settle(page, 800);
      await typeInto(page, page.locator('#name'), 'Rohit Bhatia');
      await typeInto(page, page.locator('#email'), 'rohit.bhatia@example.com');
      const phone = page.locator('input[type="tel"]').first();
      await focus(page, 'phone-input', phone);
      await typeInto(page, phone, '9811142587');
      await pickSelect(page, page.locator('button#source'), 'Referral');
      await typeInto(page, page.locator('#city'), 'New Delhi');
      await glance(page, page.getByText(/already (exists|on file)|possible duplicate/i), 1200);
      await clickOn(page, page.getByRole('button', { name: /Save Contact/i }));
      await page.waitForURL('**/contacts', { timeout: 20_000 });
      await settle(page, 800);
    });

    await beat(page, 'contacts-detail', async () => {
      await search(page, /Search contacts/i, 'Priya Nair');
      await openRow(page, 'Priya Nair', /\/contacts\/[^/]+$/);
      await scrollSteps(page, 2, 400);
      await glance(page, page.getByRole('tab', { name: /Timeline|Activity/ }), 600);
      await page.mouse.wheel(0, -1500);
      await pause(page, 400);
    });

    await beat(page, 'contacts-consent', async () => {
      const card = page.getByTestId('contact-privacy');
      await card.scrollIntoViewIfNeeded();
      await focus(page, 'consent', card);
      await pause(page, 1200);
    });

    await beat(page, 'contacts-merge', async () => {
      await page.goto('/contacts/merge');
      await settle(page, 1100);
      const combos = page.getByRole('combobox');
      await pickRelation(page, combos.nth(0), /Search/i, 'Rohit', /rohit\.bhatia@example\.com|9811142587/);
      await pickRelation(page, combos.nth(1), /Search/i, 'Rohit', /rohit\.b@example\.com|9811142500/);
      await settle(page, 900);
      await clickOn(page, page.getByRole('button', { name: /^Merge/ }).last());
      const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
      if (await confirm.getByRole('button', { name: /Merge|Confirm/ }).count()) await clickOn(page, confirm.getByRole('button', { name: /Merge|Confirm/ }).last());
      await settle(page, 1200);
    });

    await beat(page, 'contacts-fields', async () => {
      await page.goto('/settings/custom-fields');
      await settle(page, 1300);
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'contacts-io', async () => {
      await page.goto('/contacts/import');
      await settle(page, 1300);
      await visit(page, '/contacts');
      await glance(page, page.getByRole('button', { name: /Export/ }), 900);
    });

    await beat(page, 'travellers', async () => {
      await visit(page, '/travellers');
      await page.goto('/travellers/new');
      await settle(page, 900);
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Select a contact/ }), 'Search contacts...', 'Priya', /Priya Nair/);
      await typeInto(page, page.locator('#firstName'), 'Aditi');
      await typeInto(page, page.locator('#lastName'), 'Nair');
      await pickDate(page, page.getByRole('button', { name: 'Pick date of birth' }), '2015-06-09');
      await typeInto(page, page.locator('#passportNumber'), 'Z7104421');
      await pickDate(page, page.getByRole('button', { name: 'Pick expiry date' }), '2029-06-08');
      await clickOn(page, page.getByRole('button', { name: /^save$/i }));
      await page.waitForURL(/\/travellers(\/[^/]+)?$/, { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'documents', async () => {
      await visit(page, '/documents');
      await clickOn(page, page.getByRole('button', { name: /Upload File/i }).first());
      await page.locator('input[type="file"]').setInputFiles(PDF);
      await settle(page, 600);
      await typeInto(page, page.locator('#doc-name'), 'Nair family: passport copies');
      await pickSelect(page, page.locator('#doc-category'), 'Passport');
      await clickOn(page, page.getByRole('button', { name: /^Upload$/i }));
      await expect(page.getByText('Document uploaded').first()).toBeVisible({ timeout: 15_000 });
      await settle(page, 900);
    });
  });
});

void D;
