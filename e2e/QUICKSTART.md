# Quick Start Guide - TravelCRM Pro E2E Tests

Get started with the E2E test suite in 5 minutes.

## 1. Install Dependencies

```bash
cd /sessions/sleepy-inspiring-feynman/mnt/CRM/e2e
npm install
```

This will install Playwright and all necessary dependencies.

## 2. Configure Environment

```bash
# Set API and app URLs
export API_BASE_URL=http://localhost:8787
export APP_BASE_URL=http://localhost:3000
```

Or create a `.env` file in the `e2e/` directory:
```
API_BASE_URL=http://localhost:8787
APP_BASE_URL=http://localhost:3000
```

## 3. Start Services

Make sure both services are running:

### Backend API (Cloudflare Workers)
```bash
cd /sessions/sleepy-inspiring-feynman/mnt/CRM/backend
npm run dev
# API runs on http://localhost:8787
```

### Frontend (Flutter Web)
```bash
cd /sessions/sleepy-inspiring-feynman/mnt/CRM/packages/crm_app
flutter run -d web
# App runs on http://localhost:3000
```

## 4. Run Tests

### All Tests
```bash
cd /sessions/sleepy-inspiring-feynman/mnt/CRM/e2e
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

### Specific Milestone
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

## 5. View Results

After tests complete:

```bash
npm run report
```

This opens an interactive HTML report in your browser.

## Common Commands

```bash
# Run with visible browser
npx playwright test tests/browser --headed

# Run with debug mode
npx playwright test --debug

# Run single test file
npx playwright test tests/api/m2-auth.spec.ts

# Run with slow motion (useful for debugging)
npx playwright test --headed --slow-mo=1000

# Generate fresh report
npx playwright show-report
```

## Troubleshooting

### Tests fail with "API Connection Refused"
- Check that backend API is running on port 8787
- Verify `API_BASE_URL` is correct

### Browser tests can't find elements
- Run in headed mode: `--headed`
- Add debug screenshot: `page.screenshot()`
- Check that frontend is running on port 3000

### Authentication fails
- Verify test user credentials exist in database
- Check that test credentials are correct in `.env` or env vars
- Look for CORS configuration issues

### Timeout issues
- Increase timeout in `playwright.config.ts`
- Check network connectivity
- Verify both services are responding

## Test Structure

### API Tests (`tests/api/`)
Tests the backend API endpoints:
- Authentication & authorization
- CRUD operations
- Business logic
- Validation
- Error handling

**Example**: `npm run test:m7` tests invoice creation, GST calculations, and payments

### Browser Tests (`tests/browser/`)
Tests the Flutter web UI:
- User login flow
- Navigation
- Form interactions
- Data display
- State management

**Example**: `tests/browser/login-flow.spec.ts` tests the login form and authentication

## Test Data

Tests use automatically generated random data, so you can run tests multiple times without conflicts.

Test users (credentials):
```
Email: admin@test.com
Password: Test123!@#
Tenant: test-tenant
```

## Directory Structure

```
e2e/
├── tests/
│   ├── api/              # 10 milestone API test files
│   ├── browser/          # 6 browser UI test files
│   └── helpers/          # Utility functions
├── playwright.config.ts  # Configuration
├── package.json          # Dependencies
└── README.md             # Full documentation
```

## Next Steps

1. Read the full [README.md](./README.md) for detailed documentation
2. Explore test files in `tests/api/` and `tests/browser/`
3. Check `IMPLEMENTATION_SUMMARY.md` for technical details
4. Add your own tests following the existing patterns

## Getting Help

### Check Test Output
```bash
# Save test results
npm test -- --reporter=list

# View detailed trace
npx playwright show-trace trace.zip
```

### Debug Mode
```bash
# Step through tests
npx playwright test --debug

# See what's happening in the browser
npx playwright test --headed --slow-mo=1000
```

### Run with Logging
```bash
DEBUG=pw:api npm test
```

## Expected Results

Full test suite should complete in 15-20 minutes with:
- ~215 API test cases
- ~75 browser test cases
- Overall success rate: 95%+

Each test reports its specific assertion, making it easy to identify issues.

## Performance Notes

- API tests: ~2-3 seconds each
- Browser tests: ~5-10 seconds each
- Total suite: ~15-20 minutes
- Can run in parallel with `--workers=4`

## CI/CD Integration

Ready to integrate into GitHub Actions, GitLab CI, or Jenkins. See [README.md](./README.md#cicd-integration) for examples.

---

**Happy Testing! 🎉**

For more details, see [README.md](./README.md) or [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
