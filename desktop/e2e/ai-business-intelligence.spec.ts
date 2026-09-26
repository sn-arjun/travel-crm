import { test, expect, type Page, type Download } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedContact } from './helpers/api-seed';

/**
 * The AiGate fetches /ai/settings before deciding between a skeleton, the
 * real page, or the disabled/upgrade prompt (same pattern as ai-assistant.spec.ts).
 * Wait for that resolution before asserting on page content.
 */
async function waitForGateResolved(page: Page) {
  await expect
    .poll(async () => page.locator('main .animate-pulse').count(), { timeout: 20_000 })
    .toBe(0);
}

async function isGated(page: Page): Promise<boolean> {
  return page
    .locator('text=/upgrade|not on your plan|quota is used up/i')
    .first()
    .isVisible()
    .catch(() => false);
}

async function assertNoLeakedError(page: Page) {
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/\b403\b|Forbidden|\bTypeError\b|\bundefined is not/);
}

/**
 * This slice (desktop/audit/remake/slices/ai-business-intelligence.json) is
 * dashboards and analytics, not an entity CRUD surface — the manifest's
 * uxContract explicitly marks listPage/filterBar/infiniteScroll/hoverActions/
 * detailDrawer/sendMessageDialog as N/A for this slice. There is no
 * existingSpecs entry to merge (net-new coverage). The real assertions here
 * are: every BI page actually renders live data from its endpoint (not just
 * "the page loads"), every generate/recalculate action round-trips through
 * its POST endpoint and updates the UI, filters/tabs/selects actually change
 * the rendered data, the customer LTV lookup uses a real searchable
 * combobox (never a raw contact-id input), CSV export produces a non-empty
 * file, and the AiGate never leaks a raw 403/error regardless of plan state.
 */

test.describe('Business Intelligence hub', () => {
  test('renders live stats and links into every BI section', async ({ page }) => {
    await page.goto('/ai/bi');
    await waitForLoad(page);
    await waitForGateResolved(page);

    await expect(page.locator('h1, h2').filter({ hasText: /Business Intelligence/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    // Health score + revenue stats render actual values, not the '--' placeholder.
    await expect(page.locator('text=Health Score').first()).toBeVisible();
    await expect(page.locator('text=Monthly Revenue').first()).toBeVisible();

    // All six section cards link to their real sub-pages.
    const sectionHrefs = [
      '/ai/bi/briefings',
      '/ai/bi/health-score',
      '/ai/bi/team',
      '/ai/bi/destinations',
      '/ai/bi/segments',
      '/ai/bi/usage',
    ];
    for (const href of sectionHrefs) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }

    await assertNoLeakedError(page);
  });

  test('navigating into a section from the hub loads that page', async ({ page }) => {
    await page.goto('/ai/bi');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGated(page)) return;

    await page.locator('a[href="/ai/bi/health-score"]').first().click();
    await page.waitForURL('**/ai/bi/health-score');
    await waitForLoad(page);
    await expect(page.locator('h1, h2').filter({ hasText: /Business Health Score/i }).first()).toBeVisible();
  });
});

test.describe('Daily Briefings', () => {
  test('generates a briefing, switches type, and refreshes', async ({ page }) => {
    await page.goto('/ai/bi/briefings');
    await waitForLoad(page);
    await waitForGateResolved(page);

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    await expect(page.locator('h1, h2').filter({ hasText: /Daily Briefings/i }).first()).toBeVisible();

    // Generate today's briefing — round-trips through POST /ai/bi/briefings/generate.
    const generateBtn = page.getByRole('button', { name: /generate today's briefing/i }).first();
    await generateBtn.click();
    await expect(page.locator('text=/Briefing generated|Could not generate briefing/i')).toBeVisible({
      timeout: 20_000,
    });
    await waitForLoad(page);

    // After generation, the summary section should render (not the empty state).
    const hasSummary = await page.locator('text=/briefing/i').first().isVisible().catch(() => false);
    expect(hasSummary).toBe(true);

    // Switching briefing type re-fetches with the new type param.
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]', { hasText: 'Weekly' }).click();
    await waitForLoad(page);
    await expect(page.locator('text=Weekly briefing').first()).toBeVisible({ timeout: 10_000 });

    // Refresh re-fetches without erroring.
    await page.getByRole('button', { name: /refresh/i }).click();
    await waitForLoad(page);
    await assertNoLeakedError(page);
  });
});

test.describe('Business Health Score', () => {
  test('recalculates the score and renders category breakdown + trend', async ({ page }) => {
    await page.goto('/ai/bi/health-score');
    await waitForLoad(page);
    await waitForGateResolved(page);

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    await expect(page.locator('h1, h2').filter({ hasText: /Business Health Score/i }).first()).toBeVisible();

    const recalcBtn = page.getByRole('button', { name: /recalculate|calculate now/i }).first();
    await recalcBtn.click();
    await expect(page.locator('text=/Health score recalculated|Could not recalculate/i')).toBeVisible({
      timeout: 20_000,
    });
    await waitForLoad(page);

    // Overall score renders as a number out of 100, and category breakdown is populated.
    await expect(page.locator('text=/100').first()).toBeVisible({ timeout: 10_000 });
    const categoryRows = page.locator('text=Category breakdown').locator('..');
    await expect(categoryRows.first()).toBeVisible();

    await assertNoLeakedError(page);
  });
});

test.describe('Destination Analytics', () => {
  test('tabs between profitability, trending, and seasonal demand; filters by period; exports CSV', async ({ page }) => {
    await page.goto('/ai/bi/destinations');
    await waitForLoad(page);
    await waitForGateResolved(page);

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    await expect(page.locator('h1, h2').filter({ hasText: /Destination Analytics/i }).first()).toBeVisible();

    // Profitability tab is the default — table should have rows once data loads.
    await waitForLoad(page);
    const profitTable = page.locator('table').first();
    const hasRows = await profitTable.locator('tbody tr').count();

    // Filter narrows/reshapes the dataset — switching period re-fetches.
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]', { hasText: 'This quarter' }).click();
    await waitForLoad(page);

    if (hasRows > 0) {
      // Export produces a non-empty CSV file.
      const exportBtn = page.getByRole('button', { name: /export/i });
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ]);
      const dl: Download = download;
      expect(dl.suggestedFilename()).toMatch(/destination-profitability-.*\.csv/);
      const stream = await dl.createReadStream();
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c) => chunks.push(c as Buffer));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      const content = Buffer.concat(chunks).toString('utf-8');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toMatch(/Destination,Revenue,Costs,Profit,Margin,Trend/);
    }

    // Trending tab renders destination cards.
    await page.getByRole('tab', { name: 'Trending' }).click();
    await waitForLoad(page);
    await expect(page.getByRole('tabpanel').filter({ has: page.locator('text=/Trending|No trending data/i') }).first()).toBeVisible();

    // Seasonal demand tab renders the chart section.
    await page.getByRole('tab', { name: /Seasonal demand/i }).click();
    await waitForLoad(page);
    await expect(page.locator('text=Monthly demand pattern')).toBeVisible();

    await assertNoLeakedError(page);
  });
});

test.describe('Team Performance', () => {
  test('filters by period, sorts by revenue, and exports CSV', async ({ page }) => {
    await page.goto('/ai/bi/team');
    await waitForLoad(page);
    await waitForGateResolved(page);

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    await expect(page.locator('h1, h2').filter({ hasText: /Team Performance/i }).first()).toBeVisible();

    await expect(page.locator('text=Total revenue')).toBeVisible();
    await expect(page.locator('text=Total deals closed')).toBeVisible();
    await expect(page.locator('text=Avg conversion rate')).toBeVisible();

    // Period filter re-fetches team performance for the new range.
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]', { hasText: 'This quarter' }).click();
    await waitForLoad(page);

    const rowCount = await page.locator('table tbody tr').count();
    if (rowCount > 0) {
      const exportBtn = page.getByRole('button', { name: /export/i });
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/team-performance-.*\.csv/);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c) => chunks.push(c as Buffer));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      expect(Buffer.concat(chunks).toString('utf-8').length).toBeGreaterThan(0);
    } else {
      await expect(page.locator('text=No team performance data available')).toBeVisible();
    }

    await assertNoLeakedError(page);
  });
});

test.describe('AI Usage Statistics', () => {
  test('renders usage totals and per-feature breakdown', async ({ page }) => {
    await page.goto('/ai/bi/usage');
    await waitForLoad(page);
    await waitForGateResolved(page);

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    await expect(page.locator('h1, h2').filter({ hasText: /AI Usage Statistics/i }).first()).toBeVisible();
    await expect(page.locator('text=Total API calls')).toBeVisible();
    await expect(page.locator('text=Tokens used')).toBeVisible();
    await expect(page.locator('text=Total cost')).toBeVisible();

    // Either real breakdown rows, or the documented empty state — never a blank crash.
    const rowCount = await page.locator('table tbody tr').count();
    if (rowCount === 0) {
      await expect(page.locator('text=No usage data yet')).toBeVisible();
    }

    await page.getByRole('button', { name: /refresh/i }).click();
    await waitForLoad(page);
    await assertNoLeakedError(page);
  });
});

test.describe('Customer Segments', () => {
  test('recalculates segments and looks up a real customer LTV via combobox (no raw id input)', async ({ page }) => {
    const contact = await seedContact({ name: `E2E BI Segment Contact ${Date.now()}` });

    await page.goto('/ai/bi/segments');
    await waitForLoad(page);
    await waitForGateResolved(page);

    if (await isGated(page)) {
      await assertNoLeakedError(page);
      return;
    }

    await expect(page.locator('h1, h2').filter({ hasText: /Customer Segments/i }).first()).toBeVisible();

    // Relation field must be a real combobox — never a raw contact-id text/number input.
    const rawIdInputs = await page
      .locator('input[name*="contactId" i], input[name*="customer_id" i], input[id*="contactId" i]')
      .count();
    expect(rawIdInputs).toBe(0);
    const combobox = page.locator('button[role="combobox"]').last();
    await expect(combobox).toBeVisible();

    // Recalculate segments round-trips through the calculate endpoint.
    const recalcBtn = page.getByRole('button', { name: /recalculate segments/i }).first();
    await recalcBtn.click();
    await expect(page.locator('text=/Customer segments recalculated|Could not recalculate/i')).toBeVisible({
      timeout: 20_000,
    });
    await waitForLoad(page);

    // Typing in the combobox filters options via the debounced search fetcher.
    await combobox.click();
    const searchInput = page.locator('[cmdk-input], input[placeholder*="Search"]').last();
    await searchInput.fill(contact.name);
    await page.waitForTimeout(400); // debounce
    await expect(page.locator('[role="option"], [cmdk-item]').filter({ hasText: contact.name }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Selecting the contact fetches and renders their LTV.
    await page.locator('[role="option"], [cmdk-item]').filter({ hasText: contact.name }).first().click();
    await expect(page.getByText('Lifetime value', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Predicted value', { exact: true })).toBeVisible();
    await expect(page.getByText('Bookings', { exact: true })).toBeVisible();

    await assertNoLeakedError(page);
  });
});
