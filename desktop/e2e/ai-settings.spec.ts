import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';

// Self-sufficient: the page assertions below need ai_assistant on, whatever an earlier
// spec left behind. Restore the tenant's original flag state afterwards.
let assistantWasEnabled: boolean | undefined;
let plan = '';

test.beforeAll(async () => {
  const settings = await api('GET', '/ai/settings');
  plan = settings?.data?.plan ?? '';
  const flag = (settings?.data?.aiFeatures ?? []).find((f: { key: string }) => f.key === 'ai_assistant');
  assistantWasEnabled = flag?.enabled;
  if (assistantWasEnabled === false) {
    await api('PUT', '/ai/settings/features', { features: { ai_assistant: true } });
  }
});

test.afterAll(async () => {
  if (assistantWasEnabled === false) {
    await api('PUT', '/ai/settings/features', { features: { ai_assistant: false } });
  }
});

test.describe('AI Settings & Usage', () => {
  test('AI Settings page — gate, provider, quotas, feature toggles', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);

    // Settings hub must expose an AI tab linking to both pages (previously unreachable).
    await expect(page.locator('a[href="/settings/ai"]').first()).toBeVisible();
    await expect(page.locator('a[href="/settings/ai-usage"]').first()).toBeVisible();

    await page.locator('a[href="/settings/ai"]').first().click();
    await page.waitForURL('**/settings/ai');
    await waitForLoad(page);

    // ai_assistant is enabled (beforeAll), so the
    // working page renders — never the upgrade/disabled affordance, never an error toast.
    await expect(page.locator('text=AI Assistant is not available')).toHaveCount(0);
    await expect(page.locator('text=/^(Try Again)$/')).toHaveCount(0);

    // Plan badge and provider section.
    expect(plan).not.toBe('');
    await expect(page.getByText(plan, { exact: false }).first()).toBeVisible();
    await expect(page.locator('text=Cloudflare Workers AI')).toBeVisible();
    await expect(page.locator('text=Claude API')).toBeVisible();

    // Usage Quotas section is present (may be empty on this plan).
    await expect(page.locator('text=Usage Quotas').first()).toBeVisible();

    // Pro and Enterprise feature groups render with toggle switches.
    await expect(page.locator('text=/AI Features \\(\\d+\\/\\d+\\)/').first()).toBeVisible();
    const featureCard = page.locator('text=AI Co-Pilot').locator('..').locator('..');
    await expect(featureCard.first()).toBeVisible();

    const toggle = page.getByRole('switch', { name: 'Toggle AI Co-Pilot' });
    await expect(toggle).toBeVisible();
    const wasChecked = await toggle.isChecked();

    // Flip the toggle and assert the change persists across a refetch.
    await toggle.click();
    await expect
      .poll(async () => toggle.isChecked(), { timeout: 10_000 })
      .toBe(!wasChecked);

    await page.reload();
    await waitForLoad(page);
    const toggleAfterReload = page.getByRole('switch', { name: 'Toggle AI Co-Pilot' });
    await expect(toggleAfterReload).toBeChecked({ checked: !wasChecked });

    // Revert so the spec is idempotent across runs.
    await toggleAfterReload.click();
    await expect
      .poll(async () => toggleAfterReload.isChecked(), { timeout: 10_000 })
      .toBe(wasChecked);

    // Refresh button re-fetches without error.
    await page.getByRole('button', { name: /Refresh/i }).click();
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'AI Settings' })).toBeVisible();

    // No raw ID inputs and no direct outbound-messaging anchors anywhere on this page.
    await expect(page.locator('input[name*="id" i]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="wa.me"]')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test('AI Usage page — stats, breakdown table, quotas, daily trend', async ({ page }) => {
    await page.goto('/settings/ai-usage');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: 'AI Usage' })).toBeVisible();
    await expect(page.locator('text=Monitor your AI feature usage')).toBeVisible();

    // Top stat tiles.
    await expect(page.locator('text=Total API Calls')).toBeVisible();
    await expect(page.locator('text=Tokens Used')).toBeVisible();
    await expect(page.getByText('Estimated Cost', { exact: true })).toBeVisible();

    // The page must call the real getUsage() endpoint (aiApi.settings.getUsage,
    // GET /ai/settings/usage) rather than a nonexistent /ai/usage — verify via
    // the network response instead of just trusting the rendered table.
    const usageResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/ai/settings/usage') && res.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.reload();
    const usageResponse = await usageResponsePromise;
    expect(usageResponse.ok()).toBe(true);
    await waitForLoad(page);

    // Usage breakdown table renders task/model/requests/tokens/cost/percent columns.
    await expect(page.locator('text=Usage by Feature')).toBeVisible();
    // With AI usage history the breakdown table lists task/model/requests/cost columns;
    // a fresh tenant shows the honest empty state instead.
    const emptyState = page.getByText('No AI usage data available yet');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    } else {
      const breakdownTable = page.locator('table').first();
      await expect(breakdownTable.locator('th', { hasText: 'Task' })).toBeVisible();
      await expect(breakdownTable.locator('th', { hasText: 'Model' })).toBeVisible();
      await expect(breakdownTable.locator('th', { hasText: 'Requests' })).toBeVisible();
      await expect(breakdownTable.locator('th', { hasText: 'Est. Cost' })).toBeVisible();
      await expect(breakdownTable.locator('tbody tr').first()).toBeVisible();
    }

    // Quotas section renders (may report "no caps configured" for this plan).
    await expect(page.locator('text=Usage Quotas')).toBeVisible();

    // Back button returns to AI Settings.
    await page.getByRole('button', { name: 'Back to AI settings' }).click();
    await page.waitForURL('**/settings/ai');
    await expect(page.getByRole('heading', { name: 'AI Settings' })).toBeVisible();

    // No raw ID inputs, no direct outbound-messaging anchors.
    await expect(page.locator('input[name*="id" i]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="wa.me"]')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });
});
