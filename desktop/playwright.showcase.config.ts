import { defineConfig, devices } from '@playwright/test';

/**
 * Showcase config — produces the deliverable video.
 *
 * Deliberately separate from playwright.config.ts, which uses
 * `video: 'retain-on-failure'` and therefore produces NO video on a passing
 * run. This config records unconditionally at 1080p, slowed down enough to be
 * watchable, in a single browser context so the whole walkthrough is one
 * continuous take.
 *
 * Run:  npx playwright test --config=playwright.showcase.config.ts
 * Out:  showcase/full-walkthrough.webm  +  showcase/SHOWCASE.md
 */
export default defineConfig({
  testDir: './e2e/showcase',
  testMatch: /full-walkthrough\.spec\.ts/,
  outputDir: './showcase/.artifacts',
  globalTeardown: './e2e/showcase/finalize.ts',

  // One take, start to finish.
  fullyParallel: false,
  workers: 1,

  // The walkthrough covers every feature area — it is long by design.
  timeout: 60 * 60 * 1000,
  expect: { timeout: 15_000 },

  // One retry: a retry re-records cleanly rather than leaving a broken take.
  retries: 1,
  forbidOnly: !!process.env.CI,

  reporter: [['list'], ['html', { open: 'never', outputFolder: './showcase/report' }]],

  use: {
    baseURL: 'http://localhost:3100',
    storageState: './e2e/.auth/admin.json',

    viewport: { width: 1920, height: 1080 },
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    screenshot: 'off',
    trace: 'off',

    // Slow enough that a human can follow what is happening on screen.
    launchOptions: { slowMo: 250 },

    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  projects: [
    {
      name: 'showcase-setup',
      testDir: './e2e',
      testMatch: /global-setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: undefined },
    },
    {
      name: 'showcase',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
      dependencies: ['showcase-setup'],
    },
  ],

  // Same servers as the main config; reused if already running.
  webServer: [
    {
      command: 'cd ../backend && npx wrangler dev --port 8787',
      url: 'http://localhost:8787/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx next dev --turbopack --port 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
