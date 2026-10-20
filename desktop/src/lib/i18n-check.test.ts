import { describe, it, expect } from 'vitest';
import { run, scanFile } from '../../scripts/i18n-check.mjs';

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
