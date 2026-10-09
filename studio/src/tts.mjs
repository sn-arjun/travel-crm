// Local text-to-speech with Kokoro-82M (kokoro-js, ONNX, CPU). Model cached in studio/models/.
// Usage: node src/tts.mjs <script.json> <clipName> [defaultVoice]
// Script JSON: [{ "id": "s1", "text": "...", "voice": "bf_emma" }]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ff, probeDuration } from './ff.mjs';

export const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_VOICE = 'bf_emma';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DTYPE = 'q8';

let engine = null;
async function getEngine() {
  if (engine) return engine;
  const { env } = await import('@huggingface/transformers');
  env.cacheDir = path.join(studioRoot, 'models');
  const { KokoroTTS } = await import('kokoro-js');
  engine = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' });
  return engine;
}

function writeWav(file, samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

/** Synthesise one line to a loudness-normalised 24 kHz mono WAV. Returns duration in seconds. */
export async function synth(text, voice, outFile) {
  const tts = await getEngine();
  const audio = await tts.generate(text, { voice });
  const raw = outFile + '.raw.wav';
  writeWav(raw, audio.audio, audio.sampling_rate);
  // EBU R128 loudness to -16 LUFS, true peak -1.5 dB, back to 24 kHz mono pcm16.
  ff(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', outFile]);
  fs.rmSync(raw, { force: true });
  return probeDuration(outFile);
}

const hash = (t, v) => crypto.createHash('sha256').update(`${MODEL}|${DTYPE}|trim1|${v}|${t}`).digest('hex').slice(0, 16);

/** Generate narration for a clip; unchanged lines (same text+voice+model) are reused. */
export async function buildNarration(clip, lines, defaultVoice = DEFAULT_VOICE) {
  const dir = path.join(studioRoot, 'out', 'narration', clip);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'narration.json');
  const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { lines: [] };
  const prevById = new Map(prev.lines.map((l) => [l.id, l]));
  const out = [];
  for (const l of lines) {
    const voice = l.voice || defaultVoice;
    const h = hash(l.text, voice);
    const file = path.join(dir, `${l.id}.wav`);
    const old = prevById.get(l.id);
    let duration;
    if (old && old.hash === h && fs.existsSync(file)) { duration = old.duration; console.log(`[tts] ${l.id}: cached`); }
    else { const t0 = Date.now(); duration = await synth(l.text, voice, file); console.log(`[tts] ${l.id}: ${duration.toFixed(2)}s audio in ${((Date.now() - t0) / 1000).toFixed(1)}s`); }
    out.push({ id: l.id, file: `${l.id}.wav`, duration: +duration.toFixed(3), text: l.text, voice, hash: h });
  }
  const manifest = { clip, engine: 'kokoro-js', model: MODEL, dtype: DTYPE, lines: out };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [script, clip, voice] = process.argv.slice(2);
  if (!script || !clip) { console.error('usage: node src/tts.mjs <script.json> <clipName> [voice]'); process.exit(1); }
  const { manifest } = await buildNarration(clip, JSON.parse(fs.readFileSync(script, 'utf8')), voice);
  console.log(`wrote ${manifest.lines.length} lines`);
}
