// Locates an ffmpeg/ffprobe binary for the showcase tooling.
// Order: FFMPEG env -> ffmpeg-static in desktop/showcase/.tools -> ffmpeg-static from node_modules -> PATH.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');

function tryStatic(from) {
  try {
    const p = createRequire(path.join(from, 'noop.js'))('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch { /* not installed there */ }
  return null;
}

let cached = null;
export function ffmpegPath() {
  if (cached) return cached;
  const env = process.env.FFMPEG;
  if (env && fs.existsSync(env)) return (cached = env);
  const p =
    tryStatic(path.join(repoRoot, 'desktop/showcase/.tools')) ||
    tryStatic(path.join(repoRoot, 'desktop')) ||
    tryStatic(repoRoot);
  if (p) return (cached = p);
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.status === 0) return (cached = 'ffmpeg');
  throw new Error('ffmpeg not found: add ffmpeg-static to desktop devDependencies, or `npm install --prefix desktop/showcase/.tools ffmpeg-static`, or set FFMPEG=<path>');
}

/** Run ffmpeg synchronously; throws with the tail of stderr on failure. */
export function ff(args, opts = {}) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', opts.loglevel ?? 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ').slice(0, 300)}\n${(r.stderr || '').split('\n').slice(-12).join('\n')}`);
  return r;
}

/** Duration in seconds of a media file (parses ffmpeg -i output; ffprobe is not shipped with ffmpeg-static). */
export function durationSec(file) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || '');
  if (!m) throw new Error(`cannot read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Video stream info: {width,height,fps,codec}. */
export function videoInfo(file) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const line = (r.stderr || '').split('\n').find((l) => /Stream #.*Video:/.test(l)) || '';
  const wh = /(\d{2,5})x(\d{2,5})/.exec(line.replace(/(?<![0-9])0x[0-9a-f]+/gi, ''));
  const fps = /(\d+(?:\.\d+)?) fps/.exec(line);
  const codec = /Video:\s*(\w+)/.exec(line);
  return { width: wh ? +wh[1] : 0, height: wh ? +wh[2] : 0, fps: fps ? +fps[1] : 0, codec: codec ? codec[1] : '' };
}
