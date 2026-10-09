import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedContact, seedLead } from './helpers/api-seed';

const RULE = `E2E honeymoon rule ${Date.now()}`;

/** Pick an option in one of the builder's dropdowns. */
async function choose(page: Page, label: string | RegExp, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function openAutomations(page: Page) {
  await page.goto('/assistant?tab=automations');
  await waitForLoad(page);
  await expect(page.getByRole('heading', { name: 'Your rules' })).toBeVisible();
}

test.describe('Assistant: your own automation rules', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    const library = await api('GET', '/automations');
    for (const rule of library?.data?.customRules ?? []) {
      if (String(rule.name).startsWith('E2E honeymoon rule')) await api('DELETE', `/automations/custom/${rule.id}`);
    }
  });

  test('the builder names what is missing instead of saving', async ({ page }) => {
    await openAutomations(page);
    await page.getByRole('button', { name: 'New rule' }).click();
    const dialog = page.getByTestId('rule-builder');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Add rule' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Give the rule a name');

    await dialog.locator('#rule-name').fill(RULE);
    await dialog.getByRole('button', { name: 'Add rule' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Give the task a title');
    await expect(dialog).toBeVisible();
  });

  test('an admin builds a rule, and it proposes its steps on a matching lead only', async ({ page }) => {
    await openAutomations(page);
    await page.getByRole('button', { name: 'New rule' }).click();
    const dialog = page.getByTestId('rule-builder');

    await dialog.locator('#rule-name').fill(RULE);
    // "When" starts on "A lead is created".
    await expect(dialog.locator('#rule-trigger')).toContainText('A lead is created');

    await dialog.getByRole('button', { name: 'Add condition' }).click();
    await choose(page, 'Condition 1: what to look at', 'Trip type');
    await choose(page, 'Condition 1: value', 'Honeymoon');
    await dialog.getByRole('button', { name: 'Add condition' }).click();
    await choose(page, 'Condition 2: what to look at', 'Budget');
    await choose(page, 'Condition 2: comparison', 'is more than');
    await dialog.getByLabel('Condition 2: value').fill('200000');

    await dialog.getByLabel('Step 1: task title').fill('Senior consultant to call {{customer_name}}');
    await dialog.getByLabel('Step 1: due in days').fill('0');

    await dialog.getByRole('button', { name: 'Add step' }).click();
    await choose(page, 'Step 2: what to do', 'Draft a message to the customer');
    await dialog.getByLabel('Step 2: message').fill('Hi {{first_name}}, congratulations! We would love to plan your {{destination}} honeymoon.');
    // Drafting a message takes "Automatic" off the table.
    await expect(dialog.getByText('A rule that drafts a message always asks first.')).toBeVisible();
    await dialog.locator('#rule-mode').click();
    await expect(page.getByRole('option', { name: 'Automatic' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await dialog.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('Rule added')).toBeVisible();

    const row = page.locator(`[data-rule="${RULE}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('When a lead is created, and trip type is honeymoon and budget is more than 2,00,000');
    await expect(row).toContainText('Always asks first');

    // A lead that matches gets both steps as suggestions; one that does not gets none.
    const contact = await seedContact({ name: 'Rule Builder Couple' });
    const match = await seedLead(contact.id, { title: 'Rule builder honeymoon', tripType: 'honeymoon', budget: 320000, destinations: ['Maldives'] });
    const other = await seedLead(contact.id, { title: 'Rule builder family trip', tripType: 'family', budget: 320000 });

    await page.goto(`/leads/${match.id}`);
    await waitForLoad(page);
    const card = (action: string) => page.locator(`[data-testid="assistant-suggestion"][data-action="${action}"]`).filter({ hasText: /Senior consultant|Message Rule Builder/ });
    await expect(card('create_task')).toContainText('Senior consultant to call Rule Builder Couple');
    await expect(card('draft_reply')).toBeVisible();

    const suggestions = await api('GET', `/assistant/suggestions?leadId=${other.id}&status=all`);
    expect((suggestions.data as Array<{ ruleTitle: string }>).filter((s) => s.ruleTitle === RULE)).toHaveLength(0);

    // One click creates the task.
    await card('create_task').getByRole('button', { name: 'Create task' }).click();
    await expect(page.locator('[data-testid="assistant-suggestion"][data-action="create_task"][data-status="applied"]').filter({ hasText: 'Senior consultant' })).toBeVisible();
  });

  test('the rule can be changed, switched off and deleted', async ({ page }) => {
    await openAutomations(page);
    const row = page.locator(`[data-rule="${RULE}"]`);
    await row.getByRole('button', { name: `Change rule ${RULE}` }).click();
    const dialog = page.getByTestId('rule-builder');
    await expect(dialog.locator('#rule-name')).toHaveValue(RULE);
    await expect(dialog.getByLabel('Condition 2: value')).toHaveValue('200000');
    await expect(dialog.getByLabel('Step 1: task title')).toHaveValue('Senior consultant to call {{customer_name}}');

    await dialog.locator('#rule-mode').click();
    await page.getByRole('option', { name: 'Off', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save rule' }).click();
    await expect(page.getByText('Rule saved')).toBeVisible();
    await expect(row.getByText('Off', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: `Delete rule ${RULE}` }).click();
    await page.getByRole('button', { name: 'Delete rule', exact: true }).click();
    await expect(page.getByText('Rule deleted')).toBeVisible();
    await expect(row).toHaveCount(0);
  });
});
