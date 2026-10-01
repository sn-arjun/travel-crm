import { test, expect, type Page } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { api, seedEmailTemplate, seedContact } from './helpers/api-seed';

const TEMPLATES_API = '/templates';
const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

async function searchList(page: Page, term: string) {
  await page.getByPlaceholder(/Search templates/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

test.describe('Message Templates', () => {
  test('create via form, appears in list, detail shows values, edit form pre-fills, edit persists, delete removes it', async ({ page }) => {
    const name = `E2E Create Tpl ${Date.now()}`;
    const subject = `Booking confirmed for {destination}`;
    const content = `Hi {customer_name}, your trip to {destination} on {travel_date} is confirmed. Ref: {booking_ref}.`;

    await page.goto('/communication/templates/new');
    await waitForLoad(page);

    await page.locator('#name').fill(name);
    // Channel defaults to Email — keep it so Subject field is required/visible.
    await page.getByRole('combobox').filter({ hasText: 'Select category' }).click();
    await page.getByRole('option', { name: 'Booking Confirmation' }).click();
    await page.locator('#subject').fill(subject);
    await page.locator('textarea').fill(content);

    await page.getByRole('button', { name: 'Save Template' }).click();
    await expect(page.locator('text=Template saved successfully!').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL('**/communication/templates', { timeout: 15_000 });
    await waitForLoad(page);

    // 2. Assert every filled value appears in the list
    await searchList(page, name);
    const row = page.locator(`table tbody tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('EMAIL');
    await expect(row).toContainText('Booking Confirmation');
    await expect(row).toContainText(subject);

    // 3. Open detail view; assert every value is present
    await row.locator('button[aria-label="Preview"]').click();
    const detail = page.locator('[role="dialog"], [data-slot="sheet-content"]').filter({ hasText: name }).first();
    await expect(detail.getByText(name).first()).toBeVisible();
    await expect(detail.getByText(subject)).toBeVisible();
    await expect(detail.getByText(content)).toBeVisible();
    await expect(detail.getByText('EN', { exact: true })).toBeVisible();
    await expect(detail.getByText('EMAIL', { exact: true })).toBeVisible();
    await expect(detail.getByText('Booking Confirmation', { exact: true })).toBeVisible();
    // close the sheet
    await page.keyboard.press('Escape');

    // 4. Open edit form; assert every value is pre-filled
    await row.locator('button[aria-label="Edit"]').click();
    await page.waitForURL(/\/communication\/templates\/.+\/edit/, { timeout: 15_000 });
    await waitForLoad(page);
    await expect(page.locator('#name')).toHaveValue(name);
    await expect(page.locator('#subject')).toHaveValue(subject);
    await expect(page.locator('textarea')).toHaveValue(content);

    // 5. Edit, save, assert the change persisted
    const updatedName = `${name} Updated`;
    const updatedContent = `${content} Updated details.`;
    await page.locator('#name').fill('');
    await page.locator('#name').fill(updatedName);
    await page.locator('textarea').fill('');
    await page.locator('textarea').fill(updatedContent);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('text=Template updated successfully!').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL('**/communication/templates', { timeout: 15_000 });
    await waitForLoad(page);

    await searchList(page, updatedName);
    const updatedRow = page.locator(`table tbody tr:has-text("${updatedName}")`).first();
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });
    await expect(updatedRow).toContainText(updatedContent.slice(0, 40));

    // 6. Delete, assert it is gone
    await updatedRow.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.locator(`text=Template "${updatedName}" deleted`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${updatedName}")`)).toHaveCount(0, { timeout: 10_000 });
  });

  test('duplicate creates a copy with " (Copy)" suffix', async ({ page }) => {
    const tpl = await seedEmailTemplate({ name: `E2E Dup Tpl ${Date.now()}` });

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await searchList(page, tpl.name);
    const row = page.locator(`table tbody tr:has-text("${tpl.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('button[aria-label="Duplicate"]').click();
    await expect(page.locator('text=Template duplicated').first()).toBeVisible({ timeout: 10_000 });

    await searchList(page, `${tpl.name} (Copy)`);
    await expect(page.locator(`table tbody tr:has-text("${tpl.name} (Copy)")`)).toBeVisible({ timeout: 10_000 });
  });

  test('channel and category filters narrow the list', async ({ page }) => {
    const marker = Date.now();
    const emailTpl = await seedEmailTemplate({ name: `Filter Email ${marker}`, channel: 'email', category: 'greeting' });
    const smsTpl = await seedEmailTemplate({ name: `Filter Sms ${marker}`, channel: 'sms', category: 'reminder', subject: undefined });

    await page.goto('/communication/templates');
    await waitForLoad(page);

    // Filter by channel = SMS
    await page.getByRole('combobox').filter({ hasText: 'All Channels' }).click();
    await page.getByRole('option', { name: 'SMS', exact: true }).click();
    await waitForLoad(page);
    await expect(page.locator(`table tbody tr:has-text("${smsTpl.name}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${emailTpl.name}")`)).toHaveCount(0);

    // Filter by category = reminder (further narrows the already-SMS-filtered list)
    await page.getByRole('combobox').filter({ hasText: 'All Categories' }).click();
    await page.getByRole('option', { name: 'Payment Reminder' }).click();
    await waitForLoad(page);
    await expect(page.locator(`table tbody tr:has-text("${smsTpl.name}")`)).toBeVisible({ timeout: 10_000 });

    // Clear all filters via the filter bar
    await page.getByRole('button', { name: 'Clear all' }).click();
    await waitForLoad(page);
  });

  test('preview substitutes a real contact\'s data via searchable combobox (no raw ID input)', async ({ page }) => {
    const contact = await seedContact({ name: `Preview Contact ${Date.now()}` });

    await page.goto('/communication/templates/new');
    await waitForLoad(page);
    await page.locator('#name').fill(`Preview Flow ${Date.now()}`);
    await page.locator('#subject').fill('Hello {customer_name}');
    await page.locator('textarea').fill('Dear {customer_name}, welcome!');

    // No raw ID input anywhere on the page
    expect(await page.locator('input[name*="Id" i], input[placeholder*="contact id" i]').count()).toBe(0);

    const combobox = page.getByRole('combobox').filter({ hasText: 'Pick a contact to preview' });
    await combobox.click();
    await page.getByPlaceholder('Search…').fill(contact.name);
    await page.waitForTimeout(500);
    await expect(page.getByRole('option', { name: new RegExp(contact.name) })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: new RegExp(contact.name) }).click();

    await page.getByRole('button', { name: /Preview/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Dear ${contact.name}, welcome!`)).toBeVisible();
  });

  test('empty state renders when search matches nothing', async ({ page }) => {
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await searchList(page, `no-such-template-${Date.now()}-zzz`);

    await expect(page.getByText('No templates yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Create your first message template to get started.')).toBeVisible();
    await expect(page.locator('table tbody tr')).toHaveCount(1);
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedEmailTemplate({ name: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await searchList(page, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('export downloads a non-empty CSV containing the listed templates', async ({ page }) => {
    const tpl = await seedEmailTemplate({ name: `Export Tpl ${Date.now()}`, category: 'offer' });

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await searchList(page, tpl.name);
    await expect(page.locator(`table tbody tr:has-text("${tpl.name}")`)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export CSV', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('message-templates.csv');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain('Name,Channel,Category,Language,Subject,Content');
    expect(csv).toContain(tpl.name);
  });

  test('delete removes the template from the API too', async ({ page }) => {
    const tpl = await seedEmailTemplate({ name: `Delete Api Tpl ${Date.now()}` });

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await searchList(page, tpl.name);
    const row = page.locator(`table tbody tr:has-text("${tpl.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.locator(`text=Template "${tpl.name}" deleted`).first()).toBeVisible({ timeout: 10_000 });

    const afterDelete = await api('GET', `${TEMPLATES_API}/${tpl.id}`);
    expect(afterDelete.success).toBe(false);
  });

  test('no raw tel/mailto/wa.me links anywhere on the list page', async ({ page }) => {
    await seedEmailTemplate();
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });

  test('email channel requires a subject; SMS/WhatsApp do not show a subject field', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);
    await page.locator('#name').fill(`Validation Tpl ${Date.now()}`);
    await page.locator('textarea').fill('Body without subject');
    await page.getByRole('button', { name: 'Save Template' }).click();
    await expect(page.locator('text=Subject is required for email templates').first()).toBeVisible({ timeout: 5_000 });

    // Switch channel to SMS — subject field should disappear and save should now be allowed
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: 'SMS', exact: true }).click();
    await expect(page.locator('#subject')).toHaveCount(0);
  });

  for (const [channelLabel, badge] of [['SMS', 'SMS'], ['WhatsApp', 'WHATSAPP']] as const) {
    test(`create ${channelLabel} template via form — channel badge and values shown in list and edit form`, async ({ page }) => {
      const name = `E2E ${badge} ${Date.now()}`;
      const content = `Hello {customer_name}! Your trip to {destination} is confirmed.`;

      await page.goto('/communication/templates/new');
      await waitForLoad(page);
      await expect(page.getByRole('heading', { name: /Create Template|New Template/i }).first()).toBeVisible();
      await page.locator('#name').fill(name);
      await page.locator('button[role="combobox"]').first().click();
      await page.getByRole('option', { name: channelLabel, exact: true }).click();
      await page.getByRole('combobox').filter({ hasText: 'Select category' }).click();
      await page.getByRole('option', { name: 'Greeting / Welcome' }).click();
      await page.locator('textarea').fill(content);
      await page.getByRole('button', { name: 'Save Template' }).click();
      await page.waitForURL('**/communication/templates', { timeout: 15_000 });
      await waitForLoad(page);

      await searchList(page, name);
      const row = page.locator(`table tbody tr:has-text("${name}")`).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row).toContainText(badge);
      await expect(row).toContainText('Greeting / Welcome');

      await row.locator('button[aria-label="Edit"]').click();
      await page.waitForURL(/\/communication\/templates\/.+\/edit/, { timeout: 15_000 });
      await waitForLoad(page);
      await expect(page.locator('#name')).toHaveValue(name);
      await expect(page.locator('textarea')).toHaveValue(content);
      await expect(page.locator('#subject')).toHaveCount(0);
    });
  }

  test('saving without a name shows a validation error and does not create the template', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);
    await page.locator('textarea').fill('Some content');
    await page.getByRole('button', { name: 'Save Template' }).click();
    await expect(page.locator('text=Template name is required').first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/communication\/templates\/new$/);
  });

  test('SMS template shows a live character counter', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: 'SMS', exact: true }).click();
    await page.locator('textarea').fill('A'.repeat(170));
    await expect(page.getByText('170 characters').first()).toBeVisible();
  });

  test('Create Template button on the list navigates to the new-template form', async ({ page }) => {
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Message Templates' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Create Template' }).first().click();
    await expect(page).toHaveURL(/\/communication\/templates\/new$/);
  });

  test('edit page delete asks for confirmation; cancelling keeps the template', async ({ page }) => {
    const tpl = await seedEmailTemplate({ name: `E2E ConfirmDel ${Date.now()}` });
    await page.goto(`/communication/templates/${tpl.id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#name')).toHaveValue(tpl.name);

    await page.getByRole('button', { name: /Delete template/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(tpl.name);
    await dialog.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(dialog).toHaveCount(0);

    const check = await api('GET', `${TEMPLATES_API}/${tpl.id}`);
    expect(check.data?.id).toBe(tpl.id);
  });

  test('templates list API honours the channel filter', async () => {
    const sms = await seedEmailTemplate({ name: `E2E ApiFilter ${Date.now()}`, channel: 'sms', subject: undefined, content: 'SMS body' });
    const smsList = await api('GET', `${TEMPLATES_API}?channel=sms&limit=100`);
    expect((smsList.data as any[]).some((t) => t.id === sms.id)).toBe(true);
    const emailList = await api('GET', `${TEMPLATES_API}?channel=email&limit=100`);
    expect((emailList.data as any[]).some((t) => t.id === sms.id)).toBe(false);
  });
});
