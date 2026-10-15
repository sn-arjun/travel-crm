// Builds the agency app as a website for Cloudflare (OpenNext). The Electron build is untouched:
//   npm -w travelcrm-desktop run build:web      -> .open-next/worker.js + .open-next/assets
//   npm -w travelcrm-desktop run preview:web    -> build, then serve locally with wrangler dev (extra args after --)
//   npm -w travelcrm-desktop run deploy:web     -> build, then deploy (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
// The web build writes to .next like the Electron build does, so rebuild the Electron app (build:desktop) afterwards.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.includes('--deploy') ? 'deploy' : args.includes('--preview') ? 'preview' : 'build';
const extra = args.filter((a) => !['--deploy', '--preview'].includes(a));

const env = { ...process.env, TRAVELCRM_TARGET: 'web' };

function run(cliArgs) {
  const r = spawnSync('npx', ['opennextjs-cloudflare', ...cliArgs], { cwd: root, env, stdio: 'inherit', shell: true });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}

run(['build']);
const worker = path.join(root, '.open-next', 'worker.js');
if (!fs.existsSync(worker)) {
  console.error('build-web: .open-next/worker.js was not produced');
  process.exit(1);
}
console.log(`build-web: ${path.relative(process.cwd(), worker) || worker} (${(fs.statSync(worker).size / 1024).toFixed(0)} KiB)`);

if (mode === 'preview') run(['preview', ...extra]);
else if (mode === 'deploy') run(['deploy', ...extra]);
