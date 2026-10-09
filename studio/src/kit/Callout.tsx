import React from 'react';
import { C, FONT_BODY, R } from './theme';
import { useSpring, lerp, useSec } from './anim';

/** Spotlight ring + label at a point (px inside its positioned parent). Appears at `at` seconds, pulses gently. */
export const Callout: React.FC<{ x: number; y: number; label: string; at?: number; r?: number; labelSide?: 'right' | 'left' | 'below' }> = ({ x, y, label, at = 0, r = 54, labelSide = 'right' }) => {
  const s = useSpring(at, { damping: 14, stiffness: 120 }); const t = useSec();
  const pulse = 1 + 0.06 * Math.sin((t - at) * 5);
  const lab: React.CSSProperties = labelSide === 'right' ? { left: x + r + 18, top: y - 30 } : labelSide === 'left' ? { left: x - r - 18, top: y - 30, transform: 'translateX(-100%)' } : { left: x, top: y + r + 16, transform: 'translateX(-50%)' };
  return (
    <>
      <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `6px solid ${C.primary}`, boxShadow: `0 0 0 9999px rgba(17,17,23,${0.22 * Math.min(1, s)}), 0 0 36px rgba(79,70,229,.7)`, opacity: Math.min(1, s), transform: `scale(${lerp(1.8, 1, s) * pulse})`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', ...lab, background: C.primary, color: '#fff', fontFamily: FONT_BODY, fontWeight: 600, fontSize: 34, padding: '12px 26px', borderRadius: R.lg, whiteSpace: 'nowrap', opacity: Math.min(1, s), boxShadow: '0 10px 30px rgba(79,70,229,.45)' }}>{label}</div>
    </>
  );
};
