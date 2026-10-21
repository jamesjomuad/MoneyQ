import { mixHex } from '../utils/colors';

/**
 * Official Budgetarian Botanical Green brand palette.
 *
 * These six values are the single source of truth for the brand. Every theme
 * token in this file is either one of them or a step derived from them with
 * `mixHex`, so the whole product can be re-tuned from this block alone and no
 * component ever needs to repeat a brand hex.
 */
const FOREST_GREEN = '#244C3A'; // deep botanical green — primary on light
const SAGE_GREEN = '#79A88A'; // mid botanical green — primary on dark
const SOFT_SAGE = '#E8F0E9'; // palest sage — soft fills, and ink on dark
const WARM_IVORY = '#F7F6F0'; // warm paper — the light canvas
const DEEP_EVERGREEN = '#202923'; // near-black evergreen — the dark canvas
const HARVEST_GOLD = '#D9A441'; // the one warm accent, used sparingly

export const brandPalette = [
  { name: 'Forest Green', hex: FOREST_GREEN },
  { name: 'Sage Green', hex: SAGE_GREEN },
  { name: 'Soft Sage', hex: SOFT_SAGE },
  { name: 'Warm Ivory', hex: WARM_IVORY },
  { name: 'Deep Evergreen', hex: DEEP_EVERGREEN },
  { name: 'Harvest Gold', hex: HARVEST_GOLD },
];

/**
 * Money semantics are deliberately not part of the brand foundation: a credit
 * has to stay recognisably green and a debit recognisably red in every theme.
 * These two are the only hues in this file that do not come from the palette
 * above.
 */
const EXPENSE_LIGHT = '#B3261E';
const EXPENSE_DARK = '#F27B6B';

/**
 * Botanical Green light: a warm ivory canvas under white cards, Forest Green
 * for primary actions, Soft Sage for selected/soft fills, and Harvest Gold
 * kept aside for warnings and folder accents.
 */
export const lightColors = {
  background: WARM_IVORY,
  surface: '#FFFFFF',
  surfaceMuted: SOFT_SAGE,
  surfaceElevated: '#FFFFFF',
  input: '#FFFFFF',
  border: mixHex(WARM_IVORY, FOREST_GREEN, 0.22),
  text: DEEP_EVERGREEN,
  textSecondary: mixHex(FOREST_GREEN, WARM_IVORY, 0.15),
  textMuted: mixHex(FOREST_GREEN, WARM_IVORY, 0.15),
  textFaint: mixHex(FOREST_GREEN, WARM_IVORY, 0.21),
  placeholder: mixHex(FOREST_GREEN, WARM_IVORY, 0.21),
  disabled: mixHex(FOREST_GREEN, WARM_IVORY, 0.76),
  primary: FOREST_GREEN,
  primaryInk: FOREST_GREEN,
  primarySoft: SOFT_SAGE,
  onPrimary: WARM_IVORY,
  secondary: mixHex(SAGE_GREEN, FOREST_GREEN, 0.45),
  income: mixHex(FOREST_GREEN, SAGE_GREEN, 0.3),
  success: mixHex(FOREST_GREEN, SAGE_GREEN, 0.3),
  expense: EXPENSE_LIGHT,
  error: EXPENSE_LIGHT,
  expenseSoft: mixHex(EXPENSE_LIGHT, WARM_IVORY, 0.86),
  warning: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.45),
  warningSoft: mixHex(HARVEST_GOLD, WARM_IVORY, 0.8),
  folder: mixHex(HARVEST_GOLD, WARM_IVORY, 0.86),
  folderBorder: mixHex(HARVEST_GOLD, WARM_IVORY, 0.58),
  folderInk: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.5),
  overlay: 'rgba(32, 41, 35, 0.45)',
  shadow: 'rgba(32, 41, 35, 0.35)',
};

/**
 * Botanical Green dark: the Deep Evergreen canvas with surfaces stepped just
 * far toward Soft Sage for cards to read, Sage Green carrying primary actions,
 * and Harvest Gold as the single warm accent.
 */
export const darkColors = {
  background: DEEP_EVERGREEN,
  surface: mixHex(DEEP_EVERGREEN, SOFT_SAGE, 0.06),
  surfaceMuted: mixHex(DEEP_EVERGREEN, SOFT_SAGE, 0.12),
  surfaceElevated: mixHex(DEEP_EVERGREEN, SOFT_SAGE, 0.09),
  input: mixHex(DEEP_EVERGREEN, '#000000', 0.18),
  border: mixHex(DEEP_EVERGREEN, SAGE_GREEN, 0.6),
  text: SOFT_SAGE,
  textSecondary: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.3),
  textMuted: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.3),
  textFaint: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.32),
  placeholder: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.32),
  disabled: mixHex(DEEP_EVERGREEN, SOFT_SAGE, 0.2),
  primary: SAGE_GREEN,
  primaryInk: mixHex(SAGE_GREEN, SOFT_SAGE, 0.16),
  primarySoft: mixHex(DEEP_EVERGREEN, FOREST_GREEN, 0.45),
  onPrimary: DEEP_EVERGREEN,
  secondary: mixHex(SAGE_GREEN, SOFT_SAGE, 0.3),
  income: mixHex(SAGE_GREEN, SOFT_SAGE, 0.4),
  success: mixHex(SAGE_GREEN, SOFT_SAGE, 0.4),
  expense: EXPENSE_DARK,
  error: EXPENSE_DARK,
  expenseSoft: mixHex(EXPENSE_DARK, DEEP_EVERGREEN, 0.82),
  warning: HARVEST_GOLD,
  warningSoft: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.85),
  folder: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.82),
  folderBorder: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.6),
  folderInk: HARVEST_GOLD,
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.55)',
};

// Panels inside the branded canvas sit deeper than it: the Forest Green page
// stays the brightest green surface, so Sage Green still clears 4.5:1 for the
// active tab label and every money colour keeps its own saturation.
const BRAND_PANEL = mixHex(FOREST_GREEN, DEEP_EVERGREEN, 0.42);
const BRAND_WELL = mixHex(FOREST_GREEN, DEEP_EVERGREEN, 0.75);

/**
 * The branded Budgetarian look: Forest Green itself as the canvas, so the app
 * wears the brand colour rather than only accenting with it. Cards and sheets
 * sit a step deeper than the page, Soft Sage is the ink, Sage Green carries
 * primary actions, and Harvest Gold stays a selective accent. A dark-family
 * palette — navigation and the status bar follow it.
 */
export const moneyqColors = {
  background: FOREST_GREEN,
  surface: BRAND_PANEL,
  surfaceMuted: mixHex(FOREST_GREEN, SAGE_GREEN, 0.12),
  surfaceElevated: BRAND_PANEL,
  input: mixHex(FOREST_GREEN, DEEP_EVERGREEN, 0.7),
  border: mixHex(FOREST_GREEN, SAGE_GREEN, 0.55),
  text: SOFT_SAGE,
  textSecondary: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.3),
  textMuted: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.17),
  textFaint: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.21),
  placeholder: mixHex(SOFT_SAGE, DEEP_EVERGREEN, 0.21),
  disabled: mixHex(FOREST_GREEN, SAGE_GREEN, 0.25),
  primary: SAGE_GREEN,
  primaryInk: mixHex(SAGE_GREEN, SOFT_SAGE, 0.45),
  primarySoft: BRAND_WELL,
  onPrimary: DEEP_EVERGREEN,
  secondary: mixHex(SAGE_GREEN, SOFT_SAGE, 0.3),
  income: mixHex(SAGE_GREEN, SOFT_SAGE, 0.45),
  success: mixHex(SAGE_GREEN, SOFT_SAGE, 0.45),
  expense: mixHex(EXPENSE_DARK, SOFT_SAGE, 0.3),
  error: mixHex(EXPENSE_DARK, SOFT_SAGE, 0.3),
  expenseSoft: mixHex(EXPENSE_DARK, DEEP_EVERGREEN, 0.8),
  warning: HARVEST_GOLD,
  warningSoft: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.85),
  folder: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.8),
  folderBorder: mixHex(HARVEST_GOLD, DEEP_EVERGREEN, 0.55),
  folderInk: HARVEST_GOLD,
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.5)',
};

/**
 * Registry of concrete palettes keyed by theme name. 'system' is a preference,
 * not a palette — it resolves to light or dark at runtime. The stored keys stay
 * stable so a saved appearance preference keeps working across releases; add
 * new themes by defining a palette here and a matching appearance option below.
 */
export const themes = {
  light: lightColors,
  dark: darkColors,
  moneyq: moneyqColors,
};

export const APPEARANCE_OPTIONS = [
  { key: 'system', label: 'System', caption: 'Follow the device appearance' },
  { key: 'light', label: 'Light', caption: 'Warm ivory with forest green' },
  { key: 'dark', label: 'Dark', caption: 'Deep evergreen with sage green' },
  { key: 'moneyq', label: 'Budgetarian', caption: 'Forest green canvas with gold accents' },
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

// Manrope static weights bundled via @expo-google-fonts/manrope. The key
// doubles as the family name registered by expo-font, and the weight lives in
// the font file itself — no synthetic bold via fontWeight.
export const fontFamilies = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
};

export const typography = {
  display: { fontFamily: fontFamilies.extraBold, fontSize: 32, letterSpacing: -0.6 },
  amount: { fontFamily: fontFamilies.bold, fontSize: 26, letterSpacing: -0.4 },
  title: { fontFamily: fontFamilies.bold, fontSize: 20, letterSpacing: -0.3 },
  heading: { fontFamily: fontFamilies.semibold, fontSize: 17 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 13, letterSpacing: 0.2 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 12 },
};
