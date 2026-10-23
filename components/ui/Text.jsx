import { Text as RNText } from 'react-native';

import { fontFamilies } from '../../constants/colors';

import { useTheme } from './ThemeProvider';

const TONE_COLORS = {
  default: 'text',
  muted: 'textMuted',
  faint: 'textFaint',
  income: 'income',
  expense: 'expense',
  warning: 'warning',
  primary: 'primaryInk',
  onPrimary: 'onPrimary',
};

// Inline emphasis: a `<b>...</b>` span inside a string child renders in the
// next-heavier static Manrope weight. The bundled fonts carry weight in the
// file itself (see constants/colors.js), so fontWeight would do nothing —
// the only way to go bold mid-sentence is a nested Text with its own family.
const BOLD_SPAN = /<b>([\s\S]*?)<\/b>/g;

// One step up per variant family; extraBold is already the ceiling, and an
// unknown family falls back to plain bold.
const HEAVIER_THAN = {
  [fontFamilies.regular]: fontFamilies.bold,
  [fontFamilies.medium]: fontFamilies.bold,
  [fontFamilies.semibold]: fontFamilies.bold,
  [fontFamilies.bold]: fontFamilies.extraBold,
  [fontFamilies.extraBold]: fontFamilies.extraBold,
};

// Split a string around its <b> spans, leaving everything else untouched.
// Non-string children (elements, arrays from .map) pass straight through,
// and text without a tag pays no cost beyond one includes() check.
function parseBoldSpans(children, boldFamily) {
  if (typeof children !== 'string' || !children.includes('<b>')) return children;
  const parts = [];
  let cursor = 0;
  let key = 0;
  for (const match of children.matchAll(BOLD_SPAN)) {
    if (match.index > cursor) parts.push(children.slice(cursor, match.index));
    parts.push(
      <RNText key={`bold-${key++}`} style={{ fontFamily: boldFamily }}>
        {match[1]}
      </RNText>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < children.length) parts.push(children.slice(cursor));
  return parts;
}

export function Text({ variant = 'body', tone = 'default', style, children, ...rest }) {
  const { colors, typography } = useTheme();

  const variantStyle = typography[variant] ?? typography.body;
  const colorKey = TONE_COLORS[tone] ?? 'text';
  const color = colors[colorKey];
  const boldFamily = HEAVIER_THAN[variantStyle.fontFamily] ?? fontFamilies.bold;

  return (
    <RNText {...rest} style={[variantStyle, { color }, style]}>
      {parseBoldSpans(children, boldFamily)}
    </RNText>
  );
}
