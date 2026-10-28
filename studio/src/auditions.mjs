// Same sentence in three voices -> out/auditions/<voice>.wav (first 15 s at most; the sentence is ~9 s).
import fs from 'node:fs';
import path from 'node:path';
import { synth, studioRoot } from './tts.mjs';
const TEXT = 'TravelCRM Pro reads every enquiry, drafts the reply, and lines up the next step, so your team spends its time selling trips, not chasing messages.';
const VOICES = [['1-bf_emma-british-female', 'bf_emma'], ['2-bm_george-british-male', 'bm_george'], ['3-af_heart-american-female', 'af_heart']];
const dir = path.join(studioRoot, 'out', 'auditions');
fs.mkdirSync(dir, { recursive: true });
for (const [name, voice] of VOICES) {
  const t0 = Date.now();
  const d = await synth(TEXT, voice, path.join(dir, `${name}.wav`));
  console.log(`${name}: ${d.toFixed(1)}s (${((Date.now() - t0) / 1000).toFixed(1)}s to generate)`);
}
