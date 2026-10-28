/**
 * Travellers — full E2E.
 *
 * Replaces 10-travellers-visa.spec.ts and the traveller sections of
 * 13-m13-travellers-visa.spec.ts (visa / credit-note / debit-note sections of
 * the latter belong to the visa and credit-debit-notes slices).
 *
 * A. Create via form UI -> list -> detail -> edit pre-fill -> edit -> delete
 * B. Form validation, comboboxes, URL prefill
 * C. List UX: search, columns, hover actions, row nav, delete confirm, export,
 *    infinite scroll, empty state, passport-expiry tags
 * D. Detail: tabs, link/unlink contact, messaging, visa relation, documents
 * E. API schema
 */
import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { pickDate as pickDateAt, localDay } from './helpers/date-picker';
import { api, seedContact, seedTraveller } from './helpers/api-seed';
import * as fs from 'node:fs';

test.setTimeout(180_000);

const DATE_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const fmt = (d: Date) => d.toLocaleDateString('en-IN', DATE_FMT);

const createdIds: string[] = [];

test.afterAll(async () => {
  for (const id of createdIds) await api('DELETE', `/travellers/${id}`).catch(() => undefined);
});

async function track<T extends { id?: string }>(t: T): Promise<T> {
  if (t?.id) createdIds.push(t.id);
  return t;
}

async function search(page: Page, term: string) {
  const box = page.getByPlaceholder(/search by name or passport/i);
  await box.fill(term);
  // ListPage debounces by 300ms and refetches from page 1.
  await page.waitForResponse((r) => r.url().includes('/travellers') && r.request().method() === 'GET', { timeout: 10_000 }).catch(() => undefined);
  await waitForLoad(page);
}

/** Opens a DatePicker by its placeholder/label text and picks the target day by clicking the calendar. */
async function pickDate(page: Page, trigger: string | RegExp, target: Date) {
  await pickDateAt(page, page.getByRole('button', { name: trigger }), target);
}

/** The Combobox trigger has no accessible name, so locate it through its field label. */
function nationalityCombobox(page: Page) {
  return page.locator('label', { hasText: /^Nationality$/ }).locator('..').getByRole('combobox');
}

async function pickNationality(page: Page, search: string, option: string) {
  await nationalityCombobox(page).click();
  const input = page.getByPlaceholder('Search nationality...');
  await input.fill(search);
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function pickContact(page: Page, name: string) {
  await page.getByRole('combobox').filter({ hasText: /select a contact/i }).click();
  await page.getByPlaceholder('Search contacts...').fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).first().click();
}

function noOutboundAnchors(page: Page) {
  return Promise.all([
    expect(page.locator('a[href^="mailto:"]')).toHaveCount(0),
    expect(page.locator('a[href^="tel:"]')).toHaveCount(0),
    expect(page.locator('a[href*="wa.me"]')).toHaveCount(0),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Full round trip
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Travellers: full round trip', () => {
  test('create with every field -> list -> detail -> edit pre-fill -> edit -> delete', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `TvlrContact ${ts}` });
    const firstName = `RtFirst${ts}`;
    const lastName = `RtLast${ts}`;
    const passport = `RT${ts}`.slice(0, 20).toUpperCase();
    const email = `rt-${ts}@e2e.test`;
    const typedPhone = '98765 43210';
    // PhoneInput normalises to E.164 (default +91 country code), so that is what is stored and shown.
    const phone = '+919876543210';
    const now = new Date();
    const dob = new Date(1990, 5, 15);
    const expiry = new Date(now.getFullYear() + 2, 8, 20);

    // ── Create via the form UI ──
    await page.goto('/travellers/new');
    await waitForLoad(page);
    await pickContact(page, contact.name);
    await page.locator('#firstName').fill(firstName);
    await page.locator('#lastName').fill(lastName);
    await pickDate(page, /pick date of birth/i, dob);
    await pickNationality(page, 'Ind', 'Indian');
    await page.locator('#passportNumber').fill(passport.toLowerCase()); // field upper-cases
    await expect(page.locator('#passportNumber')).toHaveValue(passport);
    await pickDate(page, /pick expiry date/i, expiry);
    await page.locator('#email').fill(email);
    await page.locator('input[type="tel"]').fill(typedPhone);
    await page.getByRole('button', { name: /^save$/i }).click();

    // Must not match /travellers/new (still on the form) — wait for the real uuid.
    await expect(page).toHaveURL(/\/travellers\/(?!new$)[\w-]{20,}$/, { timeout: 30_000 });
    const id = page.url().split('/').pop()!;
    createdIds.push(id);

    // ── List: every column value is present ──
    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, passport);
    const row = page.locator('tbody tr', { hasText: firstName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${firstName} ${lastName}`);
    await expect(row).toContainText(passport);
    await expect(row).toContainText('Indian');
    await expect(row).toContainText(fmt(dob));
    await expect(row).toContainText(fmt(expiry));
    expect(await row.textContent()).not.toMatch(/NaN|undefined|Invalid Date/);

    // ── Detail: every value that persists (linked contact is not a list column) ──
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${id}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${firstName} ${lastName}`);
    const main = page.locator('main');
    await expect(main.getByText(firstName, { exact: true })).toBeVisible();
    await expect(main.getByText(lastName, { exact: true })).toBeVisible();
    await expect(main.getByText(fmt(dob), { exact: true })).toBeVisible();
    await expect(main.getByText('Indian').first()).toBeVisible();
    await expect(page.locator('.font-mono').filter({ hasText: passport }).first()).toBeVisible();
    await expect(main.getByText(fmt(expiry), { exact: true })).toBeVisible();
    await expect(main.getByText(contact.name, { exact: true })).toBeVisible();
    expect(await main.textContent()).not.toMatch(/NaN|undefined|Invalid Date/);

    // ── Edit form: every field pre-filled ──
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${id}/edit$`), { timeout: 30_000 });
    await expect(page.locator('#firstName')).toHaveValue(firstName);
    await expect(page.locator('#lastName')).toHaveValue(lastName);
    await expect(page.locator('#passportNumber')).toHaveValue(passport);
    await expect(nationalityCombobox(page)).toHaveText('Indian');
    await expect(page.getByRole('button', { name: fmt(dob) })).toBeVisible();
    await expect(page.getByRole('button', { name: fmt(expiry) })).toBeVisible();

    // ── Edit, save, persisted ──
    const newLast = `Upd${ts}`;

    await page.locator('#lastName').fill(newLast);
    // (email/phone are covered separately in 'email and phone persist' — the backend does not store them yet)
    await pickNationality(page, 'Thai', 'Thai');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${id}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${firstName} ${newLast}`);
    await expect(main.getByText(`${firstName} ${newLast}`).first()).toBeVisible();
    await expect(main.getByText('Thai').first()).toBeVisible();
    // Untouched values survive the edit — including the linked contact, which the edit form does not carry.
    await expect(main.getByText(fmt(dob), { exact: true })).toBeVisible();
    await expect(main.getByText(fmt(expiry), { exact: true })).toBeVisible();
    await expect(main.getByText(contact.name, { exact: true })).toBeVisible();
    await page.reload();
    await waitForLoad(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${firstName} ${newLast}`);

    // ── Delete from detail ──
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText(`${firstName} ${newLast}`);
    await dlg.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/travellers$/, { timeout: 30_000 });
    await waitForLoad(page);
    await search(page, passport);
    await expect(page.getByText('No travellers yet')).toBeVisible();
    const gone = await api('GET', `/travellers/${id}`);
    expect(gone?.success).not.toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Form
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Travellers: form', () => {
  test('email and phone entered in the form persist and show on the detail and edit pages', async ({ page }) => {
    const ts = Date.now();
    const email = `ep-${ts}@e2e.test`;
    const typedPhone = '98765 43210';
    // PhoneInput normalises to E.164 (default +91 country code), so that is what is stored and shown.
    const phone = '+919876543210';
    await page.goto('/travellers/new');
    await waitForLoad(page);
    await page.locator('#firstName').fill(`EmailPhone${ts}`);
    await page.locator('#lastName').fill('Persist');
    await page.locator('#passportNumber').fill(`EP${ts}`.slice(0, 20));
    await page.locator('#email').fill(email);
    await page.locator('input[type="tel"]').fill(typedPhone);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page).toHaveURL(/\/travellers\/(?!new$)[\w-]{20,}$/, { timeout: 30_000 });
    const id = page.url().split('/').pop()!;
    createdIds.push(id);

    const main = page.locator('main');
    await expect(main.getByText(email, { exact: true })).toBeVisible();
    await expect(main.getByText(phone, { exact: true })).toBeVisible();
    const saved = await api('GET', `/travellers/${id}`);
    expect(saved.data?.email).toBe(email);
    expect(saved.data?.phone).toBe(phone);

    await page.goto(`/travellers/${id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#email')).toHaveValue(email);
    await expect(page.locator('input[type="tel"]')).toHaveValue(phone);
    await page.locator('#email').fill(`new-${email}`);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${id}$`), { timeout: 30_000 });
    await expect(main.getByText(`new-${email}`, { exact: true })).toBeVisible();
  });

  test('required fields and email format block submit with inline errors', async ({ page }) => {
    await page.goto('/travellers/new');
    await waitForLoad(page);

    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Passport number is required')).toBeVisible();
    expect(page.url()).toContain('/travellers/new');

    await page.locator('#firstName').fill('Only');
    await page.locator('#passportNumber').fill('ZZ1');
    await page.locator('#email').fill('not-an-email');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
    expect(page.url()).toContain('/travellers/new');
  });

  test('nationality is a searchable combobox that filters options', async ({ page }) => {
    await page.goto('/travellers/new');
    await waitForLoad(page);

    await expect(nationalityCombobox(page)).toHaveText(/select nationality/i);
    await nationalityCombobox(page).click();
    await page.getByPlaceholder('Search nationality...').fill('Ind');
    await expect(page.getByRole('option', { name: 'Indian', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Indonesian', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Thai', exact: true })).toHaveCount(0);
    await page.getByPlaceholder('Search nationality...').fill('zzzzzz');
    await expect(page.getByText('No results found.')).toBeVisible();
    await expect(page.getByPlaceholder(/nationality.*id/i)).toHaveCount(0);
  });

  test('contact is a searchable relation combobox, not a raw id input', async ({ page }) => {
    const ts = Date.now();
    const a = await seedContact({ name: `RelAlpha ${ts}` });
    await seedContact({ name: `RelBeta ${ts}` });

    await page.goto('/travellers/new');
    await waitForLoad(page);
    await expect(page.locator('input[name="contactId"], #contactId')).toHaveCount(0);
    await expect(page.getByPlaceholder(/contact.*id/i)).toHaveCount(0);

    await page.getByRole('combobox').filter({ hasText: /select a contact/i }).click();
    await page.getByPlaceholder('Search contacts...').fill(`RelAlpha ${ts}`);
    await expect(page.getByRole('option', { name: new RegExp(`RelAlpha ${ts}`) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(`RelBeta ${ts}`) })).toHaveCount(0);
    await page.getByRole('option', { name: new RegExp(`RelAlpha ${ts}`) }).click();
    await expect(page.getByRole('combobox').filter({ hasText: a.name })).toBeVisible();
  });

  test('phone uses PhoneInput with a country-code picker', async ({ page }) => {
    await page.goto('/travellers/new');
    await waitForLoad(page);
    await expect(page.getByRole('combobox').filter({ hasText: '+91' })).toBeVisible();
    await page.locator('input[type="tel"]').fill('98a76-5 4x3210');
    await expect(page.locator('input[type="tel"]')).toHaveValue('9876-5 43210');
  });

  test('?contactId prefills the contact combobox with the contact name', async ({ page }) => {
    const contact = await seedContact({ name: `Prefill ${Date.now()}` });
    await page.goto(`/travellers/new?contactId=${contact.id}`);
    await waitForLoad(page);
    await expect(page.getByRole('combobox').filter({ hasText: contact.name })).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. List
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Travellers: list', () => {
  test('header, add button, search box, columns and sidebar entry', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.locator('aside a[href="/travellers"]').first()).toBeVisible();
    await page.locator('aside a[href="/travellers"]').first().click();
    await expect(page).toHaveURL(/\/travellers$/, { timeout: 30_000 });
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: 'Travellers', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /add traveller/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Search by name or passport number...')).toBeVisible();
    for (const col of ['Name', 'Passport Number', 'Nationality', 'Date of Birth', 'Passport Expiry']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(col) })).toBeVisible();
    }
    await page.getByRole('button', { name: /add traveller/i }).first().click();
    await expect(page).toHaveURL(/\/travellers\/new$/, { timeout: 30_000 });
  });

  test('search narrows by name and by passport number; no match shows empty state', async ({ page }) => {
    const ts = Date.now();
    const a = await track(await seedTraveller({ firstName: `SrchAlpha${ts}`, lastName: 'One', passportNumber: `SA${ts}`.slice(0, 20) }));
    const b = await track(await seedTraveller({ firstName: `SrchBeta${ts}`, lastName: 'Two', passportNumber: `SB${ts}`.slice(0, 20) }));

    await page.goto('/travellers');
    await waitForLoad(page);

    await search(page, `SrchAlpha${ts}`);
    await expect(page.locator('tbody tr', { hasText: `SrchAlpha${ts}` })).toHaveCount(1);
    await expect(page.locator('tbody tr', { hasText: `SrchBeta${ts}` })).toHaveCount(0);

    await search(page, `SB${ts}`.slice(0, 20));
    await expect(page.locator('tbody tr', { hasText: `SrchBeta${ts}` })).toHaveCount(1);
    await expect(page.locator('tbody tr', { hasText: `SrchAlpha${ts}` })).toHaveCount(0);

    await search(page, 'NOMATCH_TRAVELLER_XYZ999');
    await expect(page.getByText('No travellers yet')).toBeVisible();
    await expect(page.locator('tbody tr[tabindex]')).toHaveCount(0);
    expect(a.id && b.id).toBeTruthy();
  });

  test('hover reveals View / Edit / Delete; row click and View open detail; Edit opens edit page', async ({ page }) => {
    const ts = Date.now();
    const t = await track(await seedTraveller({ firstName: `Hov${ts}`, lastName: 'Row', passportNumber: `HV${ts}`.slice(0, 20) }));

    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, `Hov${ts}`);
    const row = page.locator('tbody tr', { hasText: `Hov${ts}` });
    await row.hover();
    await expect(row.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible();

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${t.id}/edit$`), { timeout: 30_000 });

    await page.goBack();
    await waitForLoad(page);
    await search(page, `Hov${ts}`);
    await row.hover();
    await row.getByRole('button', { name: 'View' }).click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${t.id}$`), { timeout: 30_000 });

    await page.goBack();
    await waitForLoad(page);
    await search(page, `Hov${ts}`);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/travellers/${t.id}$`), { timeout: 30_000 });
  });

  test('row Delete asks for confirmation; Cancel keeps the row, Delete removes it', async ({ page }) => {
    const ts = Date.now();
    const t = await seedTraveller({ firstName: `DelRow${ts}`, lastName: 'X', passportNumber: `DR${ts}`.slice(0, 20) });
    createdIds.push(t.id);

    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, `DelRow${ts}`);
    const row = page.locator('tbody tr', { hasText: `DelRow${ts}` });
    await row.hover();
    await row.getByRole('button', { name: 'Delete' }).click();

    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText(`DelRow${ts}`);
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toBeHidden();
    await expect(row).toHaveCount(1);
    expect((await api('GET', `/travellers/${t.id}`)).success).not.toBe(false);

    await row.hover();
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    // ListPage remounts to refetch after a delete, which resets the search box — so verify via
    // the API and a fresh search rather than on the (now unfiltered) list.
    await expect(page.getByText(`DelRow${ts} X deleted`)).toBeVisible({ timeout: 10_000 });
    expect((await api('GET', `/travellers/${t.id}`)).success).not.toBe(true);
    await search(page, `DelRow${ts}`);
    await expect(page.getByText('No travellers yet')).toBeVisible();
  });

  test('passport expiry tag: valid, expiring soon and expired all render real dates', async ({ page }) => {
    const ts = Date.now();
    const day = 86_400_000;
    const iso = (offset: number) => localDay(new Date(Date.now() + offset * day));
    await track(await seedTraveller({ firstName: `ExpOk${ts}`, lastName: 'T', passportNumber: `EO${ts}`.slice(0, 20), passportExpiryDate: iso(900) }));
    await track(await seedTraveller({ firstName: `ExpSoon${ts}`, lastName: 'T', passportNumber: `ES${ts}`.slice(0, 20), passportExpiryDate: iso(90) }));
    await track(await seedTraveller({ firstName: `ExpGone${ts}`, lastName: 'T', passportNumber: `EG${ts}`.slice(0, 20), passportExpiryDate: iso(-30) }));

    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, `Exp`);
    for (const n of ['ExpOk', 'ExpSoon', 'ExpGone']) {
      const row = page.locator('tbody tr', { hasText: `${n}${ts}` });
      await expect(row).toHaveCount(1);
      const text = (await row.textContent()) ?? '';
      expect(text).not.toMatch(/NaN|undefined|Invalid Date/);
      expect(text).toMatch(/\d{1,2} \w{3,4} \d{4}/);
    }
    // Tones differ: soon = warning, expired = danger, valid = success.
    const cls = async (n: string) =>
      page.locator('tbody tr', { hasText: `${n}${ts}` }).locator('td').nth(5).locator('span').first().getAttribute('class');
    const [ok, soon, gone] = [await cls('ExpOk'), await cls('ExpSoon'), await cls('ExpGone')];
    expect(new Set([ok, soon, gone]).size).toBe(3);
  });

  test('export downloads a non-empty CSV containing the visible rows', async ({ page }) => {
    const ts = Date.now();
    await track(await seedTraveller({ firstName: `Exp${ts}`, lastName: 'Csv', passportNumber: `XP${ts}`.slice(0, 20), nationality: 'Indian' }));

    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, `Exp${ts}`);
    await expect(page.locator('tbody tr', { hasText: `Exp${ts}` })).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^travellers_export_\d{4}-\d{2}-\d{2}\.csv$/);
    const path = await download.path();
    const body = fs.readFileSync(path!, 'utf8');
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('First Name,Last Name,Passport Number,Nationality,Date of Birth,Passport Expiry,Email,Phone');
    expect(body).toContain(`"Exp${ts}"`);
    expect(body).toContain(`"XP${ts}"`.slice(0, 22));
  });

  test('bulk select + delete removes the selected rows', async ({ page }) => {
    const ts = Date.now();
    for (let i = 0; i < 2; i++) await seedTraveller({ firstName: `Bulk${ts}x${i}`, lastName: 'B', passportNumber: `BK${ts}${i}`.slice(0, 20) });

    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, `Bulk${ts}`);
    await expect(page.locator('tbody tr', { hasText: `Bulk${ts}` })).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'Select all rows' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();
    // ListPage remounts once the deletes finish (resetting search) — wait for that before searching.
    await expect(page.getByText('2 traveller(s) deleted')).toBeVisible({ timeout: 10_000 });
    await search(page, `Bulk${ts}`);
    await expect(page.getByText('No travellers yet')).toBeVisible({ timeout: 10_000 });
    const left = await api('GET', `/travellers?search=Bulk${ts}`);
    expect(left?.data?.pagination?.total ?? left?.data?.data?.length ?? 0).toBe(0);
  });

  test('infinite scroll loads the next page when the sentinel is reached', async ({ page }) => {
    const ts = Date.now();
    for (let i = 0; i < 25; i++) {
      await track(await seedTraveller({
        firstName: `Scroll${ts}n${String(i).padStart(2, '0')}`,
        lastName: 'S',
        passportNumber: `SC${ts % 1e8}${i}`.slice(0, 20),
      }));
    }

    await page.goto('/travellers');
    await waitForLoad(page);
    await search(page, `Scroll${ts}`);
    const rows = page.locator('tbody tr[tabindex]');
    await expect(rows).toHaveCount(20);

    await page.locator('tbody').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => document.querySelectorAll('main, [class*="overflow"]').forEach((e) => ((e as HTMLElement).scrollTop = (e as HTMLElement).scrollHeight)));
    await expect(rows).toHaveCount(25, { timeout: 15_000 });
  });

  test('messaging is never a mailto:/tel:/wa.me anchor on the list', async ({ page }) => {
    await page.goto('/travellers');
    await waitForLoad(page);
    await noOutboundAnchors(page);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Detail
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Travellers: detail', () => {
  test('tabs, header, passport in mono font, no undefined/NaN', async ({ page }) => {
    const ts = Date.now();
    const passport = `HD${ts}`.slice(0, 20);
    const t = await track(await seedTraveller({ firstName: `Head${ts}`, lastName: 'E2E', passportNumber: passport, nationality: 'Indian' }));

    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Head${ts} E2E`);
    await expect(page.getByText(`${passport} · Indian`)).toBeVisible();
    await expect(page.locator('.font-mono').filter({ hasText: passport }).first()).toBeVisible();
    for (const tab of ['Overview', 'Related', 'Documents']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }
    expect(await page.locator('main').textContent()).not.toMatch(/NaN|undefined|Invalid Date/);
  });

  test('passport status tag reflects valid vs expired', async ({ page }) => {
    const ts = Date.now();
    const iso = (days: number) => localDay(new Date(Date.now() + days * 86_400_000));
    const ok = await track(await seedTraveller({ firstName: `Valid${ts}`, passportNumber: `PV${ts}`.slice(0, 20), passportExpiryDate: iso(500) }));
    const bad = await track(await seedTraveller({ firstName: `Expired${ts}`, passportNumber: `PX${ts}`.slice(0, 20), passportExpiryDate: iso(-10) }));

    await page.goto(`/travellers/${ok.id}`);
    await expect(page.getByText(/Passport valid till \d{1,2} \w{3,4} \d{4}/)).toBeVisible();
    await page.goto(`/travellers/${bad.id}`);
    await expect(page.getByText('Passport expired')).toBeVisible();
  });

  test('link and unlink a contact via the Link Contact dialog', async ({ page }) => {
    const ts = Date.now();
    const contact = await seedContact({ name: `LinkMe ${ts}` });
    const t = await track(await seedTraveller({ firstName: `Link${ts}`, passportNumber: `LK${ts}`.slice(0, 20) }));

    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await expect(page.getByText('No contact linked yet')).toBeVisible();

    await page.getByRole('button', { name: 'Link contact' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('button', { name: 'Link Contact' })).toBeDisabled();
    await expect(dlg.locator('input[name="contactId"]')).toHaveCount(0);
    await dlg.getByRole('combobox').click();
    await page.getByPlaceholder('Search contacts...').fill(`LinkMe ${ts}`);
    await page.getByRole('option', { name: new RegExp(`LinkMe ${ts}`) }).first().click();
    await dlg.getByRole('button', { name: 'Link Contact' }).click();

    await expect(page.locator('main').getByText(`LinkMe ${ts}`, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'View contact' })).toBeVisible();
    const linked = await api('GET', `/travellers/${t.id}`);
    expect((linked.data?.contactId ?? linked.data?.contact_id)).toBe(contact.id);

    await page.getByRole('button', { name: 'Unlink', exact: true }).click();
    await expect(page.getByText('No contact linked yet')).toBeVisible({ timeout: 10_000 });
    const unlinked = await api('GET', `/travellers/${t.id}`);
    expect(unlinked.data?.contactId ?? unlinked.data?.contact_id ?? null).toBeNull();
  });

  test('Send message opens SendMessageDialog; no mailto:/tel:/wa.me anchors on detail', async ({ page }) => {
    const ts = Date.now();
    const t = await track(await seedTraveller({
      firstName: `Msg${ts}`, passportNumber: `MS${ts}`.slice(0, 20), email: `msg-${ts}@e2e.test`, phone: '9876543210',
    }));

    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await noOutboundAnchors(page);
    await page.getByRole('button', { name: 'Send message' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(`Msg${ts}`);
    await noOutboundAnchors(page);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('Related tab lists the traveller\'s visa applications; New visa application carries the traveller', async ({ page }) => {
    const ts = Date.now();
    const t = await track(await seedTraveller({ firstName: `Visa${ts}`, lastName: 'Rel', passportNumber: `VR${ts}`.slice(0, 20) }));
    const visa = await api('POST', '/visa', { travellerId: t.id, destinationCountry: 'Thailand', visaType: 'tourist' });
    expect(visa?.data?.id ?? visa?.id).toBeTruthy();

    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('Visa Applications', { exact: true })).toBeVisible();
    const vrow = page.locator('tbody tr', { hasText: 'Thailand' });
    await expect(vrow).toHaveCount(1);
    await expect(vrow).toContainText(/tourist/i);

    await vrow.click();
    await expect(page).toHaveURL(/\/visa\/[\w-]+$/, { timeout: 30_000 });
    await page.goBack();
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Related' }).click();
    await page.getByRole('button', { name: /new visa application/i }).click();
    await expect(page).toHaveURL(/\/visa\/new\?/, { timeout: 30_000 });
    expect(page.url()).toContain(`travellerId=${t.id}`);
    expect(page.url()).toContain('travellerName=');
    await waitForLoad(page);
    await expect(page.getByRole('combobox').first()).not.toHaveText(/^\s*$/);
  });

  test('traveller without visas shows the empty related state', async ({ page }) => {
    const t = await track(await seedTraveller({ firstName: `NoVisa${Date.now()}` }));
    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('No visa applications found')).toBeVisible();
  });

  test('Documents tab uploads, lists and deletes a traveller document', async ({ page }) => {
    const t = await track(await seedTraveller({ firstName: `Docs${Date.now()}` }));
    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByText('No documents uploaded yet')).toBeVisible();

    const name = `passport-scan-${Date.now()}.pdf`;
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'),
    });
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Failed to upload document')).toHaveCount(0);

    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 10_000 });
  });

  test('deleting from detail asks for confirmation first; Cancel keeps the traveller', async ({ page }) => {
    const ts = Date.now();
    const t = await track(await seedTraveller({ firstName: `DelDet${ts}`, passportNumber: `DD${ts}`.slice(0, 20) }));
    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toContainText('This cannot be undone');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(page.url()).toContain(`/travellers/${t.id}`);
    expect((await api('GET', `/travellers/${t.id}`)).data?.id).toBe(t.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. API schema
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Travellers: API', () => {
  test('seeded traveller has id + name fields and none of another entity\'s fields', async () => {
    const ts = Date.now();
    const t = await track(await seedTraveller({ firstName: `Schema${ts}`, lastName: 'E2E', passportNumber: `SH${ts}`.slice(0, 20) }));
    expect(t.id).toBeTruthy();
    expect(t.first_name ?? t.firstName).toBe(`Schema${ts}`);
    expect((t as any).voucherNumber).toBeUndefined();
    expect((t as any).companyName).toBeUndefined();
  });
});
