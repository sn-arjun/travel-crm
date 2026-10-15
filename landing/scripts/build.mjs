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

// The domain placeholder: config.js names the domain once; the static files carry the token YOUR-DOMAIN.example.
const TOKEN = 'YOUR-DOMAIN.example';
const configText = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const fromConfig = /var TRAVELCRM_DOMAIN = '([^']+)'/.exec(configText)?.[1];
const domain = (process.env.LANDING_DOMAIN || fromConfig || TOKEN).trim();
if (!/^[a-z0-9.-]+$/i.test(domain)) {
  console.error('landing build: invalid domain ' + JSON.stringify(domain));
  process.exit(1);
}
if (domain !== TOKEN) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/[.](html|xml|txt|js)$/.test(e.name)) {
        const t = fs.readFileSync(f, 'utf8');
        if (t.includes(TOKEN)) fs.writeFileSync(f, t.split(TOKEN).join(domain));
      }
    }
  };
  walk(out);
  console.log('landing build: domain ' + domain);
} else {
  console.log('landing build: WARNING the domain is still the placeholder ' + TOKEN + ' (set it in landing/config.js)');
}
for (const f of ['index.html', 'favicon.svg', 'sitemap.xml', 'robots.txt', 'og-image.png']) {
  if (!fs.existsSync(path.join(out, f))) {
    console.error(`landing build: ${f} missing from output`);
    process.exit(1);
  }
}
console.log(`landing build: ${out}`);
