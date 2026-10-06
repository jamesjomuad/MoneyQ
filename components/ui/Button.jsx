import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function Button({ label, onPress, variant = 'primary', disabled = false, style }) {
  const { colors, radius, spacing } = useTheme();

  const variants = {
    primary: { background: colors.primary, border: colors.primary, text: 'onPrimary' },
    secondary: { background: 'transparent', border: colors.border, text: 'default' },
    danger: { background: colors.expenseSoft, border: colors.expenseSoft, text: 'expense' },
  };

  const selected = variants[variant] ?? variants.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected.background,
          borderColor: selected.border,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text variant="label" tone={selected.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});