import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

/**
 * AI features require AI_API_KEY to fully function.
 * These tests verify UI loads correctly. API submissions may fail without keys.
 * Tag: @env-dependent
 */
test.describe('AI Features @env-dependent', () => {
  test('should load AI hub page', async ({ page }) => {
    await page.goto('/ai');
    await waitForLoad(page);
    await expect(page.locator('text=AI').first()).toBeVisible();
  });

  // AI Compose
  test('should load AI compose page', async ({ page }) => {
    await page.goto('/ai/compose');
    await waitForLoad(page);
    await expect(page.locator('text=Compose').or(page.locator('text=Message')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should fill and submit AI compose form', async ({ page }) => {
    await page.goto('/ai/compose');
    await waitForLoad(page);

    const contextInput = page.locator('textarea, #context').first();
    if (await contextInput.isVisible()) {
      await contextInput.fill('Follow up with client about Maldives trip pricing');
      await page.locator('button:has-text("Compose"), button:has-text("Generate")').first().click();
      // May succeed or fail depending on AI key
      await page.waitForTimeout(5000);
    }
  });

  // AI Itinerary
  test('should load AI itinerary page', async ({ page }) => {
    await page.goto('/ai/itinerary');
    await waitForLoad(page);
    await expect(page.locator('text=Itinerary').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should fill AI itinerary form', async ({ page }) => {
    await page.goto('/ai/itinerary');
    await waitForLoad(page);

    const destInput = page.locator('#destination, input[placeholder*="destination"]').first();
    if (await destInput.isVisible()) {
      await destInput.fill('Bali, Indonesia');
    }

    const durationInput = page.locator('#duration, input[type="number"]').first();
    if (await durationInput.isVisible()) {
      await durationInput.fill('7');
    }
  });

  // AI Lead Creation
  test('should load AI lead creation page', async ({ page }) => {
    await page.goto('/ai/lead-creation');
    await waitForLoad(page);
    await expect(page.locator('text=Lead').or(page.locator('text=Extract')).first()).toBeVisible({ timeout: 10_000 });
  });

  // AI Search (NL Query)
  test('should load AI search page', async ({ page }) => {
    await page.goto('/ai/search');
    await waitForLoad(page);
    await expect(page.locator('text=Search').or(page.locator('text=AI')).first()).toBeVisible({ timeout: 10_000 });
  });

  // AI Lead Score
  test('should load AI lead score page', async ({ page }) => {
    await page.goto('/ai/lead-score');
    await waitForLoad(page);
    await expect(page.locator('text=Score').or(page.locator('text=Lead')).first()).toBeVisible({ timeout: 10_000 });
  });

  // AI OCR
  test('should load AI OCR page', async ({ page }) => {
    await page.goto('/ai/ocr');
    await waitForLoad(page);
    await expect(page.locator('text=OCR').or(page.locator('text=Scan')).or(page.locator('text=Document')).first()).toBeVisible({ timeout: 10_000 });
  });

  // AI Smart Followups
  test('should load AI smart followups page', async ({ page }) => {
    await page.goto('/ai/smart-followups');
    await waitForLoad(page);
    await expect(page.locator('text=Follow').or(page.locator('text=Smart')).first()).toBeVisible({ timeout: 10_000 });
  });

  // AI Insights
  test('should load AI insights page', async ({ page }) => {
    await page.goto('/ai/insights');
    await waitForLoad(page);
    await expect(page.locator('text=Insights').or(page.locator('text=AI')).first()).toBeVisible({ timeout: 10_000 });
  });

  // AI BI Pages
  test('should load AI BI page', async ({ page }) => {
    await page.goto('/ai/bi');
    await waitForLoad(page);
    await expect(page.locator('text=Business').or(page.locator('text=Intelligence')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load AI BI briefings', async ({ page }) => {
    await page.goto('/ai/bi/briefings');
    await waitForLoad(page);
    await expect(page.locator('text=Briefing').or(page.locator('text=Business')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load AI BI health score', async ({ page }) => {
    await page.goto('/ai/bi/health-score');
    await waitForLoad(page);
    await expect(page.locator('text=Health').or(page.locator('text=Score')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load AI BI destinations', async ({ page }) => {
    await page.goto('/ai/bi/destinations');
    await waitForLoad(page);
    await expect(page.locator('text=Destination').or(page.locator('text=Profitability')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load AI BI team analysis', async ({ page }) => {
    await page.goto('/ai/bi/team');
    await waitForLoad(page);
    await expect(page.locator('text=Team').or(page.locator('text=Performance')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load AI usage page', async ({ page }) => {
    await page.goto('/ai/bi/usage');
    await waitForLoad(page);
    await expect(page.locator('text=Usage').or(page.locator('text=AI')).first()).toBeVisible({ timeout: 10_000 });
  });
});
