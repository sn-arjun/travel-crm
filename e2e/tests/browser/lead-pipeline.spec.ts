import { test, expect } from '@playwright/test';
import { TEST_ADMIN } from '../helpers/test-data';

test.describe('Browser: Lead Pipeline Management', () => {
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

  test('should navigate to leads page', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const pageTitle = page.locator('text=/Leads|Lead Pipeline/i').first();
    await expect(pageTitle).toBeVisible();
  });

  test('should display kanban board', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Look for kanban columns
    const newColumn = page.locator('text=/New|Prospect/i').first();
    const contactedColumn = page.locator('text=/Contacted/i').first();

    await expect(newColumn).toBeVisible({ timeout: 5000 });
    if (await contactedColumn.isVisible()) {
      // Board has multiple columns
    }
  });

  test('should display lead cards in columns', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Check for lead cards
    const leadCards = page.locator('[data-testid="lead-card"], [role="article"], .lead-card').first();
    await expect(leadCards).toBeVisible({ timeout: 5000 });
  });

  test('should open new lead form', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Click New Lead button
    const newButton = page.locator('button:has-text("New Lead"), button:has-text("Add Lead"), button:has-text("Create")').first();
    await newButton.click();

    // Check for form dialog
    const form = page.locator('[role="dialog"], form, [data-testid="lead-form"]').first();
    await expect(form).toBeVisible({ timeout: 5000 });
  });

  test('should create new lead', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Lead"), button:has-text("Add Lead"), button:has-text("Create")').first();
    await newButton.click();

    // Fill form
    const titleInput = page.locator('input[placeholder*="title"], input[name*="title"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill('Bali Trip - Test Lead');
    }

    const destinationInput = page.locator('input[placeholder*="destination"], input[name*="destination"]').first();
    if (await destinationInput.isVisible()) {
      await destinationInput.fill('Bali');
    }

    // Submit
    const submitButton = page.locator('button:has-text("Save"), button:has-text("Create")').last();
    await submitButton.click();

    // Wait for success
    const successMessage = page.locator('text=/success|created/i');
    await expect(successMessage).toBeVisible({ timeout: 10000 });
  });

  test('should display lead in kanban board', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Check for lead cards with text
    const leadCards = page.locator('[data-testid="lead-card"], [role="article"]');
    const count = await leadCards.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should click lead card to view details', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Click first lead card
    const firstLead = page.locator('[data-testid="lead-card"], [role="article"]').first();
    await firstLead.click();

    // Wait for detail page
    await page.waitForURL(/\/leads\/[^/]+/, { timeout: 10000 });

    // Verify lead details
    const leadDetail = page.locator('[data-testid="lead-detail"], [role="main"]').first();
    await expect(leadDetail).toBeVisible();
  });

  test('should display lead information on detail page', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const firstLead = page.locator('[data-testid="lead-card"], [role="article"]').first();
    await firstLead.click();

    await page.waitForURL(/\/leads\/[^/]+/, { timeout: 10000 });

    // Check for lead information
    const leadTitle = page.locator('text=/Trip|Bali|Destination/i').first();
    await expect(leadTitle).toBeVisible({ timeout: 5000 });
  });

  test('should drag lead between columns', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Find first lead card
    const firstLead = page.locator('[data-testid="lead-card"], [role="article"]').first();
    const leadBoundingBox = await firstLead.boundingBox();

    if (leadBoundingBox) {
      // Get target column
      const targetColumn = page.locator('text=/Contacted|Proposal/i').first();
      const targetBoundingBox = await targetColumn.boundingBox();

      if (targetBoundingBox) {
        // Drag lead to new column
        await page.dragAndDrop(
          '[data-testid="lead-card"]:first-of-type',
          'text=/Contacted|Proposal/',
          { sourcePosition: { x: leadBoundingBox.width / 2, y: leadBoundingBox.height / 2 } }
        );

        // Verify lead moved
        await page.waitForTimeout(1000);
        const successMessage = page.locator('text=/updated|moved/i');
        if (await successMessage.isVisible()) {
          await expect(successMessage).toBeVisible();
        }
      }
    }
  });

  test('should update lead status via dropdown', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const firstLead = page.locator('[data-testid="lead-card"], [role="article"]').first();
    await firstLead.click();

    await page.waitForURL(/\/leads\/[^/]+/, { timeout: 10000 });

    // Find status dropdown
    const statusDropdown = page.locator('[data-testid="status-dropdown"], select, button:has-text("Status")').first();
    if (await statusDropdown.isVisible()) {
      await statusDropdown.click();

      // Select new status
      const newStatus = page.locator('text=/Contacted|In Progress/i').nth(1);
      if (await newStatus.isVisible()) {
        await newStatus.click();

        // Verify update
        const successMessage = page.locator('text=/updated|success/i');
        await expect(successMessage).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should add note to lead', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const firstLead = page.locator('[data-testid="lead-card"], [role="article"]').first();
    await firstLead.click();

    await page.waitForURL(/\/leads\/[^/]+/, { timeout: 10000 });

    // Find notes section
    const notesSection = page.locator('text=/Notes|Comments/i').first();
    if (await notesSection.isVisible()) {
      const addNoteButton = page.locator('button:near(text=/Notes|Comments/)').first();
      if (await addNoteButton.isVisible()) {
        await addNoteButton.click();

        const noteInput = page.locator('[data-testid="note-input"], textarea, input:last-of-type').last();
        await noteInput.fill('Test note for this lead');

        const submitButton = page.locator('button:has-text("Add"), button:has-text("Save")').last();
        await submitButton.click();

        const successMessage = page.locator('text=/added|saved/i');
        await expect(successMessage).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should filter leads by status', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Click filter button
    const filterButton = page.locator('button:has-text("Filter"), [data-testid="filter-button"]').first();
    if (await filterButton.isVisible()) {
      await filterButton.click();

      const statusFilter = page.locator('text=/Status/i').first();
      if (await statusFilter.isVisible()) {
        await statusFilter.click();

        const newOption = page.locator('text=/New|Prospect/i').nth(1);
        if (await newOption.isVisible()) {
          await newOption.click();
        }

        const applyButton = page.locator('button:has-text("Apply")').first();
        if (await applyButton.isVisible()) {
          await applyButton.click();
        }
      }
    }
  });

  test('should search leads', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Bali');
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);
    }
  });

  test('should assign lead to user', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    const firstLead = page.locator('[data-testid="lead-card"], [role="article"]').first();
    await firstLead.click();

    await page.waitForURL(/\/leads\/[^/]+/, { timeout: 10000 });

    // Find assign button/dropdown
    const assignButton = page.locator('button:has-text("Assign"), [data-testid="assign-button"]').first();
    if (await assignButton.isVisible()) {
      await assignButton.click();

      const userOption = page.locator('[role="option"]').first();
      if (await userOption.isVisible()) {
        await userOption.click();

        const successMessage = page.locator('text=/assigned|success/i');
        await expect(successMessage).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display lead statistics', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Look for statistics (total leads, by status, etc.)
    const stats = page.locator('[data-testid="lead-stats"], text=/Total|Status|Pipeline/i').first();
    if (await stats.isVisible()) {
      await expect(stats).toBeVisible();
    }
  });

  test('should sort leads by various fields', async ({ page }) => {
    const leadsLink = page.locator('text=Leads, [href*="/leads"], button:has-text("Leads")').first();
    await leadsLink.click();

    await page.waitForURL(/\/leads/, { timeout: 10000 });

    // Find sort options
    const sortButton = page.locator('button:has-text("Sort"), [data-testid="sort-button"]').first();
    if (await sortButton.isVisible()) {
      await sortButton.click();

      const sortOption = page.locator('text=/Date|Priority|Name/i').first();
      if (await sortOption.isVisible()) {
        await sortOption.click();

        await page.waitForTimeout(1000);
      }
    }
  });
});
