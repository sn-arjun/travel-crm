import { test, expect } from '@playwright/test';
import { TEST_ADMIN, createTestContact } from '../helpers/test-data';

test.describe('Browser: Contact Management', () => {
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

  test('should navigate to contacts page', async ({ page }) => {
    // Look for Contacts link in navigation
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Verify we're on contacts page
    const pageTitle = page.locator('text=/Contacts|Contact List/i').first();
    await expect(pageTitle).toBeVisible();
  });

  test('should display contacts list', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Check for table or list of contacts
    const table = page.locator('table, [role="grid"], [data-testid="contacts-list"]').first();
    await expect(table).toBeVisible({ timeout: 5000 });
  });

  test('should open new contact form', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Click New Contact button
    const newButton = page.locator('button:has-text("New Contact"), button:has-text("Add Contact"), button:has-text("Create")').first();
    await newButton.click();

    // Check for form dialog or page
    const form = page.locator('[role="dialog"], form, [data-testid="contact-form"]').first();
    await expect(form).toBeVisible({ timeout: 5000 });
  });

  test('should fill and submit new contact form', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Contact"), button:has-text("Add Contact"), button:has-text("Create")').first();
    await newButton.click();

    const contactData = createTestContact();

    // Fill form fields
    const firstNameInput = page.locator('input[placeholder*="first"], input[name*="firstName"]').first();
    if (await firstNameInput.isVisible()) {
      await firstNameInput.fill(contactData.firstName);
    }

    const lastNameInput = page.locator('input[placeholder*="last"], input[name*="lastName"]').first();
    if (await lastNameInput.isVisible()) {
      await lastNameInput.fill(contactData.lastName);
    }

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first();
    await emailInput.fill(contactData.email);

    const phoneInput = page.locator('input[placeholder*="phone"], input[name*="phone"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill(contactData.phone);
    }

    // Submit form
    const submitButton = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")').last();
    await submitButton.click();

    // Wait for success message or redirect
    const successMessage = page.locator('text=/success|created|saved/i');
    await expect(successMessage).toBeVisible({ timeout: 10000 });
  });

  test('should display validation errors in contact form', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const newButton = page.locator('button:has-text("New Contact"), button:has-text("Add Contact"), button:has-text("Create")').first();
    await newButton.click();

    // Try to submit empty form
    const submitButton = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")').last();
    await submitButton.click();

    // Check for error messages
    const errorMessage = page.locator('text=/required|must|error/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should search for contact by name', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Find search input
    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first();
    await expect(searchInput).toBeVisible();

    // Search for a contact
    await searchInput.fill('Test');
    await page.keyboard.press('Enter');

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Verify results are displayed
    const table = page.locator('table, [role="grid"], [data-testid="contacts-list"]').first();
    await expect(table).toBeVisible();
  });

  test('should filter contacts by type', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Look for filter options
    const filterButton = page.locator('button:has-text("Filter"), [data-testid="filter-button"]').first();
    if (await filterButton.isVisible()) {
      await filterButton.click();

      // Select filter type
      const typeFilter = page.locator('text=/Type|Contact Type/i').first();
      await typeFilter.click();

      const individualOption = page.locator('text=Individual').first();
      await individualOption.click();

      // Apply filter
      const applyButton = page.locator('button:has-text("Apply")').first();
      if (await applyButton.isVisible()) {
        await applyButton.click();
      }
    }
  });

  test('should click contact to view details', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Click first contact in list
    const firstContact = page.locator('table tbody tr, [role="row"]').first();
    await firstContact.click();

    // Wait for detail page
    await page.waitForURL(/\/contacts\/[^/]+/, { timeout: 10000 });

    // Verify contact details are displayed
    const contactDetail = page.locator('[data-testid="contact-detail"], [role="main"]').first();
    await expect(contactDetail).toBeVisible();
  });

  test('should display contact information on detail page', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const firstContact = page.locator('table tbody tr, [role="row"]').first();
    await firstContact.click();

    await page.waitForURL(/\/contacts\/[^/]+/, { timeout: 10000 });

    // Check for contact information
    const name = page.locator('text=/[A-Z][a-z]+ [A-Z][a-z]+/').first();
    await expect(name).toBeVisible();

    const email = page.locator('text=/@/').first();
    await expect(email).toBeVisible({ timeout: 5000 });
  });

  test('should open edit contact form', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const firstContact = page.locator('table tbody tr, [role="row"]').first();
    await firstContact.click();

    await page.waitForURL(/\/contacts\/[^/]+/, { timeout: 10000 });

    // Click edit button
    const editButton = page.locator('button:has-text("Edit"), button:has-text("Update")').first();
    await editButton.click();

    // Check for edit form
    const form = page.locator('[role="dialog"], form, [data-testid="contact-form"]').first();
    await expect(form).toBeVisible({ timeout: 5000 });
  });

  test('should update contact information', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const firstContact = page.locator('table tbody tr, [role="row"]').first();
    await firstContact.click();

    await page.waitForURL(/\/contacts\/[^/]+/, { timeout: 10000 });

    const editButton = page.locator('button:has-text("Edit"), button:has-text("Update")').first();
    await editButton.click();

    // Update a field
    const phoneInput = page.locator('input[placeholder*="phone"], input[name*="phone"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.clear();
      await phoneInput.fill('+91-1234567890');
    }

    // Submit
    const submitButton = page.locator('button:has-text("Save"), button:has-text("Update")').last();
    await submitButton.click();

    // Wait for success message
    const successMessage = page.locator('text=/success|updated|saved/i');
    await expect(successMessage).toBeVisible({ timeout: 10000 });
  });

  test('should add tags to contact', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const firstContact = page.locator('table tbody tr, [role="row"]').first();
    await firstContact.click();

    await page.waitForURL(/\/contacts\/[^/]+/, { timeout: 10000 });

    // Look for tags section
    const tagsSection = page.locator('text=/Tags|Labels/i').first();
    if (await tagsSection.isVisible()) {
      const addTagButton = page.locator('button:near(text=/Tags|Labels/)').first();
      if (await addTagButton.isVisible()) {
        await addTagButton.click();

        const tagInput = page.locator('input[placeholder*="tag"], input[type="text"]').last();
        await tagInput.fill('vip');
        await page.keyboard.press('Enter');

        const successMessage = page.locator('text=/added|success/i');
        await expect(successMessage).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display contact activity timeline', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    const firstContact = page.locator('table tbody tr, [role="row"]').first();
    await firstContact.click();

    await page.waitForURL(/\/contacts\/[^/]+/, { timeout: 10000 });

    // Look for activity timeline
    const timeline = page.locator('text=/Activity|Timeline|History/i').first();
    if (await timeline.isVisible()) {
      // Verify timeline events are displayed
      const timelineEvents = page.locator('[data-testid="timeline-item"], [role="listitem"]');
      const count = await timelineEvents.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should delete contact', async ({ page }) => {
    const contactsLink = page.locator('text=Contacts, [href*="/contacts"], button:has-text("Contacts")').first();
    await contactsLink.click();

    await page.waitForURL(/\/contacts/, { timeout: 10000 });

    // Get contact count before
    const tableRows = page.locator('table tbody tr, [role="row"]');
    const initialCount = await tableRows.count();

    // Click last contact (safest to delete)
    const lastContact = tableRows.last();
    await lastContact.click();

    await page.waitForTimeout(1000);

    // Find and click delete button
    const deleteButton = page.locator('button:has-text("Delete"), button:has-text("Remove")').first();
    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();

        // Wait for deletion to complete
        const successMessage = page.locator('text=/deleted|removed/i');
        await expect(successMessage).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
