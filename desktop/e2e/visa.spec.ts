/**
 * Visa applications — full E2E.
 *
 * Replaces 13-m13-travellers-visa.spec.ts. Its traveller sections already live in
 * travellers.spec.ts and its credit/debit-note sections in credit-debit-notes.spec.ts;
 * every visa assertion (CRUD, form comboboxes, list UX, detail, cross-entity prefill,
 * dashboard, sidebar, API schema) is carried forward below.
 *
 * A. Create via form UI (every field) -> list -> detail -> edit pre-fill -> edit -> delete
 * B. Form: validation, comboboxes filter + no raw ID input, URL prefill
 * C. List UX: columns, search, status filter, hover actions, row nav, delete confirm,
 *    bulk delete, export, infinite scroll, empty state, no mailto/wa.me/tel anchors
 * D. Detail: status, checklist, notes, documents (upload/download/delete), activity, delete
 * E. Dashboard
 * F. Cross-entity (traveller -> new visa), sidebar, API schema
 */
import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { pickDate as pickDateAt } from './helpers/date-picker';
import { api, seedTraveller } from './helpers/api-seed';
import * as fs from 'node:fs';

test.setTimeout(180_000);

const DATE_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const fmt = (d: Date) => d.toLocaleDateString('en-IN', DATE_FMT);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const visaIds: string[] = [];
const travellerIds: string[] = [];

test.afterAll(async () => {
  for (const id of visaIds) await api('DELETE', `/visa/${id}`).catch(() => undefined);
  for (const id of travellerIds) await api('DELETE', `/travellers/${id}`).catch(() => undefined);
});

// ─── helpers ──────────────────────────────────────────────────────────────────

async function newTraveller(tag: string, last = 'Visa') {
  const ts = Date.now();
  const t = await seedTraveller({
    firstName: `${tag}${ts}`,
    lastName: last,
    passportNumber: `VP${ts % 1e9}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 20),
  });
  if (!t?.id) throw new Error('traveller seed failed');
  travellerIds.push(t.id);
  return { id: t.id as string, first: `${tag}${ts}`, last, full: `${tag}${ts} ${last}`, passport: t.passportNumber ?? '' };
}

async function seedVisa(travellerId: string, o: Record<string, any> = {}) {
  const { appliedDate, visaExpiryDate, notes, ...create } = o;
  const res = await api('POST', '/visa', {
    travellerId,
    destinationCountry: 'Thailand',
    visaType: 'tourist',
    status: 'not_started',
    ...create,
  });
  const id = res?.data?.id as string;
  if (!id) throw new Error(`visa seed failed: ${JSON.stringify(res)}`);
  visaIds.push(id);
  const extra: Record<string, any> = {};
  if (appliedDate) extra.appliedDate = appliedDate;
  if (visaExpiryDate) extra.visaExpiryDate = visaExpiryDate;
  if (notes) extra.notes = notes;
  if (Object.keys(extra).length) await api('PUT', `/visa/${id}`, extra);
  return id;
}

/** Label-scoped field wrapper (FormRow renders label + control in one div). */
const field = (page: Page, label: RegExp) => page.locator('label', { hasText: label }).locator('..');
const F = {
  traveller: /^Traveller\s*\*?$/,
  country: /^Destination Country\s*\*?$/,
  type: /^Visa Type\s*\*?$/,
  applied: /^Application Date$/,
  expiry: /^Expiry Date$/,
  notes: /^Notes$/,
  status: /^Status\s*\*?$/,
};

/** Opens a DatePicker and walks the calendar to the target day. */
async function pickDate(page: Page, label: RegExp, target: Date) {
  await pickDateAt(page, field(page, label).getByRole('button').first(), target);
}

async function pickTraveller(page: Page, name: string, optionRe: RegExp = new RegExp(name)) {
  await field(page, F.traveller).getByRole('combobox').click();
  await page.getByPlaceholder(/search by name or passport/i).fill(name);
  await page.getByRole('option', { name: optionRe }).first().click();
}

async function pickCountry(page: Page, query: string, option: string) {
  await field(page, F.country).getByRole('combobox').click();
  await page.getByPlaceholder(/search countries/i).fill(query);
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function pickVisaType(page: Page, label: string) {
  await field(page, F.type).getByRole('combobox').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function search(page: Page, term: string) {
  await page.getByPlaceholder(/search by destination/i).fill(term);
  await page.waitForResponse((r) => r.url().includes('/visa') && r.request().method() === 'GET', { timeout: 10_000 }).catch(() => undefined);
  await waitForLoad(page);
}

const rowFor = (page: Page, text: string) => page.locator('tbody tr', { hasText: text });

const dd = (page: Page, label: string) =>
  page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd').first();

async function noOutboundAnchors(page: Page) {
  expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);
  expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
}

async function openDetailMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function visaByTraveller(travellerId: string) {
  const res = await api('GET', `/visa?traveller_id=${travellerId}`);
  return (res?.data?.data ?? []) as any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Full round trip through the form UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. Create → list → detail → edit → delete', () => {
  test('every field survives create, list, detail, edit pre-fill, edit and delete', async ({ page }) => {
    const t = await newTraveller('Flow', 'Round');
    const applied = daysFromNow(-3);
    const expiry = daysFromNow(90);
    const note = `Created via UI ${Date.now()}`;

    // ── CREATE ──
    await page.goto('/visa/new');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'New Visa Application' })).toBeVisible();

    await pickTraveller(page, t.first);
    await expect(field(page, F.traveller).getByRole('combobox')).toContainText(t.full);
    await pickCountry(page, 'Thai', 'Thailand');
    await pickVisaType(page, 'Business');
    await pickDate(page, F.applied, applied);
    await pickDate(page, F.expiry, expiry);
    await field(page, F.notes).locator('textarea').fill(note);

    await page.getByRole('button', { name: 'Create Application' }).click();
    await expect(page.getByText('Visa application created successfully!')).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/visa$/, { timeout: 15_000 });

    const [created] = await visaByTraveller(t.id);
    expect(created).toBeTruthy();
    visaIds.push(created.id);
    expect(created).toMatchObject({
      destination_country: 'Thailand',
      visa_type: 'business',
      status: 'not_started',
      applied_date: iso(applied),
      visa_expiry_date: iso(expiry),
      notes: note,
    });

    // ── LIST ──
    await waitForLoad(page);
    await search(page, 'Thailand');
    const row = rowFor(page, t.full);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Thailand');
    await expect(row).toContainText('Business');
    await expect(row).toContainText(fmt(applied));
    await expect(row).toContainText('Not Started');

    // ── DETAIL ──
    await row.click();
    await page.waitForURL(new RegExp(`/visa/${created.id}$`), { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: t.full })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Thailand · Business')).toBeVisible();
    await expect(dd(page, 'Name')).toHaveText(t.full);
    await expect(dd(page, 'Passport Number')).toHaveText(t.passport);
    await expect(dd(page, 'Country')).toHaveText('Thailand');
    await expect(dd(page, 'Visa Type')).toHaveText('Business');
    await expect(dd(page, 'Application Date')).toHaveText(fmt(applied));
    await expect(dd(page, 'Expiry Date')).toHaveText(fmt(expiry));
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByText('Not Started').first()).toBeVisible();
    const body = (await page.locator('main').first().textContent()) ?? '';
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('undefined');

    // ── EDIT: pre-filled ──
    await openDetailMenu(page, 'Edit');
    await page.waitForURL(new RegExp(`/visa/${created.id}/edit$`));
    await expect(page.getByRole('heading', { name: `Edit ${t.full}` })).toBeVisible({ timeout: 10_000 });
    await expect(field(page, F.traveller).getByRole('textbox')).toHaveValue(t.full);
    await expect(field(page, F.country).getByRole('textbox')).toHaveValue('Thailand');
    await expect(field(page, F.type).getByRole('textbox')).toHaveValue('Business');
    await expect(field(page, F.status).getByRole('combobox')).toHaveText('Not Started');
    await expect(field(page, F.applied).getByRole('button')).toContainText(fmt(applied));
    await expect(field(page, F.expiry).getByRole('button')).toContainText(fmt(expiry));
    await expect(field(page, F.notes).locator('textarea')).toHaveValue(note);

    // ── EDIT: change and save ──
    const newExpiry = daysFromNow(120);
    const newNote = `${note} (edited)`;
    await field(page, F.status).getByRole('combobox').click();
    await page.getByRole('option', { name: 'Applied', exact: true }).click();
    await pickDate(page, F.expiry, newExpiry);
    await field(page, F.notes).locator('textarea').fill(newNote);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Visa application updated')).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(new RegExp(`/visa/${created.id}$`), { timeout: 15_000 });

    await expect(dd(page, 'Expiry Date')).toHaveText(fmt(newExpiry), { timeout: 10_000 });
    await expect(page.getByText(newNote)).toBeVisible();
    await expect(page.getByText('Applied', { exact: true }).first()).toBeVisible();
    // GET /visa/:id replaces the `notes` column with the timeline array, so read the row from the list.
    const [persisted] = await visaByTraveller(t.id);
    expect(persisted).toMatchObject({ status: 'applied', visa_expiry_date: iso(newExpiry), notes: newNote });

    // ── DELETE ──
    await openDetailMenu(page, 'Delete');
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText(t.full);
    await expect(dlg).toContainText('This cannot be undone');
    await dlg.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForURL(/\/visa$/, { timeout: 15_000 });
    await waitForLoad(page);
    await search(page, 'Thailand');
    await expect(rowFor(page, t.full)).toHaveCount(0);
    expect((await api('GET', `/visa/${created.id}`)).data).toBeUndefined();
    expect(await visaByTraveller(t.id)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Form validation, comboboxes, URL prefill
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. Form', () => {
  test('submitting an empty form is blocked and each required field reports why', async ({ page }) => {
    await page.goto('/visa/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Create Application' }).click();

    await expect(page.getByText('Traveller is required').first()).toBeVisible();
    await expect(page.getByText('Destination country is required').first()).toBeVisible();
    await expect(page.getByText('Visa type is required').first()).toBeVisible();
    expect(page.url()).toContain('/visa/new');
  });

  test('traveller and destination are searchable comboboxes — typing filters options, no raw ID input', async ({ page }) => {
    const a = await newTraveller('ComboA');
    const b = await newTraveller('ComboB');
    await page.goto('/visa/new');
    await waitForLoad(page);

    // No raw ID inputs anywhere.
    await expect(page.getByPlaceholder(/traveller.*id/i)).toHaveCount(0);
    await expect(page.getByPlaceholder(/country.*id/i)).toHaveCount(0);
    await expect(page.locator('input[name="travellerId"], input#travellerId, input[name="destinationCountry"]')).toHaveCount(0);

    // Traveller: typing narrows to the matching traveller only.
    const travellerCombo = field(page, F.traveller).getByRole('combobox');
    await expect(travellerCombo).toContainText(/select a traveller/i);
    await travellerCombo.click();
    const tSearch = page.getByPlaceholder(/search by name or passport/i);
    await tSearch.fill(a.first);
    await expect(page.getByRole('option', { name: new RegExp(a.first) })).toHaveCount(1);
    await expect(page.getByRole('option', { name: new RegExp(b.first) })).toHaveCount(0);
    await tSearch.fill(b.first);
    await expect(page.getByRole('option', { name: new RegExp(b.first) })).toHaveCount(1);
    await expect(page.getByRole('option', { name: new RegExp(a.first) })).toHaveCount(0);
    await tSearch.fill(`NoSuchTraveller${Date.now()}`);
    await expect(page.getByText('No matches found.')).toBeVisible();
    await page.keyboard.press('Escape');

    // Destination: typing narrows the country list.
    await field(page, F.country).getByRole('combobox').click();
    const cSearch = page.getByPlaceholder(/search countries/i);
    await cSearch.fill('Thai');
    await expect(page.getByRole('option', { name: 'Thailand', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Japan', exact: true })).toHaveCount(0);
    await cSearch.fill('zzzz');
    await expect(page.getByText('No matches found.')).toBeVisible();
    await cSearch.fill('Ger');
    await expect(page.getByRole('option', { name: 'Germany', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Visa type offers exactly the types the backend accepts.
    await field(page, F.type).getByRole('combobox').click();
    for (const label of ['Tourist', 'Business', 'Transit', 'Student', 'Work', 'Medical']) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
  });

  test('?travellerId= pre-selects the traveller by name, and the prefilled form saves', async ({ page }) => {
    const t = await newTraveller('Prefill');
    await page.goto(`/visa/new?travellerId=${t.id}`);
    await waitForLoad(page);

    const combo = field(page, F.traveller).getByRole('combobox');
    await expect(combo).toContainText(t.full, { timeout: 10_000 });
    expect(await combo.textContent()).not.toMatch(/undefined|select a traveller/i);

    await pickCountry(page, 'Jap', 'Japan');
    await pickVisaType(page, 'Tourist');
    await page.getByRole('button', { name: 'Create Application' }).click();
    await page.waitForURL(/\/visa$/, { timeout: 15_000 });

    const [created] = await visaByTraveller(t.id);
    expect(created).toBeTruthy();
    visaIds.push(created.id);
    expect(created).toMatchObject({ traveller_id: t.id, destination_country: 'Japan', visa_type: 'tourist', status: 'not_started' });
  });

  test('a new application defaults to Not Started with today as the application date', async ({ page }) => {
    await page.goto('/visa/new');
    await waitForLoad(page);
    await expect(field(page, F.applied).getByRole('button')).toContainText(fmt(new Date()));
    await expect(field(page, F.expiry).getByRole('button')).toContainText(/pick a date/i);
    // There is no status control on create — it always starts at Not Started.
    await expect(field(page, F.status)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. List UX
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. List', () => {
  test('header, count, columns, filter bar and sidebar entry render', async ({ page }) => {
    const t = await newTraveller('Cols');
    await seedVisa(t.id);
    await page.goto('/visa');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: 'Visa Tracking' })).toBeVisible();
    await expect(page.getByRole('button', { name: /new application/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder(/search by destination/i)).toBeVisible();
    for (const col of ['Traveller', 'Destination', 'Type', 'Applied', 'Status']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(col) })).toBeVisible();
    }
    await expect(page.locator('aside a[href="/visa"]').first()).toBeVisible();
    await noOutboundAnchors(page);

    await page.getByRole('button', { name: /new application/i }).first().click();
    await page.waitForURL(/\/visa\/new$/);
  });

  test('search narrows rows by destination', async ({ page }) => {
    const ts = Date.now();
    const t = await newTraveller('Srch');
    await seedVisa(t.id, { destinationCountry: `Alpha${ts}land` });
    await seedVisa(t.id, { destinationCountry: `Beta${ts}land` });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, `Alpha${ts}`);
    await expect(rowFor(page, `Alpha${ts}land`)).toHaveCount(1);
    await expect(rowFor(page, `Beta${ts}land`)).toHaveCount(0);

    await search(page, `Beta${ts}`);
    await expect(rowFor(page, `Beta${ts}land`)).toHaveCount(1);
    await expect(rowFor(page, `Alpha${ts}land`)).toHaveCount(0);
  });

  test('status filter lists every status, narrows rows, shows the empty state and clears', async ({ page }) => {
    const ts = Date.now();
    const dest = `Stat${ts}land`;
    const t = await newTraveller('Stat');
    await seedVisa(t.id, { destinationCountry: dest, status: 'not_started', visaType: 'tourist' });
    await seedVisa(t.id, { destinationCountry: dest, status: 'approved', visaType: 'business' });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, dest);
    await expect(rowFor(page, dest)).toHaveCount(2);

    const statusFilter = page.getByRole('combobox').filter({ hasText: /all status/i });
    await statusFilter.click();
    for (const s of ['All Status', 'Not Started', 'Documents Collecting', 'Applied', 'Processing', 'Approved', 'Rejected']) {
      await expect(page.getByRole('option', { name: s, exact: true })).toBeVisible();
    }
    await page.getByRole('option', { name: 'Approved', exact: true }).click();
    await waitForLoad(page);
    await expect(rowFor(page, dest)).toHaveCount(1);
    await expect(rowFor(page, dest)).toContainText('Approved');
    await expect(rowFor(page, dest)).toContainText('Business');

    // Empty state when the filter matches nothing.
    await page.getByRole('combobox').filter({ hasText: /approved/i }).click();
    await page.getByRole('option', { name: 'Rejected', exact: true }).click();
    await expect(page.getByText('No visa applications yet')).toBeVisible({ timeout: 10_000 });

    // Clear filters restores both rows.
    await page.getByRole('button', { name: /clear/i }).first().click();
    await expect(rowFor(page, dest)).toHaveCount(2, { timeout: 10_000 });
  });

  test('empty state renders when the search matches nothing', async ({ page }) => {
    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, `NOMATCH_VISA_${Date.now()}`);
    await expect(page.getByText('No visa applications yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Create your first visa application to start tracking it.')).toBeVisible();
    await expect(page.getByRole('button', { name: /new application/i }).last()).toBeVisible();
  });

  test('hover reveals View / Edit / Delete and each one navigates or acts', async ({ page }) => {
    const ts = Date.now();
    const dest = `Hover${ts}land`;
    const t = await newTraveller('Hover');
    const id = await seedVisa(t.id, { destinationCountry: dest });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, dest);
    const row = rowFor(page, t.full);
    await expect(row).toHaveCount(1);
    await row.hover();
    for (const name of ['View', 'Edit', 'Delete']) {
      await expect(row.getByRole('button', { name })).toBeVisible();
    }

    await row.getByRole('button', { name: 'View' }).click();
    await page.waitForURL(new RegExp(`/visa/${id}$`));
    await page.goBack();
    await waitForLoad(page);
    await search(page, dest);
    await rowFor(page, t.full).hover();
    await rowFor(page, t.full).getByRole('button', { name: 'Edit' }).click();
    await page.waitForURL(new RegExp(`/visa/${id}/edit$`));
  });

  test('clicking a row opens the detail page', async ({ page }) => {
    const ts = Date.now();
    const dest = `Click${ts}land`;
    const t = await newTraveller('Click');
    const id = await seedVisa(t.id, { destinationCountry: dest });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, dest);
    await rowFor(page, t.full).click();
    await page.waitForURL(new RegExp(`/visa/${id}$`), { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: t.full })).toBeVisible({ timeout: 10_000 });
  });

  test('row Delete asks for confirmation: Cancel keeps the row, Delete removes it and the list refreshes', async ({ page }) => {
    const ts = Date.now();
    const dest = `DelRow${ts}land`;
    const t = await newTraveller('DelRow');
    const id = await seedVisa(t.id, { destinationCountry: dest });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, dest);
    const row = rowFor(page, t.full);
    await row.hover();
    await row.getByRole('button', { name: 'Delete' }).click();

    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText(t.full);
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toBeHidden();
    await expect(row).toHaveCount(1);
    expect((await api('GET', `/visa/${id}`)).data?.id).toBe(id);

    await row.hover();
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Visa record deleted')).toBeVisible({ timeout: 10_000 });
    await expect(row).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `/visa/${id}`)).data).toBeUndefined();
  });

  test('bulk select + delete removes the selected rows', async ({ page }) => {
    const ts = Date.now();
    const dest = `Bulk${ts}land`;
    const t = await newTraveller('Bulk');
    await seedVisa(t.id, { destinationCountry: dest });
    await seedVisa(t.id, { destinationCountry: dest });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, dest);
    await expect(rowFor(page, dest)).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'Select all rows' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('2 visa record(s) deleted')).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, dest)).toHaveCount(0, { timeout: 10_000 });
    expect(await visaByTraveller(t.id)).toHaveLength(0);
  });

  test('export downloads a non-empty, correctly-shaped CSV', async ({ page }) => {
    const ts = Date.now();
    const t = await newTraveller('Exp', 'Csv');
    await seedVisa(t.id, {
      destinationCountry: `Exp${ts}land`,
      visaType: 'student',
      appliedDate: iso(daysFromNow(-1)),
      visaExpiryDate: iso(daysFromNow(200)),
    });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, `Exp${ts}land`);
    await expect(rowFor(page, t.full)).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('visa-applications.csv');
    const body = fs.readFileSync((await download.path())!, 'utf8');
    expect(body.length).toBeGreaterThan(0);
    expect(body.split('\n')[0]).toBe('Traveller,Destination,Visa Type,Application Date,Expiry Date,Status');
    const line = body.split('\n').find((l) => l.includes(`Exp${ts}land`));
    expect(line).toBeTruthy();
    expect(line).toContain(`"${t.full}"`);
    expect(line).toContain('"Student"');
    expect(line).toContain(`"${iso(daysFromNow(-1))}"`);
    expect(line).toContain(`"${iso(daysFromNow(200))}"`);
    expect(line).toContain('"not_started"');
    expect(body).not.toMatch(/undefined|NaN/);
  });

  test('infinite scroll loads the next page when the sentinel is reached', async ({ page }) => {
    const ts = Date.now();
    const dest = `Scroll${ts}land`;
    const t = await newTraveller('Scroll');
    for (let i = 0; i < 25; i++) await seedVisa(t.id, { destinationCountry: dest });

    await page.goto('/visa');
    await waitForLoad(page);
    await search(page, dest);
    const rows = page.locator('tbody tr[tabindex]');
    await expect(rows).toHaveCount(20);

    await page.locator('tbody').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => document.querySelectorAll('main, [class*="overflow"]').forEach((e) => ((e as HTMLElement).scrollTop = (e as HTMLElement).scrollHeight)));
    await expect(rows).toHaveCount(25, { timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('D. Detail', () => {
  test('header shows traveller, destination · type and status; missing optionals render a dash, not undefined', async ({ page }) => {
    const t = await newTraveller('Hdr');
    const id = await seedVisa(t.id, { destinationCountry: 'Germany', visaType: 'business', status: 'processing' });

    await page.goto(`/visa/${id}`);
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: t.full })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Germany · Business')).toBeVisible();
    await expect(page.getByText('Processing', { exact: true }).first()).toBeVisible();
    await expect(dd(page, 'Expiry Date')).toHaveText('—');
    await expect(page.getByText('No notes yet.')).toBeVisible();
    const body = (await page.locator('main').first().textContent()) ?? '';
    expect(body).not.toMatch(/undefined|NaN/);
    await noOutboundAnchors(page);

    // Tabs: Overview, Activity, Documents.
    for (const tab of ['Overview', 'Activity', 'Documents']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }
  });

  test('every status renders its own label on the detail page', async ({ page }) => {
    const t = await newTraveller('Stt');
    const labels: Record<string, string> = {
      not_started: 'Not Started',
      documents_collecting: 'Docs Collecting',
      applied: 'Applied',
      processing: 'Processing',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    for (const [status, label] of Object.entries(labels)) {
      const id = await seedVisa(t.id, { status });
      await page.goto(`/visa/${id}`);
      await waitForLoad(page);
      await expect(page.getByRole('heading', { name: t.full })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('checklist is auto-generated; ticking items updates progress, persists, and advances the status', async ({ page }) => {
    const t = await newTraveller('Chk');
    const id = await seedVisa(t.id, { destinationCountry: 'Japan', visaType: 'tourist' });
    const items = (await api('GET', `/visa/${id}`)).data.checklist as any[];
    expect(items.length).toBeGreaterThan(0);

    await page.goto(`/visa/${id}`);
    await waitForLoad(page);
    await expect(page.getByText(`0/${items.length} completed`)).toBeVisible({ timeout: 10_000 });
    for (const i of items) await expect(page.getByRole('button', { name: i.document_name })).toBeVisible();

    await page.getByRole('button', { name: items[0].document_name }).click();
    await expect(page.getByText('Item completed')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`1/${items.length} completed`)).toBeVisible();
    // First tick on a Not Started application moves it to Docs Collecting.
    await expect(page.getByText('Docs Collecting', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    const after = (await api('GET', `/visa/${id}`)).data;
    expect(after.status).toBe('documents_collecting');
    expect(after.checklist.find((c: any) => c.id === items[0].id).is_received).toBe(1);

    // Survives reload.
    await page.reload();
    await waitForLoad(page);
    await expect(page.getByText(`1/${items.length} completed`)).toBeVisible({ timeout: 10_000 });

    // Un-tick.
    await page.getByRole('button', { name: items[0].document_name }).click();
    await expect(page.getByText('Item unchecked')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`0/${items.length} completed`)).toBeVisible();
  });

  test('notes can be edited, cancelled and saved, and persist', async ({ page }) => {
    const t = await newTraveller('Nts');
    const id = await seedVisa(t.id, { notes: 'Original note' });
    const next = `Updated note ${Date.now()}`;

    await page.goto(`/visa/${id}`);
    await waitForLoad(page);
    await expect(page.getByText('Original note')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const box = page.getByPlaceholder(/add notes about this visa application/i);
    await expect(box).toHaveValue('Original note');
    await box.fill('Discarded');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Original note')).toBeVisible();
    await expect(page.getByText('Discarded')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByPlaceholder(/add notes about this visa application/i).fill(next);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Notes saved')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(next)).toBeVisible();
    expect((await visaByTraveller(t.id))[0].notes).toBe(next);

    await page.reload();
    await waitForLoad(page);
    await expect(page.getByText(next)).toBeVisible({ timeout: 10_000 });
  });

  test('documents: upload, list, download and delete', async ({ page }) => {
    const t = await newTraveller('Doc');
    const id = await seedVisa(t.id);
    const fileName = `passport-${Date.now()}.pdf`;
    const content = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

    await page.goto(`/visa/${id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByText('No documents uploaded yet')).toBeVisible();

    // Pick a type, then upload.
    await page.getByRole('combobox').filter({ hasText: /other/i }).click();
    await page.getByRole('option', { name: 'Passport Copy', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: content });
    await expect(page.getByText('Document uploaded successfully')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(fileName)).toBeVisible();
    await expect(page.getByText('Passport Copy').last()).toBeVisible();
    await expect(page.getByText(/\d+(\.\d)? (B|KB)/)).toBeVisible();

    const docs = (await api('GET', `/visa/${id}/documents`)).data as any[];
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ file_name: fileName, document_type: 'passport', mime_type: 'application/pdf' });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(fileName);
    expect(fs.readFileSync((await download.path())!).equals(content)).toBe(true);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Document deleted')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(fileName)).toHaveCount(0);
    await expect(page.getByText('No documents uploaded yet')).toBeVisible();
    expect((await api('GET', `/visa/${id}/documents`)).data).toHaveLength(0);
  });

  test('documents: a disallowed file type is rejected client-side', async ({ page }) => {
    const t = await newTraveller('BadDoc');
    const id = await seedVisa(t.id);
    await page.goto(`/visa/${id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Documents' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'evil.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await expect(page.getByText(/file type not allowed|not allowed|accepted/i).first()).toBeVisible({ timeout: 10_000 });
    expect((await api('GET', `/visa/${id}/documents`)).data).toHaveLength(0);
  });

  test('activity tab shows created and current status', async ({ page }) => {
    const t = await newTraveller('Act');
    const id = await seedVisa(t.id, { status: 'applied', appliedDate: iso(daysFromNow(-2)) });
    await page.goto(`/visa/${id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByText('Application created')).toBeVisible();
    await expect(page.getByText('Application submitted')).toBeVisible();
    await expect(page.getByText('Status: Applied')).toBeVisible();
  });

  test('delete asks for confirmation: Cancel keeps the record, Delete removes it and returns to the list', async ({ page }) => {
    const t = await newTraveller('DelDet');
    const id = await seedVisa(t.id);
    await page.goto(`/visa/${id}`);
    await waitForLoad(page);

    await openDetailMenu(page, 'Delete');
    await expect(page.getByRole('dialog')).toContainText('This cannot be undone');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(page.url()).toContain(`/visa/${id}`);

    await openDetailMenu(page, 'Delete');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForURL(/\/visa$/, { timeout: 15_000 });
    expect((await api('GET', `/visa/${id}`)).data).toBeUndefined();
  });

  test('an unknown id shows the error state with a way back, not a crash', async ({ page }) => {
    await page.goto('/visa/00000000-0000-7000-8000-00000000dead');
    await expect(page.getByText('Failed to load visa record')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Back to Visa' }).click();
    await page.waitForURL(/\/visa$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Dashboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('E. Dashboard', () => {
  test('stats match the API, upcoming deadlines and by-country render real data and link to detail', async ({ page }) => {
    const ts = Date.now();
    const dest = `Dash${ts}land`;
    const t = await newTraveller('Dash');
    const id = await seedVisa(t.id, { destinationCountry: dest, status: 'applied', visaExpiryDate: iso(daysFromNow(10)) });

    await page.goto('/visa/dashboard');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Visa Dashboard' })).toBeVisible({ timeout: 10_000 });

    const summary = (await api('GET', '/visa/dashboard')).data;
    await expect(page.getByText(`${summary.total} total applications`)).toBeVisible();
    const stat = (label: string) => page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=../following-sibling::p').first();
    await expect(stat('Applied')).toHaveText(String(summary.statusCounts.applied ?? 0));
    await expect(stat('Approved')).toHaveText(String(summary.statusCounts.approved ?? 0));
    await expect(stat('Rejected')).toHaveText(String(summary.statusCounts.rejected ?? 0));
    await expect(stat('Not Started')).toHaveText(String(summary.statusCounts.not_started ?? 0));

    const deadline = page.getByRole('button', { name: new RegExp(`${t.full}.*${dest}`) });
    await expect(deadline).toBeVisible();
    await expect(deadline).toContainText(/\(\d+d\)/);
    await expect(page.getByText(dest).first()).toBeVisible();
    await expect(page.getByText('Applications by Country')).toBeVisible();
    const body = (await page.locator('main').first().textContent()) ?? '';
    expect(body).not.toMatch(/undefined|NaN/);

    await deadline.click();
    await page.waitForURL(new RegExp(`/visa/${id}$`));
  });

  test('View All Applications goes to the list', async ({ page }) => {
    await page.goto('/visa/dashboard');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'View All Applications' }).click();
    await page.waitForURL(/\/visa$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Cross-entity, API schema
// ─────────────────────────────────────────────────────────────────────────────

test.describe('F. Cross-entity and API', () => {
  test('traveller detail → New visa application opens the form with that traveller selected; the new visa appears on the traveller', async ({ page }) => {
    const t = await newTraveller('Cross');
    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Related' }).click();
    await page.getByRole('button', { name: /new visa application/i }).click();
    await page.waitForURL(/\/visa\/new\?/);
    expect(page.url()).toContain(`travellerId=${t.id}`);

    const combo = field(page, F.traveller).getByRole('combobox');
    await expect(combo).toContainText(t.full, { timeout: 10_000 });

    await pickCountry(page, 'Fra', 'France');
    await pickVisaType(page, 'Tourist');
    await page.getByRole('button', { name: 'Create Application' }).click();
    await page.waitForURL(/\/visa$/, { timeout: 15_000 });
    const [created] = await visaByTraveller(t.id);
    visaIds.push(created.id);

    await page.goto(`/travellers/${t.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('France').first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar entry navigates to the visa list', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    await page.locator('aside a[href="/visa"]').first().click();
    await page.waitForURL(/\/visa$/);
    await expect(page.getByRole('heading', { name: 'Visa Tracking' })).toBeVisible();
  });

  test('API: create returns an id and the destination; no invoice linkage; enforces the visa type enum', async () => {
    const t = await newTraveller('Schema');
    const ok = await api('POST', '/visa', { travellerId: t.id, destinationCountry: 'France', visaType: 'tourist' });
    expect(ok.data.id).toBeTruthy();
    visaIds.push(ok.data.id);
    expect(ok.data.destinationCountry).toBe('France');
    expect(ok.data.invoiceId).toBeUndefined();
    expect(ok.data.invoice_id).toBeUndefined();

    const stored = (await api('GET', `/visa/${ok.data.id}`)).data;
    expect(stored.status).toBe('not_started');
    expect(stored.invoice_id).toBeUndefined();

    const bad = await api('POST', '/visa', { travellerId: t.id, destinationCountry: 'France', visaType: 'Visit' });
    expect(bad.data?.id).toBeUndefined();
  });

  test('API: status transitions are validated and approval needs visa details', async () => {
    const t = await newTraveller('Trans');
    const id = await seedVisa(t.id);
    const skip = await api('PUT', `/visa/${id}/status`, { status: 'approved' });
    expect(skip.error).toMatch(/Cannot transition/);

    expect((await api('PUT', `/visa/${id}/status`, { status: 'documents_collecting' })).data.status).toBe('documents_collecting');
    expect((await api('PUT', `/visa/${id}/status`, { status: 'applied' })).data.status).toBe('applied');
    expect((await api('PUT', `/visa/${id}/status`, { status: 'processing' })).data.status).toBe('processing');
    const noDetails = await api('PUT', `/visa/${id}/status`, { status: 'approved' });
    expect(noDetails.error).toMatch(/required for approval/);
    const approved = await api('PUT', `/visa/${id}/status`, {
      status: 'approved', visaNumber: 'V123', visaIssueDate: iso(new Date()), visaExpiryDate: iso(daysFromNow(365)),
    });
    expect(approved.data.status).toBe('approved');
    expect(approved.data.visa_number).toBe('V123');
  });
});
