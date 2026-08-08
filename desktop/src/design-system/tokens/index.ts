// Legacy palette (kept for existing consumers — prefer the semantic tokens below)
export { colors } from './colors';
export { fontFamily, fontSize, fontWeight } from './typography';
export {
  spacing,
  borderRadius,
  shadows,
  zIndex,
  transitions,
  breakpoints,
  iconSizes,
  componentRadii,
} from './spacing';

// Semantic token layer — the source of truth for all new work
export {
  semanticColors,
  chartColors,
  contrastPairs,
  resolveTheme,
  type SemanticColorToken,
  type ChartColorToken,
  type ThemedColor,
} from './semantic';

export {
  tokens,
  themeColors,
  chartSeries,
  color,
  duration,
  easing,
  elevation,
  type ThemeName,
} from './tokens';

export { contrastRatio, relativeLuminance, hexToRgb, WCAG_AA_NORMAL, WCAG_AA_LARGE } from './contrast';
