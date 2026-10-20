/**
 * Regression check for R203: no screen or component may carry a hardcoded India locale, currency or zone.
 * Money, numbers, dates and time zones come from the agency settings through lib/format.ts, lib/utils.ts,
 * lib/dates.ts and lib/locale-options.ts. A page that needs a new format adds a helper there.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Files that legitimately name these literals, and why. Everything else must stay clean. */
const ALLOW: Array<{ path: string; why: string }> = [
  { path: 'lib/locale.ts', why: 'lakh/crore is an en-IN rule; a pre-R202 session without a locale maps INR to en-IN' },
  { path: 'lib/utils.ts', why: 'formatCompactCurrency documents and implements the en-IN lakh/crore form' },
  { path: 'lib/dates.ts', why: 'doc comments only' },
  { path: 'lib/format.ts', why: 'PDF short form "Rs." for INR; lakh/crore tight money for en-IN; doc comments' },
  { path: 'lib/locale-options.ts', why: 'the one list that names currencies and zones' },
  { path: 'app/(app)/settings/billing/', why: 'platform billing (R205/R206) is owned by the billing batches' },
];

const LITERALS: Array<{ name: string; re: RegExp }> = [
  { name: 'en-IN', re: /en-IN/ },
  { name: 'Asia/Kolkata', re: /Asia\/Kolkata/ },
  { name: "'INR'", re: /['"`]INR['"`]/ },
  { name: 'rupee sign', re: /₹/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'messages') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) && e.name !== 'test-setup.ts') {
      out.push(p);
    }
  }
  return out;
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

describe('hardcoded India locale literals', () => {
  it('appear only in the allow-listed files', () => {
    const hits: string[] = [];
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(200);
    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (ALLOW.some((a) => rel === a.path || (a.path.endsWith('/') && rel.startsWith(a.path)))) continue;
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (isComment(line)) return;
          for (const { name, re } of LITERALS) if (re.test(line)) hits.push(`${rel}:${i + 1} ${name}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('the allow-list only names files that exist', () => {
    for (const a of ALLOW) {
      const full = join(SRC, a.path);
      expect(() => (a.path.endsWith('/') ? readdirSync(full) : readFileSync(full))).not.toThrow();
      expect(a.why.length).toBeGreaterThan(10);
    }
  });
});
