import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8797/api/v1').replace(/\/+$/, '');
const ADMIN_EMAIL = 'admin@demo.com';
const ADMIN_PASSWORD = 'Admin@123';
const releaseDir = path.resolve(__dirname, '..', 'release');

let workDir = '';
let installDir = '';
let exePath = '';

function findInstaller(): string {
  const files = fs
    .readdirSync(releaseDir)
    .filter((f) => /^TravelCRM Pro Setup .*\.exe$/.test(f))
    .sort();
  if (!files.length) throw new Error(`No installer in ${releaseDir}; run npm run build:desktop`);
  return path.join(releaseDir, files[files.length - 1]!);
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

async function waitUntil(fn: () => Promise<boolean> | boolean, timeoutMs: number, label: string) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function launch(userData: string, extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: exePath,
    env: { ...(process.env as Record<string, string>), TRAVELCRM_USER_DATA: userData, ...extraEnv },
    timeout: 60_000,
  });
}

function profile(name: string, apiUrl?: string): string {
  const dir = path.join(workDir, name);
  fs.mkdirSync(dir, { recursive: true });
  if (apiUrl) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ apiUrl }));
  return dir;
}

test.beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'travelcrm-smoke-'));
  installDir = path.join(workDir, 'app');
  // NSIS silent install; /D must be last and unquoted.
  const result = spawnSync(findInstaller(), ['/S', `/D=${installDir}`], { windowsHide: true });
  expect(result.status, 'silent install exit code').toBe(0);
  exePath = path.join(installDir, 'TravelCRM Pro.exe');
});

test.afterAll(() => {
  const uninstaller = path.join(installDir, 'Uninstall TravelCRM Pro.exe');
  if (fs.existsSync(uninstaller)) {
    spawnSync(uninstaller, ['/S', `_?=${installDir}`], { windowsHide: true });
  }
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('installed app logs in against the configured API and stops its server on close', async () => {
  const userData = profile('login', API_URL);
  const app = await launch(userData);
  // The window is created only after the bundled Next server answers /login.
  const page = await app.firstWindow();
  const serverUrl = await app.evaluate(() => process.env.TRAVELCRM_SERVER_URL ?? '');
  expect(serverUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const port = Number(new URL(serverUrl).port);
  expect(await listening(port)).toBe(true);

  await page.waitForSelector('text=Welcome back', { timeout: 60_000 });

  // The runtime config reached the renderer, and the desktop-only Advanced section is present.
  expect(await page.evaluate(() => (window as any).travelcrmConfig?.apiUrl)).toBe(API_URL);
  await expect(page.getByRole('button', { name: 'Advanced' })).toBeVisible();

  // The login form is server-rendered: retry the email step until hydration has attached the handler.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForSelector('#password', { timeout: 5_000 });
      break;
    } catch {
      /* not hydrated yet */
    }
  }
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 30_000 });
  await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 15_000 });

  await app.close();
  await waitUntil(async () => !(await listening(port)), 15_000, `port ${port} to stop listening`);
});

test('the updater reports update-available from a local feed', async () => {
  // electron-updater is a runtime dependency of the packaged app; without it the updater logs and stays off.
  const installed = ['.', '..'].some((d) => fs.existsSync(path.resolve(__dirname, '..', d, 'node_modules', 'electron-updater')));
  test.skip(!installed, 'electron-updater is not installed (run npm install electron-updater@6.3.9 -w travelcrm-desktop, then rebuild the installer)');

  const feedDir = path.join(workDir, 'feed');
  fs.mkdirSync(feedDir, { recursive: true });
  const installer = findInstaller();
  const fileName = 'TravelCRM-Pro-Setup-0.1.1.exe';
  fs.copyFileSync(installer, path.join(feedDir, fileName));
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
  const size = fs.statSync(installer).size;
  fs.writeFileSync(
    path.join(feedDir, 'latest.yml'),
    [
      'version: 0.1.1',
      'files:',
      `  - url: ${fileName}`,
      `    sha512: ${sha512}`,
      `    size: ${size}`,
      `path: ${fileName}`,
      `sha512: ${sha512}`,
      `releaseDate: '${new Date().toISOString()}'`,
      '',
    ].join('\n'),
  );

  const { serveUpdateFeed } = await import('../scripts/serve-update-feed.mjs');
  const server = await serveUpdateFeed(feedDir);
  const feedUrl = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/`;
  const userData = profile('update', API_URL);
  const app = await launch(userData, { TRAVELCRM_UPDATE_URL: feedUrl });
  try {
    const log = path.join(userData, 'logs', 'updater.log');
    await waitUntil(
      () => fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('update-available'),
      60_000,
      'update-available in updater.log',
    );
  } finally {
    await app.close();
    server.close();
  }
});
