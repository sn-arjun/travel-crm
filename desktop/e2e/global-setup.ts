import { test as setup, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

const authDir = path.join(__dirname, '.auth');

setup('authenticate as admin', async ({ page }) => {
  // Ensure auth dir exists
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  await loginViaUI(page);

  // Save storage state (cookies + localStorage)
  await page.context().storageState({ path: path.join(authDir, 'admin.json') });
});
