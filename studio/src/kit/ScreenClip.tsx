import React from 'react';
import { Freeze, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, softGradient, R } from './theme';
import { ease, lerp } from './anim';
import { Callout } from './Callout';
import { LowerThird } from './LowerThird';
import type { CalloutSpec, LowerThirdSpec, Zoom } from './types';

export const WIN_W = 1560; // window width; height follows the source aspect minus the cropped bottom strip
/**
 * Plays [in,out] of a source recording inside a rounded window on a soft gradient.
 * If the scene is longer than the segment the video slows (never below 0.8x) then holds the last frame.
 * cropBottom trims the source's burned-in caption strip (fraction of height).
 */
export const ScreenClip: React.FC<{ src: string; in: number; out: number; cropBottom?: number; zoom?: Zoom; callout?: CalloutSpec; lowerThird?: LowerThirdSpec; srcW?: number; srcH?: number }> = ({ src, in: tin, out, cropBottom = 0.14, zoom, callout, lowerThird, srcW = 1920, srcH = 1080 }) => {
  const frame = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig(); const t = frame / fps;
  const vw = WIN_W, vh = (WIN_W * srcH) / srcW, wh = Math.round(vh * (1 - cropBottom));
  const segLen = out - tin, sceneLen = durationInFrames / fps;
  const rate = sceneLen > segLen ? Math.max(0.8, segLen / sceneLen) : 1; // slow slightly, never speed up
  const playFrames = Math.max(1, Math.floor((segLen / rate) * fps));
  let z = 1, ox = 0.5, oy = 0.5;
  if (zoom) { const p = ease((t - zoom.start) / Math.max(0.01, zoom.end - zoom.start)); z = lerp(1, zoom.scale, p); ox = zoom.x; oy = zoom.y; }
  const x0 = (1920 - WIN_W) / 2, y0 = 118;
  const fade = Math.min(1, frame / 8, (durationInFrames - frame) / 8);
  return (
    <div style={{ position: 'absolute', inset: 0, background: softGradient, opacity: Math.max(0, fade) }}>
      {lowerThird && <LowerThird {...lowerThird} style={{ position: 'absolute', left: x0, top: 24 }} />}
      <div style={{ position: 'absolute', left: x0, top: y0, width: WIN_W, height: wh, borderRadius: R.x2 + 4, overflow: 'hidden', background: C.surface, boxShadow: '0 40px 90px rgba(55,48,163,.28), 0 0 0 2px rgba(79,70,229,.14)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: vw, height: vh, transformOrigin: `${ox * 100}% ${oy * 100}%`, transform: `scale(${z})` }}>
          <Freeze frame={Math.min(frame, playFrames - 1)}>
            <OffthreadVideo src={staticFile(src)} startFrom={Math.round(tin * fps)} endAt={Math.round(out * fps)} playbackRate={rate} muted style={{ width: vw, height: vh }} />
          </Freeze>
          {callout && <Callout x={callout.x * vw} y={callout.y * vh} label={callout.label} at={callout.at} r={callout.r ?? 54} labelSide={callout.side} />}
        </div>
      </div>
    </div>
  );
};
