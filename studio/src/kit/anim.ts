import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); // easeOutCubic
export const SPRING = { damping: 200 }; // smooth, no overshoot: consistent across the kit
export const SPRING_POP = { damping: 14, stiffness: 140 }; // slight overshoot for badges and rings
export function useSpring(delaySec = 0, config: Record<string, number> = SPRING) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return spring({ frame: frame - Math.round(delaySec * fps), fps, config });
}
export function useSec() { const frame = useCurrentFrame(); const { fps } = useVideoConfig(); return frame / fps; }
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
