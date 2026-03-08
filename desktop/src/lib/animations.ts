/**
 * TravelCRM Pro — Animation Utilities
 * Smooth, delightful micro-interactions throughout the app.
 */

/** Shared transition presets for framer-motion-like className usage */
export const transitions = {
  fast: 'duration-100 ease-out',
  base: 'duration-150 ease-in-out',
  smooth: 'duration-200 ease-in-out',
  slow: 'duration-300 ease-in-out',
  spring: 'duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
  bounce: 'duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
} as const;

/** CSS keyframe animation class names (defined in globals.css) */
export const animations = {
  fadeIn: 'animate-fade-in',
  fadeOut: 'animate-fade-out',
  slideInFromTop: 'animate-slide-in-from-top',
  slideInFromBottom: 'animate-slide-in-from-bottom',
  slideInFromLeft: 'animate-slide-in-from-left',
  slideInFromRight: 'animate-slide-in-from-right',
  scaleIn: 'animate-scale-in',
  scaleOut: 'animate-scale-out',
  shimmer: 'animate-shimmer',
  pulse: 'animate-pulse',
  spin: 'animate-spin',
  wiggle: 'animate-wiggle',
  slideUp: 'animate-slide-up',
  popIn: 'animate-pop-in',
  float: 'animate-float',
} as const;

/** Stagger delay helper for list animations */
export function staggerDelay(index: number, baseMs = 50): string {
  return `${index * baseMs}ms`;
}

/** Get stagger style for list items */
export function getStaggerStyle(index: number, baseMs = 50) {
  return {
    animationDelay: staggerDelay(index, baseMs),
    animationFillMode: 'both' as const,
  };
}
