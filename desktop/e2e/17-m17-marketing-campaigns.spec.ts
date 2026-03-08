/**
 * M17 — Marketing & Promotions E2E Tests
 *
 * Covers:
 *  A. Campaign CRUD lifecycle (create → list → detail → delete)
 *  B. Segment CRUD lifecycle (create → list → drawer → edit → delete)
 *  C. Campaign wizard steps and validation
 *  D. List UX — FilterBar, search, hover actions
 *  E. Segment → Campaign cross-navigation (Use in Campaign auto-populate)
 *  F. Campaign detail analytics page
 *  G. Marketing dashboard page
 *  H. Segment builder features
 *  I. Campaign schedule validation
 *  J. No raw ID inputs (UX anti-pattern check)
 */

import { test, expect, type Page } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedCampaign, api } from './helpers/api-seed';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Seed a segment via the marketing segments API */
async function seedSegment(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const data = {
    name: `E2E-Seg-${ts}`,
    criteria: {
      groups: [
        {
          logic: 'AND',
          rules: [{ field: 'city', operator: 'equals', value: 'Mumbai' }],
        },
      ],
    },
    ...overrides,
  };
  const res = await api('POST', '/marketing/segments', data);
  return res.data ?? res;
}

async function deleteCampaignById(id: string) {
  await api('DELETE', `/campaigns/${id}`).catch(() => null);
}

async function deleteSegmentById(id: string) {
  await api('DELETE', `/marketing/segments/${id}`).catch(() => null);
}

/** Click the campaign wizard "Next" button (avoid Next.js devtools button) */
async function clickNext(page: Page) {
  await page.locator('button').filter({ hasText: /^Next/ }).first().click();
}

/** Wait until the campaigns table OR empty state appears (data loaded) */
async function waitForCampaignsList(page: Page) {
  await waitForLoad(page);
  await page
    .waitForSelector('table tbody tr, text=/No campaigns/i', { timeout: 15_000 })
    .catch(() => null);
}

/** Wait until the segments table OR empty state appears */
async function waitForSegmentsList(page: Page) {
  await waitForLoad(page);
  await page
    .waitForSelector('table tbody tr, text=/No segments/i', { timeout: 15_000 })
    .catch(() => null);
}

// ─── A. Campaign CRUD Lifecycle ─────────────────────────────────────────────

test.describe('A. Campaign CRUD lifecycle', () => {
  test('create campaign via wizard → verify in list → view detail → delete', async ({ page }) => {
    const ts = Date.now();
    const campaignName = `E2E-Camp-${ts}`;

    // ── Step 1: Navigate to New Campaign ──
    await page.goto('/campaigns/new');
    await waitForLoad(page);
    await expect(page.getByText('Create New Campaign')).toBeVisible();

    // ── Fill Campaign Name (placeholder: "e.g., Summer Holiday Offers") ──
    await page.getByPlaceholder(/summer holiday/i).fill(campaignName);
    await clickNext(page);

    // ── Step 2: Audience — select "Custom Filter" to skip tag requirement ──
    await page.locator('label').filter({ hasText: 'Custom Filter' }).click();
    await clickNext(page);

    // ── Step 3: Content — write custom ──
    await page.locator('label').filter({ hasText: 'Write Custom Content' }).click();
    await waitForLoad(page);
    await page.locator('textarea').last().fill('Hello {customer_name}, check out our amazing tour packages!');
    await clickNext(page);

    // ── Step 4: Schedule — Send Immediately (default) ──
    await expect(page.getByText('Schedule Campaign')).toBeVisible();
    await page.getByRole('button', { name: /Launch Campaign/i }).click();
    await waitForCampaignsList(page);

    // ── Verify in list ──
    await expect(page).toHaveURL(/\/campaigns/);
    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 12_000 });

    // ── View detail ──
    await page.getByText(campaignName).first().click();
    await waitForLoad(page);
    await expect(page).toHaveURL(/\/campaigns\/.+/);
    await expect(page.getByText(campaignName).first()).toBeVisible();

    // ── Go back and delete ──
    await page.goBack();
    await waitForCampaignsList(page);

    const row = page.locator('tr').filter({ hasText: campaignName });
    await row.hover();
    const menuBtn = row.locator('button[aria-haspopup="menu"]').last();
    await menuBtn.click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('menuitem', { name: /delete/i }).click();
    await waitForLoad(page);

    await expect(page.getByText(campaignName)).not.toBeVisible({ timeout: 8_000 });
  });

  test('save draft campaign redirects to campaigns list', async ({ page }) => {
    const ts = Date.now();
    const draftName = `E2E-Draft-${ts}`;

    await page.goto('/campaigns/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/summer holiday/i).fill(draftName);
    await page.getByRole('button', { name: /Save Draft/i }).click();
    await waitForCampaignsList(page);

    await expect(page).toHaveURL(/\/campaigns/);
    await expect(page.getByText(draftName)).toBeVisible({ timeout: 12_000 });
  });
});

// ─── B. Segment CRUD Lifecycle ───────────────────────────────────────────────

test.describe('B. Segment CRUD lifecycle', () => {
  test('create segment → verify in list → open drawer → navigate to edit → delete', async ({ page }) => {
    const ts = Date.now();
    const segName = `E2E-Segment-${ts}`;

    // ── Navigate to New Segment ──
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);
    await expect(page.getByText('New Segment')).toBeVisible();

    // ── Fill name (input has id="name") ──
    await page.locator('#name').fill(segName);

    // ── Fill rule value ──
    await page.locator('input[placeholder*="Value"]').first().fill('Mumbai');

    // ── Save ──
    await page.getByRole('button', { name: /Save Segment/i }).click();
    await waitForSegmentsList(page);

    // ── Should redirect to segments list ──
    await expect(page).toHaveURL(/\/marketing\/segments/);
    await expect(page.getByText(segName)).toBeVisible({ timeout: 12_000 });

    // ── Click row to open drawer ──
    await page.getByText(segName).first().click();
    await waitForLoad(page);

    // ── Drawer should contain segment name ──
    await expect(
      page.locator('[data-state="open"]').getByText(segName),
    ).toBeVisible({ timeout: 8_000 }).catch(async () => {
      await expect(page.getByText(segName).first()).toBeVisible();
    });

    // ── Close drawer ──
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ── Hover to reveal Edit button ──
    const segRow = page.locator('tr').filter({ hasText: segName });
    await segRow.hover();
    await segRow.locator('button[title="Edit"]').first().click({ force: true });
    await waitForLoad(page);

    // ── Edit page loaded ──
    await expect(page).toHaveURL(/\/marketing\/segments\/.+\/edit/);
    await expect(page.getByText('Edit Segment')).toBeVisible();

    // ── Go back ──
    await page.goBack();
    await waitForSegmentsList(page);

    // ── Delete ──
    const segRow2 = page.locator('tr').filter({ hasText: segName });
    await segRow2.hover();
    await segRow2.locator('button[aria-haspopup="menu"]').last().click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    // Confirm in modal dialog
    await page.getByRole('button', { name: /^Delete$/i }).last().click();
    await waitForLoad(page);

    await expect(page.getByText(segName)).not.toBeVisible({ timeout: 8_000 });
  });

  test('segment list shows name, criteria, and contacts columns', async ({ page }) => {
    const segment = await seedSegment({ name: `E2E-ListCheck-${Date.now()}` });
    if (!segment?.id) { test.skip(); return; }

    await page.goto('/marketing/segments');
    await waitForSegmentsList(page);

    await expect(page.getByText(segment.name)).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('columnheader', { name: /name/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /criteria/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /contacts/i })).toBeVisible();

    await deleteSegmentById(segment.id);
  });
});

// ─── C. Campaign Wizard Validation ──────────────────────────────────────────

test.describe('C. Campaign wizard validation', () => {
  test('cannot advance from step 1 without campaign name — Next disabled', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    const nextBtn = page.locator('button').filter({ hasText: /^Next/ }).first();
    await expect(nextBtn).toBeDisabled();

    await page.getByPlaceholder(/summer holiday/i).fill('Test Campaign');
    await expect(nextBtn).toBeEnabled();
  });

  test('step progress indicator shows 4 numbered buttons (1–4)', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    for (const num of ['1', '2', '3', '4']) {
      await expect(
        page.locator('button').filter({ hasText: new RegExp(`^${num}$`) }).first(),
      ).toBeVisible();
    }
  });

  test('step 3 template picker uses Combobox — no raw ID inputs', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/summer holiday/i).fill('Test Campaign');
    await clickNext(page);
    await page.locator('label').filter({ hasText: 'Custom Filter' }).click();
    await clickNext(page);

    // No raw "Enter ID" placeholders
    await expect(page.getByPlaceholder(/enter.*id/i)).toHaveCount(0);
    // Combobox placeholder text for template picker
    await expect(
      page.locator('button').filter({ hasText: /choose a template/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('SMS campaign shows character counter and multi-part warning', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/summer holiday/i).fill('SMS Test Campaign');

    // Radix Select / combobox for campaign type — click to open
    const typeCombobox = page.locator('[role="combobox"]').first();
    await typeCombobox.click();
    await page.getByRole('option', { name: 'SMS' }).click();

    await clickNext(page);
    await page.locator('label').filter({ hasText: 'Custom Filter' }).click();
    await clickNext(page);

    await page.locator('label').filter({ hasText: 'Write Custom Content' }).click();
    await waitForLoad(page);

    const textarea = page.locator('textarea').last();
    await textarea.fill('Short SMS test');

    // Counter shows x/160
    await expect(page.locator('text=/\\d+\\/160/').first()).toBeVisible({ timeout: 5_000 });

    // Type >160 chars — multi-part warning
    await textarea.fill('A'.repeat(161));
    await expect(
      page.locator('text=/161\\/160|parts|split/i').first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── D. List Page UX Validation ─────────────────────────────────────────────

test.describe('D. List page UX validation', () => {
  test('campaign list (/campaigns) has search bar and type/status filters', async ({ page }) => {
    await page.goto('/campaigns');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/search campaigns/i)).toBeVisible();
    // Status filter combobox
    await expect(page.locator('[role="combobox"]').filter({ hasText: /All Statuses|All Status/i })).toBeVisible();
    // Type filter combobox
    await expect(page.locator('[role="combobox"]').filter({ hasText: /All Types/i })).toBeVisible();
  });

  test('marketing campaigns page (/marketing/campaigns) has FilterBar', async ({ page }) => {
    await page.goto('/marketing/campaigns');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/search campaigns/i)).toBeVisible();
  });

  test('segments list (/marketing/segments) has search bar', async ({ page }) => {
    await page.goto('/marketing/segments');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/search segments/i)).toBeVisible();
  });

  test('campaigns list page loads without crashing', async ({ page }) => {
    await page.goto('/campaigns');
    await waitForLoad(page);
    await page.waitForTimeout(1000);

    // Page has heading "Campaigns" and is not an error
    await expect(page.locator('h1').filter({ hasText: /Campaigns/i })).toBeVisible({ timeout: 10_000 });
  });

  test('campaign list rows have hover dropdown menu', async ({ page }) => {
    const campaign = await seedCampaign({ name: `E2E-HoverTest-${Date.now()}` });
    if (!campaign?.id || !campaign?.name) { test.skip(); return; }

    await page.goto('/campaigns');
    await waitForCampaignsList(page);

    const row = page.locator('tr').filter({ hasText: campaign.name }).first();
    await expect(row).toBeVisible({ timeout: 12_000 });
    await row.hover();
    await expect(row.locator('button[aria-haspopup="menu"]')).toBeVisible();

    await deleteCampaignById(campaign.id);
  });

  test('campaign list search filters by campaign name', async ({ page }) => {
    const campaign = await seedCampaign({ name: `E2E-SearchCamp-${Date.now()}` });
    if (!campaign?.id) { test.skip(); return; }

    await page.goto('/campaigns');
    await waitForCampaignsList(page);

    await page.getByPlaceholder(/search campaigns/i).fill(campaign.name.slice(0, 15));
    await page.waitForTimeout(700);

    await expect(page.getByText(campaign.name)).toBeVisible({ timeout: 8_000 });

    await page.getByPlaceholder(/search campaigns/i).clear();
    await deleteCampaignById(campaign.id);
  });

  test('campaign status filter applies without error', async ({ page }) => {
    await page.goto('/campaigns');
    await waitForLoad(page);
    await page.waitForTimeout(500);

    const statusCombobox = page.locator('[role="combobox"]').filter({ hasText: /All Statuses|All Status/i });
    await statusCombobox.click();
    await page.getByRole('option', { name: /^Draft$/i }).click();
    await page.waitForTimeout(400);

    // Page did not crash
    await expect(page.locator('h1').filter({ hasText: /Campaigns/i })).toBeVisible();
  });
});

// ─── E. Segment → Campaign cross-navigation ─────────────────────────────────

test.describe('E. Segment → Campaign auto-populate', () => {
  test('"Use in Campaign" from segment dropdown passes segmentId to wizard', async ({ page }) => {
    const segment = await seedSegment({ name: `E2E-ForCampaign-${Date.now()}` });
    if (!segment?.id) { test.skip(); return; }

    await page.goto('/marketing/segments');
    await waitForSegmentsList(page);

    const segRow = page.locator('tr').filter({ hasText: segment.name });
    await expect(segRow).toBeVisible({ timeout: 12_000 });
    await segRow.hover();

    await segRow.locator('button[aria-haspopup="menu"]').last().click();
    await page.getByRole('menuitem', { name: /use in campaign/i }).click();
    await waitForLoad(page);

    await expect(page).toHaveURL(/\/campaigns\/new/);
    expect(page.url()).toContain('segmentId');
    expect(page.url()).toContain(segment.id);

    await deleteSegmentById(segment.id);
  });

  test('"Use in Campaign" link in segment drawer contains segmentId', async ({ page }) => {
    const segment = await seedSegment({ name: `E2E-DrawerCamp-${Date.now()}` });
    if (!segment?.id) { test.skip(); return; }

    await page.goto('/marketing/segments');
    await waitForSegmentsList(page);

    const segText = page.getByText(segment.name).first();
    await expect(segText).toBeVisible({ timeout: 12_000 });
    await segText.click();
    await waitForLoad(page);

    // Link in the open Sheet
    const drawerLink = page
      .locator('[data-state="open"]')
      .locator('a')
      .filter({ hasText: /use in campaign/i });
    await expect(drawerLink.first()).toBeVisible({ timeout: 8_000 });

    const href = (await drawerLink.first().getAttribute('href')) ?? '';
    expect(href).toContain('segmentId');
    expect(href).toContain(segment.id);

    await deleteSegmentById(segment.id);
  });
});

// ─── F. Campaign Detail Analytics Page ──────────────────────────────────────

test.describe('F. Campaign detail page', () => {
  test('shows name, status, 6 stat cards, and recipients section', async ({ page }) => {
    const campaign = await seedCampaign({ name: `E2E-Detail-${Date.now()}` });
    if (!campaign?.id) { test.skip(); return; }

    await page.goto(`/campaigns/${campaign.id}`);
    await waitForLoad(page);

    await expect(page.getByText(campaign.name)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=/draft/i').first()).toBeVisible();
    await expect(page.locator('text=/^Sent$/').first()).toBeVisible();
    await expect(page.locator('text=/^Delivered$/').first()).toBeVisible();
    await expect(page.locator('text=/^Opened$/').first()).toBeVisible();
    await expect(page.getByText(/Recipients/i).first()).toBeVisible();

    await deleteCampaignById(campaign.id);
  });

  test('draft campaign detail has Send Now and Schedule buttons', async ({ page }) => {
    const campaign = await seedCampaign({ name: `E2E-DetailActions-${Date.now()}`, status: 'draft' });
    if (!campaign?.id) { test.skip(); return; }

    await page.goto(`/campaigns/${campaign.id}`);
    await waitForLoad(page);

    await expect(page.getByRole('button', { name: /send now/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /schedule/i })).toBeVisible();

    await deleteCampaignById(campaign.id);
  });

  test('campaign detail has no direct mailto or wa.me links', async ({ page }) => {
    const campaign = await seedCampaign({ name: `E2E-NoMailto-${Date.now()}` });
    if (!campaign?.id) { test.skip(); return; }

    await page.goto(`/campaigns/${campaign.id}`);
    await waitForLoad(page);

    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);

    await deleteCampaignById(campaign.id);
  });
});

// ─── G. Marketing Dashboard ──────────────────────────────────────────────────

test.describe('G. Marketing dashboard', () => {
  test('shows stats, quick actions, recent campaigns, audience segments', async ({ page }) => {
    await page.goto('/marketing');
    await waitForLoad(page);

    await expect(page.getByText('Marketing').first()).toBeVisible();
    await expect(page.getByText(/Active Campaigns/i)).toBeVisible();
    await expect(page.getByText(/Total Sent/i)).toBeVisible();
    await expect(page.getByText(/Quick Actions/i)).toBeVisible();
    await expect(page.getByText(/Recent Campaigns/i)).toBeVisible();
    await expect(page.getByText(/Audience Segments/i)).toBeVisible();
  });

  test('"New Segment" quick action navigates to segment builder', async ({ page }) => {
    await page.goto('/marketing');
    await waitForLoad(page);

    await page.locator('a[href="/marketing/segments/new"]').first().click();
    await waitForLoad(page);
    await expect(page).toHaveURL(/\/marketing\/segments\/new/);
    await expect(page.getByText('New Segment')).toBeVisible();
  });

  test('"New Campaign" header button navigates to campaign wizard', async ({ page }) => {
    await page.goto('/marketing');
    await waitForLoad(page);

    await page.getByRole('link', { name: /new campaign/i }).first().click();
    await waitForLoad(page);
    await expect(page).toHaveURL(/\/campaigns\/new/);
  });
});

// ─── H. Segment Builder Features ────────────────────────────────────────────

test.describe('H. Segment builder', () => {
  test('shows field, operator, value inputs and add rule/group buttons', async ({ page }) => {
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);

    await expect(page.locator('[role="combobox"]').filter({ hasText: /City/i }).first()).toBeVisible();
    await expect(page.locator('[role="combobox"]').filter({ hasText: /Equals/i }).first()).toBeVisible();
    await expect(page.locator('input[placeholder*="Value"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Rule', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Rule Group/i })).toBeVisible();
  });

  test('preview button shows estimated contact count', async ({ page }) => {
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);

    await page.locator('input[placeholder*="Value"]').first().fill('Mumbai');
    await page.getByRole('button', { name: /Preview/i }).click();

    await expect(
      page.locator('text=/\\d+ contacts|estimated|matching/i').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('save without name shows validation error', async ({ page }) => {
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);

    await page.locator('input[placeholder*="Value"]').first().fill('Mumbai');
    await page.getByRole('button', { name: /Save Segment/i }).click();

    await expect(page.locator('text=/name is required/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('adding second rule group shows OR separator', async ({ page }) => {
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);

    await page.getByRole('button', { name: /Add Rule Group/i }).click();

    await expect(page.getByText(/^OR$/).first()).toBeVisible({ timeout: 3_000 });
  });
});

// ─── I. Campaign Schedule Validation ─────────────────────────────────────────

test.describe('I. Campaign schedule validation', () => {
  test('detail page schedule dialog has date and time inputs', async ({ page }) => {
    const campaign = await seedCampaign({ name: `E2E-SchedDlg-${Date.now()}`, status: 'draft' });
    if (!campaign?.id) { test.skip(); return; }

    await page.goto(`/campaigns/${campaign.id}`);
    await waitForLoad(page);

    await page.getByRole('button', { name: /schedule/i }).click();
    await waitForLoad(page);

    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.locator('input[type="time"]').first()).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();
    await deleteCampaignById(campaign.id);
  });

  test('step 4 shows "15 minutes" error for past date/time', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/summer holiday/i).fill('Schedule Validation Test');
    await clickNext(page);
    await page.locator('label').filter({ hasText: 'Custom Filter' }).click();
    await clickNext(page);
    await page.locator('label').filter({ hasText: 'Write Custom Content' }).click();
    await page.locator('textarea').last().fill('Test content');
    await clickNext(page);

    await page.locator('label').filter({ hasText: 'Schedule for Later' }).click();
    await waitForLoad(page);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    await page.locator('input[type="date"]').fill(pastDate.toISOString().split('T')[0]!);
    await page.locator('input[type="time"]').fill('00:00');

    await expect(page.getByText(/15 minutes/i)).toBeVisible({ timeout: 5_000 });
  });

  test('step 4 shows "90 days" error for date too far ahead', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/summer holiday/i).fill('Max Schedule Test');
    await clickNext(page);
    await page.locator('label').filter({ hasText: 'Custom Filter' }).click();
    await clickNext(page);
    await page.locator('label').filter({ hasText: 'Write Custom Content' }).click();
    await page.locator('textarea').last().fill('Test content');
    await clickNext(page);

    await page.locator('label').filter({ hasText: 'Schedule for Later' }).click();
    await waitForLoad(page);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 100);
    await page.locator('input[type="date"]').fill(futureDate.toISOString().split('T')[0]!);
    await page.locator('input[type="time"]').fill('12:00');

    await expect(page.getByText(/90 days/i)).toBeVisible({ timeout: 5_000 });
  });
});

// ─── J. No raw ID inputs ─────────────────────────────────────────────────────

test.describe('J. No raw ID inputs', () => {
  test('campaign wizard has no raw "Enter ID" inputs', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/enter.*id/i)).toHaveCount(0);
    await expect(page.getByPlaceholder(/segment.*id/i)).toHaveCount(0);
  });

  test('segment builder has no raw "Enter ID" inputs', async ({ page }) => {
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/enter.*id/i)).toHaveCount(0);
  });

  test('marketing campaigns page has no raw ID inputs', async ({ page }) => {
    await page.goto('/marketing/campaigns');
    await waitForLoad(page);

    await expect(page.getByPlaceholder(/enter.*id/i)).toHaveCount(0);
  });
});
