#!/usr/bin/env node
/**
 * After `astro build`: replace the domain placeholder in dist/ and check the files the hosting needs are there.
 * config.js names the domain once; static files that were not built by Astro (robots.txt, legal pages) carry the
 * token YOUR-DOMAIN.example, replaced here with that value (or with the LANDING_DOMAIN environment variable).
 *
 * Usage: node landing/scripts/postbuild.mjs (run by `npm run build`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const TOKEN = 'YOUR-DOMAIN.example';
const configText = fs.readFileSync(path.join(root, 'public', 'config.js'), 'utf8');
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
  console.log('landing build: WARNING the domain is still the placeholder ' + TOKEN + ' (set it in landing/public/config.js)');
}
for (const f of ['index.html', '404.html', 'favicon.svg', 'sitemap-index.xml', 'robots.txt', 'og-image.png', 'config.js', 'legal/privacy.html']) {
  if (!fs.existsSync(path.join(out, f))) {
    console.error(`landing build: ${f} missing from output`);
    process.exit(1);
  }
}
console.log(`landing build: ${out}`);
