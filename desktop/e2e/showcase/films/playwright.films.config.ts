import { defineConfig, devices } from '@playwright/test';

/**
 * Recording config for the video catalogue films (docs/videos/RECORDING-RUNBOOK.md). Same rules as
 * playwright.showcase.config.ts: an ALREADY RUNNING production stack (fix-stack.mjs up), 1920x1080 video always on,
 * one worker, no retries (retakes belong to scripts/showcase/record-films.mjs), no slowMo (pacing is explicit).
 *
 *   cd desktop
 *   E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1 \
 *     npx playwright test --config=e2e/showcase/films/playwright.films.config.ts --grep "film:area-leads"
 *
 * Each spec saves desktop/showcase/.work/<film>.webm + marks-<film>.json + violations-<film>.json.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: '../../../showcase/.artifacts-films',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 20 * 60_000,
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
    timezoneId: process.env.FILM_TZ ?? 'Asia/Kolkata',
    locale: process.env.FILM_LOCALE ?? 'en-IN',
    colorScheme: 'light',
    permissions: ['clipboard-read', 'clipboard-write'],
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'films' }],
});
