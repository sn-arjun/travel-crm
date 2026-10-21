export type Zoom = { x: number; y: number; scale: number; start: number; end: number }; // x,y = 0..1 of the source frame; start/end = seconds into the scene
export type CalloutSpec = { x: number; y: number; label: string; at: number; r?: number; side?: "right" | "left" | "below" }; // x,y = 0..1 of the source frame; at = seconds into the scene
export type LowerThirdSpec = { feature: string; role: string; plan: string };
export type CaptionChunk = { from: number; to: number; text: string }; // seconds on the clip timeline
export type FlowStep = { label: string; sub?: string };
export type PlanRowSpec = { label: string; plans: [boolean, boolean, boolean] };
export type SceneBase = { start: number; dur: number; audio?: string; audioDur?: number; audioAt?: number };
export type Scene =
  | (SceneBase & { type: 'logo' })
  | (SceneBase & { type: 'title'; title: string; subtitle: string; kicker?: string })
  | (SceneBase & { type: 'screen'; src: string; in: number; out: number; cropBottom: number; lowerThird?: LowerThirdSpec; zoom?: Zoom; callout?: CalloutSpec })
  | (SceneBase & { type: 'flow'; steps: FlowStep[]; heading?: string })
  | (SceneBase & { type: 'plans'; heading?: string; rows: PlanRowSpec[] })
  | (SceneBase & { type: 'end'; headline: string; cta: string; url?: string })
  | (SceneBase & { type: 'phone'; src: string; in: number; out: number; srcW?: number; srcH?: number; heading?: string; sub?: string; lowerThird?: LowerThirdSpec });
export type Timeline = { fps: number; width: number; height: number; totalFrames: number; scenes: Scene[]; captions: CaptionChunk[] };
