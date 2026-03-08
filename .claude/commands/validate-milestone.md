# Phase 3: Validate Milestone with E2E Tests

Write and run REAL Playwright E2E tests for milestone $ARGUMENTS.

## Input
Milestone number. Read `desktop/audit/M{N}-audit.md` for context on what was implemented.

## What REAL E2E Means

A real E2E test exercises the FULL user workflow. Every test MUST cover ALL of these steps:

```
Create (fill ALL fields) → Verify in list (ALL filled values visible) →
View detail (ALL values shown correctly) → Edit (verify existing values prefilled) →
Save edit → Verify changes persisted → Delete → Verify removed
```

### CRITICAL: Test Data Visibility Across Views

The #1 bug pattern is: user fills 10 fields during create, but list/detail only shows 3.
Every E2E test MUST verify that EVERY field filled during creation appears in:
1. The list view (at minimum: name, status, key identifier)
2. The detail view (ALL fields)
3. The edit form (ALL fields prefilled)

```typescript
test('all created fields visible in list, detail, and edit', async ({ page }) => {
  // Create with ALL fields
  const data = {
    firstName: `E2E-${Date.now()}`,
    lastName: 'TestUser',
    email: `test-${Date.now()}@example.com`,
    phone: '+919876543210',
    company: 'Test Corp',
    city: 'Mumbai',
    notes: 'Created by E2E test',
  };

  await navigateTo(page, 'Contacts');
  await page.getByRole('button', { name: /new/i }).click();
  await page.getByLabel(/first name/i).fill(data.firstName);
  await page.getByLabel(/last name/i).fill(data.lastName);
  await page.getByLabel(/email/i).fill(data.email);
  // Phone field — must use PhoneInput component (country code picker)
  await page.getByLabel(/phone/i).fill(data.phone);
  await page.getByLabel(/company/i).fill(data.company);
  // Address — use AddressAutocomplete if available, plain input fallback
  await page.getByLabel(/city/i).fill(data.city);
  await page.getByLabel(/notes/i).fill(data.notes);
  await page.getByRole('button', { name: /save/i }).click();
  await waitForLoad(page);

  // ── VERIFY IN LIST ──
  const row = page.getByText(data.firstName);
  await expect(row).toBeVisible();
  // List should show key fields (name, email/phone, company)

  // ── VERIFY IN DETAIL ──
  await row.click();
  await waitForLoad(page);
  // ALL fields must be visible in detail view
  await expect(page.getByText(data.firstName)).toBeVisible();
  await expect(page.getByText(data.lastName)).toBeVisible();
  await expect(page.getByText(data.email)).toBeVisible();
  await expect(page.getByText(data.phone)).toBeVisible();
  await expect(page.getByText(data.company)).toBeVisible();
  await expect(page.getByText(data.city)).toBeVisible();
  await expect(page.getByText(data.notes)).toBeVisible();

  // ── VERIFY EDIT PREFILL ──
  await page.getByRole('button', { name: /edit/i }).click();
  await waitForLoad(page);
  // ALL fields must be prefilled with existing values
  await expect(page.getByLabel(/first name/i)).toHaveValue(data.firstName);
  await expect(page.getByLabel(/last name/i)).toHaveValue(data.lastName);
  await expect(page.getByLabel(/email/i)).toHaveValue(data.email);
  await expect(page.getByLabel(/company/i)).toHaveValue(data.company);
  await expect(page.getByLabel(/city/i)).toHaveValue(data.city);

  // ── EDIT AND VERIFY ──
  await page.getByLabel(/last name/i).clear();
  await page.getByLabel(/last name/i).fill('Updated');
  await page.getByRole('button', { name: /save/i }).click();
  await waitForLoad(page);
  await expect(page.getByText('Updated')).toBeVisible();
  // Other fields should NOT have changed
  await expect(page.getByText(data.email)).toBeVisible();

  // ── DELETE AND VERIFY ──
  await page.getByRole('button', { name: /delete/i }).click();
  await page.getByRole('button', { name: /confirm/i }).click();
  await waitForLoad(page);
  await expect(page.getByText(data.firstName)).not.toBeVisible();
});
```

### NEVER write tests that only do this (FAKE E2E):
```typescript
// BAD: Only checks page loads — proves NOTHING
test('contacts page', async ({ page }) => {
  await page.goto('/contacts');
  await expect(page).toHaveTitle(/Contacts/);
});

// BAD: Creates entity but doesn't verify fields in detail/edit
test('create contact', async ({ page }) => {
  await page.goto('/contacts/new');
  await page.getByLabel(/name/i).fill('Test');
  await page.getByRole('button', { name: /save/i }).click();
  // ← Missing: verify in list, detail, edit prefill
});
```

## Mandatory Test Categories

### A. CRUD Lifecycle (for every entity in this milestone)
Create → List → Detail → Edit → Delete (as shown above)

### B. Form Component Validation
```typescript
test('relation fields use searchable combobox', async ({ page }) => {
  // Navigate to create form
  // Verify relation fields are Combobox (role="combobox"), NOT plain Input
  // Type partial name → verify dropdown shows matching results
  // Select from dropdown → verify ID populated automatically
  await expect(page.getByPlaceholder(/enter.*id/i)).toHaveCount(0); // No raw ID inputs
});

test('address uses autocomplete with fallback', async ({ page }) => {
  // If Google Maps API key is set: AddressAutocomplete should appear
  // If not set: plain input fields should appear (NOT crash/blank)
});

test('phone uses country code picker', async ({ page }) => {
  // PhoneInput should have country code dropdown
  // Verify country code selector is present
});

test('money fields use currency input', async ({ page }) => {
  // CurrencyInput should format numbers with currency symbol
});
```

### C. List Page UX Validation
```typescript
test('list has infinite scroll pagination', async ({ page }) => {
  // Seed 30+ items via API
  // Navigate to list page
  // Count initially visible rows (should be ~20, not all 30+)
  // Scroll to bottom using sentinel div
  // Verify more items loaded (count increased)
});

test('list has working search and filters', async ({ page }) => {
  // Seed items with known names
  // Type in search bar → verify list filters
  // Use status/type dropdown → verify list filters
  // Clear filters → verify all items return
});

test('list has hover action icons', async ({ page }) => {
  // Hover over a row
  // Verify action icons appear (view, edit, phone, email, delete)
  // Click email icon → verify SendMessageDialog opens (NOT mailto:)
});
```

### D. Communication Hub Validation
```typescript
test('email/whatsapp/sms uses SendMessageDialog', async ({ page }) => {
  // From any entity detail page
  // Click Email/WhatsApp/SMS button
  // Verify SendMessageDialog opens with template picker
  // Verify NO direct mailto:, wa.me, or tel: links on page
  const mailtoLinks = await page.locator('a[href^="mailto:"]').count();
  const waLinks = await page.locator('a[href*="wa.me"]').count();
  expect(mailtoLinks).toBe(0);
  expect(waLinks).toBe(0);
});
```

### E. Export/Import Validation (when applicable)
```typescript
test('export downloads file with all data', async ({ page }) => {
  // Seed known data via API
  const contact = await seedContact(getAuthToken());

  // Navigate to export page
  await navigateTo(page, 'Settings');
  await page.getByText(/export/i).click();

  // Select entity type (e.g., Contacts)
  // Click export button
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export/i }).click(),
  ]);

  // Verify file downloaded
  const filePath = await download.path();
  expect(filePath).toBeTruthy();

  // Read file content and verify data is present
  const content = fs.readFileSync(filePath, 'utf8');
  expect(content).toContain(contact.firstName);
  expect(content).toContain(contact.email);
  expect(content).toContain(contact.phone);
  // Verify ALL fields are in export, not just a subset
});

test('import processes file and creates records', async ({ page }) => {
  // Prepare a CSV/Excel file with known data
  // Navigate to import page
  // Upload file
  // Map fields
  // Confirm import
  // Navigate to list page
  // Verify imported records appear with correct data
});

test('export follows design theme', async ({ page }) => {
  // If export generates PDF/printable:
  // Verify it uses brand colors, correct fonts, proper layout
  // Check logo, company name, headers are present
});
```

### F. Cross-Entity Navigation & Autofill
```typescript
test('creating lead from contact prefills contact data', async ({ page }) => {
  const contact = await seedContact(getAuthToken());
  await page.goto(`/contacts/${contact.id}`);
  await waitForLoad(page);

  // Click "Create Lead" button on contact detail
  await page.getByRole('button', { name: /create lead/i }).click();
  await waitForLoad(page);

  // Contact field should be auto-populated (NOT empty, NOT asking for ID)
  await expect(page.getByText(contact.firstName)).toBeVisible();
  // Or verify the combobox has the contact pre-selected
});
```

## Test Infrastructure
- Auth: `desktop/e2e/helpers/auth.ts` → `loginViaUI()`, `waitForLoad()`, `navigateTo()`
- Seed: `desktop/e2e/helpers/api-seed.ts` → `seedContact()`, `seedLead()`, etc.
- Config: `desktop/playwright.config.ts`
- Naming: `desktop/e2e/XX-feature-name.spec.ts`

## After Writing Tests
```bash
cd desktop && npx playwright test --reporter=list
```

When tests fail:
1. Is test correct per ticket spec? → Yes: fix the code. No: fix the test.
2. Check screenshots in `desktop/test-results/`
3. Iterate: fix → re-run → until all pass
4. Do NOT weaken tests to make them pass — fix the implementation

## Output
Summary of:
- Tests written (file name, test count, what each tests)
- Pass/fail results
- Code fixes made to pass tests
- Any remaining issues
