import { Text as RNText } from 'react-native';

import { useTheme } from './ThemeProvider';

const TONES = ['default', 'muted', 'faint', 'income', 'expense', 'warning', 'primary', 'onPrimary'];

export function Text({ variant = 'body', tone = 'default', style, ...rest }) {
  const { colors, typography } = useTheme();

  const variantStyle = typography[variant] ?? typography.body;
  const color = TONES.includes(tone) ? colors[tone] : colors.text;

  return <RNText {...rest} style={[variantStyle, { color }, style]} />;
}