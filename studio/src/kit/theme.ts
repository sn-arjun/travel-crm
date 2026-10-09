// Brand tokens copied from desktop/src/app/globals.css (light theme --ds-*). Radii: --radius-ds-*.
export const C = {
  bg: '#FAFAFB', surface: '#FFFFFF', sunken: '#F4F4F6', border: '#E4E4E9', borderStrong: '#C7C7D1',
  fg: '#111117', fgMuted: '#55555F', fgSubtle: '#6E6E7A',
  primary: '#4F46E5', primaryHover: '#4338CA', primaryActive: '#3730A3', primarySubtle: '#EEF0FE', primaryOnSubtle: '#3730A3',
  success: '#047857', successSubtle: '#ECFDF5', successOnSubtle: '#04563F',
  warning: '#B45309', warningSubtle: '#FFFBEB',
  // dark brand surface used for the sting / end card (product dark theme)
  darkBg: '#0A0A0F', darkSurface: '#14141B', darkRaised: '#1C1C26', darkFg: '#EDEDF2', darkMuted: '#A0A0AE', darkPrimary: '#818CF8', darkPrimarySubtle: '#1E1B4B',
};
export const R = { sm: 6, md: 10, lg: 14, xl: 16, x2: 20, full: 9999 };
export const FONT_BODY = "'Geist Variable', 'DM Sans Variable', system-ui, sans-serif";
export const FONT_DISPLAY = "'DM Sans Variable', 'Geist Variable', system-ui, sans-serif";
export const softGradient = `radial-gradient(1200px 700px at 15% 10%, #E0E3FF 0%, transparent 60%), radial-gradient(1000px 700px at 90% 100%, #EDE9FE 0%, transparent 60%), linear-gradient(135deg, #F4F5FF, #F8F7FF)`;
export const darkGradient = `radial-gradient(1100px 700px at 20% 15%, #2B2780 0%, transparent 60%), radial-gradient(900px 700px at 85% 95%, #1E1B4B 0%, transparent 60%), ${C.darkBg}`;
