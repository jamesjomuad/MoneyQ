/**
 * Folder color helpers.
 *
 * A budget may carry a user-selected hex color (`budget.color`). When it does,
 * the folder paints with that exact color in every theme — Light, Dark and
 * MoneyQ alike — and readable ink/border colors are derived from it with WCAG
 * contrast. When it doesn't, the theme-driven `folder` / `folderBorder` /
 * `folderInk` values are used, so existing budgets render exactly as before.
 */

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function hexToRgb(hex) {
  const match = HEX_COLOR.exec(hex);
  if (!match) return null;
  const int = Number.parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (channel) =>
    Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** Mix `hex` toward `target` by `amount` (0–1). */
export function mixHex(hex, target, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!a || !b) return hex;
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

/** WCAG 2.x relative luminance, 0–1. */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

const DARK_INK_BASE = '#0B0F14';
const LIGHT_INK = '#FFFFFF';

/**
 * Resolve the palette a folder card should paint with.
 *
 * @param {string|null|undefined} customColor user-selected hex, if any
 * @param {object} colors active theme colors (fallback source)
 * @returns {{ folder: string, folderBorder: string, folderInk: string }}
 */
export function resolveFolderPalette(customColor, colors) {
  if (!isHexColor(customColor)) {
    return {
      folder: colors.folder,
      folderBorder: colors.folderBorder,
      folderInk: colors.folderInk,
    };
  }

  const base = customColor.toUpperCase();
  const darkInk = mixHex(base, DARK_INK_BASE, 0.78);
  const inkIsLight = contrastRatio(base, LIGHT_INK) >= contrastRatio(base, darkInk);

  return {
    folder: base,
    // Border steps away from the background in whichever direction keeps it
    // visible: darker on light colors, lighter on dark ones.
    folderBorder: inkIsLight ? mixHex(base, LIGHT_INK, 0.28) : mixHex(base, DARK_INK_BASE, 0.28),
    folderInk: inkIsLight ? LIGHT_INK : darkInk,
  };
}
