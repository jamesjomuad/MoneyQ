/** Append an alpha channel to a #RRGGBB colour. */
export function withAlpha(hex, alpha) {
  const base = String(hex).replace('#', '');
  if (base.length !== 6) return hex;
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `#${base}${byte.toString(16).padStart(2, '0')}`;
}