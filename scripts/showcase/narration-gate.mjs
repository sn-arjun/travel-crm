/**
 * The speed-aware length of a film's narration, used by record-films.mjs for the raw-take length gate.
 * Each narration line is "n<scene index>"; a line counts (duration + 0.65 s) x the speed of its scene (sped-up screen
 * and phone scenes take longer to record). A film recorded in parts (film.clip set) counts only the scenes whose
 * recording is that part.
 * Self-check: node scripts/showcase/narration-gate.mjs --self-check
 */
import { fileURLToPath } from 'node:url';

export const sceneIndexOf = (lineId) => Number(/^n(\d+)$/.exec(String(lineId))?.[1]);

export function narrationSeconds(film, clip, lines) {
  const sceneOf = (line) => clip.scenes[sceneIndexOf(line.id)];
  const mine = (s) => !film.clip || (s && (s.recording ?? clip.recording) === film.id);
  const speedOf = (s) => (s && (s.type === 'screen' || s.type === 'phone') ? s.speed ?? 1 : 1);
  return lines.reduce((n, l) => { const s = sceneOf(l); return mine(s) ? n + (l.duration + 0.65) * speedOf(s) : n; }, 0);
}

function selfCheck() {
  const assert = (c, m) => { if (!c) { console.error(`self-check failed: ${m}`); process.exit(1); } };
  assert(sceneIndexOf('n12') === 12 && Number.isNaN(sceneIndexOf('nx')), 'line ids parse with \\d+');
  const clip = {
    recording: 'part-a',
    scenes: [{ type: 'screen' }, { type: 'screen', speed: 2 }, { type: 'card', recording: 'part-b' }, { type: 'phone', recording: 'part-b', speed: 3 }],
  };
  const lines = [0, 1, 2, 3].map((i) => ({ id: `n${i}`, duration: 1 }));
  const a = narrationSeconds({ id: 'part-a', clip: 'x' }, clip, lines);
  const b = narrationSeconds({ id: 'part-b', clip: 'x' }, clip, lines);
  assert(Math.abs(a - 1.65 * 3) < 1e-9, `part-a counts its two scenes with speed (got ${a})`);
  assert(Math.abs(b - (1.65 + 1.65 * 3)) < 1e-9, `part-b counts only its own scenes (got ${b})`);
  assert(Math.abs(narrationSeconds({ id: 'whole' }, clip, lines) - 1.65 * (1 + 2 + 1 + 3)) < 1e-9, 'a whole film counts every scene');
  console.log('narration-gate self-check ok');
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--self-check')) selfCheck();
