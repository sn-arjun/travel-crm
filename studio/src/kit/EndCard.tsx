import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT_BODY, FONT_DISPLAY, R, darkGradient } from './theme';
import { useSpring, lerp } from './anim';

/** Closing call to action. */
export const EndCard: React.FC<{ headline: string; cta: string; url?: string }> = ({ headline, cta, url }) => {
  const a = useSpring(0.1); const b = useSpring(0.6); const c = useSpring(1.1, { damping: 14, stiffness: 130 });
  return (
    <AbsoluteFill style={{ background: darkGradient, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', padding: '0 180px' }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 104, lineHeight: 1.1, color: C.darkFg, letterSpacing: -2.5, opacity: a, transform: `translateY(${lerp(40, 0, a)}px)` }}>{headline}</div>
      <div style={{ marginTop: 56, background: C.primary, color: '#fff', fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 56, padding: '26px 64px', borderRadius: R.x2, opacity: b, transform: `scale(${lerp(0.8, 1, c)})`, boxShadow: '0 20px 60px rgba(79,70,229,.55)' }}>{cta}</div>
      {url && <div style={{ marginTop: 40, fontFamily: FONT_BODY, fontSize: 40, color: C.darkMuted, opacity: b }}>{url}</div>}
      <div style={{ marginTop: 70, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 38, color: C.darkPrimary, opacity: b }}>TravelCRM Pro</div>
    </AbsoluteFill>
  );
};
