/**
 * TravelCRM Pro Design System — Color Tokens
 * Extracted from Relatewise-style warm, clean design system
 */

export const colors = {
  // ─── Brand: Primary (Coral/Red-Orange) ────────────────
  primary: {
    50: '#FFF5F2',
    100: '#FFE8E1',
    200: '#FFD0C4',
    300: '#FFB09E',
    400: '#FF8A6F',
    500: '#FF5C38', // Main CTA / brand accent
    600: '#E8553D',
    700: '#CC3D28',
    800: '#A63220',
    900: '#7D261A',
    950: '#4D160E',
  },

  // ─── Brand: Secondary (Warm Violet) ──────────────────
  secondary: {
    50: '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    300: '#C4B5FD',
    400: '#A78BFA',
    500: '#8B5CF6', // Purple accent for status bars/charts
    600: '#7C3AED',
    700: '#6D28D9',
    800: '#5B21B6',
    900: '#4C1D95',
    950: '#2E1065',
  },

  // ─── Semantic ──────────────────────────────────────────
  success: {
    light: '#F0FDF4',
    bg: '#DCFCE7',
    DEFAULT: '#22C55E',
    text: '#166534',
  },
  warning: {
    light: '#FFFBEB',
    bg: '#FEF3C7',
    DEFAULT: '#F59E0B',
    text: '#92400E',
  },
  error: {
    light: '#FEF2F2',
    bg: '#FEE2E2',
    DEFAULT: '#EF4444',
    text: '#991B1B',
  },
  info: {
    light: '#EFF6FF',
    bg: '#DBEAFE',
    DEFAULT: '#3B82F6',
    text: '#1E40AF',
  },

  // ─── Neutral (Warm Gray) ──────────────────────────────
  gray: {
    50: '#FAFAF9',
    100: '#F5F5F4',
    200: '#E7E5E4',
    300: '#D6D3D1',
    400: '#A8A29E',
    500: '#78716C',
    600: '#57534E',
    700: '#44403C',
    800: '#292524',
    900: '#1C1917',
    950: '#0C0A09',
  },

  // ─── Domain: Lead Priority ────────────────────────────
  leadPriority: {
    hot: '#EF4444',
    warm: '#F59E0B',
    cold: '#3B82F6',
    lost: '#78716C',
    won: '#22C55E',
  },

  // ─── Domain: Pipeline Stages ──────────────────────────
  pipeline: {
    new: '#8B5CF6',
    contacted: '#3B82F6',
    qualified: '#06B6D4',
    proposalSent: '#F59E0B',
    negotiation: '#F97316',
    won: '#22C55E',
    lost: '#EF4444',
    onHold: '#78716C',
  },

  // ─── Task Priority (from reference) ──────────────────
  taskPriority: {
    urgent: '#EF4444',
    normal: '#F59E0B',
    low: '#22C55E',
  },
} as const;
