'use client';

import { useTheme } from 'next-themes';
import * as React from 'react';

import { chartSeries, themeColors, type ThemeName } from './tokens';

/**
 * Resolved design tokens for the currently active theme.
 *
 * Use in React for consumers that cannot take Tailwind classes — Recharts
 * `stroke`/`fill`, jsPDF, canvas. Everything else should use classes.
 *
 * Degrades safely: before hydration `resolvedTheme` is undefined, so we fall
 * back to light rather than throwing.
 */
export function useThemeTokens() {
  const { resolvedTheme } = useTheme();
  const theme: ThemeName = resolvedTheme === 'dark' ? 'dark' : 'light';

  return React.useMemo(
    () => ({
      theme,
      colors: themeColors[theme],
      chart: chartSeries(theme),
    }),
    [theme],
  );
}
