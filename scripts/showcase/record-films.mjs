#!/usr/bin/env node
/**
 * Records (and optionally renders) the video catalogue films, one at a time (docs/videos/RECORDING-RUNBOOK.md).
 * The stack must already be up (fix-stack.mjs; plus console-up.mjs for the multi group). Nothing here starts a stack.
 *
 *   node scripts/showcase/record-films.mjs --slot 2 --group single            every single-stack film, in catalogue order
 *   node scripts/showcase/record-films.mjs --slot 2 --films area-leads,area-finance
 *   node scripts/showcase/record-films.mjs --slot 2 --group multi --render    record, then render + gate each film
 *   node scripts/showcase/record-films.mjs --render-only --films area-leads   render a film that is already recorded
 *   node scripts/showcase/record-films.mjs --slot 2 --clip <id>               a film that is not in films.json (its clip carries film: { stack, targetSec })
 *   flags: --retakes 2 (max, default 2)  --pace 0.3 (dry run: fast, nothing kept)  --no-reseed  --dry (print only)
 *
 * Per film: (1) narration manifest: studio `build.mjs <film> --no-render` (Kokoro TTS, hash-cached), so the take is paced to the
 * real line lengths; (2) the take: playwright --grep "film:<film>"; (3) gate on the raw take: no violations, length within
 * 0.6x..2x of the clip's narration; (4) with --render: build.mjs <film> [--chapters], then the finalize gate on out/<film>.mp4.
 * A failed take is retaken at most --retakes times; single-stack retakes reseed first (seed-demo + film-prep --demo), because
 * every single-stack film depends only on the seed, never on another film. Cosmetic findings are reported, never looped on.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = path.join(root, 'desktop');
const studio = path.join(root, 'studio');
const work = path.join(desktop, 'showcase/.work');
const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const slot = Number(val('slot', process.env.SHOWCASE_SLOT ?? 2));
const retakes = Math.min(2, Number(val('retakes', 2)));
const pace = val('pace', '1');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'docs/videos/films.json'), 'utf8')).films;
const env = {
  ...process.env,
  E2E_API_URL: process.env.E2E_API_URL ?? `http://localhost:${8787 + 10 * slot}/api/v1`,
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? `http://localhost:${3100 + 10 * slot}`,
  E2E_CONSOLE_URL: process.env.E2E_CONSOLE_URL ?? `http://localhost:${3105 + 10 * slot}`,
  SHOWCASE_PACE: pace,
};
const log = (m) => console.log(`\n[record-films] ${m}`);
const node = process.execPath;
function run(cmd, args, cwd = root, extraEnv = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  if (flag('dry')) return 0;
  return spawnSync(cmd, args, { cwd, env: { ...env, ...extraEnv }, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' }).status ?? 1;
}
const must = (code, what) => { if (code !== 0) throw new Error(`${what} (exit ${code})`); };

const group = val('group');
const only = val('films')?.split(',');
const clipId = val('clip');
let films;
if (clipId) {
  // a film outside the catalogue (a prospect film): the clip says how to record it, then it takes the same retake, gate and render path
  const clipFile = path.join(studio, 'clips', `${clipId}.json`);
  if (!fs.existsSync(clipFile)) { console.error(`no clip ${clipFile}`); process.exit(2); }
  const meta = JSON.parse(fs.readFileSync(clipFile, 'utf8')).film;
  if (!meta || !meta.stack || !meta.targetSec) { console.error(`${clipId}.json needs film: { stack, targetSec } to be recorded with --clip`); process.exit(2); }
  films = [{ id: clipId, title: clipId, shorts: false, ...meta }];
} else films = catalogue.filter((f) => (only ? only.includes(f.id) : f.stack === group));
if (!films.length) { console.error(`nothing to do: --group single|multi|driver|ai, --clip id or --films id,id (ids: ${catalogue.map((f) => f.id).join(', ')})`); process.exit(2); }
films = films.filter((f) => {
  if (f.stack === 'cut') { log(`${f.id} is a cut (nothing to record): node studio/src/${f.id === 'master' ? 'master.mjs' : `build.mjs ${f.id}`}`); return false; }
  if (f.stack === 'ai' && !flag('ai')) { log(`${f.id} needs live AI: skipped (owner approval, a stack started with --ai, and --ai here)`); return false; }
  if (f.stack === 'driver') { log('driver: run scripts/record-driver.ps1 (see the runbook); not a Playwright film'); return false; }
  return true;
});

/** Expected raw-take length: each line holds (narration + 0.65 s) x the speed of its scene (sped-up scenes take longer to record). */
function narrationSeconds(f) {
  const clipName = f.clip ?? f.id; // a film recorded in parts names the clip its recording belongs to
  const m = path.join(studio, 'out/narration', clipName, 'narration.json');
  if (!fs.existsSync(m)) return null;
  const clipFile = path.join(studio, 'clips', `${clipName}.json`);
  const clip = fs.existsSync(clipFile) ? JSON.parse(fs.readFileSync(clipFile, 'utf8')) : { scenes: [] };
  const sceneOf = (line) => clip.scenes[Number(/^n(d+)$/.exec(line.id)?.[1])];
  const mine = (s) => !f.clip || (s && (s.recording ?? clip.recording) === f.id);
  const speedOf = (s) => (s && (s.type === 'screen' || s.type === 'phone') ? s.speed ?? 1 : 1);
  return JSON.parse(fs.readFileSync(m, 'utf8')).lines.reduce((n, l) => { const s = sceneOf(l); return mine(s) ? n + (l.duration + 0.65) * speedOf(s) : n; }, 0);
}
function reseed() {
  must(run(node, ['--no-warnings', path.join(root, 'backend/scripts/seed-demo.mjs')]), 'seed-demo');
  must(run(node, [path.join(root, 'scripts/showcase/film-prep.mjs'), '--demo']), 'film-prep --demo');
}
const gate = (name, video, extra) => run(node, ['--no-warnings', path.join(desktop, 'e2e/showcase/finalize.ts'), '--name', name, '--video', video, ...extra]);

const report = [];
for (const f of films) {
  const r = { film: f.id, attempts: 0, recorded: false, rendered: false, notes: [] };
  report.push(r);
  try {
    if (!flag('render-only')) {
      log(`${f.id}: narration manifest`);
      must(run(node, ['src/build.mjs', f.clip ?? f.id, '--no-render'], studio), 'narration');
      const need = narrationSeconds(f);
      for (let attempt = 0; attempt <= retakes && !r.recorded; attempt++) {
        r.attempts = attempt + 1;
        if (attempt > 0 && f.stack === 'single' && !flag('no-reseed')) { log(`${f.id}: reseed before retake ${attempt}`); reseed(); }
        log(`${f.id}: take ${attempt + 1}/${retakes + 1}`);
        const code = run('npx', ['playwright', 'test', '--config=e2e/showcase/films/playwright.films.config.ts', '--grep', `film:${f.id}`], desktop);
        if (code !== 0) { r.notes.push(`take ${attempt + 1} failed (see desktop/showcase/.work/fail-${f.id}.png)`); continue; }
        if (pace !== '1') { r.recorded = true; r.notes.push(`dry run at pace ${pace}: not a keeper`); break; }
        const lo = need ? Math.floor(need * 0.6) : 20; const hi = need ? Math.ceil(need * 2 + 30) : 900;
        const g = gate(`${f.id}-take`, path.join(work, `${f.id}.webm`), ['--violations', path.join(work, `violations-${f.id}.json`), '--duration', `${lo}-${hi}`]);
        if (g !== 0) { r.notes.push(`take ${attempt + 1} failed the gate`); continue; }
        r.recorded = true;
      }
      if (!r.recorded) throw new Error(`no clean take after ${r.attempts} attempt(s)`);
    }
    if (flag('render') || flag('render-only')) {
      log(`${f.id}: render`);
      must(run(node, ['src/build.mjs', f.id, ...(f.shorts ? ['--chapters'] : [])], studio, { STUDIO_CONCURRENCY: process.env.STUDIO_CONCURRENCY ?? '4' }), 'render');
      const out = path.join(studio, 'out', `${f.id}.mp4`);
      const g = gate(f.id, out, ['--frames-dir', path.join(work, 'frames', f.id), '--duration', `${Math.floor(f.targetSec * 0.5)}-${Math.ceil(f.targetSec * 2)}`]);
      if (g !== 0) r.notes.push('rendered film failed the gate: look at the frames, report cosmetic issues, retake only for real ones');
      r.rendered = g === 0;
    }
  } catch (e) {
    r.notes.push(String(e.message));
    log(`${f.id}: STOPPED - ${e.message}`);
  }
}
fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, `record-films-${Date.now()}.json`), JSON.stringify({ slot, pace, report }, null, 2));
log('summary');
for (const r of report) console.log(`  ${r.film.padEnd(20)} ${r.recorded ? 'recorded' : 'NOT recorded'}${r.rendered ? ', rendered' : ''} (${r.attempts} take(s)) ${r.notes.join('; ')}`);
process.exit(report.every((r) => r.recorded || flag('render-only')) ? 0 : 1);
