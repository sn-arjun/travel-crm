import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT_BODY, R } from './theme';

/** Small pill at the top right of the window that tells the viewer the footage is sped up. Fades in over 8 frames. */
export const SpeedBadge: React.FC<{ speed: number; label?: string | false; style?: React.CSSProperties }> = ({ speed, label, style }) => {
  const frame = useCurrentFrame();
  if (label === false || speed <= 1) return null;
  const text = (label ?? 'Sped up {speed}x').replace('{speed}', String(speed));
  return (
    <div style={{ position: 'absolute', right: 24, top: 20, padding: '8px 18px', borderRadius: R.full, background: C.darkBg, color: C.darkFg, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 24, letterSpacing: 0.2, boxShadow: '0 6px 18px rgba(17,17,23,.35)', opacity: Math.min(1, frame / 8), ...style }}>
      {text}
    </div>
  );
};
