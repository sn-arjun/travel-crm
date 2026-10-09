import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT_DISPLAY, FONT_BODY, softGradient } from './theme';
import { useSpring, lerp } from './anim';

const Word: React.FC<{ w: string; delay: number }> = ({ w, delay }) => {
  const s = useSpring(delay);
  return <span style={{ display: 'inline-block', opacity: s, transform: `translateY(${lerp(50, 0, s)}px)` }}>{w}</span>;
};
/** Kinetic chapter title: words rise in one after another, then the subtitle. */
export const TitleCard: React.FC<{ title: string; subtitle?: string; kicker?: string }> = ({ title, subtitle, kicker }) => {
  const words = title.split(' ');
  const k = useSpring(0.05); const sub = useSpring(0.15 + words.length * 0.12 + 0.2);
  return (
    <AbsoluteFill style={{ background: softGradient, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '0 160px', textAlign: 'center' }}>
      {kicker && <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 36, letterSpacing: 6, textTransform: 'uppercase', color: C.primary, opacity: k, transform: `translateY(${lerp(14, 0, k)}px)`, marginBottom: 28 }}>{kicker}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 30px', fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 124, lineHeight: 1.08, color: C.fg, letterSpacing: -3 }}>
        {words.map((w, i) => <Word key={i} w={w} delay={0.15 + i * 0.12} />)}
      </div>
      {subtitle && <div style={{ marginTop: 40, fontFamily: FONT_BODY, fontSize: 48, color: C.fgMuted, opacity: sub, transform: `translateY(${lerp(16, 0, sub)}px)` }}>{subtitle}</div>}
    </AbsoluteFill>
  );
};
