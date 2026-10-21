// Resolves a clip's screen and phone scenes against recordings and their marks (narration-paced recording, see README).
// Used by build.mjs (timeline), shorts.mjs and docs/videos/coverage.mjs (static checks only).
//
// A clip (or one scene) names a `recording`: <name> -> desktop/showcase/films/<name>.mp4 if present, else
// desktop/showcase/.work/<name>.webm, with marks in desktop/showcase/.work/marks-<name>.json (written by
// desktop/e2e/showcase/films/film-kit.ts). A scene then says `step: "<id>"` instead of hand-picked `in`/`out`:
//   in  = the time of mark "step:<id>"     (minus 0.1 s)
//   out = the time of mark "step-end:<id>"
// `zoom: { focus: "<id>", scale }` and `callout: { focus: "<id>", label }` take x, y and timing from mark
// "focus:<id>" (its data.box is the element's box as fractions of the frame).
// The driver app writes desktop/showcase/.work/driver-marks.json instead; phone scenes there use `markText`
// (a substring of a CAPTION or CARD mark): in = that mark, out = the next CAPTION / CARD / done mark.
// `trimIn` / `trimOut` shift in / out (seconds); `maxLen` keeps only the first N seconds of a step (short excerpts for the hero cut).
// Legacy clips keep `source` + explicit `in` / `out` (pilot-assistant.json) and are passed through untouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(studioRoot, '..');
export const WORK = path.join(repoRoot, 'desktop', 'showcase', '.work');
export const FILMS = path.join(repoRoot, 'desktop', 'showcase', 'films');

export function loadClip(id) {
  const file = path.join(studioRoot, 'clips', `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`no clip ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listClips() {
  // master.json is the master-cut config (studio/src/master.mjs), not a clip
  return fs.readdirSync(path.join(studioRoot, 'clips')).filter((f) => f.endsWith('.json') && f !== 'master.json').map((f) => f.replace(/\.json$/, ''));
}

/** Where a recording's video and marks live. */
export function recordingPaths(name) {
  if (name === 'driver') return { video: path.join(WORK, 'driver.mp4'), marks: path.join(WORK, 'driver-marks.json'), driver: true };
  const mp4 = path.join(FILMS, `${name}.mp4`);
  const webm = path.join(WORK, `${name}.webm`);
  return { video: fs.existsSync(mp4) ? mp4 : webm, marks: path.join(WORK, `marks-${name}.json`), driver: false };
}

const cache = new Map();
/** Parsed marks of a recording: steps { id -> {start, end} } and focus { id -> {t, box} } in seconds. */
export function loadMarks(name) {
  if (cache.has(name)) return cache.get(name);
  const p = recordingPaths(name);
  if (!fs.existsSync(p.marks)) { cache.set(name, null); return null; }
  const j = JSON.parse(fs.readFileSync(p.marks, 'utf8'));
  const out = { durationS: (j.durationMs ?? 0) / 1000, steps: new Map(), focus: new Map(), driver: [] };
  if (p.driver) {
    out.driver = (j.marks ?? []).filter((m) => ['CAPTION', 'CARD', 'done'].includes(m.name)).map((m) => ({ name: m.name, text: m.text ?? '', t: m.tVideoS }));
  } else {
    for (const m of j.marks ?? []) {
      const t = m.atMs / 1000;
      if (m.name.startsWith('step:')) { const id = m.name.slice(5); out.steps.set(id, { ...(out.steps.get(id) ?? {}), start: t }); }
      else if (m.name.startsWith('step-end:')) { const id = m.name.slice(9); out.steps.set(id, { ...(out.steps.get(id) ?? {}), end: t }); }
      else if (m.name.startsWith('focus:')) out.focus.set(m.name.slice(6), { t, box: m.data?.box, step: m.data?.step });
    }
  }
  cache.set(name, out);
  return out;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Fill in/out, zoom and callout of every screen/phone scene that uses a recording.
 * Returns { scenes, recordings: Set<name>, errors: string[] }. Scenes keep every other field.
 */
export function resolveScenes(clip) {
  const errors = []; const recordings = new Set();
  const scenes = clip.scenes.map((s0, i) => {
    const s = { ...s0 };
    if (s.type !== 'screen' && s.type !== 'phone') return s;
    const rec = s.recording ?? clip.recording;
    if (!rec) return s; // legacy: source + in/out
    s.recording = rec; recordings.add(rec);
    const marks = loadMarks(rec);
    const where = `scene ${i} (${s.step ?? s.markText ?? 'no step'}) of recording "${rec}"`;
    if (!marks) { errors.push(`${where}: no marks file ${path.relative(repoRoot, recordingPaths(rec).marks)} (record the film first)`); return s; }
    if (s.markText) {
      const k = marks.driver.findIndex((m) => m.text.includes(s.markText));
      if (k < 0) { errors.push(`${where}: no driver mark containing "${s.markText}"`); return s; }
      s.in = Math.max(0, marks.driver[k].t - 0.2 + (s.trimIn ?? 0));
      s.out = (marks.driver[k + 1]?.t ?? marks.driver[k].t + 8) + (s.trimOut ?? 0);
      return s;
    }
    if (!s.step) { if (s.in === undefined || s.out === undefined) errors.push(`${where}: needs step or in/out`); return s; }
    const st = marks.steps.get(s.step);
    if (!st || st.start === undefined || st.end === undefined) { errors.push(`${where}: step not found in marks (did the spec run beat('${s.step}')?)`); return s; }
    s.in = Math.max(0, st.start - 0.1 + (s.trimIn ?? 0));
    s.out = Math.max(s.in + 0.5, st.end + (s.trimOut ?? 0));
    if (s.maxLen) s.out = Math.min(s.out, s.in + s.maxLen); // a short excerpt of a longer step (the hero film)
    const focusAt = (id, what) => {
      const f = marks.focus.get(id);
      if (!f || !f.box) { errors.push(`${where}: ${what} focus "${id}" not in marks (spec must call focus(page, '${id}', ...))`); return null; }
      return { x: clamp(f.box.x + f.box.w / 2, 0.02, 0.98), y: clamp(f.box.y + f.box.h / 2, 0.02, 0.98), at: Math.max(0.2, f.t - s.in), box: f.box };
    };
    if (s.zoom && s.zoom.focus) {
      const f = focusAt(s.zoom.focus, 'zoom');
      if (f) { const start = Math.max(0.3, f.at - 0.6); s.zoom = { x: f.x, y: f.y, scale: s.zoom.scale ?? 1.35, start, end: start + (s.zoom.len ?? 1.6) }; }
      else delete s.zoom;
    }
    if (s.callout && s.callout.focus) {
      const f = focusAt(s.callout.focus, 'callout');
      if (f) {
        const r = s.callout.r ?? clamp(Math.round((Math.max(f.box.w * 1560, f.box.h * 877) / 2) + 16), 30, 96);
        s.callout = { x: f.x, y: f.y, label: s.callout.label, at: Math.max(0.4, f.at + (s.callout.delay ?? 0.4)), r, side: s.callout.side ?? (f.x > 0.6 ? 'left' : 'right') };
      } else delete s.callout;
    }
    return s;
  });
  return { scenes, recordings, errors };
}

/** Chapters from scenes: a scene with `chapter` opens one; the next scene with `chapter` closes it. */
export function chaptersOf(clip) {
  const out = [];
  clip.scenes.forEach((s, i) => {
    if (s.chapter) out.push({ title: s.chapter, first: i, last: i, features: [...(s.features ?? [])], short: s.short !== false });
    else if (out.length) { const c = out[out.length - 1]; c.last = i; c.features.push(...(s.features ?? [])); }
    if (s.chapter && s.short === false) out[out.length - 1].short = false;
  });
  return out;
}
