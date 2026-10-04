// @ts-nocheck - runs under plain node (type stripping); not covered by the desktop tsconfig strictness
/**
 * Quality gate + chapter files for the showcase videos (STORYBOARD D.8 / D.9).
 *
 * Library:  import { chaptersText, validateChapters, gate } from './finalize.ts'
 * CLI:      node --no-warnings desktop/e2e/showcase/finalize.ts --name smoke --video <file> \
 *             [--marks marks-smoke.json ...] [--violations violations-smoke.json ...] \
 *             [--duration 20-60] [--min-chapter 10] [--max-chapter 60] [--chapters chapters.txt] [--frames-dir dir]
 *
 * The gate fails (exit 1) on: any recorded violation (console error / pageerror / HTTP >= 400 / banned text),
 * a video outside the duration budget, a card chapter shorter than --min-chapter, or a white/black flash
 * (mean luma > 245 or < 8 on >= 2 consecutive samples taken every 10 s, or any blackdetect hit >= 1 s).
 * Extracted frames are left in --frames-dir for the human reviewer.
 *
 * Erasable TypeScript only; runs under plain node >= 22.18.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ff, ffmpegPath, durationSec } from '../../../scripts/showcase/ffmpeg.mjs';

// ─── Chapters (D.8) ──────────────────────────────────────────────

export interface Chapter { title: string; tSec: number }

export function stamp(sec: number, hours = false): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(r).padStart(2, '0');
  return hours ? `${h}:${mm}:${ss}` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${ss}`;
}

/** YouTube chapter list. The first line is always "00:00 Introduction". Titles are stripped of < and >. */
export function chaptersText(chapters: Chapter[], totalSec: number): string {
  const hours = totalSec >= 3600;
  const clean = chapters
    .filter((c) => c.tSec > 0.5)
    .sort((a, b) => a.tSec - b.tSec)
    .map((c) => ({ title: c.title.replace(/[<>]/g, '').trim(), tSec: c.tSec }));
  const lines = [`${stamp(0, hours)} Introduction`];
  let prev = 0;
  for (const c of clean) {
    if (Math.floor(c.tSec) <= prev) continue; // strictly ascending
    lines.push(`${stamp(c.tSec, hours)} ${c.title}`);
    prev = Math.floor(c.tSec);
  }
  return lines.join('\n') + '\n';
}

export function validateChapters(text: string, totalSec: number, minLen = 10): string[] {
  const errs: string[] = [];
  const lines = text.trim().split('\n');
  if (!/^0?0?:?00:00 Introduction$|^00:00 Introduction$|^0:00:00 Introduction$/.test(lines[0] ?? '')) errs.push('first chapter must be "00:00 Introduction"');
  if (lines.length < 3) errs.push(`need at least 3 chapters, have ${lines.length}`);
  const secs = lines.map((l) => {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2}) /.exec(l);
    return m ? (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3] : NaN;
  });
  secs.forEach((s, i) => {
    if (Number.isNaN(s)) errs.push(`unparseable line: ${lines[i]}`);
    else if (i > 0 && s <= secs[i - 1]) errs.push(`not strictly ascending at: ${lines[i]}`);
    const next = i + 1 < secs.length ? secs[i + 1] : totalSec;
    if (!Number.isNaN(s) && next - s < minLen) errs.push(`chapter shorter than ${minLen}s: ${lines[i]}`);
    if (/[<>]/.test(lines[i])) errs.push(`< or > in title: ${lines[i]}`);
  });
  return errs;
}

// ─── Frame checks ────────────────────────────────────────────────

export interface FrameCheck { samples: { t: number; luma: number }[]; flashes: string[]; blackSegments: string[] }

export function frameCheck(video: string, framesDir: string, everySec = 10): FrameCheck {
  fs.mkdirSync(framesDir, { recursive: true });
  for (const f of fs.readdirSync(framesDir)) if (/^(f|luma)/.test(f)) fs.rmSync(path.join(framesDir, f));
  // PNG frames for the human reviewer
  ff(['-i', path.resolve(video), '-vf', `fps=1/${everySec}`, path.join(framesDir, 'f%03d.png')]);
  // mean luma per sample (metadata=print writes to a file relative to cwd to dodge Windows drive-colon escaping)
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'info', '-i', path.resolve(video), '-vf',
    `fps=1/${everySec},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=luma.txt`, '-an', '-f', 'null', '-'],
    { cwd: framesDir, encoding: 'utf8', maxBuffer: 1 << 26 });
  const bd = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'info', '-i', path.resolve(video), '-vf', 'blackdetect=d=1:pix_th=0.03', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const txt = fs.existsSync(path.join(framesDir, 'luma.txt')) ? fs.readFileSync(path.join(framesDir, 'luma.txt'), 'utf8') : '';
  const samples: { t: number; luma: number }[] = [];
  let idx = 0;
  for (const m of txt.matchAll(/YAVG=([\d.]+)/g)) samples.push({ t: idx++ * everySec, luma: parseFloat(m[1]) });
  const flashes: string[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].luma, b = samples[i].luma;
    if ((a > 245 && b > 245) || (a < 8 && b < 8)) flashes.push(`consecutive ${a > 245 ? 'white' : 'black'} samples at ${samples[i - 1].t}s and ${samples[i].t}s`);
  }
  const blackSegments = Array.from((bd.stderr || '').matchAll(/black_start:([\d.]+).*?black_duration:([\d.]+)/g)).map((m) => `black ${m[1]}s for ${m[2]}s`);
  return { samples, flashes, blackSegments };
}

// ─── Gate ────────────────────────────────────────────────────────

export interface GateOptions {
  name: string;
  video: string;
  violationFiles?: string[];
  marksFiles?: string[];
  duration?: [number, number];
  minChapterSec?: number;
  maxChapterSecWarn?: number;
  framesDir?: string;
}
export interface GateResult { ok: boolean; failures: string[]; warnings: string[]; durationSec: number; frames?: FrameCheck }

export function gate(o: GateOptions): GateResult {
  const failures: string[] = [], warnings: string[] = [];
  let dur = 0;
  try { dur = durationSec(o.video); } catch (e) { failures.push(`cannot read ${o.video}: ${(e as Error).message}`); return { ok: false, failures, warnings, durationSec: 0 }; }

  for (const f of o.violationFiles ?? []) {
    if (!fs.existsSync(f)) { warnings.push(`no violations file ${f}`); continue; }
    const v: string[] = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const x of v) failures.push(`violation (${path.basename(f)}): ${x}`);
  }
  if (o.duration && (dur < o.duration[0] || dur > o.duration[1])) failures.push(`duration ${dur.toFixed(1)}s outside budget ${o.duration[0]}-${o.duration[1]}s`);

  // card chapters: every title card to the next card (or the end) must be >= min length
  if (o.minChapterSec) {
    for (const f of o.marksFiles ?? []) {
      if (!fs.existsSync(f)) continue;
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const cards = (j.marks as { type?: string; name: string; atMs: number }[]).filter((m) => m.type === 'card');
      cards.forEach((c, i) => {
        const end = i + 1 < cards.length ? cards[i + 1].atMs : j.durationMs;
        const len = (end - c.atMs) / 1000;
        if (len < o.minChapterSec!) failures.push(`chapter "${c.name}" is ${len.toFixed(1)}s (< ${o.minChapterSec}s)`);
        if (o.maxChapterSecWarn && len > o.maxChapterSecWarn) warnings.push(`chapter "${c.name}" is ${len.toFixed(1)}s (> ${o.maxChapterSecWarn}s)`);
      });
    }
  }
  let frames: FrameCheck | undefined;
  if (o.framesDir) {
    frames = frameCheck(o.video, o.framesDir);
    failures.push(...frames.flashes, ...frames.blackSegments);
  }
  return { ok: failures.length === 0, failures, warnings, durationSec: dur, frames };
}

// ─── CLI ─────────────────────────────────────────────────────────

function arg(a: string[], k: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] === k && a[i + 1]) out.push(a[++i]);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const name = arg(a, '--name')[0] ?? 'video';
  const video = arg(a, '--video')[0];
  if (!video) { console.error('usage: finalize.ts --name N --video FILE [--marks F]... [--violations F]... [--duration lo-hi] [--min-chapter S] [--frames-dir D]'); process.exit(2); }
  const dur = arg(a, '--duration')[0]?.split('-').map(Number) as [number, number] | undefined;
  const res = gate({
    name, video, violationFiles: arg(a, '--violations'), marksFiles: arg(a, '--marks'), duration: dur,
    minChapterSec: arg(a, '--min-chapter')[0] ? Number(arg(a, '--min-chapter')[0]) : undefined,
    maxChapterSecWarn: arg(a, '--max-chapter')[0] ? Number(arg(a, '--max-chapter')[0]) : undefined,
    framesDir: arg(a, '--frames-dir')[0],
  });
  console.log(`[gate:${name}] duration ${res.durationSec.toFixed(1)}s`);
  if (res.frames) console.log(`[gate:${name}] luma samples: ${res.frames.samples.map((s) => `${s.t}s=${s.luma.toFixed(0)}`).join(' ')}`);
  for (const w of res.warnings) console.log(`[gate:${name}] warn: ${w}`);
  for (const f of res.failures) console.error(`[gate:${name}] FAIL: ${f}`);
  console.log(`[gate:${name}] ${res.ok ? 'PASS' : 'FAILED'}`);
  process.exit(res.ok ? 0 : 1);
}
