import fs from 'node:fs';
import path from 'node:path';

/**
 * Playwright globalTeardown for the showcase run.
 *
 * Playwright writes video into outputDir under a per-test folder with a
 * generated name. This lifts the largest (i.e. the real, complete) recording
 * out to a stable path and writes the chapter index beside it.
 *
 * Stable deliverable: desktop/showcase/full-walkthrough.webm
 */

const SHOWCASE_DIR = path.resolve(__dirname, '..', '..', 'showcase');
const ARTIFACT_DIR = path.join(SHOWCASE_DIR, '.artifacts');
const TARGET = path.join(SHOWCASE_DIR, 'full-walkthrough.webm');
const CHAPTERS_JSON = path.join(ARTIFACT_DIR, 'chapters.json');
const SHOWCASE_MD = path.join(SHOWCASE_DIR, 'SHOWCASE.md');

function findVideos(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findVideos(full));
    else if (e.name.endsWith('.webm')) out.push(full);
  }
  return out;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default async function globalTeardown() {
  fs.mkdirSync(SHOWCASE_DIR, { recursive: true });

  const videos = findVideos(ARTIFACT_DIR);
  if (!videos.length) {
    console.log('\n  [showcase] No video produced. Check that the walkthrough spec ran.\n');
    return;
  }

  // On a retry there are multiple takes; the complete one is the largest.
  const ranked = videos
    .map((f) => ({ f, size: fs.statSync(f).size }))
    .sort((a, b) => b.size - a.size);
  const best = ranked[0];
  if (!best) {
    console.log('\n  [showcase] No readable video found.\n');
    return;
  }

  fs.copyFileSync(best.f, TARGET);
  const mb = (best.size / (1024 * 1024)).toFixed(1);

  let chapterRows = '_No chapter data was recorded._';
  try {
    const chapters: { title: string; at: number }[] = JSON.parse(
      fs.readFileSync(CHAPTERS_JSON, 'utf8')
    );
    if (chapters.length) {
      chapterRows = ['| # | Timestamp | Chapter |', '|---|---|---|']
        .concat(chapters.map((c, i) => `| ${i + 1} | ${mmss(c.at)} | ${c.title} |`))
        .join('\n');
    }
  } catch {
    /* chapters are a nicety, not a requirement */
  }

  fs.writeFileSync(
    SHOWCASE_MD,
    `# TravelCRM Pro — Feature Walkthrough

Recorded ${new Date().toISOString()} · 1920×1080 · ${mb} MB

**Video:** [full-walkthrough.webm](./full-walkthrough.webm)

One continuous take covering every feature area of the desktop app, produced by
\`desktop/e2e/showcase/full-walkthrough.spec.ts\` against a live backend
(\`wrangler dev\` on :8787) and the Next.js app on :3100.

## Chapters

${chapterRows}

---

Regenerate with:

\`\`\`bash
cd desktop && npx playwright test --config=playwright.showcase.config.ts
\`\`\`
`,
    'utf8'
  );

  console.log(`\n  [showcase] Video:  ${path.relative(process.cwd(), TARGET)} (${mb} MB)`);
  console.log(`  [showcase] Index:  ${path.relative(process.cwd(), SHOWCASE_MD)}\n`);
}
