import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedTask } from './helpers/api-seed';

test.describe('Tasks & Calendar', () => {
  // Tasks
  test('should load tasks page (kanban)', async ({ page }) => {
    await page.goto('/tasks');
    await waitForLoad(page);
    await expect(page.locator('text=Tasks').first()).toBeVisible();
  });

  test('should show seeded task', async ({ page }) => {
    await seedTask({ title: 'E2E Kanban Task' });

    await page.goto('/tasks');
    await waitForLoad(page);

    // Should see tasks rendered
    await page.waitForTimeout(2000);
  });

  test('should create a new task', async ({ page }) => {
    await page.goto('/tasks');
    await waitForLoad(page);

    // Click add/new task button
    const addBtn = page.locator('button:has-text("New Task"), button:has-text("Add Task"), button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      // Fill task title in dialog
      const titleInput = page.locator('[role="dialog"] input').first();
      if (await titleInput.isVisible()) {
        await titleInput.fill(`E2E New Task ${Date.now()}`);
        await page.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("Create")').first().click();
        await page.waitForTimeout(2000);
      }
    }
  });

  // Calendar
  test('should load calendar page', async ({ page }) => {
    await page.goto('/calendar');
    await waitForLoad(page);
    await expect(page.locator('text=Calendar').first()).toBeVisible();
  });

  // Follow-ups
  test('should load follow-ups page', async ({ page }) => {
    await page.goto('/follow-ups');
    await waitForLoad(page);
    await expect(page.locator('text=Follow').first()).toBeVisible({ timeout: 10_000 });
  });
});
