import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';
const API_URL = 'http://localhost:8787';

export default defineConfig({
  testDir: './e2e',
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
    storageState: './e2e/.auth/admin.json',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      use: { storageState: undefined },
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
      command: 'cd ../backend && node -e "const fs=require(\'fs\');const l=fs.readFileSync(\'wrangler.toml\',\'utf8\').split(/\\r?\\n/);const out=[];let skip=false;for(const line of l){if(/^\\s*\\[/.test(line))skip=/^\\s*\\[ai\\]/.test(line);if(!skip)out.push(line);}fs.writeFileSync(\'.wrangler-e2e.toml\',out.join(String.fromCharCode(10)));" && npx wrangler dev --port 8787 -c .wrangler-e2e.toml',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx next dev --turbopack --port 3100',
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
