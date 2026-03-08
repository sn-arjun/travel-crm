/**
 * TravelCRM Pro Design System — Spacing, Borders, Shadows, Animation Tokens
 * Warm, clean aesthetic with generous rounding and soft shadows
 */

// ─── Spacing (4px base grid) ────────────────────────────
export const spacing = {
  0: '0px',
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
} as const;

// ─── Border Radius (larger, softer corners) ─────────────
export const borderRadius = {
  none: '0px',
  sm: '6px',
  DEFAULT: '10px',
  md: '12px',
  lg: '14px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px',
} as const;

// ─── Shadows (softer, warmer) ───────────────────────────
export const shadows = {
  xs: '0 1px 2px rgba(0,0,0,0.04)',
  sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  md: '0 4px 8px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
  lg: '0 8px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)',
  xl: '0 16px 48px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.04)',
  card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  cardHover: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
  inner: 'inset 0 2px 4px rgba(0,0,0,0.04)',
  none: 'none',
} as const;

// ─── Z-Index Scale ──────────────────────────────────────
export const zIndex = {
  base: '0',
  dropdown: '10',
  sticky: '20',
  overlay: '30',
  modal: '40',
  popover: '50',
  toast: '60',
  command: '70',
} as const;

// ─── Transitions ────────────────────────────────────────
export const transitions = {
  fast: '100ms ease-out',
  base: '150ms ease-in-out',
  slow: '200ms ease-in-out',
  enter: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  exit: '200ms cubic-bezier(0.4, 0, 1, 1)',
  spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ─── Breakpoints (Electron Desktop Focus) ───────────────
export const breakpoints = {
  compact: '1024px',
  default: '1280px',
  wide: '1536px',
} as const;

// ─── Icon Sizes ─────────────────────────────────────────
export const iconSizes = {
  xs: '14px',
  sm: '16px',
  md: '20px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
} as const;

// ─── Component Radius Mapping ───────────────────────────
// Standardized: no more mixing rounded-lg / rounded-xl / rounded-2xl
export const componentRadii = {
  button: '10px',      // DEFAULT
  input: '10px',       // DEFAULT
  badge: '10px',       // DEFAULT
  chip: '6px',         // sm
  card: '14px',        // lg
  dropdown: '14px',    // lg
  popover: '14px',     // lg
  dialog: '16px',      // xl
  sheet: '16px',       // xl
  avatar: '9999px',    // full
  progress: '9999px',  // full
  switch: '9999px',    // full
} as const;
