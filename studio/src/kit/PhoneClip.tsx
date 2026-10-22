import React from 'react';
import { Freeze, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT_BODY, FONT_DISPLAY, softGradient } from './theme';
import { lerp, useSpring } from './anim';
import { LowerThird } from './LowerThird';
import { SpeedBadge } from './SpeedBadge';
import type { LowerThirdSpec } from './types';

/**
 * A portrait recording (the driver app on the Android emulator) inside a phone frame, with a heading and a short line
 * beside it. Same timing rule as ScreenClip: never faster than the source, at most 0.8x slower, then hold the last frame.
 */
export const PhoneClip: React.FC<{ src: string; in: number; out: number; srcW?: number; srcH?: number; heading?: string; sub?: string; lowerThird?: LowerThirdSpec; speed?: number; speedLabel?: string | false }> = ({ src, in: tin, out, srcW = 1080, srcH = 2400, heading, sub, lowerThird, speed = 1, speedLabel }) => {
  const frame = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig();
  const segLen = out - tin, sceneLen = durationInFrames / fps;
  const shown = segLen / speed;
  const rate = speed * (sceneLen > shown ? Math.max(0.8, shown / sceneLen) : 1);
  const playFrames = Math.max(1, Math.floor((segLen / rate) * fps));
  const screenH = 840, screenW = Math.round((screenH * srcW) / srcH), bezel = 22;
  const fade = Math.min(1, frame / 8, (durationInFrames - frame) / 8);
  const h = useSpring(0.25); const s = useSpring(0.55);
  const x0 = 360;
  return (
    <div style={{ position: 'absolute', inset: 0, background: softGradient, opacity: Math.max(0, fade) }}>
      {speed > 1 && <SpeedBadge speed={speed} label={speedLabel} style={{ right: 'auto', left: x0 + screenW + bezel * 2 + 120, top: 250 }} />}
      {lowerThird && <LowerThird {...lowerThird} style={{ position: 'absolute', left: 180, top: 24 }} />}
      <div style={{ position: 'absolute', left: x0, top: 130, width: screenW + bezel * 2, height: screenH + bezel * 2, borderRadius: 64, background: '#111117', boxShadow: '0 40px 90px rgba(55,48,163,.35), 0 0 0 3px #2A2A35' }}>
        <div style={{ position: 'absolute', left: bezel, top: bezel, width: screenW, height: screenH, borderRadius: 44, overflow: 'hidden', background: '#000' }}>
          <Freeze frame={Math.min(frame, playFrames - 1)}>
            <OffthreadVideo src={staticFile(src)} startFrom={Math.round(tin * fps)} endAt={Math.round(out * fps)} playbackRate={rate} muted style={{ width: screenW, height: screenH }} />
          </Freeze>
        </div>
      </div>
      {(heading || sub) && (
        <div style={{ position: 'absolute', left: x0 + screenW + bezel * 2 + 120, top: 360, width: 1920 - (x0 + screenW + bezel * 2 + 120) - 160 }}>
          {heading && <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 76, lineHeight: 1.08, color: C.fg, letterSpacing: -1.5, opacity: h, transform: `translateY(${lerp(30, 0, h)}px)` }}>{heading}</div>}
          {sub && <div style={{ marginTop: 28, fontFamily: FONT_BODY, fontSize: 40, lineHeight: 1.35, color: C.fgMuted, opacity: s, transform: `translateY(${lerp(16, 0, s)}px)` }}>{sub}</div>}
        </div>
      )}
    </div>
  );
};
