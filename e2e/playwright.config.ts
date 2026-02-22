import { defineConfig } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8787';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  outputDir: '/tmp/e2e-results',
  timeout: 30_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: API_BASE_URL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: API_BASE_URL,
      },
    },
    {
      name: 'browser',
      testDir: './tests/browser',
      use: {
        baseURL: APP_BASE_URL,
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
      },
    },
  ],
});
