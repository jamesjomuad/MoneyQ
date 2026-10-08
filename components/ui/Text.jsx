import { Text as RNText } from 'react-native';

import { useTheme } from './ThemeProvider';

const TONE_COLORS = {
  default: 'text',
  muted: 'textMuted',
  faint: 'textFaint',
  income: 'income',
  expense: 'expense',
  warning: 'warning',
  primary: 'primary',
  onPrimary: 'onPrimary',
};

export function Text({ variant = 'body', tone = 'default', style, ...rest }) {
  const { colors, typography } = useTheme();

  const variantStyle = typography[variant] ?? typography.body;
  const colorKey = TONE_COLORS[tone] ?? 'text';
  const color = colors[colorKey];

  return <RNText {...rest} style={[variantStyle, { color }, style]} />;
}
