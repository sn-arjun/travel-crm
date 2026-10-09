import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT_BODY, FONT_DISPLAY, R, softGradient } from './theme';
import { useSpring, lerp } from './anim';
import type { FlowStep } from './types';

const Box: React.FC<{ step: FlowStep; i: number; x: number; w: number; last: boolean; gap: number }> = ({ step, i, x, w, last, gap }) => {
  const d = 0.4 + i * 0.7; const s = useSpring(d, { damping: 16, stiffness: 120 }); const a = useSpring(d + 0.45);
  const len = gap - 20;
  return (
    <>
      <div style={{ position: 'absolute', left: x, top: 400, width: w, height: 250, borderRadius: R.x2, background: last ? C.primary : C.surface, color: last ? '#fff' : C.fg, border: `3px solid ${last ? C.primaryActive : C.border}`, boxShadow: '0 24px 60px rgba(55,48,163,.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 20, opacity: Math.min(1, s), transform: `translateY(${lerp(40, 0, s)}px) scale(${lerp(0.85, 1, s)})` }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: last ? 'rgba(255,255,255,.22)' : C.primarySubtle, color: last ? '#fff' : C.primaryOnSubtle, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 40, lineHeight: 1.1 }}>{step.label}</div>
        {step.sub && <div style={{ fontFamily: FONT_BODY, fontSize: 28, color: last ? '#E0E3FF' : C.fgMuted }}>{step.sub}</div>}
      </div>
      {!last && (
        <svg style={{ position: 'absolute', left: x + w + 10, top: 505, width: len, height: 40, overflow: 'visible' }}>
          <line x1={0} y1={20} x2={len * a} y2={20} stroke={C.primary} strokeWidth={6} strokeLinecap="round" />
          <polygon points={`${len * a - 4},6 ${len * a + 18},20 ${len * a - 4},34`} fill={C.primary} opacity={a > 0.9 ? 1 : 0} />
        </svg>
      )}
    </>
  );
};
/** Boxes and arrows that draw in left to right, e.g. message arrives, assistant reads it, suggestion, one click. */
export const FlowDiagram: React.FC<{ steps: FlowStep[]; heading?: string }> = ({ steps, heading }) => {
  const h = useSpring(0.05); const n = steps.length; const boxW = 340, gap = 112;
  const totalW = n * boxW + (n - 1) * gap; const x0 = (1920 - totalW) / 2;
  return (
    <AbsoluteFill style={{ background: softGradient }}>
      {heading && <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center', fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 72, color: C.fg, opacity: h }}>{heading}</div>}
      {steps.map((s, i) => <Box key={i} step={s} i={i} x={x0 + i * (boxW + gap)} w={boxW} last={i === n - 1} gap={gap} />)}
    </AbsoluteFill>
  );
};
