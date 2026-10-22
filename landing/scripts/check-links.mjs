#!/usr/bin/env node
/**
 * Link checker for the landing site (no dependencies). Run it after `npm run build`.
 *
 * Starts a static server on landing/dist/ (the built site, the way the hosting publishes it: /x/ serves
 * x/index.html), crawls every internal page starting at /, and fails when:
 *   - an internal href, src or stylesheet link answers anything but 200,
 *   - a link is "#" on its own (a call to action that goes nowhere),
 *   - an in-page link (#id) points at an id that does not exist on that page,
 *   - a sitemap entry has no matching page,
 *   - an hreflang alternate is missing or does not link back (alternates must be reciprocal).
 * External links (http/https to other hosts, mailto:, tel:) are listed, not fetched.
 *
 * Usage: node landing/scripts/check-links.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('landing/dist is missing: run `npm run build` in landing/ first');
  process.exit(1);
}
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
};

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const candidates = [path.join(root, p)];
  for (const c of candidates) {
    const norm = path.normalize(c);
    if (!norm.startsWith(root)) continue;
    if (fs.existsSync(norm) && fs.statSync(norm).isFile()) return norm;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url || '/');
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const problems = [];
const external = new Set();
let checked = 0;

const attrRe = /\b(href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function extract(html) {
  const out = [];
  let m;
  while ((m = attrRe.exec(html))) out.push({ attr: m[1].toLowerCase(), value: (m[3] ?? m[4] ?? '').trim() });
  return out;
}

function idsOf(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\bid\s*=\s*("([^"]*)"|'([^']*)')/gi)) ids.add(m[2] ?? m[3]);
  return ids;
}

async function get(base, urlPath) {
  const res = await fetch(base + urlPath);
  return { status: res.status, body: await res.text() };
}

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const queue = ['/'];
  const isPage = (t) => t.endsWith('.html') || t.endsWith('/');
  const alternates = new Map();
  const seen = new Set();
  const pageIds = new Map();

  while (queue.length) {
    const page = queue.shift();
    if (seen.has(page)) continue;
    seen.add(page);
    const { status, body } = await get(base, page);
    checked++;
    if (status !== 200) { problems.push(`${page}: HTTP ${status}`); continue; }
    pageIds.set(page, idsOf(body));
    const alts = [...body.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], new URL(m[2]).pathname]);
    if (alts.length) alternates.set(page, alts);

    for (const { attr, value } of extract(body)) {
      if (value === '' && attr === 'href') { problems.push(`${page}: empty href`); continue; }
      if (/^(mailto:|tel:|javascript:|data:)/i.test(value)) {
        if (/^javascript:/i.test(value)) problems.push(`${page}: javascript: link`);
        else external.add(value);
        continue;
      }
      if (/^(https?:)?\/\//i.test(value)) { external.add(value); continue; }
      if (value === '#') { problems.push(`${page}: href="#" goes nowhere`); continue; }

      const url = new URL(value, base + page);
      const target = url.pathname;
      if (value.startsWith('#')) {
        // in-page anchor: id must exist on this page
        if (!pageIds.get(page).has(decodeURIComponent(value.slice(1)))) problems.push(`${page}: ${value} has no matching id`);
        continue;
      }
      const res = await get(base, target + url.search);
      checked++;
      if (res.status !== 200) { problems.push(`${page}: ${attr}="${value}" -> HTTP ${res.status}`); continue; }
      if (url.hash && isPage(target)) {
        const ids = idsOf(res.body);
        if (!ids.has(decodeURIComponent(url.hash.slice(1)))) problems.push(`${page}: ${value} has no matching id on ${target}`);
      }
      if (isPage(target) && !seen.has(target)) queue.push(target);
      if (target.endsWith('.css')) {
        for (const m of res.body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
          const ref = m[1];
          if (/^(https?:|data:|\/\/)/i.test(ref)) continue;
          const r = await get(base, new URL(ref, base + target).pathname);
          checked++;
          if (r.status !== 200) problems.push(`${target}: url(${ref}) -> HTTP ${r.status}`);
        }
      }
    }
  }

  // sitemap: the index lists the sitemaps; every <loc> in them must exist
  const index = await get(base, '/sitemap-index.xml');
  if (index.status !== 200) problems.push('/sitemap-index.xml: missing');
  else {
    for (const sm of index.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const smPath = new URL(sm[1]).pathname;
      const file = await get(base, smPath);
      if (file.status !== 200) { problems.push(`sitemap-index.xml: ${smPath} is HTTP ${file.status}`); continue; }
      for (const m of file.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const p = new URL(m[1]).pathname;
        const r = await get(base, p);
        checked++;
        if (r.status !== 200) problems.push(`${smPath}: ${m[1]} -> ${p} is HTTP ${r.status}`);
      }
    }
  }
  // hreflang: every alternate exists, lists the page itself, and links back
  for (const [page, alts] of alternates) {
    if (!alts.some(([, p]) => p === page)) problems.push(`${page}: hreflang alternates do not include the page itself`);
    for (const [lang, p] of alts) {
      const back = alternates.get(p);
      if (!back) problems.push(`${page}: hreflang ${lang} -> ${p} has no alternates of its own`);
      else if (!back.some(([, q]) => q === page)) problems.push(`${page}: hreflang ${lang} -> ${p} does not link back`);
    }
  }
  // robots.txt names the sitemap
  const robots = await get(base, '/robots.txt');
  if (robots.status !== 200 || !/^Sitemap:/mi.test(robots.body)) problems.push('/robots.txt: missing or has no Sitemap line');
  // social image and favicon exist
  for (const f of ['/og-image.png', '/favicon.svg']) {
    const r = await fetch(base + f);
    checked++;
    if (r.status !== 200) problems.push(`${f}: HTTP ${r.status}`);
  }

  server.close();
  console.log(`checked ${checked} references on ${seen.size} pages; ${external.size} external links not fetched`);
  if (problems.length) {
    console.error(`FAIL: ${problems.length} problem(s)`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('OK: no broken internal links, no dead "#" calls to action');
}

main().catch((e) => { console.error(e); server.close(); process.exit(1); });
