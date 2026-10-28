#!/usr/bin/env node
/**
 * Per-file ESLint ratchet.
 *
 *   node scripts/lint-gate.mjs                      compare against audit/fix/lint-baseline.json
 *   node scripts/lint-gate.mjs --update             rewrite the baseline from the current tree
 *   node scripts/lint-gate.mjs --zero <glob>...    additionally require 0 errors in files matching the globs
 *   node scripts/lint-gate.mjs --json <file>        write a machine-readable summary
 *
 * Default mode FAILS (exit 1) when a file's error count is higher than its baseline entry,
 * or when a file that is not in the baseline has any error. Only severity-2 messages count.
 * Globs are relative to desktop/, POSIX style, and support `**`, `*`, `?` and `{a,b}`; a leading `!` excludes.
 */
import { ESLint } from 'eslint';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(desktopDir, 'audit', 'fix', 'lint-baseline.json');

// ── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let update = false;
let jsonOut = null;
const zeroGlobs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--update') update = true;
  else if (a === '--json') jsonOut = argv[++i];
  else if (a === '--zero') {
    while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) zeroGlobs.push(argv[++i]);
  } else {
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
}

// ── glob -> RegExp (no deps) ────────────────────────────────
function globToRegExp(glob) {
  let re = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      braceDepth++;
      re += '(?:';
    } else if (c === '}' && braceDepth > 0) {
      braceDepth--;
      re += ')';
    } else if (c === ',' && braceDepth > 0) re += '|';
    else if ('\\^$+.()|[]'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

// ── lint ────────────────────────────────────────────────────
const started = Date.now();
const eslint = new ESLint({ cwd: desktopDir });
const results = await eslint.lintFiles(['.']);

/** @type {Record<string, number>} */
const files = {};
/** @type {Record<string, number>} */
const rules = {};
let totalErrors = 0;
let totalWarnings = 0;
for (const r of results) {
  const rel = path.relative(desktopDir, r.filePath).split(path.sep).join('/');
  const errs = r.messages.filter((m) => m.severity === 2);
  totalWarnings += r.messages.length - errs.length;
  if (errs.length === 0) continue;
  files[rel] = errs.length;
  totalErrors += errs.length;
  for (const m of errs) {
    const id = m.ruleId ?? '(parse error)';
    rules[id] = (rules[id] ?? 0) + 1;
  }
}
const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
const sortedRules = Object.fromEntries(Object.entries(rules).sort(([, a], [, b]) => b - a));
const summary = {
  generatedAt: new Date().toISOString(),
  totalErrors,
  totalWarnings,
  filesWithErrors: Object.keys(files).length,
  rules: sortedRules,
  files: sortedFiles,
};

if (jsonOut) {
  mkdirSync(path.dirname(path.resolve(desktopDir, jsonOut)), { recursive: true });
  writeFileSync(path.resolve(desktopDir, jsonOut), JSON.stringify(summary, null, 2) + '\n');
}

if (update) {
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(
    baselinePath,
    JSON.stringify({ generatedAt: summary.generatedAt, totalErrors, files: sortedFiles }, null, 2) + '\n',
  );
  console.log(
    `lint-gate: baseline updated - ${totalErrors} errors in ${summary.filesWithErrors} files (${totalWarnings} warnings ignored)`,
  );
  console.log('Top rules: ' + Object.entries(sortedRules).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(', '));
  process.exit(0);
}

// ── compare ─────────────────────────────────────────────────
if (!existsSync(baselinePath)) {
  console.error(`lint-gate: ${path.relative(desktopDir, baselinePath)} not found - run with --update first`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const baseFiles = baseline.files ?? {};

const regressions = [];
const improved = [];
for (const [file, count] of Object.entries(files)) {
  const was = baseFiles[file];
  if (was === undefined) regressions.push(`${file}: ${count} error(s), file not in baseline`);
  else if (count > was) regressions.push(`${file}: ${was} -> ${count}`);
  else if (count < was) improved.push(`${file}: ${was} -> ${count}`);
}
for (const [file, was] of Object.entries(baseFiles)) {
  if (!(file in files)) improved.push(`${file}: ${was} -> 0`);
}

const zeroFailures = [];
if (zeroGlobs.length > 0) {
  // A leading "!" negates (exclusion): a file is checked when it matches a positive glob and no negated one.
  const positive = zeroGlobs.filter((g) => !g.startsWith('!')).map(globToRegExp);
  const negative = zeroGlobs.filter((g) => g.startsWith('!')).map((g) => globToRegExp(g.slice(1)));
  for (const [file, count] of Object.entries(files)) {
    if (positive.some((re) => re.test(file)) && !negative.some((re) => re.test(file))) {
      zeroFailures.push(`${file}: ${count} error(s) (must be 0)`);
    }
  }
}

console.log(
  `lint-gate: ${totalErrors} errors in ${summary.filesWithErrors} files ` +
    `(baseline ${baseline.totalErrors}), ${totalWarnings} warnings, ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
if (improved.length) {
  console.log(`Improved (${improved.length}):`);
  for (const l of improved.slice(0, 40)) console.log('  + ' + l);
  if (improved.length > 40) console.log(`  ... and ${improved.length - 40} more`);
}
if (regressions.length) {
  console.log(`REGRESSIONS (${regressions.length}):`);
  for (const l of regressions) console.log('  - ' + l);
}
if (zeroFailures.length) {
  console.log(`ZERO-ERROR FAILURES (${zeroFailures.length}) for ${zeroGlobs.join(' ')}:`);
  for (const l of zeroFailures) console.log('  - ' + l);
}

if (regressions.length || zeroFailures.length) {
  console.log('lint-gate: FAIL');
  process.exit(1);
}
console.log('lint-gate: PASS');
