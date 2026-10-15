#!/usr/bin/env node
/**
 * Fresh-clone check: proves a new copy of the repository passes with ONE root `npm ci`.
 *
 *   node scripts/fresh-clone-check.mjs            clone HEAD (git clone --no-hardlinks) into a temp folder, check it, delete it
 *   node scripts/fresh-clone-check.mjs --here     check the current checkout in place (used by CI)
 *   node scripts/fresh-clone-check.mjs --keep     keep the temp clone
 *   node scripts/fresh-clone-check.mjs --tmp <dir>  parent folder for the clone
 *
 * Includes the agency web app OpenNext build (desktop/.open-next/worker.js), the gen-wrangler and deploy-script
 * self-tests, and terraform fmt/validate when terraform is installed.
 * Steps run strictly one at a time (low-memory machines). No backend/.dev.vars or desktop/.env.local needed.
 * Only committed files are cloned, so commit before running locally. Exits non-zero when any step fails.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const here = argv.includes('--here');
const keep = argv.includes('--keep');
const tmpIdx = argv.indexOf('--tmp');
const tmpParent = tmpIdx >= 0 ? path.resolve(argv[tmpIdx + 1]) : path.join(repoRoot, 'backend', '.dryrun');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;

let dir = repoRoot;
if (!here) {
  fs.mkdirSync(tmpParent, { recursive: true });
  dir = fs.mkdtempSync(path.join(tmpParent, 'fresh-clone-'));
  console.log(`cloning ${repoRoot} -> ${dir}`);
  const r = spawnSync('git', ['clone', '--no-hardlinks', '--quiet', repoRoot, dir], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('git clone failed');
    process.exit(1);
  }
}

// Never leak this repo's local test config into the check.
const env = { ...process.env, CI: 'true', NODE_ENV: undefined };
delete env.NODE_ENV;

// Terraform is optional on a developer machine (CI always has it): the steps run when `terraform version` works.
const hasTerraform = spawnSync('terraform', ['version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
const terraformSteps = hasTerraform
  ? [
      ['terraform fmt -check', 'terraform', ['fmt', '-check', '-recursive'], 'terraform'],
      ['terraform init + validate (Cloudflare root)', 'terraform', ['init', '-backend=false', '-input=false'], 'terraform'],
      ['terraform validate', 'terraform', ['validate'], 'terraform'],
      ['terraform init + validate (Oracle root)', 'terraform', ['init', '-backend=false', '-input=false'], 'terraform/oracle'],
      ['terraform validate (Oracle root)', 'terraform', ['validate'], 'terraform/oracle'],
    ]
  : [];

/** [label, command, args, cwd relative to the clone] */
const steps = [
  ['npm ci (root, once)', npm, ['ci', '--no-audit', '--no-fund'], '.'],
  ['npm ls --workspaces --depth=0', npm, ['ls', '--workspaces', '--depth=0'], '.'],
  ['shared-ts build', npm, ['-w', '@travelcrm/shared', 'run', 'build'], '.'],
  ['backend tsc', npm, ['-w', 'travelcrm-api', 'run', 'typecheck'], '.'],
  ['backend vitest', npm, ['-w', 'travelcrm-api', 'exec', '--', 'vitest', 'run'], '.'],
  ['desktop tsc', npm, ['-w', 'travelcrm-desktop', 'run', 'typecheck'], '.'],
  ['desktop vitest', npm, ['-w', 'travelcrm-desktop', 'run', 'test'], '.'],
  ['desktop lint gate', node, ['scripts/lint-gate.mjs'], 'desktop'],
  ['super-admin tsc', npx, ['tsc', '--noEmit'], 'super-admin'],
  ['super-admin lint', npm, ['-w', 'super-admin', 'run', 'lint'], '.'],
  ['super-admin next build', npm, ['-w', 'super-admin', 'run', 'build'], '.'],
  ['super-admin OpenNext build', npx, ['opennextjs-cloudflare', 'build'], 'super-admin'],
  ['desktop web OpenNext build', npm, ['-w', 'travelcrm-desktop', 'run', 'build:web'], '.'],
  ['landing link check', node, ['landing/scripts/check-links.mjs'], '.'],
  ['gen-wrangler self-test', node, ['scripts/gen-wrangler.selftest.mjs'], 'backend'],
  ['deploy scripts self-test', node, ['scripts/shell-scripts.selftest.mjs'], '.'],
  ...terraformSteps,
];

const results = [];
let failed = false;
for (const [label, cmd, args, cwd] of steps) {
  if (failed) {
    results.push({ label, outcome: 'SKIPPED' });
    continue;
  }
  console.log(`\n=== ${label} ===`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: path.join(dir, cwd), stdio: 'inherit', env, shell: process.platform === 'win32' && cmd.endsWith('.cmd') });
  const secs = Math.round((Date.now() - t0) / 1000);
  let ok = r.status === 0;
  if (ok && label.startsWith('desktop web OpenNext') && !fs.existsSync(path.join(dir, 'desktop', '.open-next', 'worker.js'))) {
    console.error('desktop/.open-next/worker.js was not produced');
    ok = false;
  }
  if (ok && label.startsWith('super-admin OpenNext') && !fs.existsSync(path.join(dir, 'super-admin', '.open-next', 'worker.js'))) {
    console.error('super-admin/.open-next/worker.js was not produced');
    ok = false;
  }
  results.push({ label, outcome: ok ? 'PASS' : 'FAIL', secs });
  if (!ok) failed = true;
}

console.log('\n=== fresh-clone summary ===');
for (const r of results) console.log(`${r.outcome.padEnd(8)} ${r.label}${r.secs !== undefined ? ` (${r.secs}s)` : ''}`);

if (!here && !keep) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  console.log(`removed ${dir}`);
} else if (!here) {
  console.log(`kept ${dir}`);
}
console.log(failed ? '\nFRESH CLONE CHECK: FAILED' : '\nFRESH CLONE CHECK: PASSED');
process.exit(failed ? 1 : 0);
