// Locates ffmpeg/ffprobe from the studio's own dependencies (or FFMPEG / FFPROBE env).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
export const FFMPEG = process.env.FFMPEG || require('ffmpeg-static');
export const FFPROBE = process.env.FFPROBE || require('ffprobe-static').path;
export function ff(args, loglevel = 'error') {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', loglevel, '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ').slice(0, 200)}\n${(r.stderr || '').slice(-800)}`);
  return r;
}
export function probeDuration(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(r.stdout);
}
