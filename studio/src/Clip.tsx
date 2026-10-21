import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/geist';
import { Captions, EndCard, FlowDiagram, LogoSting, PhoneClip, PlanMatrix, ScreenClip, TitleCard } from './kit';
import type { Scene, Timeline } from './kit/types';

export type ClipProps = { timeline: Timeline; /** OPTIONAL background music file under public/ (UNUSED by default). */ music?: string; musicVolume?: number };

const SceneBody: React.FC<{ s: Scene }> = ({ s }) => {
  switch (s.type) {
    case 'logo': return <LogoSting />;
    case 'title': return <TitleCard title={s.title} subtitle={s.subtitle} kicker={s.kicker} />;
    case 'screen': return <ScreenClip src={s.src} in={s.in} out={s.out} cropBottom={s.cropBottom} zoom={s.zoom} callout={s.callout} lowerThird={s.lowerThird} />;
    case 'flow': return <FlowDiagram steps={s.steps} heading={s.heading} />;
    case 'plans': return <PlanMatrix rows={s.rows} heading={s.heading} />;
    case 'end': return <EndCard headline={s.headline} cta={s.cta} url={s.url} />;
    case 'phone': return <PhoneClip src={s.src} in={s.in} out={s.out} srcW={s.srcW} srcH={s.srcH} heading={s.heading} sub={s.sub} lowerThird={s.lowerThird} />;
  }
};

export const Clip: React.FC<ClipProps> = ({ timeline, music, musicVolume = 0.08 }) => {
  const fps = timeline.fps;
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {timeline.scenes.map((s, i) => (
        <Sequence key={i} from={Math.round(s.start * fps)} durationInFrames={Math.round(s.dur * fps)}>
          <SceneBody s={s} />
        </Sequence>
      ))}
      {timeline.scenes.map((s, i) => s.audio ? (
        <Sequence key={'a' + i} from={Math.round((s.start + (s.audioAt ?? 0.15)) * fps)} durationInFrames={Math.ceil((s.audioDur ?? s.dur) * fps) + 2}>
          <Audio src={staticFile(s.audio)} />
        </Sequence>) : null)}
      {music ? <Audio src={staticFile(music)} volume={musicVolume} loop /> : null}
      <Captions chunks={timeline.captions} />
    </AbsoluteFill>
  );
};
