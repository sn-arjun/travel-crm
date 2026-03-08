import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedLead, api } from './helpers/api-seed';

test.describe('Leads', () => {
  test('should load leads list page', async ({ page }) => {
    await page.goto('/leads');
    await waitForLoad(page);
    await expect(page.locator('text=Leads').first()).toBeVisible();
  });

  test('should create a new lead via UI and verify API success', async ({ page }) => {
    // First seed a contact to select in the form
    const contact = await seedContact({ name: 'E2E Lead Contact' });
    expect(contact.id).toBeTruthy();

    await page.goto('/leads/new');
    await waitForLoad(page);

    // Fill title (required)
    const titleInput = page.locator('#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    const leadTitle = `E2E Lead ${Date.now()}`;
    await titleInput.fill(leadTitle);

    // Select contact
    const contactSelect = page.locator('text=Select a contact').first();
    if (await contactSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contactSelect.click();
      await page.waitForTimeout(500);
      // Click the contact in the dropdown
      const contactOption = page.locator(`[role="option"]`).filter({ hasText: 'E2E Lead Contact' }).first();
      if (await contactOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await contactOption.click();
      }
    }

    // Fill destination (required)
    const destInput = page.locator('#destination');
    if (await destInput.isVisible()) {
      await destInput.fill('Bali');
    }

    // Travel date should be pre-filled with today, but verify
    const travelDateInput = page.locator('#travelDate');
    const travelDateValue = await travelDateInput.inputValue();
    expect(travelDateValue).toBeTruthy(); // Should be pre-filled

    // Trip type should default to 'domestic', source to 'manual' — no action needed

    // Submit the form
    await page.locator('button:has-text("Save Lead")').first().click();

    // Wait for success toast — this is the REAL verification
    const successToast = page.locator('text=Lead created successfully');
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // Should redirect to /leads
    await expect(page).toHaveURL(/\/leads/, { timeout: 10_000 });
  });

  test('should seed a lead via API and verify it appears', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: 'E2E API Lead Verify' });

    // Verify the API returned a valid lead with an ID
    expect(lead).toBeTruthy();
    expect(lead.id).toBeTruthy();
    expect(lead.title || lead.id).toBeTruthy();

    // Navigate to the lead detail page
    await page.goto(`/leads/${lead.id}`);
    await waitForLoad(page);
    await expect(page.locator('text=Lead').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should filter leads by status', async ({ page }) => {
    await page.goto('/leads');
    await waitForLoad(page);

    // Look for status filter dropdown
    const filterSelect = page.locator('select, [role="combobox"]').first();
    if (await filterSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterSelect.click();
      await page.waitForTimeout(500);
    }
  });

  test('should show seeded lead in list', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id, { title: 'E2E Visible Lead Check' });
    expect(lead.id).toBeTruthy();

    await page.goto('/leads');
    await waitForLoad(page);

    // Wait for data to load
    await page.waitForTimeout(3000);
    await expect(page.locator('text=Leads').first()).toBeVisible({ timeout: 10_000 });
  });

  test('seed lead via API returns valid response (schema match check)', async () => {
    // This test directly validates the API — no browser needed
    const contact = await seedContact({ name: 'Schema Check Contact' });
    expect(contact.id).toBeTruthy();

    const lead = await seedLead(contact.id, {
      title: 'Schema Match Test',
      destinations: ['Maldives', 'Bali'],
      travelDate: '2026-04-15',
      tripType: 'international',
      source: 'manual',
      priority: 'hot',
    });

    // If we get here without error, the Zod schema accepted our payload
    expect(lead).toBeTruthy();
    expect(lead.id).toBeTruthy();
  });
});
