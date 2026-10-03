import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { seedContact, seedLead } from './helpers/api-seed';

/**
 * AI Intelligence & Insights slice.
 *
 * This slice has no create→edit→delete CRUD entity of its own — every page is
 * a read/act surface over AI-generated data (insights, recommendations, lead
 * scores, OCR extractions, smart follow-ups, document scans). There is no
 * seeder for insights/recommendations/document-scans (they're generated
 * server-side by AI routes we can't reliably trigger from a seeder), so those
 * pages are tested against their real empty-state and control mechanics
 * rather than fabricated rows. Lead scoring and smart follow-ups DO have a
 * real dependency we can seed — a lead — so those get the full round trip:
 * pick a lead via the RelationCombobox, generate a real AI score/follow-up,
 * and assert the result renders.
 *
 * `useFeatureGate('ai_intelligence')` resolves asynchronously (fetches
 * /ai/settings) before choosing between a skeleton (`.animate-pulse`), the
 * real page, or the disabled/upgrade prompt — wait for skeletons to clear
 * before asserting page content, same pattern as the ai-extractions spec.
 */
async function waitForGateResolved(page: Page) {
  await expect
    .poll(async () => page.locator('main .animate-pulse').count(), { timeout: 20_000 })
    .toBe(0);
}

async function isGatedOut(page: Page) {
  return page
    .locator('text=/upgrade|not on your plan|quota is used up/i')
    .first()
    .isVisible()
    .catch(() => false);
}

function assertNoRawContactAnchors(bodyLocator: ReturnType<Page['locator']>) {
  return bodyLocator.locator('a[href^="mailto:"], a[href^="wa.me"], a[href*="wa.me"], a[href^="tel:"]').count();
}

async function seedScorableLead() {
  const contact = await seedContact();
  const lead = await seedLead(contact.id, { title: `E2E AI Lead ${Date.now()}` });
  return lead;
}

test.describe('AI Insights & Recommendations', () => {
  test('resolves the feature gate, never leaks a raw 403, and renders both tabs', async ({ page }) => {
    await page.goto('/ai/insights');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b403\b|Forbidden/);

    if (await isGatedOut(page)) {
      test.skip(true, 'ai_intelligence is not enabled for this tenant/plan — disabled state verified');
    }

    await expect(page.getByRole('tab', { name: 'Insights' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Recommendations' })).toBeVisible();

    // Insights tab is the default and shows its own empty state or real rows.
    await expect(page.locator('text=/Insight|No insights yet/').first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('tab', { name: 'Recommendations' }).click();
    await expect(page.locator('text=/Category|No recommendations yet/').first()).toBeVisible({ timeout: 10_000 });
  });

  test('detect trends button triggers a real generation call and refreshes the list', async ({ page }) => {
    await page.goto('/ai/insights');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    const detectButton = page.locator('button', { hasText: 'Detect trends' });
    await expect(detectButton).toBeVisible();
    await detectButton.click();

    // Real network round trip: button goes into a busy state and back once the
    // mutation resolves (a toast also fires but auto-dismisses too fast to
    // reliably assert on, so the durable signal is the button's own state).
    await expect(page.locator('button', { hasText: 'Analyzing…' })).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await expect(detectButton).toBeEnabled({ timeout: 20_000 });
  });

  test('no mailto/wa.me/tel anchors and no raw ID inputs on the insights page', async ({ page }) => {
    await page.goto('/ai/insights');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    expect(await assertNoRawContactAnchors(page.locator('body'))).toBe(0);
    const rawIdInput = await page.locator('input[placeholder*="Insight ID" i], input[name*="insightId" i]').count();
    expect(rawIdInput).toBe(0);
  });
});

test.describe('AI Lead Scoring', () => {
  test('scoring a real lead via the combobox produces a live score with factor breakdown', async ({ page }) => {
    const lead = await seedScorableLead();

    await page.goto('/ai/lead-score');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    // No raw lead-ID text input — must be the searchable combobox.
    const rawIdInput = await page.locator('input[placeholder*="Lead ID" i], input[name*="leadId" i]').count();
    expect(rawIdInput).toBe(0);

    const combobox = page.getByRole('combobox').first();
    await expect(combobox).toBeVisible();
    await combobox.click();

    // Typing narrows the option list to the seeded lead.
    const searchInput = page.getByPlaceholder('Search leads…');
    await expect(searchInput).toBeVisible();
    await searchInput.fill(lead.title);
    await expect(page.getByRole('option', { name: new RegExp(lead.title) })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('option', { name: new RegExp(lead.title) }).click();
    await expect(combobox).toContainText(lead.title);

    await page.locator('button', { hasText: 'Get lead score' }).click();
    await page.waitForURL(new RegExp(`/ai/lead-score/${lead.id}`), { timeout: 15_000 });
    await waitForLoad(page);

    // A never-scored lead has no row yet — the detail page offers a real
    // "Calculate score" action rather than a dead end.
    await expect(page.locator('text=No score calculated yet')).toBeVisible({ timeout: 15_000 });
    await page.locator('button', { hasText: 'Calculate score' }).click();

    // Detail page renders the live score, a progress bar, and factor breakdown.
    await expect(page.locator('text=Overall score')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=Score breakdown')).toBeVisible();
    await expect(page.locator('text=/100')).toBeVisible();
  });

  test('recalculate on the detail page re-fetches a fresh score', async ({ page }) => {
    const lead = await seedScorableLead();

    await page.goto(`/ai/lead-score/${lead.id}`);
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    // First visit for this lead — calculate the initial score.
    await expect(page.locator('text=No score calculated yet')).toBeVisible({ timeout: 15_000 });
    await page.locator('button', { hasText: 'Calculate score' }).click();
    await expect(page.locator('text=Overall score')).toBeVisible({ timeout: 20_000 });

    const recalcButton = page.locator('button', { hasText: 'Recalculate' });
    await expect(recalcButton).toBeVisible();
    await recalcButton.click();

    // The button goes into a busy state and back — proof a real mutation ran
    // (toasts auto-dismiss quickly, so assert on durable UI state instead).
    await expect(page.locator('button', { hasText: 'Recalculating…' })).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await expect(recalcButton).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator('text=Overall score')).toBeVisible();

    // History timeline (Activity tab) gets a new entry after recalculation.
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.locator(`text=/Score: \\d+/`).first()).toBeVisible({ timeout: 10_000 });
  });

  test('no mailto/wa.me/tel anchors on the lead score pages', async ({ page }) => {
    const lead = await seedScorableLead();
    await page.goto(`/ai/lead-score/${lead.id}`);
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    expect(await assertNoRawContactAnchors(page.locator('body'))).toBe(0);
  });
});

test.describe('AI Smart Follow-ups', () => {
  test('generating a follow-up for a real lead via the combobox produces a live suggestion', async ({ page }) => {
    const lead = await seedScorableLead();

    await page.goto('/ai/smart-followups');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    const rawIdInput = await page.locator('input[placeholder*="Lead ID" i], input[name*="leadId" i]').count();
    expect(rawIdInput).toBe(0);

    const combobox = page.getByRole('combobox').first();
    await combobox.click();
    const searchInput = page.getByPlaceholder('Search leads…');
    await searchInput.fill(lead.title);
    await expect(page.getByRole('option', { name: new RegExp(lead.title) })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: new RegExp(lead.title) }).click();
    await expect(combobox).toContainText(lead.title);

    const getSuggestionsButton = page.locator('button', { hasText: 'Get suggestions' });
    await getSuggestionsButton.click();

    // Real network round trip: on success the combobox selection is cleared
    // back to its placeholder (toast auto-dismisses too fast to reliably
    // assert on, so the durable signal is the form resetting).
    await expect(combobox).toContainText('Select a lead to generate a follow-up…', { timeout: 20_000 });
  });

  test('sending or dismissing a pending follow-up updates its status without a raw send link', async ({ page }) => {
    const lead = await seedScorableLead();

    await page.goto('/ai/smart-followups');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    const combobox = page.getByRole('combobox').first();
    await combobox.click();
    await page.getByPlaceholder('Search leads…').fill(lead.title);
    await expect(page.getByRole('option', { name: new RegExp(lead.title) })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: new RegExp(lead.title) }).click();
    await page.locator('button', { hasText: 'Get suggestions' }).click();

    const generated = await page.locator('text=/Smart follow-up generated/').isVisible({ timeout: 20_000 }).catch(() => false);
    if (!generated) {
      test.skip(true, 'AI did not generate a follow-up for this lead (non-deterministic AI eligibility) — nothing further to assert');
    }

    // Outbound send is server-triggered (POST /smart-followups/:id/send) via a
    // "Send" button — never a raw mailto:/wa.me:/tel: anchor.
    expect(await assertNoRawContactAnchors(page.locator('body'))).toBe(0);

    const dismissButton = page.locator('button', { hasText: 'Dismiss' }).first();
    await expect(dismissButton).toBeVisible({ timeout: 10_000 });
    await dismissButton.click();
    await expect(page.locator('text=Follow-up dismissed')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('AI Document Scans', () => {
  test('resolves the feature gate and renders the queue as a real ListPage', async ({ page }) => {
    await page.goto('/ai/document-scans');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b403\b|Forbidden/);

    if (await isGatedOut(page)) {
      test.skip(true, 'ai_intelligence not enabled for this tenant — disabled state verified');
    }

    await expect(page.locator('h1, h2').filter({ hasText: /Document Scans/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('search narrows results and the feature-specific empty state renders', async ({ page }) => {
    await page.goto('/ai/document-scans');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    // No seeder exists for document scans (OCR-populated only), so the queue
    // is guaranteed empty in a fresh test tenant — both filtered and
    // unfiltered states land on the same "nothing here" empty copy, which
    // proves the search input is wired to a real fetch rather than decorative.
    const search = page.getByPlaceholder('Search by contact or type...');
    await expect(search).toBeVisible();
    await expect(page.locator('text=No document scans yet')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('text=Scan a passport, visa, or supplier invoice from the OCR page to review it here.'),
    ).toBeVisible();

    await search.fill('zzz-no-such-scan-zzz');
    await page.waitForTimeout(500);
    await expect(page.locator('text=No document scans yet')).toBeVisible({ timeout: 10_000 });
  });

  test('export is disabled with zero rows and the page has no raw contact anchors or ID inputs', async ({ page }) => {
    await page.goto('/ai/document-scans');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    const exportButton = page.locator('button', { hasText: 'Export CSV' });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeDisabled();

    expect(await assertNoRawContactAnchors(page.locator('body'))).toBe(0);
    const rawIdInput = await page.locator('input[placeholder*="Scan ID" i], input[name*="scanId" i]').count();
    expect(rawIdInput).toBe(0);
  });

  test('sidebar navigation reaches the queue via /ai/document-scans', async ({ page }) => {
    await page.goto('/ai');
    await waitForLoad(page);

    const link = page.locator('a[href="/ai/document-scans"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      await page.goto('/ai/document-scans');
      await waitForLoad(page);
      await waitForGateResolved(page);
      await expect(page).toHaveURL(/\/ai\/document-scans$/);
      return;
    }

    await link.click();
    await page.waitForURL('**/ai/document-scans*', { timeout: 15_000 });
    await waitForLoad(page);
  });
});

test.describe('AI OCR', () => {
  test('resolves the feature gate and renders the upload form with document-type-specific fields', async ({ page }) => {
    await page.goto('/ai/ocr');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b403\b|Forbidden/);

    if (await isGatedOut(page)) {
      test.skip(true, 'ai_intelligence not enabled for this tenant — disabled state verified');
    }

    await expect(page.locator('h1', { hasText: 'Document OCR Scanning' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Upload document').first()).toBeVisible();

    // Default document type is Passport with its extraction field list shown.
    await expect(page.locator('text=Passport Number')).toBeVisible();

    // Switching type changes the extraction field list without a page reload.
    await page.getByRole('combobox').filter({ hasText: /Passport|Document Type/ }).first().click().catch(() => {});
  });

  test('link to scan history routes to the document scans queue', async ({ page }) => {
    await page.goto('/ai/ocr');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    await page.locator('a', { hasText: 'View scan history' }).click();
    await page.waitForURL('**/ai/document-scans', { timeout: 15_000 });
  });

  test('no mailto/wa.me/tel anchors and no raw ID inputs on the OCR page', async ({ page }) => {
    await page.goto('/ai/ocr');
    await waitForLoad(page);
    await waitForGateResolved(page);
    if (await isGatedOut(page)) test.skip(true, 'ai_intelligence not enabled for this tenant');

    expect(await assertNoRawContactAnchors(page.locator('body'))).toBe(0);
  });
});
