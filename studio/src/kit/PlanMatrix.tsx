import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT_BODY, FONT_DISPLAY, R, softGradient } from './theme';
import { useSpring, lerp } from './anim';
import type { PlanRowSpec } from './types';

const PLANS = ['Basic', 'Pro', 'Enterprise'];
const Row: React.FC<{ row: PlanRowSpec; delay: number; highlight: number }> = ({ row, delay, highlight }) => {
  const s = useSpring(delay); const tick = useSpring(delay + 0.2, { damping: 12, stiffness: 160 });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px 240px 240px', borderTop: `1px solid ${C.border}`, opacity: s, transform: `translateY(${lerp(14, 0, s)}px)`, fontFamily: FONT_BODY, fontSize: 36, color: C.fg }}>
      <div style={{ padding: '18px 26px' }}>{row.label}</div>
      {row.plans.map((on, i) => <div key={i} style={{ padding: 18, textAlign: 'center', fontSize: 44, fontWeight: 700, background: i === highlight ? C.primarySubtle : undefined, color: on ? C.success : C.borderStrong, transform: `scale(${on ? lerp(0.3, 1, tick) : 1})` }}>{on ? '✓' : '–'}</div>)}
    </div>
  );
};
/** Animated three-column plan comparison: rows tick in one by one. Rows are data supplied by the clip. */
export const PlanMatrix: React.FC<{ heading?: string; rows: PlanRowSpec[]; highlight?: number }> = ({ heading = 'What each plan includes', rows, highlight = 1 }) => {
  const h = useSpring(0.05);
  return (
    <AbsoluteFill style={{ background: softGradient, alignItems: 'center', paddingTop: 70 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 76, color: C.fg, opacity: h, transform: `translateY(${lerp(20, 0, h)}px)` }}>{heading}</div>
      <div style={{ marginTop: 40, width: 1500, background: C.surface, borderRadius: R.x2, border: `2px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 30px 80px rgba(55,48,163,.18)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px 240px 240px', background: C.sunken, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 38, color: C.fg }}>
          <div style={{ padding: 22 }} />{PLANS.map((p, i) => <div key={p} style={{ padding: 22, textAlign: 'center', color: i === highlight ? C.primary : C.fg }}>{p}</div>)}
        </div>
        {rows.map((r, i) => <Row key={r.label} row={r} delay={0.5 + i * 0.35} highlight={highlight} />)}
      </div>
    </AbsoluteFill>
  );
};
