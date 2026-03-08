import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedLead, seedVoucher } from './helpers/api-seed';

test.describe('Vouchers — List & Navigation', () => {
  test('should load vouchers list page', async ({ page }) => {
    await page.goto('/vouchers');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: /vouchers/i }).first()).toBeVisible();
  });

  test('should navigate to voucher detail', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const voucher = await seedVoucher(lead.id);
    if (!voucher?.id) return;

    await page.goto(`/vouchers/${voucher.id}`);
    await waitForLoad(page);
    await expect(page.getByText(/VCH-|voucher/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load create voucher page', async ({ page }) => {
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await expect(page.getByText(/voucher/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show guest information on detail', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const voucher = await seedVoucher(lead.id);
    if (!voucher?.id) return;

    await page.goto(`/vouchers/${voucher.id}`);
    await waitForLoad(page);

    await expect(page.getByText('Guest Information')).toBeVisible({ timeout: 10_000 });
  });

  test('should show voucher details section', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const voucher = await seedVoucher(lead.id);
    if (!voucher?.id) return;

    await page.goto(`/vouchers/${voucher.id}`);
    await waitForLoad(page);

    await expect(page.getByText('Voucher Details')).toBeVisible({ timeout: 10_000 });
  });

  test('should have send via email and whatsapp buttons', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const voucher = await seedVoucher(lead.id);
    if (!voucher?.id) return;

    await page.goto(`/vouchers/${voucher.id}`);
    await waitForLoad(page);

    await expect(page.getByRole('button', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /whatsapp/i })).toBeVisible();
  });

  test('should have status change functionality', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const voucher = await seedVoucher(lead.id);
    if (!voucher?.id) return;

    await page.goto(`/vouchers/${voucher.id}`);
    await waitForLoad(page);

    await expect(page.getByText('Change Status')).toBeVisible();
    await expect(page.getByRole('button', { name: /update status/i })).toBeVisible();
  });

  test('seed voucher via API returns valid response', async () => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const voucher = await seedVoucher(lead.id);
    expect(voucher).toBeTruthy();
    expect(voucher.id).toBeTruthy();
  });
});
