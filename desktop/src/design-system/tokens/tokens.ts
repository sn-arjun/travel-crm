/**
 * TravelCRM Pro Design System — Typed TS Token Mirror
 *
 * For consumers that cannot use Tailwind classes: Recharts, jsPDF, canvas.
 * Everything here mirrors what `globals.css` emits as CSS custom properties.
 *
 * In React, prefer `useThemeTokens()` from '@/design-system/tokens/use-theme-tokens'
 * so values track the active theme. Use these raw maps only outside React.
 */

import { chartColors, resolveTheme, semanticColors } from './semantic';
import { borderRadius, shadows, spacing, transitions, zIndex } from './spacing';
import { fontFamily, fontSize, fontWeight } from './typography';

export type ThemeName = 'light' | 'dark';

/** Fully resolved color maps, one per theme. */
export const themeColors: Record<ThemeName, Record<string, string>> = {
  light: resolveTheme('light'),
  dark: resolveTheme('dark'),
};

/** Ordered chart series colors for a theme — series N uses index N % length. */
export function chartSeries(theme: ThemeName): string[] {
  return (Object.keys(chartColors) as Array<keyof typeof chartColors>).map(
    (k) => chartColors[k][theme],
  );
}

/** Look up one semantic color for a theme. */
export function color(token: keyof typeof semanticColors, theme: ThemeName): string {
  return semanticColors[token][theme];
}

// ─── Motion ────────────────────────────────────────────────
export const duration = {
  instant: '50ms',
  fast: '100ms',
  base: '150ms',
  slow: '200ms',
  slower: '300ms',
  slowest: '500ms',
} as const;

export const easing = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
} as const;

// ─── Elevation ─────────────────────────────────────────────
export const elevation = {
  0: 'none',
  1: shadows.xs,
  2: shadows.sm,
  3: shadows.md,
  4: shadows.lg,
  5: shadows.xl,
} as const;

export const tokens = {
  color: themeColors,
  spacing,
  radius: borderRadius,
  elevation,
  duration,
  easing,
  zIndex,
  transitions,
  fontFamily,
  fontSize,
  fontWeight,
  shadows,
} as const;

export { semanticColors, chartColors };
export type { SemanticColorToken, ChartColorToken, ThemedColor } from './semantic';
