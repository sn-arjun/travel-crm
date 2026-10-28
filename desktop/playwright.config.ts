import { defineConfig, devices } from '@playwright/test';

/**
 * Stack under test. Defaults to slot 0 (web 3100, API 8787). `node scripts/fix-stack.mjs up --slot N`
 * prints the E2E_BASE_URL / E2E_API_URL pair for slot N (web 3100+10N, API 8787+10N), e.g.
 *   E2E_BASE_URL=http://localhost:3110 E2E_API_URL=http://localhost:8797/api/v1 npx playwright test ...
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');
const API_PORT = new URL(API_URL).port || '8787';
const WEB_PORT = new URL(BASE_URL).port || '3100';

export default defineConfig({
  testDir: './e2e',
  // The showcase specs record client videos on a clean demo DB; they have their own config.
  testIgnore: ['**/showcase/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 90_000,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // No storageState here: e2e/fixtures.ts supplies a freshly minted, refresh-safe session per
    // test (refresh tokens are single-use, so one shared state cascades into /login redirects).
    // The 'setup' project below still writes e2e/.auth/admin.json, which the fixture uses as a template.
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      // AI binding needs Cloudflare auth wrangler dev can't get in a sandboxed/offline
      // environment; -c points at a gitignored copy of wrangler.toml with [ai] stripped,
      // generated the same way backend/vitest.config.ts does for the test pool.
      command: `cd ../backend && node -e "const fs=require('fs');const l=fs.readFileSync('wrangler.toml','utf8').split(/\\r?\\n/);const out=[];let skip=false;for(const line of l){if(/^\\s*\\[/.test(line))skip=/^\\s*\\[ai\\]/.test(line);if(!skip)out.push(line);}fs.writeFileSync('.wrangler-e2e.toml',out.join(String.fromCharCode(10)));" && npx wrangler dev --port ${API_PORT} -c .wrangler-e2e.toml --var TEST_MODE:true`,
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Production server, not `next dev`: dev (Turbopack) crashed under load. Needs a prior
      // `npm run build` (with NEXT_PUBLIC_API_URL pointing at the API above). `node scripts/fix-stack.mjs up`
      // does both the build and the start and is the preferred way to bring the stack up.
      command: `npx next start -p ${WEB_PORT}`,
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
