// Node copy of chunkCaptions() from src/kit/Captions.tsx (keep the two in step).
export function chunkCaptionsNode(text, start, dur, maxWords = 9) {
  const words = text.trim().split(/\s+/); const parts = []; let cur = [];
  for (const w of words) { cur.push(w); if ((/[.,;:!?]$/.test(w) && cur.length >= 3) || cur.length >= maxWords) { parts.push(cur); cur = []; } }
  if (cur.length) { if (cur.length < 3 && parts.length) parts[parts.length - 1].push(...cur); else parts.push(cur); }
  const total = parts.reduce((n, p) => n + p.join(' ').length, 0); let t = start; const out = [];
  for (const p of parts) { const d = (p.join(' ').length / total) * dur; out.push({ from: +t.toFixed(3), to: +(t + d).toFixed(3), text: p.join(' ') }); t += d; }
  return out;
}
