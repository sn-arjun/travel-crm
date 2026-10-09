import { defineConfig, devices } from '@playwright/test';

/**
 * Showcase config - records the client demo videos (STORYBOARD 0.2 / D.2).
 *
 * Runs against an ALREADY RUNNING production stack (`node scripts/fix-stack.mjs up --slot N`, which does
 * `next build` + `next start`): there is no webServer block, so nothing here can start `next dev`.
 *
 *   E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1 \
 *     npx playwright test --config=playwright.showcase.config.ts [--grep story-A]
 *
 * No slowMo: all pacing is explicit (see e2e/showcase/showcase-helpers.ts). Specs record through the built-in
 * page fixture (1920x1080 video, always on) and call finishRecording() to lift the video + marks into
 * desktop/showcase/.work/. Sessions come from e2e/fixtures.ts (fresh API login per run, refresh-safe).
 * Retakes are owned by the orchestrator (scripts/record-demo.mjs), hence retries: 0.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e/showcase',
  testMatch: /(smoke|story|full-walkthrough|wt\d|wtai|assistant)\.spec\.ts/,
  outputDir: './showcase/.artifacts',

  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,

  // Per-spec test.setTimeout() overrides (story-A 15 min, story-B 5 min, walkthrough 50 min).
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },

  reporter: [['list']],

  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    screenshot: 'off',
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    colorScheme: 'light',
    permissions: ['clipboard-read', 'clipboard-write'],
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // no launchOptions.slowMo: pacing is explicit
  },

  projects: [{ name: 'showcase' }],
});
