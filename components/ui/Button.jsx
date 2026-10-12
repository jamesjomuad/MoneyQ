import { Pressable, StyleSheet } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function Button({ label, onPress, variant = 'primary', disabled = false, style, icon }) {
  const { colors, radius, spacing } = useTheme();

  const variants = {
    primary: { background: colors.primary, border: colors.primary, text: 'onPrimary', ink: colors.onPrimary },
    secondary: { background: 'transparent', border: colors.border, text: 'default', ink: colors.text },
    danger: { background: colors.expenseSoft, border: colors.expenseSoft, text: 'expense', ink: colors.expense },
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
          backgroundColor: disabled ? colors.disabled : selected.background,
          borderColor: disabled ? colors.disabled : selected.border,
          borderRadius: radius.md,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          opacity: disabled ? 1 : pressed ? 0.8 : 1,
          // Slight press squash so taps feel physical; same instant as the
          // opacity change, so it never delays the action.
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={16} color={disabled ? colors.textMuted : selected.ink} />
      ) : null}
      <Text variant="label" tone={disabled ? 'muted' : selected.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
});