import { test as setup, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

const authDir = path.join(__dirname, '.auth');

setup('authenticate as admin', async ({ page }) => {
  // Ensure auth dir exists
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  // The login rate limiter 500s (KV expirationTtl < 60) when <60s remain in its window.
  // Waiting out the window clears it, so retry instead of failing the whole run.
  setup.setTimeout(6 * 60_000);
  for (let attempt = 1; ; attempt++) {
    try {
      await loginViaUI(page);
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      await page.waitForTimeout(65_000);
    }
  }

  // Save storage state (cookies + localStorage)
  await page.context().storageState({ path: path.join(authDir, 'admin.json') });
});
