#!/usr/bin/env node
/**
 * ffmpeg compositing pipeline (STORYBOARD D.7). Everything is H.264 High yuv420p 30 fps CFR, concatenated with
 * the concat demuxer (-c copy) and finished with a silent AAC track + faststart.
 *
 *   node scripts/showcase/compose.mjs proof  --desktop <webm> --desktop-marks <marks.json> --driver <mp4> --driver-marks <json> [--out proof.mp4]
 *   node scripts/showcase/compose.mjs story  --part-a <webm> --marks-a <json> --driver <mp4> --driver-marks <json> --part-b <webm> --marks-b <json>
 *                                           [--frame-a png] [--frame-b png] --out TravelCRM-Demo.mp4 --chapters story-chapters.txt
 *   node scripts/showcase/compose.mjs full   --walkthrough <webm> --marks <json> [--driver ... --driver-marks ... --driver-at <mark name>] --out ... --chapters ...
 *
 * Common: --work <dir> (default desktop/showcase/.work)   env FFMPEG, E2E_BASE_URL (cards render inside the app for its fonts)
 *
 * "proof" = intro + desktop clip + scene card + phone composite (device frame beside a still desktop frame) + outro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ff, durationSec, videoInfo, repoRoot } from './ffmpeg.mjs';
import { renderAll, templates } from './cards.mjs';

const { chaptersText, validateChapters } = await import(pathToFileURL(path.join(repoRoot, 'desktop/e2e/showcase/finalize.ts')).href);

const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-an'];
const log = (m) => console.log(`[compose] ${m}`);

// ─── building blocks ─────────────────────────────────────────────

/** Re-encode any source to the common format, optionally trimmed (-ss/-to in seconds of the source). */
export function normalize(src, dst, { ss, to, scale = true } = {}) {
  const args = [];
  if (ss !== undefined) args.push('-ss', String(ss));
  if (to !== undefined) args.push('-to', String(to));
  args.push('-i', src, '-vf', `fps=30${scale ? ',scale=1920:1080:flags=lanczos' : ''},format=yuv420p`, ...ENC, dst);
  ff(args);
  return dst;
}

/** Still PNG -> clip with fade in/out. */
export function cardClip(png, secs, dst, { fade = 0.4 } = {}) {
  const f = `fps=30,format=yuv420p,fade=in:0:12,fade=out:st=${Math.max(0, secs - fade).toFixed(2)}:d=${fade}`;
  ff(['-loop', '1', '-t', String(secs), '-i', png, '-vf', f, ...ENC, dst]);
  return dst;
}

/** Concat demuxer, stream copy (all inputs share one encode). */
export function concat(files, dst) {
  const list = path.join(path.dirname(dst), `${path.basename(dst, '.mp4')}-list.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', dst]);
  return dst;
}

/** Silent stereo AAC + faststart; video is stream-copied. */
export function finish(src, dst) {
  ff(['-i', src, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', dst]);
  return dst;
}

/** Single frame of a video as PNG. */
export function still(video, t, png) {
  ff(['-ss', String(t), '-i', video, '-frames:v', '1', png]);
  return png;
}

const dataUri = (png) => `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`;

/**
 * Phone composite: blurred desktop background with a framed desktop inset on the left, the phone clip inside a
 * device frame on the right, captions at the lower left and in-phone time-skip cards from the driver marks.
 * `bgB` (optional) crossfades in over the last 3 s (e.g. trip-assigned -> trip-completed).
 */
export async function phoneComposite({ driver, marks, bgA, bgB, out, work }) {
  const m = JSON.parse(fs.readFileSync(marks, 'utf8'));
  const start = m.clipStartS ?? 0;
  const end = m.clipEndS ?? durationSec(driver);
  const D = +(end - start).toFixed(2);
  const lib = path.join(work, 'cards');
  fs.mkdirSync(lib, { recursive: true });

  const caps = (m.marks ?? []).filter((x) => x.name === 'CAPTION').map((x) => ({ text: x.text, t: x.tVideoS - start }));
  const cards = (m.marks ?? []).filter((x) => x.name === 'CARD').map((x) => ({ text: x.text, t: x.tVideoS - start }));
  const capSpans = caps.map((c, i) => ({ ...c, s: Math.max(0, c.t), e: Math.min(D, i + 1 < caps.length ? caps[i + 1].t : c.t + 5) }));
  const cardSpans = cards.map((c) => ({ ...c, s: Math.max(0, c.t), e: Math.min(D, c.t + 2.5) }));

  const jobs = [
    { html: templates.phoneBg({ desktopPng: dataUri(bgA) }), out: path.join(lib, 'bgA.png') },
    ...(bgB ? [{ html: templates.phoneBg({ desktopPng: dataUri(bgB) }), out: path.join(lib, 'bgB.png') }] : []),
    { html: templates.mask(), out: path.join(lib, 'mask.png'), w: 405, h: 900 },
    { html: templates.deviceFrame(), out: path.join(lib, 'frame.png'), w: 437, h: 932, transparent: true },
    ...capSpans.map((c, i) => ({ html: templates.caption({ text: c.text }), out: path.join(lib, `cap${i}.png`), transparent: true })),
    ...cardSpans.map((c, i) => ({ html: templates.phoneCard({ text: c.text }), out: path.join(lib, `pcard${i}.png`), transparent: true })),
  ];
  await renderAll(jobs);

  const inputs = [];
  const add = (...a) => { inputs.push(...a); return inputs.filter((x) => x === '-i').length - 1; };
  const iA = add('-loop', '1', '-t', String(D), '-i', path.join(lib, 'bgA.png'));
  const iB = bgB ? add('-loop', '1', '-t', String(D), '-i', path.join(lib, 'bgB.png')) : -1;
  const iP = add('-ss', String(start), '-t', String(D), '-i', driver);
  const iM = add('-loop', '1', '-t', String(D), '-i', path.join(lib, 'mask.png'));
  const iF = add('-loop', '1', '-t', String(D), '-i', path.join(lib, 'frame.png'));
  const overlays = [
    ...capSpans.map((c, i) => ({ i: add('-loop', '1', '-t', String(D), '-i', path.join(lib, `cap${i}.png`)), s: c.s, e: c.e })),
    ...cardSpans.map((c, i) => ({ i: add('-loop', '1', '-t', String(D), '-i', path.join(lib, `pcard${i}.png`)), s: c.s, e: c.e })),
  ];

  const f = [];
  f.push(`[${iP}:v]fps=30,scale=405:900:flags=lanczos,format=rgba[ph]`);
  f.push(`[${iM}:v]format=gray[mk]`);
  f.push(`[ph][mk]alphamerge[phr]`);
  let cur = 'bg';
  if (iB >= 0) {
    f.push(`[${iA}:v]format=rgba[bga]`);
    f.push(`[${iB}:v]format=rgba,fade=t=in:st=${Math.max(0, D - 3).toFixed(2)}:d=0.8:alpha=1[bgb]`);
    f.push(`[bga][bgb]overlay=0:0[bg]`);
  } else f.push(`[${iA}:v]format=rgba[bg]`);
  f.push(`[${cur}][phr]overlay=1379:90[a]`);
  f.push(`[a][${iF}:v]overlay=1363:74[b0]`);
  let last = 'b0';
  overlays.forEach((o, k) => {
    f.push(`[${last}][${o.i}:v]overlay=0:0:enable='between(t,${o.s.toFixed(2)},${o.e.toFixed(2)})'[b${k + 1}]`);
    last = `b${k + 1}`;
  });
  f.push(`[${last}]fps=30,format=yuv420p[v]`);
  ff([...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-t', String(D), ...ENC, out]);
  return { out, durationSec: D, captions: capSpans.length, cards: cardSpans.length };
}

// ─── CLI ─────────────────────────────────────────────────────────

function opts(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
  return o;
}
const readMarks = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** trim window of a Playwright recording: first card minus 0.3 s .. last mark plus tail */
function window_(marksFile, tail = 1.5, skipCard = null) {
  const j = readMarks(marksFile);
  const first = j.marks.find((x) => x.type === 'card' && x.name !== skipCard) ?? j.marks[0];
  const last = j.marks[j.marks.length - 1];
  const ss = Math.max(0, (first?.atMs ?? 0) / 1000 - 0.3);
  const to = Math.min(j.durationMs / 1000, (last?.atMs ?? j.durationMs) / 1000 + tail);
  return { ss, to, cards: j.marks.filter((x) => x.type === 'card' && x.atMs >= (first?.atMs ?? 0)).map((x) => ({ title: x.name, atS: x.atMs / 1000 - ss })), len: to - ss };
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const o = opts(rest);
  const work = path.resolve(o.work ?? path.join(repoRoot, 'desktop/showcase/.work'));
  fs.mkdirSync(path.join(work, 'parts'), { recursive: true });
  const parts = path.join(work, 'parts');
  const P = (n) => path.join(parts, n);

  // static cards
  const sceneCard = o['scene-title'] ?? 'On the road with Ravi';
  await renderAll([
    // --intro-tagline / --outro-line replace the two lines on the opening and closing cards
    { html: templates.intro(o['intro-tagline'] ? { tagline: o['intro-tagline'] } : {}), out: P('intro.png') },
    { html: templates.outro(o['outro-line'] ? { line: o['outro-line'] } : {}), out: P('outro.png') },
    { html: templates.scene({ kicker: o['scene-kicker'] ?? 'Scene 7 of 9', title: sceneCard, subtitle: 'TravelCRM Driver app on Android' }), out: P('scene7.png') },
  ]);
  cardClip(P('intro.png'), 5, P('intro.mp4'));
  cardClip(P('outro.png'), 6, P('outro.mp4'));
  cardClip(P('scene7.png'), 2.5, P('scene7.mp4'), { fade: 0.3 });

  const seq = [{ file: P('intro.mp4'), title: 'Introduction', len: 5 }];
  const chapters = [];
  let t = 5;
  const addDesktop = (webm, marksFile, name) => {
    const w = window_(marksFile, 1.5, name === 'wt7' ? 'AI assistant' : null); // wt7 was recorded when it still opened with the (honest, no-AI) AI chapter, now its own part wtai
    const dst = P(`${name}.mp4`);
    normalize(webm, dst, { ss: w.ss, to: w.to });
    const len = durationSec(dst);
    for (const c of w.cards) chapters.push({ title: c.title, tSec: t + c.atS });
    seq.push({ file: dst, len });
    t += len;
  };
  const addPhone = async (driver, dmarks, bgA, bgB, withCard, speed = 1) => {
    if (withCard) { seq.push({ file: P('scene7.mp4'), len: 2.5 }); chapters.push({ title: sceneCard, tSec: t }); t += 2.5; }
    const out = P('phone.mp4');
    const r = await phoneComposite({ driver, marks: dmarks, bgA, bgB, out, work });
    log(`phone composite: ${r.durationSec}s, ${r.captions} captions, ${r.cards} card(s)`);
    if (speed !== 1) { const fast = P('phone-fast.mp4'); ff(['-i', out, '-vf', `setpts=PTS/${speed},fps=30,format=yuv420p`, ...ENC, fast]); fs.copyFileSync(fast, out); }
    if (!withCard) chapters.push({ title: sceneCard, tSec: t });
    seq.push({ file: out, len: durationSec(out) });
    t += durationSec(out);
  };

  if (mode === 'proof') {
    addDesktop(o.desktop, o['desktop-marks'], 'desktop');
    const frame = still(o.desktop, Math.min(8, Math.max(1, window_(o['desktop-marks']).len / 2)), P('frameA.png'));
    const frame2 = still(o.desktop, Math.max(2, durationSec(o.desktop) - 4), P('frameB.png'));
    await addPhone(o.driver, o['driver-marks'], frame, frame2, true);
  } else if (mode === 'story') {
    addDesktop(o['part-a'], o['marks-a'], 'partA');
    const wb = o['part-b'] ? window_(o['marks-b']) : null;
    const bgA = o['frame-a'] ?? still(o['part-a'], 5, P('frameA.png'));
    const bgB = o['frame-b'] ?? (o['part-b'] ? still(o['part-b'], wb.ss + 4, P('frameB.png')) : undefined);
    await addPhone(o.driver, o['driver-marks'], bgA, bgB, true);
    if (o['part-b']) addDesktop(o['part-b'], o['marks-b'], 'partB');
  } else if (mode === 'full') {
    // independent recorded parts, concatenated in order; the driver clip (chapter 21) goes after `--driver-after <part>`
    const names = (o.parts ?? 'wt1,wt2,wt3,wt4,wt5,wt6,wtai,wt7').split(',');
    for (const n of names) {
      addDesktop(path.join(work, `${n}.webm`), path.join(work, `marks-${n}.json`), n);
      if (o.driver && n === (o['driver-after'] ?? 'wt4')) {
        const bgA = o['frame-a'] ?? still(path.join(work, `${n}.webm`), 5, P('frameA.png'));
        await addPhone(o.driver, o['driver-marks'], bgA, o['frame-b'], true, Number(o['driver-speed'] ?? 1.25));
      }
    }
  } else throw new Error('mode must be proof | story | full');

  seq.push({ file: P('outro.mp4'), len: 6 });
  chapters.push({ title: 'Thank you', tSec: t });
  t += 6;

  const out = path.resolve(o.out ?? path.join(work, `${mode}.mp4`));
  const joined = concat(seq.map((s) => s.file), P('joined.mp4'));
  finish(joined, out);
  const dur = durationSec(out);
  const info = videoInfo(out);
  log(`${out}  ${dur.toFixed(1)}s  ${info.width}x${info.height}@${info.fps}  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
  const txt = chaptersText(chapters, dur);
  const chFile = path.resolve(o.chapters ?? path.join(work, `${mode}-chapters.txt`));
  fs.writeFileSync(chFile, txt);
  const errs = validateChapters(txt, dur, 5);
  log(`chapters -> ${chFile}${errs.length ? `  (WARN: ${errs.join('; ')})` : ''}`);
  fs.writeFileSync(path.join(work, `${mode}-timeline.json`), JSON.stringify({ out, durationSec: dur, chapters, segments: seq.map((s) => ({ file: path.basename(s.file), len: s.len })) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
