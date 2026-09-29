/**
 * Import & Export — real E2E.
 *
 * Replaces 16-m16-import-export.spec.ts and 20-import-export.spec.ts.
 * Covers: /import wizard (4 steps), /settings/import (templates, 3-step wizard,
 * import history ListPage), /settings/export (contacts, leads, full export,
 * job table), invoice bulk PDF export, and the "no mailto/wa.me/tel" rule.
 */
import { test, expect, type Page, type Download } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { getAuthToken, API_URL } from './helpers/auth';
import { api, seedContact, seedLead, seedInvoice } from './helpers/api-seed';

const RUN = Date.now();
const tmpFiles: string[] = [];

// ─── helpers ────────────────────────────────────────────────────────────────

function csvText(headers: string[], rows: string[][]) {
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function writeCsv(fileName: string, headers: string[], rows: string[][]): string {
  const p = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(p, csvText(headers, rows), 'utf8');
  tmpFiles.push(p);
  return p;
}

async function apiUploadCsv(type: string, fileName: string, headers: string[], rows: string[][]): Promise<string> {
  const token = await getAuthToken();
  const fd = new FormData();
  fd.append('file', new Blob([csvText(headers, rows)], { type: 'text/csv' }), fileName);
  fd.append('importType', type);
  fd.append('skipHeader', 'true');
  const res = await fetch(`${API_URL}/imports/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json: any = await res.json();
  const jobId = json?.data?.jobId;
  if (!jobId) throw new Error(`API upload failed: ${JSON.stringify(json)}`);
  return jobId;
}

async function jobStatus(jobId: string): Promise<any> {
  const res = await api('GET', `/imports/${jobId}/progress`);
  return res.data;
}

async function waitForJobDone(jobId: string) {
  await expect
    .poll(async () => (await jobStatus(jobId))?.status, { timeout: 60_000, intervals: [500, 1000, 2000] })
    .toMatch(/^(completed|failed|cancelled)$/);
  return jobStatus(jobId);
}

function listOf(res: any): any[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

async function saveDownload(dl: Download): Promise<{ name: string; buf: Buffer }> {
  const p = await dl.path();
  expect(p, 'download must be saved to disk').toBeTruthy();
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(p!) };
}

/** Concatenate the text of every text-like entry inside an OOXML/zip buffer. */
function unzipText(buf: Buffer): string {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd, 'buffer is a zip archive').toBeGreaterThanOrEqual(0);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  let out = '';
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    if (/\.(xml|csv|json|txt)$/i.test(name)) {
      out += (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    off += 46 + nlen + elen + clen;
  }
  return out;
}

const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

async function goto(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('aside').first()).toBeVisible();
}

// ─── /import wizard helpers ─────────────────────────────────────────────────

const nextBtn = (page: Page) => page.getByRole('button', { name: /^Next/ });
const typeCard = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`${label}$`) });

async function uploadStep(page: Page, label: string, csvPath: string): Promise<string> {
  await typeCard(page, label).click();
  await page.locator('#fileInput').setInputFiles(csvPath);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/imports/upload') && r.request().method() === 'POST'),
    nextBtn(page).click(),
  ]);
  const json: any = await res.json();
  expect(json?.data?.jobId, 'upload returns a job id').toBeTruthy();
  await expect(page.getByText(/Step 2 of 4/)).toBeVisible();
  return json.data.jobId;
}

async function counter(page: Page, label: string) {
  return Number(await page.getByText(label, { exact: true }).locator('xpath=preceding-sibling::p').innerText());
}

async function runWizard(page: Page, label: string, csvPath: string, strategy: 'Skip Duplicates' | 'Update Existing' | 'Create New') {
  await goto(page, '/import');
  const jobId = await uploadStep(page, label, csvPath);
  await nextBtn(page).click(); // → preview
  await expect(page.getByText(/Step 3 of 4/)).toBeVisible();
  await page.getByText(strategy, { exact: true }).click();
  await nextBtn(page).click(); // → summary
  await expect(page.getByText(/Step 4 of 4/)).toBeVisible();
  await page.getByRole('button', { name: 'Start Import' }).click();
  await expect(page.getByText('Import Complete', { exact: true })).toBeVisible({ timeout: 60_000 });
  return {
    jobId,
    imported: await counter(page, 'Imported'),
    duplicates: await counter(page, 'Duplicates'),
    errors: await counter(page, 'Errors'),
  };
}

// ─── fixtures ───────────────────────────────────────────────────────────────

const CONTACT_HEADERS = ['First Name', 'Last Name', 'Email', 'Phone', 'Company'];
const phoneBase = 9_000_000_000 + (RUN % 90_000_000);
const contactRows = (company: string) => [
  [`Alice${RUN}`, 'Smith', `alice.${RUN}@e2e-import.test`, `+91${phoneBase + 1}`, company],
  [`Bob${RUN}`, 'Jones', `bob.${RUN}@e2e-import.test`, `+91${phoneBase + 2}`, company],
  [`Cara${RUN}`, 'Lee', `cara.${RUN}@e2e-import.test`, `+91${phoneBase + 3}`, company],
  [`Dan${RUN}`, 'Broken', 'not-an-email', `+91${phoneBase + 4}`, company],
];
const MAIN_FILE = `contacts-${RUN}-main.csv`;
let mainJobId = '';

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  for (const f of tmpFiles) fs.rmSync(f, { force: true });
});

// ─── A. navigation ──────────────────────────────────────────────────────────

test('sidebar Import / Export link opens the import wizard', async ({ page }) => {
  await goto(page, '/');
  await page.locator('aside a[href="/import"]').first().click();
  await page.waitForURL('**/import');
  await expect(page.getByRole('heading', { name: 'Import Data' })).toBeVisible();
  await expect(page.getByText(/Step 1 of 4/)).toBeVisible();
});

// ─── B. /import step 1 ──────────────────────────────────────────────────────

test('step 1: 5 types, gated Next, template only after type, size/type validation', async ({ page }) => {
  await goto(page, '/import');
  for (const t of ['Contacts', 'Leads', 'Suppliers', 'Rate Cards', 'Travellers']) {
    await expect(typeCard(page, t)).toBeVisible();
  }
  await expect(page.getByText(/max 20MB/i).first()).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download Template' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /download.*error|error.*download/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Import History' })).toBeVisible();

  await typeCard(page, 'Contacts').click();
  await expect(page.getByRole('button', { name: 'Download Template' })).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled(); // type alone is not enough

  // unsupported type
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') });
  await expect(page.getByText('Only CSV and Excel (XLSX/XLS) files are supported')).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled();

  // > 20MB
  await page.locator('#fileInput').setInputFiles({
    name: 'big.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(21 * 1024 * 1024, 'a'),
  });
  await expect(page.getByText(/File too large\. Maximum size is 20MB/)).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled();

  // valid file enables Next, and can be removed again
  const ok = writeCsv(`gate-${RUN}.csv`, ['First Name', 'Email'], [['A', 'a@e2e-import.test']]);
  await page.locator('#fileInput').setInputFiles(ok);
  await expect(page.getByText(`gate-${RUN}.csv`)).toBeVisible();
  await expect(nextBtn(page)).toBeEnabled();
});

test('"View Import History" on /import opens /settings/import', async ({ page }) => {
  await goto(page, '/import');
  await page.getByRole('button', { name: 'View Import History' }).click();
  await page.waitForURL('**/settings/import');
  await expect(page.getByText('Import History').first()).toBeVisible();
});

test('template download on /import hits the API and returns a real xlsx', async ({ page }) => {
  await goto(page, '/import');
  await typeCard(page, 'Contacts').click();
  const [res, dl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/imports/templates/contacts')),
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Template' }).click(),
  ]);
  expect(res.status()).toBe(200);
  const { name, buf } = await saveDownload(dl);
  expect(name).toBe('contacts_import_template.xlsx');
  expect(buf.length).toBeGreaterThan(1000);
  expect(isZip(buf)).toBe(true);
  await expect(page.getByText('Template downloaded')).toBeVisible();
});

test('header-only CSV reaches mapping with 0 rows and does not crash', async ({ page }) => {
  await goto(page, '/import');
  const p = writeCsv(`empty-${RUN}.csv`, ['First Name', 'Email'], []);
  await uploadStep(page, 'Contacts', p);
  await expect(page.getByText(/File has\s*2\s*columns and\s*0\s*rows/)).toBeVisible();
});

// ─── C. /import full contacts round trip ────────────────────────────────────

test('contacts wizard: map → preview → duplicates → summary → import → results', async ({ page }) => {
  await goto(page, '/import');
  const csvPath = writeCsv(MAIN_FILE, CONTACT_HEADERS, contactRows(`Acme${RUN}`));
  mainJobId = await uploadStep(page, 'Contacts', csvPath);

  // Step 2 — dynamic headers, auto-map, required handling
  await expect(page.getByText('col1')).toHaveCount(0);
  for (const h of CONTACT_HEADERS) await expect(page.getByText(h, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`Sample: Alice${RUN}`)).toBeVisible();
  await expect(page.getByText(/File has\s*5\s*columns and\s*4\s*rows/)).toBeVisible();
  const combos = page.getByRole('combobox');
  await expect(combos).toHaveCount(5);
  await expect(combos.nth(0)).toContainText('First Name');
  await expect(combos.nth(2)).toContainText('Email');
  await expect(page.getByText('Required fields not yet mapped')).toHaveCount(0);
  await expect(nextBtn(page)).toBeEnabled();

  // a CRM field already used elsewhere is not offered again
  await combos.nth(1).click();
  await expect(page.getByRole('option', { name: '-- Skip --' })).toBeVisible();
  await expect(page.getByRole('option', { name: /^First Name/ })).toHaveCount(0);
  await expect(page.getByRole('option', { name: /^Email/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // un-map a required field → warning + Next blocked; Reset Auto-Map recovers
  await combos.nth(2).click();
  await page.getByRole('option', { name: '-- Skip --' }).click();
  await expect(page.getByText('Required fields not yet mapped')).toBeVisible();
  await expect(page.getByText('Required fields not yet mapped').locator('..')).toContainText('Email');
  await expect(nextBtn(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Reset Auto-Map' }).click();
  await expect(page.getByText('Required fields not yet mapped')).toHaveCount(0);
  await expect(nextBtn(page)).toBeEnabled();

  // Step 3 — preview shows the real file, not a sample
  await nextBtn(page).click();
  await expect(page.getByText(/Step 3 of 4/)).toBeVisible();
  await expect(page.getByText(/First 4 of\s*4\s*rows/)).toBeVisible();
  const table = page.locator('table').first();
  for (const h of ['First Name', 'Last Name', 'Email', 'Phone', 'Company']) {
    await expect(table.getByRole('columnheader', { name: new RegExp(`^${h}`) })).toBeVisible();
  }
  await expect(table).toContainText(`Alice${RUN}`);
  await expect(table).toContainText(`bob.${RUN}@e2e-import.test`);
  await expect(table).toContainText(`Acme${RUN}`);
  await expect(table).toContainText('not-an-email');
  await expect(page.getByText('Sample Name')).toHaveCount(0);

  // duplicate strategy radios
  const radios = page.locator('input[name="duplicateStrategy"]');
  await expect(radios).toHaveCount(3);
  await expect(page.getByText('Skip Duplicates', { exact: true })).toBeVisible();
  await expect(page.getByText('Update Existing', { exact: true })).toBeVisible();
  await expect(page.getByText('Create New', { exact: true })).toBeVisible();
  await expect(radios.nth(0)).toBeChecked();
  await page.getByText('Update Existing', { exact: true }).click();
  await expect(radios.nth(1)).toBeChecked();
  await page.getByText('Skip Duplicates', { exact: true }).click();
  await expect(radios.nth(0)).toBeChecked();

  // Step 4 — summary, Previous keeps state
  await nextBtn(page).click();
  await expect(page.getByText(/Step 4 of 4/)).toBeVisible();
  await expect(page.getByText('Import Type:').locator('..')).toContainText(/contacts/i);
  await expect(page.getByText('File:', { exact: true }).locator('..')).toContainText(MAIN_FILE);
  await expect(page.getByText('Total Rows:').locator('..')).toContainText('4');
  await expect(page.getByText('Mapped Columns:').locator('..')).toContainText('5');
  await expect(page.getByText('Duplicate Strategy:').locator('..')).toContainText(/skip/i);
  await expect(page.getByRole('button', { name: 'Cancel Import' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByText(/Step 3 of 4/)).toBeVisible();
  await expect(radios.nth(0)).toBeChecked();
  await nextBtn(page).click();

  // run it
  await page.getByRole('button', { name: 'Start Import' }).click();
  await expect(page.getByText('Import Complete', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Import completed successfully!')).toBeVisible();
  expect(await counter(page, 'Imported')).toBe(3);
  expect(await counter(page, 'Duplicates')).toBe(0);
  expect(await counter(page, 'Errors')).toBe(1);
  await expect(page.getByRole('button', { name: 'Cancel Import' })).toHaveCount(0);

  const job = await jobStatus(mainJobId);
  expect(job.status).toBe('completed');
  expect(job.successCount).toBe(3);
  expect(job.errorCount).toBe(1);

  // error report
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Error Report' }).click(),
  ]);
  const err = await saveDownload(dl);
  expect(err.name).toBe(`contacts_errors_${mainJobId}.xlsx`);
  expect(isZip(err.buf)).toBe(true);
  const errText = unzipText(err.buf);
  expect(errText).toContain('Invalid email address');
  expect(errText).toContain(`Dan${RUN}`);

  // Import Another File resets the wizard
  await page.getByRole('button', { name: 'Import Another File' }).click();
  await expect(page.getByText(/Step 1 of 4/)).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download Template' })).toHaveCount(0);
});

test('imported contacts exist: visible in /contacts, invalid row was not created', async ({ page }) => {
  await goto(page, '/contacts');
  await page.getByPlaceholder(/search/i).first().fill(`Alice${RUN}`);
  const row = page.getByRole('row').filter({ hasText: `Alice${RUN}` });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Smith');

  const alice = listOf(await api('GET', `/contacts?search=alice.${RUN}&limit=50`));
  expect(alice).toHaveLength(1);
  expect(alice[0].company).toBe(`Acme${RUN}`);
  expect(alice[0].email).toBe(`alice.${RUN}@e2e-import.test`);
  const dan = listOf(await api('GET', `/contacts?search=Dan${RUN}&limit=50`));
  expect(dan.filter((c) => String(c.name).includes(`Dan${RUN}`))).toHaveLength(0);
});

test('re-import with "Skip Duplicates" skips all 3 and leaves data untouched', async ({ page }) => {
  const p = writeCsv(`contacts-${RUN}-skip.csv`, CONTACT_HEADERS, contactRows(`Skipped${RUN}`));
  const r = await runWizard(page, 'Contacts', p, 'Skip Duplicates');
  expect(r.imported).toBe(0);
  expect(r.duplicates).toBe(3);
  expect(r.errors).toBe(1);
  const alice = listOf(await api('GET', `/contacts?search=alice.${RUN}&limit=50`));
  expect(alice).toHaveLength(1);
  expect(alice[0].company).toBe(`Acme${RUN}`);
});

test('re-import with "Update Existing" merges into the 3 existing contacts', async ({ page }) => {
  const p = writeCsv(`contacts-${RUN}-merge.csv`, CONTACT_HEADERS, contactRows(`Merged${RUN}`));
  const r = await runWizard(page, 'Contacts', p, 'Update Existing');
  expect(r.duplicates).toBe(3);
  expect(r.imported).toBe(3);
  const alice = listOf(await api('GET', `/contacts?search=alice.${RUN}&limit=50`));
  expect(alice).toHaveLength(1);
  expect(alice[0].company).toBe(`Merged${RUN}`);
  await waitForJobDone(r.jobId);
});

test('"View Contacts" after a completed import navigates to /contacts', async ({ page }) => {
  const p = writeCsv(`contacts-${RUN}-view.csv`, CONTACT_HEADERS, contactRows(`Viewed${RUN}`).slice(0, 1));
  await runWizard(page, 'Contacts', p, 'Skip Duplicates');
  await page.getByRole('button', { name: 'View Contacts' }).click();
  await page.waitForURL('**/contacts');
});

// ─── D. /contacts/import template (carried from M16) ────────────────────────

test('contacts/import template button uses the server template endpoint', async ({ page }) => {
  await goto(page, '/contacts/import');
  const [res, dl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/imports/templates/contacts')),
    page.waitForEvent('download'),
    page.getByRole('button', { name: /template/i }).first().click(),
  ]);
  expect(res.status()).toBe(200);
  const { buf } = await saveDownload(dl);
  expect(buf.length).toBeGreaterThan(1000);
});

// ─── E. /settings/import ────────────────────────────────────────────────────

test('settings/import: every template button downloads a non-empty xlsx', async ({ page }) => {
  await goto(page, '/settings/import');
  for (const [label, type] of [
    ['Contacts', 'contacts'],
    ['Leads', 'leads'],
    ['Suppliers', 'suppliers'],
    ['Rate Cards', 'rate_cards'],
    ['Travellers', 'travellers'],
  ]) {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: `${label} Template` }).click(),
    ]);
    const { name, buf } = await saveDownload(dl);
    expect(name).toBe(`${type}_import_template.xlsx`);
    expect(buf.length).toBeGreaterThan(1000);
    expect(isZip(buf)).toBe(true);
  }
});

const SETTINGS_FILE = `contacts-${RUN}-settings.csv`;
let settingsJobId = '';

test('settings/import wizard: upload → map → configure → start → history row', async ({ page }) => {
  await goto(page, '/settings/import');
  await expect(page.getByText('1. Upload')).toBeVisible();
  await expect(page.getByText('2. Map Columns')).toBeVisible();
  await expect(page.getByText('3. Configure')).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload & Continue/ })).toBeDisabled();
  await expect(page.getByRole('combobox').filter({ hasText: 'Contacts' }).first()).toBeVisible();

  const p = writeCsv(SETTINGS_FILE, CONTACT_HEADERS, contactRows(`Settings${RUN}`).map((r, i) => {
    const c = [...r];
    c[2] = (c[2] ?? '').replace('@', '.s@');
    c[3] = `+91${phoneBase + 100 + i}`;
    return c;
  }));
  await page.locator('#import-file').setInputFiles(p);
  await expect(page.getByText(SETTINGS_FILE)).toBeVisible();
  const [up] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/imports/upload')),
    page.getByRole('button', { name: /Upload & Continue/ }).click(),
  ]);
  settingsJobId = (await up.json()).data.jobId;

  await expect(page.getByText(`Uploaded: ${SETTINGS_FILE}`)).toBeVisible();
  await expect(page.getByText(/4 records\s*—\s*5 columns detected/)).toBeVisible();
  for (const h of CONTACT_HEADERS) await expect(page.getByText(h, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Fields marked * are required.')).toBeVisible();
  const mapCombos = page.getByRole('combobox').filter({ hasText: /First Name|Last Name|Email|Phone|Company/ });
  await expect(mapCombos.first()).toContainText('First Name');

  await page.getByRole('button', { name: /^Next/ }).click();
  await expect(page.getByText('Ready to import: 4 records as Contacts')).toBeVisible();
  const radios = page.locator('input[name="duplicateStrategy"]');
  await expect(radios).toHaveCount(3);
  await expect(radios.nth(0)).toBeChecked();
  await page.getByText('Update existing', { exact: true }).click();
  await expect(radios.nth(1)).toBeChecked();
  await page.getByText('Skip duplicates', { exact: true }).click();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText(`Uploaded: ${SETTINGS_FILE}`)).toBeVisible();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: 'Start Import' }).click();
  await expect(page.getByText('Import started')).toBeVisible();

  // wizard resets, history shows the new job
  await expect(page.getByRole('button', { name: /Upload & Continue/ })).toBeDisabled();
  await expect(page.getByRole('row').filter({ hasText: SETTINGS_FILE })).toHaveCount(1, { timeout: 15_000 });

  const job = await waitForJobDone(settingsJobId);
  expect(job.status).toBe('completed');
  expect(job.successCount).toBe(3);
  expect(job.errorCount).toBe(1);
});

test('import history row shows file, type, records, status and date', async ({ page }) => {
  await goto(page, '/settings/import');
  for (const h of ['File', 'Type', 'Records', 'Status', 'Date']) {
    await expect(page.getByRole('columnheader', { name: new RegExp(`^${h}`) })).toBeVisible();
  }
  const row = page.getByRole('row').filter({ hasText: SETTINGS_FILE });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/contacts/i);
  await expect(row).toContainText('4/4');
  await expect(row).toContainText('(1 failed)');
  await expect(row).toContainText('Completed');
  await expect(row).not.toContainText('undefined');
  await expect(row).not.toContainText('NaN');
});

test('import history: type/status filters and search narrow the list; empty state', async ({ page }) => {
  const travName = `travellers-${RUN}-pending.csv`;
  const travJob = await apiUploadCsv('travellers', travName, ['First Name', 'Last Name'], [['T', `R${RUN}`]]);
  expect(travJob).toBeTruthy();

  await goto(page, '/settings/import');
  const rows = (name: string) => page.getByRole('row').filter({ hasText: name });
  await expect(rows(SETTINGS_FILE)).toHaveCount(1);
  await expect(rows(travName)).toHaveCount(1);

  // type filter
  await page.getByRole('combobox').filter({ hasText: 'All Types' }).click();
  await page.getByRole('option', { name: 'Travellers' }).click();
  await expect(rows(travName)).toHaveCount(1);
  await expect(rows(SETTINGS_FILE)).toHaveCount(0);
  await page.getByRole('combobox').filter({ hasText: 'Travellers' }).last().click();
  await page.getByRole('option', { name: 'All Types' }).click();
  await expect(rows(SETTINGS_FILE)).toHaveCount(1);

  // status filter
  await page.getByRole('combobox').filter({ hasText: 'All Statuses' }).click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await expect(rows(SETTINGS_FILE)).toHaveCount(1);
  await expect(rows(travName)).toHaveCount(0);
  await page.getByRole('combobox').filter({ hasText: 'Completed' }).last().click();
  await page.getByRole('option', { name: 'Pending' }).click();
  await expect(rows(travName)).toHaveCount(1);
  await expect(rows(SETTINGS_FILE)).toHaveCount(0);
  await page.getByRole('combobox').filter({ hasText: 'Pending' }).last().click();
  await page.getByRole('option', { name: 'All Statuses' }).click();

  // search
  const search = page.getByPlaceholder(/search/i).first();
  await search.fill(travName);
  await expect(rows(travName)).toHaveCount(1);
  await expect(rows(SETTINGS_FILE)).toHaveCount(0);
  await search.fill(`zz-no-such-import-${RUN}`);
  await expect(page.getByText('No imports found')).toBeVisible();
  await expect(page.getByText('Upload a file above to start your first import.')).toBeVisible();
  await search.fill('');
  await expect(rows(SETTINGS_FILE)).toHaveCount(1);
});

test('import history hover action downloads the error report; only rows with failures have it', async ({ page }) => {
  await goto(page, '/settings/import');
  const row = page.getByRole('row').filter({ hasText: SETTINGS_FILE });
  await expect(row).toHaveCount(1);
  await row.hover();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    row.getByRole('button', { name: 'Download errors' }).click(),
  ]);
  const { name, buf } = await saveDownload(dl);
  expect(name).toBe(`contacts_errors_${settingsJobId}.xlsx`);
  expect(unzipText(buf)).toContain('Invalid email address');

  const cleanName = `travellers-${RUN}-clean.csv`;
  await apiUploadCsv('travellers', cleanName, ['First Name', 'Last Name'], [['C', 'L']]);
  await page.reload();
  const clean = page.getByRole('row').filter({ hasText: cleanName });
  await expect(clean).toHaveCount(1);
  await expect(clean.getByRole('button', { name: 'Download errors' })).toHaveCount(0);
});

test('cancelling a pending import from history marks it Cancelled', async ({ page }) => {
  const name = `leads-${RUN}-cancel.csv`;
  const jobId = await apiUploadCsv('leads', name, ['Title', 'First Name'], [['T', 'F']]);
  await goto(page, '/settings/import');
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('Pending');
  page.once('dialog', (d) => d.accept());
  await row.hover();
  await row.getByRole('button', { name: 'Cancel or remove' }).click();
  await expect(page.getByText('Removed', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Cancelled');
  expect((await jobStatus(jobId)).status).toBe('cancelled');
});

test('import history shows a skeleton while loading', async ({ page }) => {
  await page.route('**/api/v1/imports?*', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.route('**/api/v1/imports', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto('/settings/import');
  await expect(page.locator('[class*="animate-pulse"], [data-slot="skeleton"], [class*="skeleton"]').first()).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: SETTINGS_FILE })).toHaveCount(1, { timeout: 20_000 });
});

test('import history infinite scroll loads more rows', async ({ page }) => {
  let count = listOf(await api('GET', '/imports')).length;
  for (let i = 0; count < 25; i++, count++) {
    await apiUploadCsv('travellers', `travellers-${RUN}-bulk-${i}.csv`, ['First Name', 'Last Name'], [['B', String(i)]]);
  }
  await goto(page, '/settings/import');
  const bodyRows = page.locator('tbody tr');
  await expect.poll(() => bodyRows.count(), { timeout: 15_000 }).toBe(20);
  await page.mouse.move(600, 400);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 6000);
      return bodyRows.count();
    }, { timeout: 15_000 })
    .toBeGreaterThan(20);
});

// ─── F. /settings/export ────────────────────────────────────────────────────

const exportSeed = { name: `ExportMe ${RUN}`, email: `export.${RUN}@e2e-export.test` };
const exportLeadTitle = `ExportLead ${RUN}`;

test.describe('exports', () => {
  test.beforeAll(async () => {
    const contact = await seedContact(exportSeed);
    await seedLead(contact.id, { title: exportLeadTitle });
  });

  for (const entity of ['contacts', 'leads'] as const) {
    for (const format of ['csv', 'xlsx'] as const) {
      test(`export ${entity} as ${format.toUpperCase()} downloads a file whose content matches its extension`, async ({ page }) => {
        await goto(page, '/settings/export');
        const idx = entity === 'contacts' ? 0 : 1;
        if (format === 'xlsx') {
          await page.getByRole('combobox').nth(idx).click();
          await page.getByRole('option', { name: 'XLSX' }).click();
        } else {
          await expect(page.getByRole('combobox').nth(idx)).toContainText('CSV');
        }
        const [res, dl] = await Promise.all([
          page.waitForResponse((r) => r.url().includes(`/exports/${entity}`)),
          page.waitForEvent('download'),
          page.getByRole('button', { name: entity === 'contacts' ? 'Export Contacts' : 'Export Leads' }).click(),
        ]);
        expect(res.request().method()).toBe('GET');
        expect(res.status()).toBe(200);
        expect(res.url()).toContain(`format=${format}`);
        const { name, buf } = await saveDownload(dl);
        expect(name).toMatch(new RegExp(`^${entity}_export_\\d{4}-\\d{2}-\\d{2}\\.${format}$`));
        expect(buf.length).toBeGreaterThan(50);
        const needle = entity === 'contacts' ? exportSeed.name : exportLeadTitle;
        if (format === 'xlsx') {
          expect(isZip(buf)).toBe(true);
          expect(unzipText(buf)).toContain(needle);
        } else {
          expect(isZip(buf), 'CSV export must be text, not an xlsx zip').toBe(false);
          const text = buf.toString('utf8');
          expect(text.split('\n')[0]).toContain(',');
          expect(text).toContain(needle);
        }
        await expect(page.getByText(entity === 'contacts' ? 'Contacts exported successfully' : 'Leads exported successfully')).toBeVisible();
      });
    }
  }

  test('format selectors offer CSV and XLSX', async ({ page }) => {
    await goto(page, '/settings/export');
    await expect(page.getByText('Format', { exact: true })).toHaveCount(2);
    await page.getByRole('combobox').first().click();
    await expect(page.getByRole('option', { name: 'CSV' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'XLSX' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('full export: options → job row → completes → downloads zip with data', async ({ page }) => {
    await goto(page, '/settings/export');
    await expect(page.getByText('No export jobs yet')).toBeVisible();

    const switches = page.getByRole('switch');
    await expect(switches).toHaveCount(9);
    for (let i = 0; i < 7; i++) await expect(switches.nth(i)).toBeChecked();
    await expect(switches.nth(7)).not.toBeChecked(); // Documents
    await expect(switches.nth(8)).not.toBeChecked(); // Messages
    await switches.nth(6).click(); // Payments off
    await expect(switches.nth(6)).not.toBeChecked();

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/exports/full') && r.method() === 'POST'),
      page.getByRole('button', { name: 'Start Full Export' }).click(),
    ]);
    const body = req.postDataJSON();
    expect(body.includeContacts).toBe(true);
    expect(body.includePayments).toBe(false);
    expect(body.includeDocuments).toBe(false);

    await expect(page.getByText(/Full export started/)).toBeVisible();
    await expect(page.getByText('No export jobs yet')).toHaveCount(0);
    const jobRow = page.locator('tbody tr').first();
    await expect(jobRow).toBeVisible();

    await expect
      .poll(async () => {
        await page.getByRole('button', { name: 'Refresh' }).first().click();
        return page.getByRole('button', { name: 'Download' }).count();
      }, { timeout: 60_000, intervals: [1000, 2000] })
      .toBeGreaterThan(0);
    await expect(jobRow).toContainText('Completed');

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).first().click(),
    ]);
    const { buf } = await saveDownload(dl);
    expect(buf.length).toBeGreaterThan(100);
    expect(isZip(buf)).toBe(true);
    expect(unzipText(buf)).toContain(exportSeed.email);
  });

  test('invoices: select rows → Download PDFs delivers a non-empty zip via the bulk-pdf job', async ({ page }) => {
    const contact = await seedContact();
    const inv = await seedInvoice(contact.id);
    expect(inv.id).toBeTruthy();
    await goto(page, '/invoices');
    await page.getByRole('checkbox', { name: `Select row ${inv.id}` }).check();
    await expect(page.getByText(/1 selected/)).toBeVisible();
    const [queued, dl] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/exports/invoices/bulk-pdf') && r.request().method() === 'POST'),
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Download PDFs' }).click(),
    ]);
    expect(queued.status()).toBe(200);
    const { name, buf } = await saveDownload(dl);
    expect(name).toMatch(/^invoices_\d{4}-\d{2}-\d{2}\.zip$/);
    expect(buf.length).toBeGreaterThan(50);
  });
});

// ─── G. no direct communication links ───────────────────────────────────────

for (const url of ['/import', '/settings/import', '/settings/export']) {
  test(`no mailto:, wa.me or tel: anchors on ${url}`, async ({ page }) => {
    await goto(page, url);
    await expect(page.getByRole('heading', { name: /import|export/i }).first()).toBeVisible();
    await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
  });
}
