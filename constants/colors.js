export const lightColors = {
  background: '#F5F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EBEFEA',
  surfaceElevated: '#FFFFFF',
  input: '#FFFFFF',
  border: '#E0E5DE',
  text: '#13201A',
  textSecondary: '#5C6B62',
  textMuted: '#5C6B62',
  textFaint: '#8D9A92',
  placeholder: '#8D9A92',
  disabled: '#C5CCC7',
  primary: '#0F6B4B',
  primarySoft: '#E1F0E8',
  onPrimary: '#FFFFFF',
  secondary: '#0F7A8C',
  income: '#0F7A51',
  success: '#0F7A51',
  expense: '#B3261E',
  error: '#B3261E',
  expenseSoft: '#FBE9E7',
  warning: '#A96600',
  warningSoft: '#FCF0DC',
  folder: '#FDF1DA',
  folderBorder: '#F0DEB6',
  folderInk: '#8A6B2E',
  overlay: 'rgba(19, 32, 26, 0.45)',
};

export const darkColors = {
  background: '#0E1310',
  surface: '#1A221D',
  surfaceMuted: '#252F2A',
  surfaceElevated: '#202A24',
  input: '#141C17',
  border: '#4F5E56',
  text: '#EAF1EC',
  textSecondary: '#AAB7AF',
  textMuted: '#AAB7AF',
  textFaint: '#8E9A93',
  placeholder: '#8E9A93',
  disabled: '#3A4840',
  primary: '#3FBF8F',
  primarySoft: '#12301F',
  onPrimary: '#06231A',
  secondary: '#49B9C9',
  income: '#4ECB8D',
  success: '#4ECB8D',
  expense: '#F27B6B',
  error: '#F27B6B',
  expenseSoft: '#33191A',
  warning: '#E0A44A',
  warningSoft: '#2F2415',
  folder: '#2A2518',
  folderBorder: '#403925',
  folderInk: '#D9B96A',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/**
 * Branded MoneyQ look: deep navy surfaces with a blue/cyan primary and a
 * green/cyan secondary. Deliberately restrained — a professional finance
 * palette, not a colorful one.
 */
export const moneyqColors = {
  background: '#0A1424',
  surface: '#101D31',
  surfaceMuted: '#182740',
  surfaceElevated: '#14243B',
  input: '#0C1729',
  border: '#2C405F',
  text: '#EAF2FC',
  textSecondary: '#AEBED6',
  textMuted: '#AEBED6',
  textFaint: '#7B8CA8',
  placeholder: '#7B8CA8',
  disabled: '#31415C',
  primary: '#3F9FE0',
  primarySoft: '#14304A',
  onPrimary: '#07131F',
  secondary: '#3FD1B0',
  income: '#3ECF8E',
  success: '#3ECF8E',
  expense: '#F2736B',
  error: '#F2736B',
  expenseSoft: '#33212C',
  warning: '#E0B44A',
  warningSoft: '#2E2718',
  folder: '#20293D',
  folderBorder: '#39455F',
  folderInk: '#D9B96A',
  overlay: 'rgba(5, 11, 21, 0.65)',
};

/**
 * Registry of concrete palettes keyed by theme name. 'system' is a preference,
 * not a palette — it resolves to light or dark at runtime. Add new themes by
 * defining a palette here and a matching appearance option below.
 */
export const themes = {
  light: lightColors,
  dark: darkColors,
  moneyq: moneyqColors,
};

export const APPEARANCE_OPTIONS = [
  { key: 'system', label: 'System', caption: 'Follow the device appearance' },
  { key: 'light', label: 'Light', caption: 'Always use the light theme' },
  { key: 'dark', label: 'Dark', caption: 'Always use the dark theme' },
  { key: 'moneyq', label: 'MoneyQ', caption: 'Deep navy with cyan accents' },
];

export const tagColors = [
  '#0F6B4B',
  '#B3261E',
  '#A96600',
  '#1F5FA8',
  '#6B3FA0',
  '#0F7A8C',
  '#8C2F5C',
  '#5C6B62',
  '#7A5C1F',
];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const typography = {
  display: { fontSize: 32, fontWeight: '700', letterSpacing: -0.6 },
  amount: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  caption: { fontSize: 12, fontWeight: '400' },
};
