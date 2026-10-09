import React from 'react';
import { C, FONT_BODY, FONT_DISPLAY, R } from './theme';
import { useSpring, lerp } from './anim';
import type { LowerThirdSpec } from './types';

const Badge: React.FC<{ children: React.ReactNode; bg: string; fg: string; delay: number }> = ({ children, bg, fg, delay }) => {
  const s = useSpring(delay, { damping: 14, stiffness: 140 });
  return <span style={{ background: bg, color: fg, borderRadius: R.full, padding: '8px 22px', fontFamily: FONT_BODY, fontWeight: 600, fontSize: 28, transform: `scale(${lerp(0.6, 1, s)})`, opacity: Math.min(1, s), display: 'inline-block' }}>{children}</span>;
};
/** Feature name plus a role badge and a plan badge. */
export const LowerThird: React.FC<LowerThirdSpec & { style?: React.CSSProperties }> = ({ feature, role, plan, style }) => {
  const s = useSpring(0.2);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: s, transform: `translateX(${lerp(-60, 0, s)}px)`, ...style }}>
      <div style={{ width: 8, height: 54, borderRadius: 4, background: C.primary }} />
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 46, color: C.fg, letterSpacing: -0.5 }}>{feature}</div>
      <Badge bg={C.primarySubtle} fg={C.primaryOnSubtle} delay={0.5}>{role}</Badge>
      <Badge bg={C.successSubtle} fg={C.successOnSubtle} delay={0.65}>{plan}</Badge>
    </div>
  );
};
