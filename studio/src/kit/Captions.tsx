import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_BODY, R } from './theme';
import type { CaptionChunk } from './types';

/** Subtitles. chunks come from narration.json (split and timed by build.mjs). */
export const Captions: React.FC<{ chunks: CaptionChunk[]; bottom?: number }> = ({ chunks, bottom = 26 }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig(); const t = frame / fps;
  const c = chunks.find((k) => t >= k.from && t < k.to);
  if (!c) return null;
  const a = Math.min(1, (t - c.from) / 0.12, (c.to - t) / 0.12);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', opacity: Math.max(0, a) }}>
      <div style={{ background: 'rgba(17,17,23,.88)', color: '#fff', fontFamily: FONT_BODY, fontWeight: 500, fontSize: 44, padding: '10px 34px', borderRadius: R.xl, maxWidth: 1700, textAlign: 'center' }}>{c.text}</div>
    </div>
  );
};

/** Split narration text into short caption chunks timed proportionally to character count within [start, start+dur]. */
export function chunkCaptions(text: string, start: number, dur: number, maxWords = 9): CaptionChunk[] {
  const words = text.trim().split(/\s+/); const parts: string[][] = []; let cur: string[] = [];
  for (const w of words) { cur.push(w); if ((/[.,;:!?]$/.test(w) && cur.length >= 3) || cur.length >= maxWords) { parts.push(cur); cur = []; } }
  if (cur.length) { if (cur.length < 3 && parts.length) parts[parts.length - 1].push(...cur); else parts.push(cur); }
  const total = parts.reduce((n, p) => n + p.join(' ').length, 0); let t = start; const out: CaptionChunk[] = [];
  for (const p of parts) { const d = (p.join(' ').length / total) * dur; out.push({ from: +t.toFixed(3), to: +(t + d).toFixed(3), text: p.join(' ') }); t += d; }
  return out;
}
