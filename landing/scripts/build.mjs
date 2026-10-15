#!/usr/bin/env node
/**
 * Assemble the landing site for hosting: landing/dist/ holds the pages (index.html, legal/, config.js,
 * main.js, styles.css) with the contents of landing/public/ published at the site root
 * (/favicon.svg, /og-image.png, /sitemap.xml, /robots.txt, /images/...). scripts/ is not published.
 *
 * Usage: node landing/scripts/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(root)) {
  if (['scripts', 'public', 'dist', 'node_modules'].includes(name)) continue;
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
for (const f of ['index.html', 'favicon.svg', 'sitemap.xml', 'robots.txt', 'og-image.png']) {
  if (!fs.existsSync(path.join(out, f))) {
    console.error(`landing build: ${f} missing from output`);
    process.exit(1);
  }
}
console.log(`landing build: ${out}`);
