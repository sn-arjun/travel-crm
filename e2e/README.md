# TravelCRM Pro - Playwright E2E Test Suite

Comprehensive End-to-End testing suite for TravelCRM Pro using Playwright. This suite includes both API tests and browser UI tests covering all 10 milestones of the application.

## Project Structure

```
e2e/
├── package.json                 # Dependencies and test scripts
├── playwright.config.ts         # Playwright configuration
├── tests/
│   ├── api/                     # API integration tests
│   │   ├── m1-infrastructure.spec.ts
│   │   ├── m2-auth.spec.ts
│   │   ├── m3-contacts.spec.ts
│   │   ├── m4-leads.spec.ts
│   │   ├── m5-followups.spec.ts
│   │   ├── m6-itineraries.spec.ts
│   │   ├── m7-invoicing.spec.ts
│   │   ├── m8-communications.spec.ts
│   │   ├── m9-email-campaigns.spec.ts
│   │   └── m10-notifications.spec.ts
│   ├── browser/                 # Browser UI tests
│   │   ├── login-flow.spec.ts
│   │   ├── contact-management.spec.ts
│   │   ├── lead-pipeline.spec.ts
│   │   ├── invoice-flow.spec.ts
│   │   ├── communication-hub.spec.ts
│   │   └── notification-flow.spec.ts
│   └── helpers/
│       ├── api-client.ts       # Reusable API client wrapper
│       └── test-data.ts        # Test data factories
└── README.md                    # This file
```

## Setup & Installation

### Prerequisites

- Node.js 18+ installed
- Access to TravelCRM Pro API and Flutter web frontend
- Environment variables configured (see below)

### Installation

```bash
cd e2e
npm install
```

This will install:
- `@playwright/test@^1.51.0` - Core testing framework

### Environment Configuration

Create a `.env` file or set environment variables:

```bash
# API Configuration
export API_BASE_URL=http://localhost:8787

# Frontend Configuration
export APP_BASE_URL=http://localhost:3000

# Optional: Test timeout (milliseconds)
export TEST_TIMEOUT=30000
```

For different environments:

```bash
# Development
export API_BASE_URL=http://localhost:8787
export APP_BASE_URL=http://localhost:3000

# Staging
export API_BASE_URL=https://api-staging.travelcrm.com
export APP_BASE_URL=https://staging.travelcrm.com

# Production
export API_BASE_URL=https://api.travelcrm.com
export APP_BASE_URL=https://app.travelcrm.com
```

## Running Tests

### All Tests

```bash
npm test
```

### API Tests Only

```bash
npm run test:api
```

### Browser Tests Only

```bash
npm run test:browser
```

### Tests by Milestone

Run tests for specific milestones:

```bash
npm run test:m1    # Infrastructure
npm run test:m2    # Authentication
npm run test:m3    # Contacts
npm run test:m4    # Leads
npm run test:m5    # Follow-ups
npm run test:m6    # Itineraries
npm run test:m7    # Invoicing
npm run test:m8    # Communications
npm run test:m9    # Email Campaigns
npm run test:m10   # Notifications
```

### Run Specific Test File

```bash
npx playwright test tests/api/m2-auth.spec.ts
npx playwright test tests/browser/login-flow.spec.ts
```

### Run with Specific Project

```bash
# Run only on API project
npx playwright test --project=api

# Run only on browser project
npx playwright test --project=browser
```

### Debug Mode

```bash
# Run with inspector
npx playwright test --debug

# Run with headed browser (visible)
npx playwright test tests/browser --headed

# Run with slow motion
npx playwright test --headed --slow-mo=1000
```

### Generate & View Reports

```bash
# Run tests and generate HTML report
npm test

# View the HTML report
npm run report
```

## Test Architecture

### API Tests (`tests/api/`)

API tests use the `APIClient` helper class to make authenticated requests to the backend. Each test file corresponds to a milestone feature:

- **M1**: Infrastructure & health checks
- **M2**: Authentication, authorization, RBAC
- **M3**: Contact CRUD, search, filters, tags, sharing
- **M4**: Lead pipeline, status transitions, notes, timeline
- **M5**: Follow-ups, lead assignment, bulk actions
- **M6**: Itineraries, versioning, cloning, templates, rates
- **M7**: Invoicing, GST calculations, payments, credit/debit notes
- **M8**: Communications, templates, variable substitution, webhooks
- **M9**: Email campaigns, segmentation, analytics
- **M10**: Notifications, preferences, quiet hours, announcements

### Browser Tests (`tests/browser/`)

Browser tests use Playwright's page automation to test the Flutter web UI:

- **login-flow.spec.ts**: Login, validation, session management
- **contact-management.spec.ts**: Contact CRUD, search, filtering
- **lead-pipeline.spec.ts**: Kanban board, drag-drop, status changes
- **invoice-flow.spec.ts**: Invoice creation, line items, payments
- **communication-hub.spec.ts**: Message log, templates
- **notification-flow.spec.ts**: Notification preferences, alerts

### Helpers

#### `APIClient` (`tests/helpers/api-client.ts`)

Provides convenient methods for authenticated API calls:

```typescript
const client = new APIClient(request, baseURL);

// Login
await client.login(email, password, tenantId);

// Requests
const contacts = await client.get('/api/contacts');
const created = await client.post('/api/contacts', contactData);
const updated = await client.put(`/api/contacts/${id}`, updateData);
await client.delete(`/api/contacts/${id}`);

// Raw requests
const response = await client.raw('GET', '/api/endpoint');
```

#### `test-data.ts` (`tests/helpers/test-data.ts`)

Test data factories with randomized values:

```typescript
createTestContact()      // Generate random contact
createTestLead()         // Generate random lead
createTestInvoice()      // Generate random invoice
createTestPayment()      // Generate random payment
createTestTemplate()     // Generate random template
// ... and more

// Pre-configured test users
TEST_ADMIN              // Admin credentials
TEST_SALESPERSON        // Salesperson credentials
TEST_MANAGER            // Manager credentials
```

## Test Coverage

### API Test Coverage

| Milestone | Tests | Coverage |
|-----------|-------|----------|
| M1 | 8 | Health checks, CORS, rate limiting, error handling |
| M2 | 15 | Login, tokens, RBAC, authorization |
| M3 | 20 | CRUD, search, filters, tags, sharing, validation |
| M4 | 25 | CRUD, pipeline, notes, timeline, validation |
| M5 | 20 | CRUD, filters, assignment, bulk actions |
| M6 | 22 | CRUD, versioning, cloning, templates, rates, comms |
| M7 | 30 | CRUD, GST, payments, credit notes, reporting |
| M8 | 25 | Templates, variables, comms, webhooks, bulk send |
| M9 | 22 | CRUD, segmentation, sending, analytics, webhooks |
| M10 | 28 | Tokens, preferences, quiet hours, announcements |

**Total API Tests**: ~215 test cases

### Browser Test Coverage

| Feature | Tests | Coverage |
|---------|-------|----------|
| Login | 12 | Form validation, error handling, session |
| Contacts | 13 | CRUD, search, filter, edit, delete |
| Leads | 13 | Kanban, drag-drop, status, notes, assignment |
| Invoices | 12 | Creation, calculations, payments, filters |
| Communications | 12 | Message log, templates, search, filters |
| Notifications | 13 | Panel, settings, preferences, state |

**Total Browser Tests**: ~75 test cases

**Overall Test Suite**: ~290+ comprehensive test cases

## Key Features

### 🔐 Authentication & RBAC Testing
- Login/logout flows
- Token management (access, refresh)
- Role-based access control
- Tenant isolation
- Permission validation

### 📋 CRUD Operations
- Complete lifecycle testing (create, read, update, delete)
- Bulk operations
- Soft/hard deletes
- Versioning & history

### 🔍 Search & Filtering
- Text search
- Multi-field filters
- Date range filters
- Complex nested filters
- Pagination

### 💰 Financial Features
- GST calculations (CGST+SGST vs IGST)
- Invoice creation & management
- Payment recording
- Credit & debit notes
- Outstanding & ageing reports

### 📧 Communications
- Template management
- Variable substitution
- Multi-channel send (email, SMS, WhatsApp)
- Bulk campaigns
- Webhook event handling

### 🔔 Notifications
- Push token registration
- Notification preferences
- Quiet hours configuration
- Badge counts
- Admin announcements

### 📊 Validation Testing
- Required field validation
- Format validation (email, phone, GST)
- Business logic validation
- Duplicate detection
- Constraint violation handling

### ⚠️ Error Handling
- 401/403 unauthorized responses
- 404 not found
- 400 bad request with error messages
- Rate limiting
- Timeout handling

## Writing New Tests

### API Test Template

```typescript
import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import { createTestContact, TEST_ADMIN, API_ENDPOINTS } from '../helpers/test-data';

test.describe('Feature Name', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';
  let client: APIClient;

  test.beforeAll(async () => {
    // Setup
  });

  test('should do something', async ({ request }) => {
    client = new APIClient(request, baseURL);
    await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

    const data = createTestContact();
    const response = await client.post(API_ENDPOINTS.CONTACTS, data);

    expect(response).toHaveProperty('id');
    expect(response.email).toBe(data.email);
  });
});
```

### Browser Test Template

```typescript
import { test, expect } from '@playwright/test';
import { TEST_ADMIN } from '../helpers/test-data';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(TEST_ADMIN.email);
    // ... rest of login
  });

  test('should do something', async ({ page }) => {
    await page.goto('/features');

    const button = page.locator('button:has-text("New")');
    await button.click();

    await expect(page.locator('form')).toBeVisible();
  });
});
```

## Best Practices

### API Testing
1. **Use `test.describe.serial`** for dependent tests
2. **Store IDs** from create responses for use in subsequent tests
3. **Clean up** after tests (delete created resources)
4. **Test both success and failure** paths
5. **Validate response structure** not just status codes
6. **Use meaningful assertions** with proper error messages

### Browser Testing
1. **Wait for elements** before interacting
2. **Use data-testid** attributes for reliable element selection
3. **Avoid hardcoded delays** - use proper waits
4. **Test user flows** end-to-end
5. **Handle async operations** with proper awaits
6. **Test across different states** (empty, loading, error, success)

## Troubleshooting

### Tests Fail with "API Connection Refused"

Ensure the API server is running:

```bash
# Start API server
cd backend
npm run dev

# Or if using Wrangler
wrangler dev
```

### Browser Tests Can't Find Elements

1. Check selectors match actual HTML
2. Use `page.screenshot()` to debug
3. Use `--headed` mode to see what's happening
4. Check for dynamic content loading delays

### Tests Time Out

- Increase timeout in `playwright.config.ts`
- Check network connectivity
- Verify backend is responding
- Check for infinite loading states in UI

### Authentication Failures

- Verify `TEST_ADMIN` credentials exist in database
- Check token expiration
- Verify tenant setup
- Check CORS configuration

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Performance Considerations

- API tests: ~2-3 seconds each
- Browser tests: ~5-10 seconds each
- Total suite: ~15-20 minutes
- Run in parallel with `--workers=4`

## Future Enhancements

- [ ] Visual regression testing
- [ ] Performance benchmarking
- [ ] Load testing with k6
- [ ] Mobile UI testing
- [ ] Accessibility testing (WCAG)
- [ ] Security scanning
- [ ] Database cleanup between runs
- [ ] Test data seeding automation
- [ ] Custom reports with screenshots
- [ ] Slack/Email notifications

## Contributing

When adding new tests:

1. Follow existing patterns
2. Use test data factories
3. Add meaningful assertions
4. Include error case tests
5. Document complex test logic
6. Keep tests focused and isolated
7. Update this README if adding new patterns

## Support

For issues or questions:

1. Check `playwright-report/` after test run
2. Review browser context screenshots
3. Enable debug mode: `PWDEBUG=1 npm test`
4. Check application logs for errors
5. Review test patterns in existing specs

## License

Internal use only - TravelCRM Pro

## Version

- Playwright: ^1.51.0
- Node.js: 18+
- Last Updated: 2026-02-21
