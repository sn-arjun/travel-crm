// Master end-to-end cut: stitches rendered films (no new recording, no new Remotion render) into one video with
// chapters. Reads clips/master.json: { "id": "master", "films": ["platform-owner", ...], "trim": true }.
// Usage: node src/master.mjs [--copy]
//   default  re-encode (x264 veryfast): drops the logo sting of every film after the first and the end card of every
//            film before the last, so the master flows. CPU time is roughly 0.5-1x the master's length.
//   --copy   stream-copy the films as rendered (seconds, keeps every sting and end card).
// Out: out/master.mp4, out/master.chapters.txt (YouTube: one chapter per film plus its own chapters), out/master.srt.
import fs from 'node:fs';
import path from 'node:path';
import { ff, probeDuration } from './ff.mjs';
import { studioRoot } from './resolve.mjs';

const copy = process.argv.includes('--copy');
const cfg = JSON.parse(fs.readFileSync(path.join(studioRoot, 'clips', 'master.json'), 'utf8'));
const out = path.join(studioRoot, 'out');
const films = cfg.films.map((id) => {
  const mp4 = path.join(out, `${id}.mp4`); const meta = path.join(out, `${id}.chapters.json`);
  if (!fs.existsSync(mp4) || !fs.existsSync(meta)) throw new Error(`render ${id} first (node src/build.mjs ${id})`);
  return { id, mp4, meta: JSON.parse(fs.readFileSync(meta, 'utf8')), srt: path.join(out, `${id}.srt`) };
});
const tmp = path.join(studioRoot, 'tmp', 'master'); fs.mkdirSync(tmp, { recursive: true });
const parseSrt = (text) => text.trim().split(/\r?\n\r?\n/).map((b) => { const l = b.split(/\r?\n/); const [a, z] = (l[1] ?? '').split(' --> '); const toS = (v) => { const [h, m, r] = v.split(':'); const [s, ms] = r.split(','); return +h * 3600 + +m * 60 + +s + +ms / 1000; }; return { from: toS(a), to: toS(z), text: l.slice(2).join('\n') }; }).filter((c) => !Number.isNaN(c.from));
const ts = (x) => { const ms = Math.round(x * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const hms = (x) => { const s = Math.floor(x); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

const list = []; const chapters = []; const caps = []; let offset = 0;
films.forEach((f, i) => {
  const total = probeDuration(f.mp4);
  const a = copy || i === 0 || !f.meta.logo ? 0 : f.meta.logo.end;
  const b = copy || i === films.length - 1 || !f.meta.endCard ? total : f.meta.endCard.start;
  let part = f.mp4;
  if (!copy) { // every part re-encoded with the same settings, so the concat below can stream-copy safely
    part = path.join(tmp, `${String(i).padStart(2, '0')}-${f.id}.mp4`);
    ff(['-ss', a.toFixed(3), '-to', b.toFixed(3), '-i', f.mp4, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-b:a', '160k', part]);
    console.log(`[master] ${f.id}: ${a.toFixed(1)}-${b.toFixed(1)} s`);
  }
  list.push(`file '${part.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
  chapters.push({ t: offset, title: f.meta.title ?? f.id });
  for (const c of f.meta.chapters) if (c.start >= a && c.start < b && c.start - a > 1) chapters.push({ t: offset + c.start - a, title: `${f.meta.title ?? f.id}: ${c.title}` });
  if (fs.existsSync(f.srt)) for (const c of parseSrt(fs.readFileSync(f.srt, 'utf8'))) if (c.from >= a && c.to <= b) caps.push({ ...c, from: c.from - a + offset, to: c.to - a + offset });
  offset += b - a;
});
fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n') + '\n');
const outFile = path.join(out, `${cfg.id ?? 'master'}.mp4`);
ff(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', outFile]);
// YouTube: first line 0:00:00, strictly ascending, at least 10 s apart
const lines = []; let last = -100;
chapters.sort((x, y) => x.t - y.t).forEach((c, i) => {
  if (i === 0) { lines.push('0:00:00 Introduction'); last = 0; return; }
  if (c.t - last >= 10) { lines.push(`${hms(c.t)} ${c.title.replace(/[<>]/g, '')}`); last = c.t; }
});
fs.writeFileSync(path.join(out, `${cfg.id ?? 'master'}.chapters.txt`), lines.join('\n') + '\n');
fs.writeFileSync(path.join(out, `${cfg.id ?? 'master'}.srt`), caps.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.text}\n`).join('\n'));
console.log(`[master] ${outFile} ${(probeDuration(outFile) / 60).toFixed(1)} min, ${lines.length} chapters`);
