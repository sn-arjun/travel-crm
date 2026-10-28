// One feature short per chapter, cut from a rendered film (no new recording, no new Remotion render).
// Usage: node src/shorts.mjs <clipId> [--only=<n,n>] [--no-sting]
// Needs out/<clipId>.mp4 and out/<clipId>.chapters.json (both written by build.mjs).
// Each short = the film's own logo sting + the chapter + the film's end card, re-encoded in one ffmpeg pass:
//   out/shorts/<clipId>/<nn>-<slug>.mp4  and  .srt (captions of that chapter, shifted)
// Chapters marked "short": false in the clip (title cards, intro, thank-you) are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ff } from './ff.mjs';
import { studioRoot } from './resolve.mjs';

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const ts = (x) => { const ms = Math.max(0, Math.round(x * 1000)); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
function parseSrt(text) {
  const toS = (v) => { const [h, m, rest] = v.split(':'); const [s, ms] = rest.split(','); return +h * 3600 + +m * 60 + +s + +ms / 1000; };
  return text.trim().split(/\r?\n\r?\n/).map((b) => { const l = b.split(/\r?\n/); const [a, z] = (l[1] ?? '').split(' --> '); return { from: toS(a), to: toS(z), text: l.slice(2).join('\n') }; }).filter((c) => !Number.isNaN(c.from));
}

export async function cutShorts(clipId, opts = {}) {
  const out = path.join(studioRoot, 'out');
  const film = path.join(out, `${clipId}.mp4`);
  const meta = path.join(out, `${clipId}.chapters.json`);
  if (!fs.existsSync(film) || !fs.existsSync(meta)) throw new Error(`render ${clipId} first (need ${film} and ${meta})`);
  const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
  const srt = fs.existsSync(path.join(out, `${clipId}.srt`)) ? parseSrt(fs.readFileSync(path.join(out, `${clipId}.srt`), 'utf8')) : [];
  const dir = path.join(out, 'shorts', clipId);
  fs.mkdirSync(dir, { recursive: true });
  const only = opts.only ? new Set(opts.only) : null;
  const made = [];
  j.chapters.forEach((c, k) => {
    if (!c.short || (only && !only.has(k + 1))) return;
    const parts = [];
    if (j.logo && opts.sting !== false) parts.push([j.logo.start, j.logo.end]);
    parts.push([c.start, c.end]);
    if (j.endCard && opts.sting !== false && j.endCard.start > c.end) parts.push([j.endCard.start, j.endCard.end]);
    const filters = parts.map(([a, b], i) => `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`).join(';');
    const concat = `${parts.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${parts.length}:v=1:a=1[v][a]`;
    const name = `${String(k + 1).padStart(2, '0')}-${slug(c.title)}`;
    const file = path.join(dir, `${name}.mp4`);
    ff(['-i', film, '-filter_complex', `${filters};${concat}`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', file]);
    // captions of the chapter, shifted past the sting
    const shift = (parts.length > 1 && j.logo && opts.sting !== false) ? j.logo.end - j.logo.start : 0;
    const caps = srt.filter((x) => x.from >= c.start - 0.05 && x.to <= c.end + 0.05).map((x) => ({ ...x, from: x.from - c.start + shift, to: x.to - c.start + shift }));
    fs.writeFileSync(path.join(dir, `${name}.srt`), caps.map((x, i) => `${i + 1}\n${ts(x.from)} --> ${ts(x.to)}\n${x.text}\n`).join('\n'));
    made.push({ file: path.relative(studioRoot, file), chapter: c.title, seconds: +parts.reduce((n, [a, b]) => n + b - a, 0).toFixed(1), features: c.features });
    console.log(`[shorts] ${name}.mp4 (${made[made.length - 1].seconds} s)`);
  });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ clip: clipId, shorts: made }, null, 2));
  return made;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const id = a.find((x) => !x.startsWith('--'));
  if (!id) { console.error('usage: node src/shorts.mjs <clipId> [--only=1,3] [--no-sting]'); process.exit(1); }
  const onlyArg = a.find((x) => x.startsWith('--only='));
  await cutShorts(id, { only: onlyArg ? onlyArg.split('=')[1].split(',').map(Number) : null, sting: !a.includes('--no-sting') });
}
