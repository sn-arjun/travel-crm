// Build one clip: TTS (hash-cached) -> timeline -> Remotion render -> out/<id>.mp4 + .srt + .chapters.txt
// Usage: node src/build.mjs <clipId> [--frames=a-b] [--still=<sec>] [--no-render]
import fs from 'node:fs';
import path from 'node:path';
import { buildNarration, studioRoot } from './tts.mjs';
import { probeDuration, FFMPEG } from './ff.mjs';
import { chunkCaptionsNode } from './captions.mjs';

const args = process.argv.slice(2);
const clipId = args.find((a) => !a.startsWith('--'));
if (!clipId) { console.error('usage: node src/build.mjs <clipId> [--no-render] [--still=<sec>]'); process.exit(1); }
const flag = (n) => { const a = args.find((x) => x.startsWith(`--${n}`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : null; };

const FPS = 30;
const clip = JSON.parse(fs.readFileSync(path.join(studioRoot, 'clips', `${clipId}.json`), 'utf8'));
const repoRoot = path.resolve(studioRoot, '..');
const T0 = Date.now();

// 1. Narration
const lines = [];
clip.scenes.forEach((s, i) => { if (s.narration) lines.push({ id: `n${String(i).padStart(2, '0')}`, text: s.narration, voice: s.voice }); });
const { dir: narrDir, manifest } = await buildNarration(clipId, lines, clip.voice);
const byId = new Map(manifest.lines.map((l) => [l.id, l]));

// 2. Public dir for Remotion (narration wavs + source recording)
const pub = path.join(studioRoot, '.cache', 'public', clipId);
fs.mkdirSync(pub, { recursive: true });
const srcAbs = path.resolve(repoRoot, clip.source);
const srcName = path.basename(srcAbs);
const srcDest = path.join(pub, srcName);
if (!fs.existsSync(srcDest) || fs.statSync(srcDest).size !== fs.statSync(srcAbs).size) {
  try { fs.rmSync(srcDest, { force: true }); fs.linkSync(srcAbs, srcDest); } catch { fs.copyFileSync(srcAbs, srcDest); }
}
for (const l of manifest.lines) fs.copyFileSync(path.join(narrDir, l.file), path.join(pub, l.file));

// 3. Timeline (narration-first): a scene lasts at least narration + 0.4 s; never speed up the voice.
const PAD = 0.4;
const scenes = []; const captions = []; let t = 0;
clip.scenes.forEach((s, i) => {
  const n = byId.get(`n${String(i).padStart(2, '0')}`);
  const audioAt = s.audioAt ?? (s.type === 'screen' ? 0.25 : 0.4);
  const need = n ? audioAt + n.duration + PAD : 0;
  const segLen = s.type === 'screen' ? s.out - s.in : 0;
  const minDur = { logo: 2.6, title: 3.5, screen: segLen, flow: 6, plans: 6, end: 4 }[s.type] ?? 3;
  let dur = Math.max(s.dur ?? 0, minDur, need);
  if (s.type === 'end') dur = Math.max(dur, need + 0.8);
  const sc = { ...s, start: +t.toFixed(3), dur: +dur.toFixed(3) };
  delete sc.narration; delete sc.chapter;
  if (s.type === 'screen') { sc.src = `${clipId}/${srcName}`; sc.cropBottom = s.cropBottom ?? clip.cropBottom ?? 0.14; }
  if (n) { sc.audio = `${clipId}/${n.file}`; sc.audioDur = n.duration; sc.audioAt = audioAt; captions.push(...chunkCaptionsNode(n.text, t + audioAt, n.duration)); }
  sc._chapter = s.chapter;
  scenes.push(sc); t += dur;
});
const total = t;
const timeline = { fps: FPS, width: 1920, height: 1080, totalFrames: Math.round(total * FPS), scenes: scenes.map(({ _chapter, ...r }) => r), captions };
fs.mkdirSync(path.join(studioRoot, 'out'), { recursive: true });
fs.writeFileSync(path.join(studioRoot, 'out', `${clipId}.timeline.json`), JSON.stringify(timeline, null, 2));

// 4. SRT + chapters
const ts = (x) => { const ms = Math.round(x * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
fs.writeFileSync(path.join(studioRoot, 'out', `${clipId}.srt`), captions.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.text}\n`).join('\n'));
const mmss = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
fs.writeFileSync(path.join(studioRoot, 'out', `${clipId}.chapters.txt`), scenes.filter((s) => s._chapter).map((s) => `${mmss(s.start)} ${s._chapter}`).join('\n') + '\n');
console.log(`[build] timeline ${total.toFixed(1)} s, ${captions.length} caption chunks, ${manifest.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)} narration words`);
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
const outFile = path.join(studioRoot, 'out', `${clipId}.mp4`);
let lastPct = -1; const R0 = Date.now();
await renderMedia({
  composition: comp, serveUrl: bundled, codec: 'h264', audioCodec: 'aac', crf: 18, pixelFormat: 'yuv420p', outputLocation: outFile, inputProps,
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== lastPct) { lastPct = p; console.log(`[render] ${p * 10}%`); } },
});
console.log(`[build] render ${((Date.now() - R0) / 1000).toFixed(0)} s, total ${((Date.now() - T0) / 1000).toFixed(0)} s; ${outFile} ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB, ${probeDuration(outFile).toFixed(1)} s`);
