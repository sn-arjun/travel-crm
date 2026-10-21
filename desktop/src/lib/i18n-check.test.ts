import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, scanFile, loadScope, COMPLETE_LANGUAGES } from '../../scripts/i18n-check.mjs';

describe('i18n-check (hard-coded strings in the shell, auth screens and shared components)', () => {
  it('finds no hard-coded UI text, no missing key and no catalogue mismatch', () => {
    const result = run();
    expect(result.problems).toEqual([]);
    expect(result.fileCount).toBeGreaterThan(40);
  });

  it('would catch a hard-coded string (the scanner itself works)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../../src/components/ui');
    const probe = path.join(dir, '__i18n_probe.tsx');
    fs.writeFileSync(
      probe,
      "export const A = () => <button aria-label=\"Close it\">Save changes</button>;\nexport const B = () => <p>{t('nowhere.key')}</p>;\n",
    );
    try {
      const { findings, usedKeys } = scanFile('src/components/ui/__i18n_probe.tsx');
      expect(findings.map((f: { what: string }) => f.what).sort()).toEqual(['JSX text', 'prop aria-label']);
      expect(usedKeys.map((k: { key: string }) => k.key)).toEqual(['nowhere.key']);
    } finally {
      fs.unlinkSync(probe);
    }
  });

  it('lets a deliberately untranslated value through with an i18n-ignore comment', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const probe = path.resolve(__dirname, '../../src/components/ui/__i18n_probe2.tsx');
    fs.writeFileSync(probe, "export const A = () => (\n  // i18n-ignore: example value\n  <input placeholder=\"Sample text value\" />\n);\n");
    try {
      expect(scanFile('src/components/ui/__i18n_probe2.tsx').findings).toEqual([]);
    } finally {
      fs.unlinkSync(probe);
    }
  });
});

describe('i18n-check catalogue rules (split catalogues, complete nl)', () => {
  const realMessages = path.resolve(__dirname, '../messages');
  let dir: string;

  const file = (lang: string, ns: string) => path.join(dir, lang, `${ns}.json`);
  const read = (lang: string, ns: string): Record<string, string> => JSON.parse(fs.readFileSync(file(lang, ns), 'utf8'));
  const write = (lang: string, ns: string, value: Record<string, string>) => fs.writeFileSync(file(lang, ns), JSON.stringify(value, null, 2));
  const check = () => run({ dir, scope: [] }).problems;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-check-'));
    fs.cpSync(realMessages, dir, { recursive: true });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('passes on the real catalogues, with en and nl complete', () => {
    expect(COMPLETE_LANGUAGES).toEqual(['en', 'nl']);
    expect(check()).toEqual([]);
    expect((run({ dir, scope: [] }).coverage as Record<string, { percent: number }>).nl.percent).toBe(100);
  });

  it('fails when an nl key is missing', () => {
    const nav = read('nl', 'nav');
    delete nav['nav.dashboard'];
    write('nl', 'nav', nav);
    expect(check()).toEqual([expect.stringContaining('nl is missing key "nav.dashboard"')]);
  });

  it('fails when nl has a key English does not', () => {
    write('nl', 'nav', { ...read('nl', 'nav'), 'nav.extra': 'Extra' });
    expect(check()).toEqual([expect.stringContaining('nl has key "nav.extra" that en does not')]);
  });

  it('fails when an nl value changes the {placeholders}', () => {
    write('nl', 'usage', { ...read('nl', 'usage'), 'usage.renews': 'Wordt vernieuwd' });
    expect(check()).toEqual([expect.stringContaining('nl "usage.renews" uses different {placeholders}')]);
  });

  it('lets hi stay partial but still checks its placeholders', () => {
    const nav = read('hi', 'nav');
    delete nav['nav.dashboard'];
    write('hi', 'nav', nav);
    expect(check()).toEqual([]);
    write('hi', 'usage', { ...read('hi', 'usage'), 'usage.renews': '{day}' });
    expect(check()).toEqual([expect.stringContaining('hi "usage.renews" uses different {placeholders}')]);
  });

  it('fails a key placed in the wrong file', () => {
    write('en', 'nav', { ...read('en', 'nav'), 'common.misplaced': 'Misplaced' });
    write('nl', 'common', { ...read('nl', 'common'), 'common.misplaced': 'Verplaatst' });
    expect(check()).toEqual([expect.stringContaining('"common.misplaced" is in en/nav.json; it belongs in en/common.json')]);
  });

  it('reads its scope from every file in i18n-scope', () => {
    const scope = loadScope(path.resolve(__dirname, '../../scripts/i18n-scope'));
    expect(scope).toContain('src/components/layout');
    expect(scope.length).toBeGreaterThan(30);
    const scopeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-scope-'));
    try {
      fs.writeFileSync(path.join(scopeDir, 'a.json'), JSON.stringify(['x/a.tsx']));
      fs.writeFileSync(path.join(scopeDir, 'b.json'), JSON.stringify(['x/b.tsx', 'x/a.tsx']));
      expect(loadScope(scopeDir)).toEqual(['x/a.tsx', 'x/b.tsx']);
    } finally {
      fs.rmSync(scopeDir, { recursive: true, force: true });
    }
  });
});
