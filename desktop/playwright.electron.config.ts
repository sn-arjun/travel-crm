import { defineConfig } from '@playwright/test';

/**
 * Smoke test for the packaged Windows installer (`npm run build:desktop` first).
 * Needs a running API: `node scripts/fix-stack.mjs up --slot 1 --reset-db --no-build` and
 *   E2E_API_URL=http://localhost:8797/api/v1 npx playwright test -c playwright.electron.config.ts
 */
export default defineConfig({
  testDir: './e2e-electron',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: { trace: 'off' },
});
