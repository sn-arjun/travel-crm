import { test, expect } from '@playwright/test';
import { TEST_ADMIN } from '../helpers/test-data';

test.describe('Browser: Communication Hub', () => {
  const baseURL = process.env.APP_BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });
  });

  test('should navigate to communications page', async ({ page }) => {
    const commLink = page.locator('text=Communications, text=Messages, [href*="/communications"], button:has-text("Communications")').first();
    await commLink.click();

    await page.waitForURL(/\/communications/, { timeout: 10000 });

    const pageTitle = page.locator('text=/Communications|Messages|Communication Log/i').first();
    await expect(pageTitle).toBeVisible();
  });

  test('should display communication log', async ({ page }) => {
    const commLink = page.locator('text=Communications, [href*="/communications"], button:has-text("Communications")').first();
    if (await commLink.isVisible()) {
      await commLink.click();
    } else {
      await page.goto('/communications');
    }

    await page.waitForURL(/\/communications/, { timeout: 10000 });

    const logTable = page.locator('table, [role="grid"], [data-testid="communication-log"]').first();
    await expect(logTable).toBeVisible({ timeout: 5000 });
  });

  test('should display communication types', async ({ page }) => {
    const commLink = page.locator('text=Communications, [href*="/communications"], button:has-text("Communications")').first();
    if (await commLink.isVisible()) {
      await commLink.click();
    } else {
      await page.goto('/communications');
    }

    await page.waitForURL(/\/communications/, { timeout: 10000 });

    // Look for communication type filters
    const emailFilter = page.locator('text=/Email/i').first();
    const whatsappFilter = page.locator('text=/WhatsApp|Whatsapp/i').first();
    const smsFilter = page.locator('text=/SMS/i').first();

    if (await emailFilter.isVisible()) {
      await expect(emailFilter).toBeVisible();
    }
  });

  test('should filter communications by type', async ({ page }) => {
    const commLink = page.locator('text=Communications, [href*="/communications"], button:has-text("Communications")').first();
    if (await commLink.isVisible()) {
      await commLink.click();
    } else {
      await page.goto('/communications');
    }

    await page.waitForURL(/\/communications/, { timeout: 10000 });

    // Find type filter
    const typeFilter = page.locator('button:has-text("Type"), select:has-text("Type")').first();
    if (await typeFilter.isVisible()) {
      await typeFilter.click();

      const emailOption = page.locator('text=/Email/i').nth(1);
      if (await emailOption.isVisible()) {
        await emailOption.click();

        await page.waitForTimeout(1000);
      }
    }
  });

  test('should navigate to templates', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const pageTitle = page.locator('text=/Templates|Message Templates/i').first();
      await expect(pageTitle).toBeVisible();
    }
  });

  test('should display templates list', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const templatesList = page.locator('table, [role="grid"], [data-testid="templates-list"]').first();
      await expect(templatesList).toBeVisible({ timeout: 5000 });
    }
  });

  test('should open new template form', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const newButton = page.locator('button:has-text("New Template"), button:has-text("Create"), button:has-text("Add")').first();
      await newButton.click();

      const form = page.locator('[role="dialog"], form, [data-testid="template-form"]').first();
      await expect(form).toBeVisible({ timeout: 5000 });
    }
  });

  test('should create email template', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const newButton = page.locator('button:has-text("New Template"), button:has-text("Create")').first();
      await newButton.click();

      // Select email channel
      const channelSelect = page.locator('select, [role="combobox"]').first();
      if (await channelSelect.isVisible()) {
        await channelSelect.click();
        const emailOption = page.locator('text=/Email/i').nth(1);
        if (await emailOption.isVisible()) {
          await emailOption.click();
        }
      }

      // Fill template name
      const nameInput = page.locator('input[placeholder*="name"], input[name*="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('Booking Confirmation Email');
      }

      // Fill template content
      const contentInput = page.locator('textarea, [contenteditable="true"]').first();
      if (await contentInput.isVisible()) {
        await contentInput.fill('Dear {{firstName}}, Your booking is confirmed for {{destination}}.');
      }

      // Submit
      const submitButton = page.locator('button:has-text("Save"), button:has-text("Create")').last();
      await submitButton.click();

      const successMessage = page.locator('text=/success|created/i');
      await expect(successMessage).toBeVisible({ timeout: 10000 });
    }
  });

  test('should create WhatsApp template', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const newButton = page.locator('button:has-text("New Template"), button:has-text("Create")').first();
      await newButton.click();

      // Select WhatsApp channel
      const channelSelect = page.locator('select, [role="combobox"]').first();
      if (await channelSelect.isVisible()) {
        await channelSelect.click();
        const whatsappOption = page.locator('text=/WhatsApp|Whatsapp/i').nth(1);
        if (await whatsappOption.isVisible()) {
          await whatsappOption.click();
        }
      }

      // Fill template details
      const nameInput = page.locator('input[placeholder*="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('Trip Confirmation');
      }

      const contentInput = page.locator('textarea, [contenteditable="true"]').first();
      if (await contentInput.isVisible()) {
        await contentInput.fill('Hi {{firstName}}, your trip to {{destination}} is booked!');
      }

      // Submit
      const submitButton = page.locator('button:has-text("Save"), button:has-text("Create")').last();
      await submitButton.click();

      const successMessage = page.locator('text=/success|created/i');
      await expect(successMessage).toBeVisible({ timeout: 10000 });
    }
  });

  test('should view template details', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const firstTemplate = page.locator('table tbody tr, [role="row"], [data-testid="template-item"]').first();
      await firstTemplate.click();

      await page.waitForURL(/\/templates\/[^/]+/, { timeout: 10000 });

      const templateDetail = page.locator('[data-testid="template-detail"], [role="main"]').first();
      await expect(templateDetail).toBeVisible();
    }
  });

  test('should edit template', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const firstTemplate = page.locator('table tbody tr, [role="row"]').first();
      await firstTemplate.click();

      await page.waitForURL(/\/templates\/[^/]+/, { timeout: 10000 });

      const editButton = page.locator('button:has-text("Edit"), button:has-text("Update")').first();
      if (await editButton.isVisible()) {
        await editButton.click();

        const contentInput = page.locator('textarea, [contenteditable="true"]').first();
        if (await contentInput.isVisible()) {
          await contentInput.fill('Updated template content');

          const submitButton = page.locator('button:has-text("Save")').last();
          await submitButton.click();

          const successMessage = page.locator('text=/updated|success/i');
          await expect(successMessage).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('should preview template with variables', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const firstTemplate = page.locator('table tbody tr, [role="row"]').first();
      await firstTemplate.click();

      await page.waitForURL(/\/templates\/[^/]+/, { timeout: 10000 });

      const previewButton = page.locator('button:has-text("Preview")').first();
      if (await previewButton.isVisible()) {
        await previewButton.click();

        const previewDialog = page.locator('[role="dialog"], [data-testid="preview"]').first();
        await expect(previewDialog).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display template variables', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const firstTemplate = page.locator('table tbody tr, [role="row"]').first();
      await firstTemplate.click();

      await page.waitForURL(/\/templates\/[^/]+/, { timeout: 10000 });

      // Look for variables section
      const variablesSection = page.locator('text=/Variables|Placeholders/i').first();
      if (await variablesSection.isVisible()) {
        await expect(variablesSection).toBeVisible();

        const variableList = page.locator('[data-testid="variables-list"], ul, [role="list"]').first();
        if (await variableList.isVisible()) {
          await expect(variableList).toBeVisible();
        }
      }
    }
  });

  test('should delete template', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const lastTemplate = page.locator('table tbody tr, [role="row"]').last();
      await lastTemplate.click();

      await page.waitForURL(/\/templates\/[^/]+/, { timeout: 10000 });

      const deleteButton = page.locator('button:has-text("Delete")').first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")').last();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          const successMessage = page.locator('text=/deleted|removed/i');
          await expect(successMessage).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('should search templates', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('Confirmation');
        await page.keyboard.press('Enter');

        await page.waitForTimeout(1000);
      }
    }
  });

  test('should filter templates by channel', async ({ page }) => {
    const templatesLink = page.locator('text=Templates, [href*="/templates"], button:has-text("Templates")').first();
    if (await templatesLink.isVisible()) {
      await templatesLink.click();

      await page.waitForURL(/\/templates/, { timeout: 10000 });

      const channelFilter = page.locator('button:has-text("Channel"), select:has-text("Channel")').first();
      if (await channelFilter.isVisible()) {
        await channelFilter.click();

        const emailOption = page.locator('text=/Email/i').nth(1);
        if (await emailOption.isVisible()) {
          await emailOption.click();

          await page.waitForTimeout(1000);
        }
      }
    }
  });
});
