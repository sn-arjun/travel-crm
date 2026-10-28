import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Right-to-left guard (R211): the shell, sign-in, shared ui/domain components and the four core areas use logical
 * utilities only (ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e), so they
 * mirror when <html dir="rtl">. A physical class slipping back in fails here.
 */
const root = path.resolve(__dirname, '..', '..');
const SCOPE = [
  'src/components/layout',
  'src/app/(auth)',
  'src/app/(app)/layout.tsx',
  'src/components/ui',
  'src/components/domain',
  'src/components/auth',
  'src/app/(app)/dashboard',
  'src/app/(app)/leads',
  'src/app/(app)/contacts',
  'src/app/(app)/itineraries',
];

function files(rel: string): string[] {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => {
    const child = `${rel}/${name}`;
    if (statSync(path.join(root, child)).isDirectory()) return files(child);
    return /\.tsx$/.test(name) && !/\.(test|spec|stories)\.tsx$/.test(name) ? [child] : [];
  });
}

const PHYSICAL: RegExp[] = [
  /(?<![\w-])-?(?:scroll-)?(?:ml|mr|pl|pr)-(?=[\w[])/,
  /(?<![\w-])-?(?:left|right)-(?=[\w[])(?!1\/2(?![\w]))(?!\[50%\])/,
  /(?<![\w-])text-(?:left|right)(?![\w-])/,
  /(?<![\w-])border-[lr](?![\w])/,
  /(?<![\w-])rounded-(?:[lr]|tl|tr|bl|br)(?![\w])/,
  /(?<![\w-])float-(?:left|right)(?![\w-])/,
];

describe('right-to-left: logical classes only in the converted scope', () => {
  const all = [...new Set(SCOPE.flatMap(files))];

  it('scans a real set of files', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('has no physical left/right utility classes', () => {
    const offenders: string[] = [];
    for (const rel of all) {
      readFileSync(path.join(root, rel), 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/rtl-ok/.test(line)) return;
          for (const re of PHYSICAL) {
            const m = re.exec(line);
            if (m) offenders.push(`${rel}:${i + 1}  ${m[0]}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
