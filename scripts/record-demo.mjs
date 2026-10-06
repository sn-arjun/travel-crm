#!/usr/bin/env node
/**
 * Orchestrator for the client demo videos (STORYBOARD D.1). Resumable per stage.
 *
 *   node scripts/record-demo.mjs [--slot 2] [--from <stage>] [--only <stage>] [--skip-driver] [--dry] [--with-smoke]
 *
 * Stages, in order:
 *   preflight   ports up, IST time window, ffmpeg resolves, emulator (unless --skip-driver)
 *   seed        backend/scripts/seed-demo.mjs                        (reset + API seed + SQL fixups + verify)
 *   storyA      pre-roll SQL, then playwright --grep story-A         -> .work/partA.webm, marks-partA.json, .handoff.json (scenes 1-6)
 *   driver      scripts/record-driver.ps1                            -> .work/driver.mp4, driver-marks.json (scene 7, Android emulator)
 *   storyB      playwright --grep story-B                            -> .work/partB.webm, marks-partB.json (scenes 8-9)
 *   walkthrough between-takes SQL, then full-walkthrough.spec.ts     [placeholder]
 *   smoke       the harness smoke clip (only with --only smoke / --with-smoke) -> .work/smoke.webm
 *   compose     scripts/showcase/compose.mjs: story + full when their takes exist, else a `proof.mp4`
 *   finalize    quality gate (desktop/e2e/showcase/finalize.ts) on every produced video
 *
 * Env (all derived from the slot unless set): SHOWCASE_SLOT, E2E_BASE_URL, E2E_API_URL, FFMPEG, DEMO_D0.
 * A failing stage stops the run and prints the stage name; fix, then re-run with `--from <stage>`.
 * Retakes (STORYBOARD B.0): storyA / storyB / driver are retried up to 2 times by --retakes (default 2).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'desktop');
const work = path.join(desktop, 'showcase/.work');
const showcase = path.join(desktop, 'showcase');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const slot = Number(val('slot', process.env.SHOWCASE_SLOT ?? 0));
const apiPort = 8787 + 10 * slot;
const webPort = 3100 + 10 * slot;
const env = {
  ...process.env,
  SHOWCASE_SLOT: String(slot),
  E2E_API_URL: process.env.E2E_API_URL ?? `http://localhost:${apiPort}/api/v1`,
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`,
};
const retakes = Number(val('retakes', 2));
const istMinsNow = (() => { const d = new Date(Date.now() + 330 * 60_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
if (!env.DEMO_PICKUP && (istMinsNow < 8 * 60 || istMinsNow > 20 * 60 + 30)) env.DEMO_PICKUP = '14:45';
const STAGES = ['preflight', 'seed', 'storyA', 'driver', 'storyB', 'walkthrough', 'smoke', 'compose', 'finalize'];
const DEFAULT_SKIP = flag('with-smoke') ? [] : ['smoke'];
const only = val('only');
const from = val('from', 'preflight');
if (!STAGES.includes(from) || (only && !STAGES.includes(only))) { console.error(`stages: ${STAGES.join(' | ')}`); process.exit(2); }

const log = (m) => console.log(`\n[record-demo] ${m}`);
fs.mkdirSync(work, { recursive: true });

function run(cmd, args, o = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  if (flag('dry')) return 0;
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, cwd: o.cwd ?? root, shell: o.shell ?? false });
  return r.status ?? 1;
}
function must(code, what) { if (code !== 0) throw new Error(`${what} failed (exit ${code})`); }
function withRetakes(what, fn) {
  let last;
  for (let i = 0; i <= retakes; i++) {
    try { fn(); return; } catch (e) { last = e; log(`${what}: attempt ${i + 1}/${retakes + 1} failed - ${e.message}`); }
  }
  throw last;
}
const exists = (p) => fs.existsSync(p);
const handoffFile = path.join(showcase, '.handoff.json');
const node = process.execPath;
const playwright = (extra) => run('npx', ['playwright', 'test', '--config=playwright.showcase.config.ts', ...extra], { cwd: desktop, shell: true });
const seedDemo = (extra = []) => run(node, ['--no-warnings', path.join(root, 'backend/scripts/seed-demo.mjs'), ...extra]);

async function up(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); return r.status < 500; } catch { return false; } }

const stage = {
  async preflight() {
    const ist = new Date(Date.now() + 330 * 60_000);
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    log(`IST now ${ist.toISOString().slice(11, 16)} (window 08:00-20:30)`);
    if (mins < 8 * 60 || mins > 20 * 60 + 30) {
      if (!process.env.SHOWCASE_IGNORE_WINDOW) throw new Error('outside the 08:00-20:30 IST recording window (set SHOWCASE_IGNORE_WINDOW=1 to record anyway with the flight pinned to 14:45)');
      log('outside the daytime window: the airport pickup is pinned to DEMO_PICKUP (default 14:45) so the story reads as an afternoon arrival');
    }
    if (!(await up(`${env.E2E_API_URL}/health`))) throw new Error(`API not up at ${env.E2E_API_URL} - run: cd desktop && node scripts/fix-stack.mjs up --slot ${slot}`);
    if (!(await up(env.E2E_BASE_URL))) throw new Error(`web not up at ${env.E2E_BASE_URL}`);
    const { ffmpegPath } = await import('./showcase/ffmpeg.mjs');
    log(`ffmpeg: ${ffmpegPath()}`);
    if (!flag('skip-driver')) {
      const adb = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools/adb') : 'adb';
      const r = spawnSync(adb, ['devices'], { encoding: 'utf8' });
      log(/emulator-5554\s+device/.test(r.stdout ?? '') ? 'emulator-5554 is up' : 'emulator not running - record-driver.ps1 will boot it');
    }
    fs.writeFileSync(path.join(work, 'preflight.json'), JSON.stringify({ at: new Date().toISOString(), slot, ...env }, null, 2));
  },
  seed() { must(seedDemo([]), 'seed'); },
  storyA() {
    if (!exists(path.join(desktop, 'e2e/showcase/story.spec.ts'))) { log('PLACEHOLDER: story.spec.ts (story-A) not written yet - skipping'); return; }
    let attempt = 0;
    withRetakes('story-A', () => {
      if (attempt++ > 0) must(seedDemo([]), 'reseed for the retake');
      must(seedDemo(['--pre-roll']), 'pre-roll');
      must(playwright(['--grep', 'story-A']), 'story-A');
    });
  },
  driver() {
    if (flag('skip-driver')) { log('--skip-driver'); return; }
    // the live trip must exist and be "today" in IST; story-A normally creates it, otherwise seed made one
    let attempt = 0;
    withRetakes('driver', () => {
      if (attempt++ > 0) {
        // the trip is partly advanced: clone a fresh one for Ravi and rewrite the handoff (Part A is not re-recorded)
        const keep = exists(handoffFile) ? JSON.parse(fs.readFileSync(handoffFile, 'utf8')) : {};
        must(seedDemo(['--live-trip']), 'clone the live trip');
        const fresh = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
        fs.writeFileSync(handoffFile, JSON.stringify({ ...keep, ...fresh, tripId: fresh.tripId }, null, 2));
      }
      must(run('pwsh', ['-NoProfile', '-File', path.join(root, 'scripts/record-driver.ps1'), '-Slot', String(slot), '-Out', path.join(work, 'driver.mp4')]), 'record-driver');
    });
  },
  storyB() {
    if (!exists(path.join(desktop, 'e2e/showcase/story.spec.ts'))) { log('PLACEHOLDER: story.spec.ts (story-B) not written yet - skipping'); return; }
    withRetakes('story-B', () => must(playwright(['--grep', 'story-B']), 'story-B'));
  },
  walkthrough() {
    if (!exists(path.join(desktop, 'e2e/showcase/full-walkthrough.spec.ts'))) { log('PLACEHOLDER: full-walkthrough.spec.ts not written yet - skipping'); return; }
    must(seedDemo(['--between-takes']), 'between-takes');
    withRetakes('walkthrough', () => must(playwright(['full-walkthrough']), 'walkthrough'));
  },
  smoke() { must(playwright(['smoke']), 'smoke'); },
  async compose() {
    const c = path.join(root, 'scripts/showcase/compose.mjs');
    const have = (f) => exists(path.join(work, f));
    let did = false;
    if (have('partA.webm') && have('partB.webm') && have('driver.mp4')) {
      must(run(node, ['--no-warnings', c, 'story', '--part-a', path.join(work, 'partA.webm'), '--marks-a', path.join(work, 'marks-partA.json'), '--part-b', path.join(work, 'partB.webm'), '--marks-b', path.join(work, 'marks-partB.json'),
        '--driver', path.join(work, 'driver.mp4'), '--driver-marks', path.join(work, 'driver-marks.json'),
        ...(have('trip-assigned.png') ? ['--frame-a', path.join(work, 'trip-assigned.png')] : []), ...(have('trip-completed.png') ? ['--frame-b', path.join(work, 'trip-completed.png')] : []),
        '--out', path.join(showcase, 'TravelCRM-Demo.mp4'), '--chapters', path.join(showcase, 'story-chapters.txt')]), 'compose story');
      did = true;
    }
    if (have('walkthrough.webm')) {
      must(run(node, ['--no-warnings', c, 'full', '--walkthrough', path.join(work, 'walkthrough.webm'), '--marks', path.join(work, 'marks-walkthrough.json'), '--out', path.join(showcase, 'TravelCRM-Full-Walkthrough.mp4'), '--chapters', path.join(showcase, 'chapters.txt')]), 'compose full');
      did = true;
    }
    if (!did) {
      if (!have('smoke.webm') || !have('driver.mp4')) throw new Error('nothing to compose: need partA/partB/walkthrough takes, or smoke.webm + driver.mp4 for the proof');
      log('no story/walkthrough takes yet -> composing the proof clip from smoke + driver');
      must(run(node, ['--no-warnings', c, 'proof', '--desktop', path.join(work, 'smoke.webm'), '--desktop-marks', path.join(work, 'marks-smoke.json'),
        '--driver', path.join(work, 'driver.mp4'), '--driver-marks', path.join(work, 'driver-marks.json'), '--out', path.join(work, 'proof.mp4')]), 'compose proof');
    }
  },
  finalize() {
    const g = path.join(desktop, 'e2e/showcase/finalize.ts');
    const gate = (name, video, extra) => must(run(node, ['--no-warnings', g, '--name', name, '--video', video, '--frames-dir', path.join(work, 'frames', name), ...extra]), `gate ${name}`);
    const viol = ['partA', 'partB', 'walkthrough', 'smoke'].filter((n) => exists(path.join(work, `violations-${n}.json`))).flatMap((n) => ['--violations', path.join(work, `violations-${n}.json`)]);
    let did = false;
    if (exists(path.join(showcase, 'TravelCRM-Demo.mp4'))) { gate('story', path.join(showcase, 'TravelCRM-Demo.mp4'), ['--duration', '480-720', '--min-chapter', '10', ...['partA', 'partB'].filter((n) => exists(path.join(work, `marks-${n}.json`))).flatMap((n) => ['--marks', path.join(work, `marks-${n}.json`)]), ...viol]); did = true; }
    if (exists(path.join(showcase, 'TravelCRM-Full-Walkthrough.mp4'))) { gate('full', path.join(showcase, 'TravelCRM-Full-Walkthrough.mp4'), ['--duration', '1200-1800', '--min-chapter', '10', ...viol]); did = true; }
    if (!did && exists(path.join(work, 'proof.mp4'))) { gate('proof', path.join(work, 'proof.mp4'), ['--duration', '20-120', ...viol]); did = true; }
    if (exists(path.join(work, 'driver.mp4'))) gate('driver', path.join(work, 'driver.mp4'), ['--duration', '60-170']);
    if (!did) throw new Error('no composed video to gate');
  },
};

const order = only ? [only] : STAGES.slice(STAGES.indexOf(from)).filter((x) => !DEFAULT_SKIP.includes(x));
try {
  for (const s of order) {
    log(`stage: ${s}`);
    await stage[s]();
  }
  log('all stages done');
} catch (e) {
  console.error(`\n[record-demo] STOPPED at a stage: ${e.message}\nResume with: node scripts/record-demo.mjs --slot ${slot} --from <stage>`);
  process.exit(1);
}
