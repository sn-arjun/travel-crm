/**
 * TravelCRM Pro Design System — Typography Tokens
 * Clean, modern aesthetic using Geist Sans (geometric) + DM Sans (friendly headings)
 * Tight tracking on headings, relaxed on body for readability
 */

export const fontFamily = {
  sans: "'Geist', 'DM Sans', 'Inter', system-ui, -apple-system, sans-serif",
  display: "'DM Sans', 'Geist', system-ui, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', 'SF Mono', monospace",
} as const;

export const fontSize = {
  /* Display — hero / page titles */
  'display-xl': ['40px', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '700' }],
  'display-lg': ['32px', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '700' }],
  'display':    ['26px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],

  /* Heading — section/card titles */
  'heading-lg': ['20px', { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '600' }],
  'heading':    ['17px', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '600' }],
  'heading-sm': ['15px', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '600' }],

  /* Body — paragraphs, descriptions */
  'body-lg':  ['15px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
  'body':     ['13.5px', { lineHeight: '1.55', letterSpacing: '0.005em', fontWeight: '400' }],
  'body-sm':  ['12.5px', { lineHeight: '1.5', letterSpacing: '0.005em', fontWeight: '400' }],

  /* Caption — labels, metadata */
  'caption':    ['12px', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '450' }],
  'caption-sm': ['11px', { lineHeight: '1.35', letterSpacing: '0.015em', fontWeight: '500' }],

  /* Overline — section labels */
  'overline': ['11px', { lineHeight: '1.3', letterSpacing: '0.08em', fontWeight: '600' }],

  /* Tabular — numbers, financial */
  'tabular':    ['14px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
  'tabular-lg': ['18px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
} as const;

export const fontWeight = {
  regular: '400',
  book: '450',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;
