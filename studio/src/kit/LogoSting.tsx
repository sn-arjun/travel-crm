import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT_DISPLAY, FONT_BODY, darkGradient } from './theme';
import { useSpring, lerp } from './anim';

/** 2-3 s animated product-name intro. */
export const LogoSting: React.FC<{ name?: string; tagline?: string }> = ({ name = 'TravelCRM', tagline = 'for tours & travel agencies' }) => {
  const mark = useSpring(0.1); const word = useSpring(0.5); const pro = useSpring(0.9); const tag = useSpring(1.3);
  return (
    <AbsoluteFill style={{ background: darkGradient, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <div style={{ width: 150, height: 150, borderRadius: 38, background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 98, transform: `scale(${lerp(0.4, 1, mark)}) rotate(${lerp(-18, 0, mark)}deg)`, opacity: mark, boxShadow: '0 20px 60px rgba(79,70,229,.55)' }}>T</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 132, color: C.darkFg, letterSpacing: -3, opacity: word, transform: `translateX(${lerp(-40, 0, word)}px)`, display: 'flex', alignItems: 'baseline', gap: 18 }}>
          {name}
          <span style={{ fontSize: 60, fontWeight: 700, color: C.darkPrimary, opacity: pro, transform: `translateY(${lerp(20, 0, pro)}px)` }}>Pro</span>
        </div>
      </div>
      <div style={{ marginTop: 34, fontFamily: FONT_BODY, fontSize: 44, color: C.darkMuted, opacity: tag, transform: `translateY(${lerp(16, 0, tag)}px)` }}>{tagline}</div>
    </AbsoluteFill>
  );
};
