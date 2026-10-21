// Build one clip: TTS (hash-cached) -> timeline -> Remotion render -> out/<id>.mp4 + .srt + .chapters.txt + .chapters.json
// Usage: node src/build.mjs <clipId> [--resolve] [--no-render] [--still=<sec>] [--chapters]
//   --resolve    resolve recordings and marks only (no TTS, no render): prints each scene's in/out, fails on missing marks
//   --no-render  narration + timeline + SRT + chapters only (writes out/narration/<id>/narration.json, which the recorder reads)
//   --chapters   after the render, cut one short per chapter (same as `node src/shorts.mjs <clipId>`)
import fs from 'node:fs';
import path from 'node:path';
import { buildNarration, studioRoot } from './tts.mjs';
import { probeDuration, probeSize, ff, FFMPEG } from './ff.mjs';
import { chunkCaptionsNode } from './captions.mjs';
import { chaptersOf, recordingPaths, repoRoot, resolveScenes } from './resolve.mjs';

const args = process.argv.slice(2);
const clipId = args.find((a) => !a.startsWith('--'));
if (!clipId) { console.error('usage: node src/build.mjs <clipId> [--resolve] [--no-render] [--still=<sec>] [--chapters]'); process.exit(1); }
const flag = (n) => { const a = args.find((x) => x === `--${n}` || x.startsWith(`--${n}=`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : null; };

const FPS = 30;
const clip = JSON.parse(fs.readFileSync(path.join(studioRoot, 'clips', `${clipId}.json`), 'utf8'));
const T0 = Date.now();

// 0. Recordings and marks (narration-paced films); legacy clips pass through.
const resolved = resolveScenes(clip);
if (resolved.errors.length) {
  for (const e of resolved.errors) console.error(`[build] ${e}`);
  if (!flag('no-render') || flag('resolve')) process.exit(1);
  console.warn('[build] continuing for narration only (--no-render): the timeline uses placeholder segment lengths');
}
if (flag('resolve')) {
  resolved.scenes.forEach((s, i) => console.log(`[resolve] ${String(i).padStart(2, '0')} ${s.type.padEnd(6)} ${s.step ?? s.markText ?? ''} ${s.in !== undefined ? `${s.in.toFixed(2)}-${s.out.toFixed(2)} s` : ''}${s.chapter ? `  [${s.chapter}]` : ''}`));
  console.log(`[resolve] ok: ${resolved.recordings.size} recording(s)`);
  process.exit(0);
}

// 1. Narration
const lines = [];
clip.scenes.forEach((s, i) => { if (s.narration) lines.push({ id: `n${String(i).padStart(2, '0')}`, text: s.narration, voice: s.voice }); });
const { dir: narrDir, manifest } = await buildNarration(clipId, lines, clip.voice);
const byId = new Map(manifest.lines.map((l) => [l.id, l]));

// 2. Public dir for Remotion (narration wavs + source recordings)
const pub = path.join(studioRoot, '.cache', 'public', clipId);
fs.mkdirSync(pub, { recursive: true });
function linkOrCopy(srcAbs, dest) {
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(srcAbs).size) {
    try { fs.rmSync(dest, { force: true }); fs.linkSync(srcAbs, dest); } catch { fs.copyFileSync(srcAbs, dest); }
  }
}
/** Playwright records VP8 WebM: transcode once to an H.264 MP4 with short GOPs so Remotion seeks frame-accurately. */
function publish(srcAbs, name) {
  if (!fs.existsSync(srcAbs)) throw new Error(`recording not found: ${path.relative(repoRoot, srcAbs)}`);
  if (/\.webm$/i.test(srcAbs)) {
    const dest = path.join(pub, `${name}.mp4`);
    if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(srcAbs).mtimeMs) {
      console.log(`[build] transcoding ${path.basename(srcAbs)} -> ${path.basename(dest)}`);
      ff(['-i', srcAbs, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-pix_fmt', 'yuv420p', '-an', dest]);
    }
    return `${clipId}/${name}.mp4`;
  }
  const dest = path.join(pub, path.basename(srcAbs));
  linkOrCopy(srcAbs, dest);
  return `${clipId}/${path.basename(srcAbs)}`;
}
const srcFor = new Map(); const sizeFor = new Map();
for (const rec of resolved.recordings) {
  const p = recordingPaths(rec).video;
  if (!fs.existsSync(p)) { if (flag('no-render')) continue; throw new Error(`recording "${rec}" not found at ${path.relative(repoRoot, p)}`); }
  srcFor.set(rec, publish(p, rec)); sizeFor.set(rec, probeSize(p));
}
let legacySrc = null;
if (clip.source) legacySrc = publish(path.resolve(repoRoot, clip.source), path.basename(clip.source).replace(/\.[^.]+$/, ''));
for (const l of manifest.lines) fs.copyFileSync(path.join(narrDir, l.file), path.join(pub, l.file));

// 3. Timeline (narration-first): a scene lasts at least narration + 0.4 s; never speed up the voice.
const PAD = 0.4;
const scenes = []; const captions = []; let t = 0;
resolved.scenes.forEach((s, i) => {
  const n = byId.get(`n${String(i).padStart(2, '0')}`);
  const isVideo = s.type === 'screen' || s.type === 'phone';
  const audioAt = s.audioAt ?? (isVideo ? 0.25 : 0.4);
  const need = n ? audioAt + n.duration + PAD : 0;
  const segLen = isVideo && s.in !== undefined ? s.out - s.in : 0;
  const minDur = { logo: 2.6, title: 3.5, screen: segLen, phone: segLen, flow: 6, plans: 6, end: 4 }[s.type] ?? 3;
  let dur = Math.max(s.dur ?? 0, minDur, need);
  if (s.type === 'end') dur = Math.max(dur, need + 0.8);
  const sc = { ...s, start: +t.toFixed(3), dur: +dur.toFixed(3) };
  for (const k of ['narration', 'chapter', 'features', 'step', 'markText', 'recording', 'trimIn', 'trimOut', 'maxLen', 'short', 'note', 'voice']) delete sc[k];
  if (isVideo) {
    if (s.recording) { sc.src = srcFor.get(s.recording) ?? 'missing.mp4'; sc.cropBottom = s.cropBottom ?? clip.cropBottom ?? 0; const z = sizeFor.get(s.recording); if (z && s.type === 'phone') { sc.srcW = z.width; sc.srcH = z.height; } }
    else { sc.src = legacySrc; sc.cropBottom = s.cropBottom ?? clip.cropBottom ?? 0.14; }
    if (sc.in === undefined) { sc.in = 0; sc.out = Math.max(1, need); }
  }
  if (n) { sc.audio = `${clipId}/${n.file}`; sc.audioDur = n.duration; sc.audioAt = audioAt; captions.push(...chunkCaptionsNode(n.text, t + audioAt, n.duration)); }
  scenes.push(sc); t += dur;
});
const total = t;
const timeline = { fps: FPS, width: 1920, height: 1080, totalFrames: Math.round(total * FPS), scenes, captions };
const outDir = path.join(studioRoot, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${clipId}.timeline.json`), JSON.stringify(timeline, null, 2));

// 4. SRT + chapters (.txt for YouTube, .json for shorts / master / coverage)
const ts = (x) => { const ms = Math.round(x * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
fs.writeFileSync(path.join(outDir, `${clipId}.srt`), captions.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.text}\n`).join('\n'));
const mmss = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
const chapters = chaptersOf(clip).map((c) => ({ title: c.title, start: scenes[c.first].start, end: +(scenes[c.last].start + scenes[c.last].dur).toFixed(3), features: [...new Set(c.features)], short: c.short && clip.scenes.slice(c.first, c.last + 1).some((s) => s.type === 'screen' || s.type === 'phone') }));
const logo = scenes[0]?.type === 'logo' ? { start: 0, end: scenes[0].dur } : null;
const endCard = scenes[scenes.length - 1]?.type === 'end' ? { start: scenes[scenes.length - 1].start, end: total } : null;
fs.writeFileSync(path.join(outDir, `${clipId}.chapters.txt`), chapters.map((c, k) => `${k === 0 ? '00:00' : mmss(c.start)} ${c.title}`).join('\n') + '\n');
fs.writeFileSync(path.join(outDir, `${clipId}.chapters.json`), JSON.stringify({ clip: clipId, title: clip.title ?? clipId, total: +total.toFixed(3), logo, endCard, chapters }, null, 2));
console.log(`[build] timeline ${total.toFixed(1)} s, ${chapters.length} chapters, ${captions.length} caption chunks, ${manifest.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)} narration words`);
if (flag('no-render')) process.exit(0);

// 5. Render
const { bundle } = await import('@remotion/bundler');
const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
const bundled = await bundle({ entryPoint: path.join(studioRoot, 'src', 'index.ts'), publicDir: path.join(studioRoot, '.cache', 'public'), onProgress: () => {} });
const inputProps = { timeline };
const comp = await selectComposition({ serveUrl: bundled, id: 'Clip', inputProps, binariesDirectory: null, ffmpegExecutable: FFMPEG });
const still = flag('still');
if (still) {
  const out = path.join(studioRoot, 'tmp', `${clipId}-still-${still}.png`);
  await renderStill({ composition: comp, serveUrl: bundled, output: out, inputProps, frame: Math.round(parseFloat(still) * FPS) });
  console.log('[build] still', out); process.exit(0);
}
const outFile = path.join(outDir, `${clipId}.mp4`);
let lastPct = -1; const R0 = Date.now();
await renderMedia({
  composition: comp, serveUrl: bundled, codec: 'h264', audioCodec: 'aac', crf: 18, pixelFormat: 'yuv420p', outputLocation: outFile, inputProps,
  // one film at a time on a shared machine: cap Chrome tabs (Remotion's default is half the cores)
  concurrency: process.env.STUDIO_CONCURRENCY ? Number(process.env.STUDIO_CONCURRENCY) : null,
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== lastPct) { lastPct = p; console.log(`[render] ${p * 10}%`); } },
});
console.log(`[build] render ${((Date.now() - R0) / 1000).toFixed(0)} s, total ${((Date.now() - T0) / 1000).toFixed(0)} s; ${outFile} ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB, ${probeDuration(outFile).toFixed(1)} s`);
if (flag('chapters')) { const { cutShorts } = await import('./shorts.mjs'); await cutShorts(clipId); }
