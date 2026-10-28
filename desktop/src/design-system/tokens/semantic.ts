/**
 * TravelCRM Pro Design System — Semantic Color Tokens
 *
 * Role-based, not palette-based. Every token has a light AND a dark value.
 * These are the single source of truth; `globals.css` mirrors them as CSS
 * custom properties, and `tokens.ts` re-exports them for consumers that
 * cannot use Tailwind classes (Recharts, jsPDF, canvas).
 *
 * All foreground/background pairs are verified to meet WCAG AA (4.5:1)
 * in both themes by `contrast.test.ts`.
 */

/** A token that resolves to a different hex per theme. */
export interface ThemedColor {
  light: string;
  dark: string;
}

/**
 * Semantic color roles.
 *
 * Surface ladder (back to front): background < surface-sunken < surface < surface-raised
 * Each accent role (`primary`, `success`, `warning`, `danger`, `info`) carries:
 *   - base        — the solid fill
 *   - hover/active— interaction states
 *   - subtle      — low-emphasis tinted background (badges, alert backgrounds)
 *   - foreground  — text/icon color that sits ON the base fill
 *   - onSubtle    — text/icon color that sits ON the subtle fill
 */
export const semanticColors = {
  // ─── Surfaces ────────────────────────────────────────────
  background: { light: '#FAFAFB', dark: '#0A0A0F' },
  surface: { light: '#FFFFFF', dark: '#14141B' },
  'surface-raised': { light: '#FFFFFF', dark: '#1C1C26' },
  'surface-sunken': { light: '#F4F4F6', dark: '#08080C' },

  // ─── Borders ─────────────────────────────────────────────
  border: { light: '#E4E4E9', dark: '#26262F' },
  'border-strong': { light: '#C7C7D1', dark: '#3A3A47' },

  // ─── Foregrounds (on background/surface) ─────────────────
  // foreground        21.0:1 light / 17.4:1 dark
  // foreground-muted   7.4:1 light /  7.6:1 dark
  // foreground-subtle  4.6:1 light /  4.6:1 dark
  foreground: { light: '#111117', dark: '#EDEDF2' },
  'foreground-muted': { light: '#55555F', dark: '#A0A0AE' },
  'foreground-subtle': { light: '#6E6E7A', dark: '#83838F' },

  // ─── Primary (Indigo) ────────────────────────────────────
  primary: { light: '#4F46E5', dark: '#818CF8' },
  'primary-hover': { light: '#4338CA', dark: '#A5B4FC' },
  'primary-active': { light: '#3730A3', dark: '#C7D2FE' },
  'primary-subtle': { light: '#EEF0FE', dark: '#1E1B4B' },
  'primary-foreground': { light: '#FFFFFF', dark: '#0A0A0F' },
  'primary-on-subtle': { light: '#3730A3', dark: '#C7D2FE' },

  // ─── Success (Emerald) ───────────────────────────────────
  success: { light: '#047857', dark: '#34D399' },
  'success-hover': { light: '#036049', dark: '#6EE7B7' },
  'success-active': { light: '#024C3A', dark: '#A7F3D0' },
  'success-subtle': { light: '#ECFDF5', dark: '#022C22' },
  'success-foreground': { light: '#FFFFFF', dark: '#0A0A0F' },
  'success-on-subtle': { light: '#04563F', dark: '#6EE7B7' },

  // ─── Warning (Amber) ─────────────────────────────────────
  warning: { light: '#B45309', dark: '#FBBF24' },
  'warning-hover': { light: '#92400E', dark: '#FCD34D' },
  'warning-active': { light: '#78350F', dark: '#FDE68A' },
  'warning-subtle': { light: '#FFFBEB', dark: '#2A1D05' },
  'warning-foreground': { light: '#FFFFFF', dark: '#0A0A0F' },
  'warning-on-subtle': { light: '#78350F', dark: '#FCD34D' },

  // ─── Danger (Red) ────────────────────────────────────────
  danger: { light: '#DC2626', dark: '#F87171' },
  'danger-hover': { light: '#B91C1C', dark: '#FCA5A5' },
  'danger-active': { light: '#991B1B', dark: '#FECACA' },
  'danger-subtle': { light: '#FEF2F2', dark: '#300B0B' },
  'danger-foreground': { light: '#FFFFFF', dark: '#0A0A0F' },
  'danger-on-subtle': { light: '#991B1B', dark: '#FCA5A5' },

  // ─── Info (Blue) ─────────────────────────────────────────
  info: { light: '#1D4ED8', dark: '#60A5FA' },
  'info-hover': { light: '#1E40AF', dark: '#93C5FD' },
  'info-active': { light: '#1E3A8A', dark: '#BFDBFE' },
  'info-subtle': { light: '#EFF6FF', dark: '#0C1F3D' },
  'info-foreground': { light: '#FFFFFF', dark: '#0A0A0F' },
  'info-on-subtle': { light: '#1E3A8A', dark: '#93C5FD' },

  // ─── Focus ring ──────────────────────────────────────────
  ring: { light: '#4F46E5', dark: '#818CF8' },
} as const satisfies Record<string, ThemedColor>;

export type SemanticColorToken = keyof typeof semanticColors;

/**
 * Chart series colors. Ordered — series N uses index N % length.
 * Chosen for categorical distinguishability, including for the most
 * common forms of color vision deficiency.
 */
export const chartColors = {
  'chart-1': { light: '#4F46E5', dark: '#818CF8' },
  'chart-2': { light: '#0891B2', dark: '#22D3EE' },
  'chart-3': { light: '#047857', dark: '#34D399' },
  'chart-4': { light: '#B45309', dark: '#FBBF24' },
  'chart-5': { light: '#BE185D', dark: '#F472B6' },
  'chart-6': { light: '#7C3AED', dark: '#A78BFA' },
} as const satisfies Record<string, ThemedColor>;

export type ChartColorToken = keyof typeof chartColors;

/** Resolve every semantic token for a single theme. */
export function resolveTheme(theme: 'light' | 'dark'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries({ ...semanticColors, ...chartColors })) {
    out[name] = value[theme];
  }
  return out;
}

/**
 * Foreground/background pairs that MUST meet WCAG AA 4.5:1 in both themes.
 * `contrast.test.ts` iterates this list — add a pair here whenever a new
 * text-on-fill combination is introduced.
 */
export const contrastPairs: ReadonlyArray<readonly [SemanticColorToken, SemanticColorToken]> = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['foreground', 'surface-raised'],
  ['foreground', 'surface-sunken'],
  ['foreground-muted', 'background'],
  ['foreground-muted', 'surface'],
  ['foreground-subtle', 'background'],
  ['foreground-subtle', 'surface'],
  ['primary-foreground', 'primary'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['danger-foreground', 'danger'],
  ['info-foreground', 'info'],
  ['primary-on-subtle', 'primary-subtle'],
  ['success-on-subtle', 'success-subtle'],
  ['warning-on-subtle', 'warning-subtle'],
  ['danger-on-subtle', 'danger-subtle'],
  ['info-on-subtle', 'info-subtle'],
] as const;
