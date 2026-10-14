// Renders build-resources/icon.svg to icon.png (1024) and tray.png (256) with Playwright's Chromium.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'build-resources');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');

const browser = await chromium.launch();
try {
  for (const [name, size] of [['icon.png', 1024], ['tray.png', 256]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace(
        /<svg /,
        `<svg width="${size}" height="${size}" `,
      )}</div></body></html>`,
    );
    await page.screenshot({ path: path.join(dir, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`wrote build-resources/${name} (${size}px)`);
  }
} finally {
  await browser.close();
}
