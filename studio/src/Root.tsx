import React from 'react';
import { Composition } from 'remotion';
import { Clip, type ClipProps } from './Clip';
import type { Timeline } from './kit/types';

const empty: Timeline = { fps: 30, width: 1920, height: 1080, totalFrames: 30, scenes: [], captions: [] };
export const Root: React.FC = () => (
  <Composition
    id="Clip"
    component={Clip as React.FC<any>}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={30}
    defaultProps={{ timeline: empty } satisfies ClipProps}
    calculateMetadata={({ props }: { props: ClipProps }) => ({ durationInFrames: Math.max(1, props.timeline.totalFrames), fps: props.timeline.fps, width: props.timeline.width, height: props.timeline.height })}
  />
);
