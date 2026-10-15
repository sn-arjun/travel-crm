// After `next build`: Next's standalone output does not include .next/static or public/. Copy them
// next to server.js, and write electron/dist/build-config.json (build-time API URL and update feed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfigJson } from './build-urls.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');

function findServerDir(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'server.js'))) return dir;
  if (depth >= 6) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
      const found = findServerDir(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

if (!fs.existsSync(standalone)) {
  console.error('prepare-standalone: .next/standalone not found; run `next build` first');
  process.exit(1);
}
const serverDir = findServerDir(standalone);
if (!serverDir) {
  console.error('prepare-standalone: server.js not found under .next/standalone');
  process.exit(1);
}

// Links inside the standalone tree must not ship: Next copies a workspace's node_modules link (here a
// junction into the shared install) and dangling workspace links, which break packaging and would
// shadow the traced node_modules at runtime. unlink never follows the link.
function pruneLinks(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const dangling = !fs.existsSync(full);
      if (dangling || (e.name === 'node_modules' && full !== path.join(standalone, 'node_modules'))) {
        fs.unlinkSync(full);
        console.log(`prepare-standalone: removed link ${path.relative(standalone, full)}`);
      }
    } else if (e.isDirectory()) {
      pruneLinks(full);
    }
  }
}
pruneLinks(standalone);

const copy = (from, to) => fs.cpSync(from, to, { recursive: true, force: true, dereference: true });
copy(path.join(root, '.next', 'static'), path.join(serverDir, '.next', 'static'));
const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir)) copy(publicDir, path.join(serverDir, 'public'));
console.log(`prepare-standalone: static assets copied next to ${path.relative(root, path.join(serverDir, 'server.js'))}`);

const distDir = path.join(root, 'electron', 'dist');
fs.mkdirSync(distDir, { recursive: true });
const buildConfig = buildConfigJson(process.env);
fs.writeFileSync(path.join(distDir, 'build-config.json'), JSON.stringify(buildConfig, null, 2));
console.log(`prepare-standalone: build-config.json apiUrl=${buildConfig.apiUrl ?? '(default applies)'} updateUrl=${buildConfig.updateUrl ?? '(none: no auto-update)'}`);
